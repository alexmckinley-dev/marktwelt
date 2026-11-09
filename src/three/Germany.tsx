// Deutschland als eigene 3D-Karte: Wahlkreise als Kacheln in Parteifarbe, die beim Öffnen
// einfliegen, darüber Länder, Bahn- und Straßennetz, Baustellen und Städte.
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Baustelle, ElectionArea, GermanyBase, GermanyNet, Ring } from "../api";
import { mix } from "../format";
import { Label, useHover } from "./common";

export type DeLayers = { wahl: boolean; bahn: boolean; autobahn: boolean; bundes: boolean; baustellen: boolean; staedte: boolean };
export type DeMode = "bund" | "land";
export type DeSel = { type: "wk" | "city" | "bau"; id: string } | null;

const K = 1.0;
export const proj = (lon: number, lat: number): [number, number] => [(lon - 10.45) * 0.63 * K, -(lat - 51.16) * K];
const TILE_H = 0.06;

export const PARTY_COLOR: Record<string, string> = {
  CDU: "#a3acbb",
  CSU: "#a3acbb",
  SPD: "#e3343f",
  AfD: "#1e9fe0",
  GRÜNE: "#4caf3e",
  "Die Linke": "#c2387e",
  BSW: "#8e3a63",
  FDP: "#f2d500",
  "FREIE WÄHLER": "#f08a24",
  SSW: "#2b5fa8",
};
export const partyColor = (p: string | null | undefined) => (p ? PARTY_COLOR[p] ?? "#8a96a8" : "#3a4656");

/** Langer Parteiname (Wikidata) → Kurzname der Wahlstatistik. */
export function shortParty(long: string | null) {
  if (!long) return null;
  if (/Christlich-Soziale/.test(long)) return "CSU";
  if (/Christlich/.test(long)) return "CDU";
  if (/Sozialdemokrat/.test(long)) return "SPD";
  if (/Grünen/.test(long)) return "GRÜNE";
  if (/Linke/.test(long)) return "Die Linke";
  if (/Alternative/.test(long)) return "AfD";
  if (/Sahra/.test(long)) return "BSW";
  if (/Freie Demokrat/.test(long)) return "FDP";
  return long;
}

export const winner = (a: ElectionArea | undefined) => a?.parties.find((p) => p.pct2 != null) ?? null;

export const sameLand = (a: string, b: string) => a === b || a.includes(b) || b.includes(a);

function shapesOf(polys: Ring[][]) {
  return polys.map((p) => {
    const toV = (r: Ring) => r.map(([lon, lat]) => {
      const [x, z] = proj(lon, lat);
      return new THREE.Vector2(x, -z);
    });
    const shape = new THREE.Shape(toV(p[0]));
    p.slice(1).forEach((h) => shape.holes.push(new THREE.Path(toV(h))));
    return shape;
  });
}

/** Mittelpunkt (Schwerpunkt der Eckpunkte des größten Rings) für Kamera und Einflug. */
export function centreOf(polys: Ring[][]): [number, number] {
  const ring = polys.flatMap((p) => p[0]).length ? polys.reduce((a, p) => (p[0].length > a.length ? p[0] : a), polys[0][0]) : [];
  const n = ring.length || 1;
  const lon = ring.reduce((s, q) => s + q[0], 0) / n;
  const lat = ring.reduce((s, q) => s + q[1], 0) / n;
  return proj(lon, lat);
}

function Tile({
  polys,
  color,
  delay,
  selected,
  label,
  onClick,
}: {
  polys: Ring[][];
  color: string;
  delay: number;
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  const [hover, bind] = useHover();
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shapesOf(polys), { depth: TILE_H, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  }, [polys]);
  const [cx, cz] = useMemo(() => centreOf(polys), [polys]);
  // Einflug: jede Kachel startet verstreut im Raum und setzt sich an ihren Platz.
  const from = useMemo(() => new THREE.Vector3((Math.random() - 0.5) * 14, 3 + Math.random() * 6, (Math.random() - 0.5) * 14), []);
  const ref = useRef<THREE.Group>(null);
  const t = useRef(-delay);
  useLayoutEffect(() => {
    ref.current?.position.copy(from);
  }, [from]);
  useFrame((_, dt) => {
    if (!ref.current || t.current >= 1) return;
    t.current = Math.min(1, t.current + dt / 1.2);
    const k = Math.max(0, t.current);
    const e = 1 - Math.pow(1 - k, 3);
    ref.current.position.copy(from).multiplyScalar(1 - e);
    ref.current.rotation.set((1 - e) * 1.4, (1 - e) * 2, 0);
    ref.current.position.y += selected ? 0.05 : 0;
  });
  const lit = hover || selected;
  return (
    <group ref={ref}>
      <mesh
        geometry={geo}
        {...bind}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta < 5) onClick();
        }}
      >
        <meshStandardMaterial color={lit ? mix(color, "#ffffff", 0.3) : color} emissive={color} emissiveIntensity={lit ? 0.6 : 0.22} roughness={0.7} transparent opacity={0.92} />
      </mesh>
      {hover && (
        <Label position={[cx, TILE_H + 0.15, cz]} className="small">
          {label}
        </Label>
      )}
    </group>
  );
}

