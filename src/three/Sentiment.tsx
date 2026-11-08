import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Sentiment } from "../api";
import { moodColor } from "../format";
import { Burst, Label, useHover } from "./common";

const ARC_R = 2.4;

/** Halbkreis-Tacho aus 50 Segmenten von Rot (Angst) über Gelb zu Grün (Gier). */
function Gauge({ score }: { score: number | null }) {
  const segs = 50;
  const needle = useRef<THREE.Group>(null);
  const target = score == null ? Math.PI / 2 : Math.PI - (score / 100) * Math.PI;
  useFrame((_, dt) => {
    if (needle.current) needle.current.rotation.z += (target - Math.PI / 2 - needle.current.rotation.z) * Math.min(1, dt * 2.5);
  });
  return (
    <group position={[0, -0.6, 0]}>
      {Array.from({ length: segs }, (_, i) => {
        const a0 = Math.PI - (i / segs) * Math.PI;
        const s = (i / (segs - 1)) * 100;
        const lit = score != null && s <= score;
        const c = moodColor(s);
        return (
          <mesh key={i} rotation={[0, 0, a0 - Math.PI / segs]}>
            <torusGeometry args={[ARC_R, 0.09, 8, 4, (Math.PI / segs) * 0.85]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={lit ? 1.6 : 0.15} toneMapped={false} transparent opacity={lit ? 1 : 0.35} />
          </mesh>
        );
      })}
      <group ref={needle}>
        <mesh position={[0, ARC_R * 0.45, 0.05]}>
          <boxGeometry args={[0.035, ARC_R * 0.9, 0.035]} />
          <meshStandardMaterial color="#e8f1ff" emissive="#e8f1ff" emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      </group>
      {[
        ["Extreme Angst", 6],
        ["Angst", 33],
        ["Neutral", 50],
        ["Gier", 66],
        ["Extreme Gier", 94],
      ].map(([t, s]) => {
        const a = Math.PI - ((s as number) / 100) * Math.PI;
        return (
          <Label key={t} position={[Math.cos(a) * (ARC_R + 0.45), Math.sin(a) * (ARC_R + 0.45), 0]} className="small dim">
            {t}
          </Label>
        );
      })}
    </group>
  );
}

function Moon({
  part,
  i,
  n,
  open,
  selected,
  onClick,
}: {
  part: Sentiment["parts"][number];
  i: number;
  n: number;
  open: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const [hover, bind] = useHover();
  const a = (i / n) * Math.PI * 2;
  const to: [number, number, number] = [Math.cos(a) * 3.6, -0.6 + Math.sin(a) * 0.4 - 1.6, Math.sin(a) * 2.2];
  const h = 0.1 + (part.score / 100) * 1.6;
  const c = moodColor(part.score);
  return (
    <Burst open={open} to={to} from={[0, -0.6, 0]} delay={i * 0.08}>
      <group
        {...bind}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <mesh position={[0, h / 2, 0]}>
          <cylinderGeometry args={[0.16, 0.16, h, 24]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={hover || selected ? 2 : 0.9} toneMapped={false} transparent opacity={0.9} />
        </mesh>
        <mesh position={[0, 1.8, 0]}>
          <cylinderGeometry args={[0.17, 0.17, 0.005, 24]} />
          <meshBasicMaterial color="#5b6b7f" transparent opacity={0.6} />
        </mesh>
      </group>
      {open && (
        <Label position={[0, h + 0.35, 0]} className="small">
          <b>{part.score}</b> · {part.name}
        </Label>
      )}
    </Burst>
  );
}

export function SentimentScene({
  data,
  open,
  setOpen,
  selected,
  onSelect,
}: {
  data: Sentiment | undefined;
  open: boolean;
  setOpen: (v: boolean) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [hover, bind] = useHover();
  const score = data?.score ?? null;
  const c = moodColor(score);
  const core = useRef<THREE.Mesh>(null);
  const wire = useMemo(() => new THREE.IcosahedronGeometry(0.95, 2), []);
  useFrame((_, dt) => {
    if (core.current) {
      core.current.rotation.y += dt * 0.25;
      core.current.rotation.x += dt * 0.1;
    }
  });
  return (
    <group>
      <Gauge score={score} />
      <group position={[0, -0.6, 0]}>
        <mesh
          ref={core}
          {...bind}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          <primitive object={wire} attach="geometry" />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={hover ? 1.4 : 0.8} wireframe toneMapped={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.6, 48, 48]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.9} toneMapped={false} transparent opacity={0.85} />
        </mesh>
        <Label position={[0, 0, 0.9]}>
          <div className="big" style={{ color: c }}>
            {score ?? "–"}
          </div>
          <small>{data?.label ?? "lädt …"}</small>
        </Label>
      </group>
      {data?.parts.map((p, i) => (
        <Moon key={p.id} part={p} i={i} n={data.parts.length} open={open} selected={selected === p.id} onClick={() => onSelect(p.id)} />
      ))}
    </group>
  );
}
