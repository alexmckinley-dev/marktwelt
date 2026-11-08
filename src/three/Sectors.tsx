import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { ok, type Quote, type Sector, type SectorDetail } from "../api";
import { changeColor, parseBig, pct } from "../format";
import { Burst, Label, useHover } from "./common";

const RAD = 1.6;
const GAP = 0.035;

/** Ein Kugelsegment wie ein Orangenschnitz, mit geschlossenen Seiten. */
function Wedge({ phi, len, color, glow }: { phi: number; len: number; color: string; glow: number }) {
  const mat = (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={glow}
      roughness={0.65}
      metalness={0}
      toneMapped={false}
      side={THREE.DoubleSide}
    />
  );
  return (
    <group>
      <mesh>
        <sphereGeometry args={[RAD, 24, 32, phi, len]} />
        {mat}
      </mesh>
      {[phi, phi + len].map((a, i) => (
        <mesh key={i} rotation={[0, Math.PI + a, 0]}>
          <circleGeometry args={[RAD, 32, -Math.PI / 2, Math.PI]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow * 0.35} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

const dirOf = (a: number) => new THREE.Vector3(-Math.cos(a), 0, Math.sin(a));

function SectorSlice({
  sector,
  index,
  count,
  exploded,
  selected,
  dimmed,
  onClick,
}: {
  sector: Sector;
  index: number;
  count: number;
  exploded: boolean;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  const [hover, bind] = useHover();
  const full = (Math.PI * 2) / count;
  const phi = index * full + GAP / 2;
  const len = full - GAP;
  const mid = phi + len / 2;
  const dir = dirOf(mid);
  const q = ok(sector.quote) ? sector.quote : null;
  const color = changeColor(q?.changePct);
  const g = useRef<THREE.Group>(null);
  const dist = selected ? 2.2 : exploded ? 1.3 : 0;
  useFrame((_, dt) => {
    if (!g.current) return;
    g.current.position.lerp(dir.clone().multiplyScalar(dist), Math.min(1, dt * 4));
    const s = dimmed ? 0.55 : hover ? 1.04 : 1;
    g.current.scale.lerp(new THREE.Vector3(s, s, s), Math.min(1, dt * 8));
  });
  return (
    <group ref={g}>
      <group
        {...bind}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <Wedge phi={phi} len={len} color={color} glow={hover || selected ? 0.9 : 0.35} />
      </group>
      {(selected || hover || (exploded && !dimmed)) && (
        <Label position={dir.clone().multiplyScalar(RAD + 0.35).setY(0.0)}>
          <b>{sector.name}</b>
          <br />
          <span style={{ color }}>{pct(q?.changePct, 2, false)}</span> <small>{sector.etf}</small>
        </Label>
      )}
    </group>
  );
}

function MemberOrb({
  symbol,
  quote,
  cap,
  to,
  delay,
  open,
  onOpen,
}: {
  symbol: string;
  quote: Quote | null;
  cap: number | null;
  to: [number, number, number];
  delay: number;
  open: boolean;
  onOpen: () => void;
}) {
  const [hover, bind] = useHover();
  const r = cap ? Math.max(0.08, Math.min(0.3, Math.cbrt(cap / 1e12) * 0.18)) : 0.09;
  const color = changeColor(quote?.changePct);
  return (
    <Burst open={open} to={to} delay={delay}>
      <mesh
        {...bind}
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        <sphereGeometry args={[r, 32, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hover ? 2 : 0.9} roughness={0.25} metalness={0.3} toneMapped={false} />
      </mesh>
      <Label position={[0, r + 0.16, 0]} className="small">
        <b>{symbol}</b> <span style={{ color }}>{pct(quote?.changePct, 1, false)}</span>
      </Label>
    </Burst>
  );
}

export function SectorsScene({
  sectors,
  spy,
  exploded,
  setExploded,
  selected,
  onSelect,
  detail,
  onStock,
}: {
  sectors: Sector[] | undefined;
  spy: Quote | null;
  exploded: boolean;
  setExploded: (v: boolean) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  detail: SectorDetail | undefined;
  onStock: (s: string) => void;
}) {
  const [hoverCore, bindCore] = useHover();
  const list = sectors ?? [];
  const selIndex = list.findIndex((s) => s.id === selected);
  const members = detail && detail.id === selected ? detail.members : [];
  const focus = sectorFocus(sectors, selected);
  const ringQ = useMemo(
    () => (focus ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), focus.dir) : new THREE.Quaternion()),
    [focus?.dir.x, focus?.dir.z],
  );
  const spyColor = changeColor(spy?.changePct);
  return (
    <group onPointerMissed={() => onSelect(null)}>
      {list.map((s, i) => (
        <SectorSlice
          key={s.id}
          sector={s}
          index={i}
          count={list.length}
          exploded={exploded || !!selected}
          selected={s.id === selected}
          dimmed={!!selected && s.id !== selected}
          onClick={() => {
            if (!exploded) setExploded(true);
            else onSelect(s.id === selected ? null : s.id);
          }}
        />
      ))}
      <mesh
        {...bindCore}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(null);
          setExploded(!exploded);
        }}
      >
        <sphereGeometry args={[exploded ? 0.55 : 0.3, 48, 48]} />
        <meshStandardMaterial color={spyColor} emissive={spyColor} emissiveIntensity={hoverCore ? 2.2 : 1.2} toneMapped={false} />
      </mesh>
      {exploded && !selected && (
        <Label position={[0, 0.85, 0]}>
          <b>S&amp;P 500</b> <span style={{ color: spyColor }}>{pct(spy?.changePct, 2, false)}</span>
          <br />
          <small>Kern anklicken zum Schließen</small>
        </Label>
      )}
      {selected && focus && (
        <group position={focus.centre} quaternion={ringQ}>
          {members.map((m, i) => {
            const a = (i / Math.max(1, members.length)) * Math.PI * 2;
            const rr = 1.5;
            return (
              <MemberOrb
                key={m.symbol}
                symbol={m.symbol}
                quote={ok(m.quote) ? m.quote : null}
                cap={parseBig(m.marketCap)}
                to={[Math.cos(a) * rr, Math.sin(a) * rr, 0]}
                delay={i * 0.05}
                open
                onOpen={() => onStock(m.symbol)}
              />
            );
          })}
          {!members.length && <Label>Mitglieder laden …</Label>}
        </group>
      )}
    </group>
  );
}

export function sectorFocus(sectors: Sector[] | undefined, selected: string | null) {
  const list = sectors ?? [];
  const i = list.findIndex((s) => s.id === selected);
  if (i < 0) return null;
  const full = (Math.PI * 2) / list.length;
  const dir = dirOf(i * full + full / 2);
  return { dir, centre: dir.clone().multiplyScalar(2.2 + RAD + 1.2) };
}