function Lines({ lines, color, y, opacity }: { lines: number[][]; color: string; y: number; opacity: number }) {
  const geo = useMemo(() => {
    let n = 0;
    for (const l of lines) n += l.length / 2 - 1;
    const pos = new Float32Array(n * 6);
    let o = 0;
    for (const l of lines) {
      for (let i = 2; i < l.length; i += 2) {
        const [x0, z0] = proj(l[i - 2], l[i - 1]);
        const [x1, z1] = proj(l[i], l[i + 1]);
        pos.set([x0, y, z0, x1, y, z1], o);
        o += 6;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [lines, y]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}

function LandBorders({ base }: { base: GermanyBase }) {
  const lines = useMemo(() => base.laender.flatMap((l) => l.polys.flatMap((p) => p.map((r) => r.flat()))), [base]);
  return <Lines lines={lines} color="#e8f6ff" y={TILE_H + 0.004} opacity={0.7} />;
}

function Roadworks({ items, sel, onSelect }: { items: Baustelle[]; sel: DeSel; onSelect: (s: DeSel) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const [hover, bind] = useHover();
  const hoverId = useRef<number | null>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    items.forEach((b, i) => {
      const [x, z] = proj(b.lon, b.lat);
      o.position.set(x, TILE_H + 0.02, z);
      o.scale.setScalar(sel?.type === "bau" && sel.id === b.id ? 2.2 : 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(b.blocked ? "#ff3b4f" : b.short ? "#ffd166" : "#ff8a2b"));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items, sel]);
  const hovered = hover && hoverId.current != null ? items[hoverId.current] : null;
  return (
    <>
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, items.length]}
        {...bind}
        onPointerMove={(e) => {
          hoverId.current = e.instanceId ?? null;
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId != null) onSelect({ type: "bau", id: items[e.instanceId].id });
        }}
      >
        <coneGeometry args={[0.014, 0.05, 6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {hovered && (
        <Label position={[proj(hovered.lon, hovered.lat)[0], TILE_H + 0.12, proj(hovered.lon, hovered.lat)[1]]} className="small">
          <b>{hovered.road}</b> {hovered.title}
        </Label>
      )}
    </>
  );
}

function Cities({ cities, sel, onSelect }: { cities: GermanyBase["cities"]; sel: DeSel; onSelect: (s: DeSel) => void }) {
  const list = useMemo(() => cities.filter((c) => c.pop >= 50000), [cities]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const hRef = (pop: number) => 0.03 + Math.sqrt(pop / 3.5e6) * 0.9;
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    list.forEach((s, i) => {
      const [x, z] = proj(s.lon, s.lat);
      const h = hRef(s.pop);
      o.position.set(x, TILE_H + h / 2, z);
      o.scale.set(1, h, 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(sel?.type === "city" && sel.id === s.name ? "#ffffff" : mix("#46e0c8", "#fff3b0", Math.min(1, Math.sqrt(s.pop / 3.5e6) * 1.4))));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [list, sel]);
  return (
    <>
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, list.length]}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId != null) onSelect({ type: "city", id: list[e.instanceId].name });
        }}
      >
        <cylinderGeometry args={[0.018, 0.018, 1, 10]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.85} />
      </instancedMesh>
      {list.slice(0, 14).map((s) => {
        const [x, z] = proj(s.lon, s.lat);
        return (
          <Label key={s.name} position={[x, TILE_H + hRef(s.pop) + 0.08, z]} className="small">
            {s.name}
          </Label>
        );
      })}
    </>
  );
}

export function GermanyScene({
  base,
  net,
  works,
  layers,
  mode,
  sel,
  onSelect,
}: {
  base: GermanyBase | undefined;
  net: GermanyNet | undefined;
  works: Baustelle[] | undefined;
  layers: DeLayers;
  mode: DeMode;
  sel: DeSel;
  onSelect: (s: DeSel) => void;
}) {
  const results = useMemo(() => new Map(base?.results.wahlkreise.map((r) => [r.nr, r]) ?? []), [base]);
  if (!base) return null;
  const govOf = (land: string) => base.governments.find((g) => sameLand(g.land, land));
  return (
    <group onPointerMissed={() => onSelect(null)}>
      {base.wahlkreise.map((w) => {
        const r = results.get(w.nr);
        const win = winner(r);
        const party = mode === "land" ? shortParty(govOf(w.land)?.party ?? null) : win?.name;
        // Farbsättigung nach Vorsprung: knappe Mehrheiten blass, klare kräftig. Dunkel genug, dass Netze sichtbar bleiben.
        const strength = mode === "land" ? 0.6 : Math.max(0.3, Math.min(0.8, 0.3 + ((win?.pct2 ?? 20) - 18) / 30));
        const color = layers.wahl ? mix("#121a25", partyColor(party), strength) : "#1b2a3a";
        const [cx, cz] = centreOf(w.polys);
        return (
          <Tile
            key={w.nr}
            polys={w.polys}
            color={color}
            delay={Math.hypot(cx, cz) * 0.08 + Math.random() * 0.25}
            selected={sel?.type === "wk" && sel.id === String(w.nr)}
            label={`${w.name}${win ? ` · ${win.name} ${win.pct2!.toFixed(1).replace(".", ",")} %` : ""}`}
            onClick={() => onSelect({ type: "wk", id: String(w.nr) })}
          />
        );
      })}
      <LandBorders base={base} />
      {net && layers.bundes && <Lines lines={net.bundesstrasse} color="#c9d6e6" y={TILE_H + 0.006} opacity={0.28} />}
      {net && layers.autobahn && <Lines lines={net.autobahn} color="#f4f8ff" y={TILE_H + 0.008} opacity={0.9} />}
      {net && layers.bahn && <Lines lines={net.bahn} color="#ffb347" y={TILE_H + 0.01} opacity={0.95} />}
      {works && layers.baustellen && <Roadworks items={works} sel={sel} onSelect={onSelect} />}
      {layers.staedte && <Cities cities={base.cities} sel={sel} onSelect={onSelect} />}
    </group>
  );
}
