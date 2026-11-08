import { Line } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Bar, Indicators } from "../api";
import { dateDe, fmt, pct } from "../format";
import { Burst, Label, useHover } from "./common";

const W = 7.5; // Breite der Zeitachse
const H = 3; // Höhe der Kursachse

/** 3D-Kerzenchart mit Volumen dahinter und gleitenden Durchschnitten davor. */
export function CandleChart({ bars, sma50, sma200 }: { bars: Bar[]; sma50?: (number | null)[]; sma200?: (number | null)[] }) {
  const body = useRef<THREE.InstancedMesh>(null);
  const wick = useRef<THREE.InstancedMesh>(null);
  const vol = useRef<THREE.InstancedMesh>(null);
  const [hoverI, setHoverI] = useState<number | null>(null);
  const n = bars.length;
  const lo = Math.min(...bars.map((b) => b.l || b.c));
  const hi = Math.max(...bars.map((b) => b.h || b.c));
  const vmax = Math.max(1, ...bars.map((b) => b.v));
  const x = (i: number) => (i / Math.max(1, n - 1) - 0.5) * W;
  const y = (p: number) => ((p - lo) / Math.max(1e-9, hi - lo)) * H;
  const bw = (W / Math.max(1, n)) * 0.7;

  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    bars.forEach((b, i) => {
      const up = b.c >= (b.o || b.c);
      col.set(up ? "#2ee6a6" : "#ff4d6d");
      const top = y(Math.max(b.o || b.c, b.c));
      const bot = y(Math.min(b.o || b.c, b.c));
      o.position.set(x(i), (top + bot) / 2, 0);
      o.scale.set(bw, Math.max(0.006, top - bot), bw);
      o.updateMatrix();
      body.current?.setMatrixAt(i, o.matrix);
      body.current?.setColorAt(i, col);
      const wt = y(b.h || b.c);
      const wb = y(b.l || b.c);
      o.position.set(x(i), (wt + wb) / 2, 0);
      o.scale.set(bw * 0.18, Math.max(0.004, wt - wb), bw * 0.18);
      o.updateMatrix();
      wick.current?.setMatrixAt(i, o.matrix);
      wick.current?.setColorAt(i, col);
      const vh = (b.v / vmax) * 0.9;
      o.position.set(x(i), vh / 2, -0.6);
      o.scale.set(bw, Math.max(0.002, vh), bw * 2);
      o.updateMatrix();
      vol.current?.setMatrixAt(i, o.matrix);
      vol.current?.setColorAt(i, col.multiplyScalar(0.45));
    });
    for (const m of [body.current, wick.current, vol.current]) {
      if (!m) continue;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }, [bars]);

  const line = (s: (number | null)[] | undefined) =>
    s
      ?.map((v, i) => (v == null ? null : new THREE.Vector3(x(i), y(v), 0.25)))
      .filter((p): p is THREE.Vector3 => p != null) ?? [];
  const l50 = useMemo(() => line(sma50), [sma50, bars]);
  const l200 = useMemo(() => line(sma200), [sma200, bars]);

  const hb = hoverI != null ? bars[hoverI] : null;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + (hi - lo) * t);
  const months = bars.map((b, i) => [b, i] as const).filter(([b, i]) => i > 0 && b.d.slice(5, 7) !== bars[i - 1].d.slice(5, 7));

  return (
    <group position={[0, -1.5, 0]}>
      <instancedMesh
        ref={body}
        args={[undefined, undefined, n]}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (e.instanceId != null) setHoverI(e.instanceId);
        }}
        onPointerOut={() => setHoverI(null)}
      >
        <boxGeometry />
        <meshStandardMaterial emissiveIntensity={0.6} toneMapped={false} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={wick} args={[undefined, undefined, n]}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={vol} args={[undefined, undefined, n]}>
        <boxGeometry />
        <meshStandardMaterial transparent opacity={0.7} />
      </instancedMesh>
      {l50.length > 1 && <Line points={l50} color="#f5c451" lineWidth={2} />}
      {l200.length > 1 && <Line points={l200} color="#9b7bff" lineWidth={2} />}
      {/* Boden und Raster */}
      <gridHelper args={[W + 1, 18, "#1d3a52", "#11263a"]} position={[0, -0.01, -0.2]} scale={[1, 1, 0.2]} />
      {ticks.map((t) => (
        <group key={t}>
          <Line points={[[-W / 2 - 0.2, y(t), -0.8], [W / 2 + 0.2, y(t), -0.8]]} color="#1d3a52" lineWidth={1} />
          <Label position={[-W / 2 - 0.6, y(t), -0.8]} className="small dim">
            {fmt(t, t > 1000 ? 0 : 2)}
          </Label>
        </group>
      ))}
      {months.map(([b, i]) => (
        <Label key={b.d} position={[x(i), -0.2, 0.4]} className="small dim">
          {new Date(`${b.d}T12:00:00`).toLocaleDateString("de-DE", { month: "short" })}
        </Label>
      ))}
      {hb && hoverI != null && (
        <Label position={[x(hoverI), y(hb.h || hb.c) + 0.35, 0]}>
          <b>{dateDe(hb.d)}</b>
          <br />
          Schluss {fmt(hb.c)} · Hoch {fmt(hb.h)} · Tief {fmt(hb.l)}
        </Label>
      )}
    </group>
  );
}

