import { Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { Earning } from "../api";
import { big, weekdayDe } from "../format";
import { Label, useHover } from "./common";

const TURN = 0.62; // Winkel je Tag auf der Spirale
const RISE = 0.55; // Höhe je Tag
const RAD = 3.2;

const at = (i: number, r = RAD) => new THREE.Vector3(Math.cos(i * TURN) * r, i * RISE, Math.sin(i * TURN) * r);

function Company({ e, pos, onOpen }: { e: Earning; pos: THREE.Vector3; onOpen: () => void }) {
  const [hover, bind] = useHover();
  const r = Math.max(0.06, Math.min(0.32, Math.cbrt((e.marketCap ?? 1e10) / 1e12) * 0.26));
  const color = e.time === "vor Börse" ? "#5cc8ff" : e.time === "nach Börse" ? "#b58cff" : "#9fb0c3";
  return (
    <group position={pos}>
      <mesh
        {...bind}
        onClick={(ev) => {
          ev.stopPropagation();
          onOpen();
        }}
      >
        <sphereGeometry args={[r, 24, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hover ? 2 : 0.7} toneMapped={false} />
      </mesh>
      {(hover || r > 0.17) && (
        <Label position={[0, r + 0.14, 0]} className="small">
          <b>{e.symbol}</b>
          {hover && (
            <>
              <br />
              {e.name}
              <br />
              {e.time} · {big(e.marketCap)} · EPS-Schätzung {e.epsForecast || "–"}
            </>
          )}
        </Label>
      )}
    </group>
  );
}

export function CalendarScene({ items, onOpen }: { items: Earning[] | undefined; onOpen: (s: string) => void }) {
  const days = useMemo(() => {
    const m = new Map<string, Earning[]>();
    for (const e of items ?? []) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);
  const n = days.length;
  const offset = -((n - 1) * RISE) / 2;
  const spine = useMemo(() => Array.from({ length: Math.max(2, n * 12) }, (_, k) => at(k / 12)), [n]);
  return (
    <group position={[0, offset, 0]}>
      {n > 0 && <Line points={spine} color="#2f8fa3" lineWidth={1.5} transparent opacity={0.6} />}
      {days.map(([d, list], i) => {
        const c = at(i);
        const top = list.slice(0, 14);
        return (
          <group key={d}>
            <mesh position={c} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.18, 0.22, 32]} />
              <meshBasicMaterial color="#46e0c8" side={THREE.DoubleSide} />
            </mesh>
            <Label position={at(i, RAD + 1.0).setY(i * RISE + 0.05)} className="small">
              <b>{weekdayDe(d)}</b> · {list.length}
            </Label>
            {top.map((e, k) => {
              const a = i * TURN + ((k % 7) - 3) * 0.075;
              const rr = RAD - 0.55 - Math.floor(k / 7) * 0.6;
              const p = new THREE.Vector3(Math.cos(a) * rr, i * RISE + ((k % 2) - 0.5) * 0.18, Math.sin(a) * rr);
              return <Company key={e.symbol} e={e} pos={p} onOpen={() => onOpen(e.symbol)} />;
            })}
          </group>
        );
      })}
      {!n && <Label>Termine laden …</Label>}
    </group>
  );
}