type Tile = { id: string; title: string; value: string; note: string; tone: "pos" | "neg" | "neu" };

export function tilesFor(ind: Indicators): Tile[] {
  const tone = (v: number | null | undefined, invert = false): Tile["tone"] =>
    v == null ? "neu" : (invert ? -v : v) > 0 ? "pos" : (invert ? -v : v) < 0 ? "neg" : "neu";
  return [
    { id: "trend", title: "Trend", value: ind.trend, note: `50T ${fmt(ind.sma50)} · 200T ${fmt(ind.sma200)}`, tone: ind.trend === "Aufwärtstrend" ? "pos" : ind.trend === "Abwärtstrend" ? "neg" : "neu" },
    { id: "perf", title: "Performance", value: `1 J. ${pct(ind.perf.y1)}`, note: `1M ${pct(ind.perf.m1)} · 3M ${pct(ind.perf.m3)} · lfd. J. ${pct(ind.perf.ytd)}`, tone: tone(ind.perf.y1) },
    { id: "rsi", title: "RSI 14", value: fmt(ind.rsi14, 0), note: ind.rsi14 == null ? "" : ind.rsi14 > 70 ? "überkauft" : ind.rsi14 < 30 ? "überverkauft" : "neutral", tone: ind.rsi14 == null ? "neu" : ind.rsi14 > 70 ? "neg" : ind.rsi14 < 30 ? "pos" : "neu" },
    { id: "vol", title: "Volatilität", value: pct(ind.vol30, 0), note: `30 Tage, annualisiert · 1 J. ${pct(ind.vol1y, 0)}`, tone: "neu" },
    { id: "dd", title: "Abstand zum Hoch", value: pct(ind.fromHigh), note: `52W ${fmt(ind.lo52)}–${fmt(ind.hi52)} · max. Rückgang ${pct(ind.maxDrawdown1y)}`, tone: tone(ind.fromHigh) },
    { id: "beta", title: "Beta zum S&P 500", value: fmt(ind.beta, 2), note: `Korrelation ${fmt(ind.corr, 2)}`, tone: "neu" },
  ];
}

/** Kennzahlen-Würfel: ein Klick sprengt ihn in sechs Kacheln auf. */
export function MetricCube({ ind, open, setOpen }: { ind: Indicators | undefined; open: boolean; setOpen: (v: boolean) => void }) {
  const [hover, bind] = useHover();
  const tiles = ind ? tilesFor(ind) : [];
  const cube = useRef<THREE.Mesh>(null);
  return (
    <group position={[5.6, 0.6, 0]}>
      <mesh
        ref={cube}
        {...bind}
        rotation={[0.5, 0.7, 0]}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        scale={open ? 0.4 : hover ? 1.08 : 1}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#46e0c8" emissive="#46e0c8" emissiveIntensity={hover ? 1 : 0.45} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      {!open && (
        <Label position={[0, -0.95, 0]} className="small">
          Kennzahlen öffnen
        </Label>
      )}
      {tiles.map((t, i) => {
        const a = (i / tiles.length) * Math.PI * 2 + Math.PI / 2;
        return (
          <Burst key={t.id} open={open} to={[Math.cos(a) * 1.7, Math.sin(a) * 1.7, 0.2]} delay={i * 0.05}>
            <mesh>
              <planeGeometry args={[1.5, 0.9]} />
              <meshStandardMaterial
                color={t.tone === "pos" ? "#0f3b31" : t.tone === "neg" ? "#3b1220" : "#14263a"}
                emissive={t.tone === "pos" ? "#2ee6a6" : t.tone === "neg" ? "#ff4d6d" : "#46e0c8"}
                emissiveIntensity={0.18}
                transparent
                opacity={0.85}
                side={THREE.DoubleSide}
              />
            </mesh>
            {open && (
              <Label className={`tile ${t.tone}`}>
                <small>{t.title}</small>
                <b>{t.value}</b>
                <small className="dim">{t.note}</small>
              </Label>
            )}
          </Burst>
        );
      })}
    </group>
  );
}
