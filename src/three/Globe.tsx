import { geoEquirectangular, geoPath } from "d3-geo";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import countries from "world-atlas/countries-110m.json";
import land from "world-atlas/land-110m.json";
import { ok, type Bank, type HotspotHeat, type MarketDetail, type World } from "../api";
import { changeColor, fmt, pct } from "../format";
import { Burst, Label, Pulse, latLon, upTo, useHover } from "./common";

export const R = 2;

export type Layers = { markets: boolean; banks: boolean; hotspots: boolean };
export type GlobeSel = { type: "market" | "bank" | "hotspot"; id: string } | null;

// ---------- Erde aus Punkten ----------

function useLandDots() {
  return useMemo(() => {
    const W = 1024;
    const H = 512;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    const proj = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
    const topo = land as unknown as Topology<{ land: GeometryCollection }>;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    geoPath(proj, ctx)(feature(topo, topo.objects.land));
    ctx.fill();
    const img = ctx.getImageData(0, 0, W, H).data;
    const pts: THREE.Vector3[] = [];
    const step = 1.25;
    for (let lat = -84; lat <= 84; lat += step) {
      const dLon = step / Math.max(0.15, Math.cos((lat * Math.PI) / 180));
      for (let lon = -180; lon < 180; lon += dLon) {
        const x = Math.floor(((lon + 180) / 360) * W);
        const y = Math.floor(((90 - lat) / 180) * H);
        if (img[(y * W + x) * 4] > 128) pts.push(latLon(lat, lon, R * 1.001));
      }
    }
    return pts;
  }, []);
}

function LandDots() {
  const pts = useLandDots();
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    pts.forEach((p, i) => {
      o.position.copy(p);
      o.lookAt(p.clone().multiplyScalar(2));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [pts]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]}>
      <circleGeometry args={[0.0105, 6]} />
      <meshBasicMaterial color="#2f8fa3" transparent opacity={0.85} />
    </instancedMesh>
  );
}

function Borders() {
  const geo = useMemo(() => {
    const topo = countries as unknown as Topology<{ countries: GeometryCollection }>;
    const m = mesh(topo, topo.objects.countries);
    const pos: number[] = [];
    for (const line of m.coordinates) {
      for (let i = 1; i < line.length; i++) {
        const a = latLon(line[i - 1][1], line[i - 1][0], R * 1.002);
        const b = latLon(line[i][1], line[i][0], R * 1.002);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, []);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#3fb6c9" transparent opacity={0.22} />
    </lineSegments>
  );
}

const atmoVertex = /* glsl */ `
varying vec3 vN; varying vec3 vP;
void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vP = mv.xyz; gl_Position = projectionMatrix*mv; }`;
const atmoFragment = /* glsl */ `
varying vec3 vN; varying vec3 vP;
uniform vec3 color;
void main(){ float f = pow(1.0 - abs(dot(normalize(-vP), vN)), 4.0); gl_FragColor = vec4(color, f*0.45); }`;

function Earth() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[R * 0.995, 96, 96]} />
        <meshStandardMaterial color="#06121f" roughness={0.9} metalness={0.1} emissive="#020a14" />
      </mesh>
      <mesh scale={1.07}>
        <sphereGeometry args={[R, 64, 64]} />
        <shaderMaterial
          vertexShader={atmoVertex}
          fragmentShader={atmoFragment}
          uniforms={{ color: { value: new THREE.Color("#2bd4e0") } }}
          transparent
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <LandDots />
      <Borders />
    </group>
  );
}

// ---------- Marker ----------

function Pillar({
  lat,
  lon,
  changePct,
  label,
  sub,
  selected,
  onClick,
}: {
  lat: number;
  lon: number;
  changePct: number | null;
  label: string;
  sub: string;
  selected: boolean;
  onClick: () => void;
}) {
  const [hover, bind] = useHover();
  const p = latLon(lat, lon, R);
  const q = upTo(p);
  const h = 0.06 + Math.min(Math.abs(changePct ?? 0), 5) * 0.09;
  const color = changeColor(changePct);
  return (
    <group position={p} quaternion={q}>
      <group>
        <mesh
          position={[0, h / 2, 0]}
          {...bind}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <cylinderGeometry args={[0.022, 0.022, h, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hover || selected ? 2.4 : 1.2} toneMapped={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
          <ringGeometry args={[0.03, 0.045, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {(hover || selected) && (
        <Label position={[0, h + 0.12, 0]}>
          <b>{label}</b> <span style={{ color }}>{pct(changePct, 2, false)}</span>
          <br />
          <small>{sub}</small>
        </Label>
      )}
    </group>
  );
}

function BankRing({ bank, selected, onClick }: { bank: Bank; selected: boolean; onClick: () => void }) {
  const [hover, bind] = useHover();
  const p = latLon(bank.lat, bank.lon, R * 1.004);
  const q = upTo(p);
  const rate = ok(bank.data) ? bank.data.rate : 0;
  const stale = ok(bank.data) ? bank.data.stale : true;
  const r = 0.05 + Math.min(rate, 15) * 0.012;
  const color = stale ? "#6b7a8c" : "#f5c451";
  return (
    <group position={p} quaternion={q}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        {...bind}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <torusGeometry args={[r, 0.007, 8, 48]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hover || selected ? 2.5 : 1} toneMapped={false} />
      </mesh>
      {(hover || selected) && (
        <Label position={[0, 0.18, 0]}>
          <b>{bank.short}</b> {ok(bank.data) ? `${fmt(bank.data.rate, 2)} %` : "keine Daten"}
          <br />
          <small>{ok(bank.data) ? bank.data.label : ""}</small>
        </Label>
      )}
    </group>
  );
}

function HotspotOrb({
  name,
  lat,
  lon,
  count,
  selected,
  onClick,
}: {
  name: string;
  lat: number;
  lon: number;
  count: number | null;
  selected: boolean;
  onClick: () => void;
}) {
  const [hover, bind] = useHover();
  const p = latLon(lat, lon, R * 1.01);
  const size = count == null ? 0.025 : 0.03 + (Math.sqrt(Math.min(count, 250) / 250)) * 0.07;
  const color = count == null ? "#55606e" : "#ff6a3d";
  return (
    <group position={p}>
      <Pulse speed={count ? 1.2 + count / 80 : 0.5} amp={0.2}>
        <mesh
          {...bind}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <sphereGeometry args={[size, 20, 20]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hover || selected ? 3 : 1.6} toneMapped={false} transparent opacity={0.9} />
        </mesh>
      </Pulse>
      {(hover || selected) && (
        <Label position={[0, size + 0.12, 0]}>
          <b>{name}</b>
          <br />
          <small>{count == null ? "Nachrichten laden …" : `${count}${count >= 250 ? "+" : ""} Meldungen in 24 h`}</small>
        </Label>
      )}
    </group>
  );
}

/** Explosionsansicht über einem Markt: vier Performance-Säulen fliegen aus dem Pfeiler. */
function MarketBurst({ lat, lon, detail }: { lat: number; lon: number; detail: MarketDetail | undefined }) {
  const p = latLon(lat, lon, R);
  const q = upTo(p);
  const perf = detail?.indicators.perf;
  const items: [string, number | null | undefined][] = [
    ["1 Monat", perf?.m1],
    ["3 Monate", perf?.m3],
    ["lfd. Jahr", perf?.ytd],
    ["1 Jahr", perf?.y1],
  ];
  return (
    <group position={p} quaternion={q}>
      {items.map(([name, v], i) => {
        const a = (i / items.length) * Math.PI * 2 + Math.PI / 4;
        const h = 0.05 + Math.min(Math.abs((v ?? 0) * 100), 40) * 0.018;
        const color = changeColor(v == null ? null : v * 100 * 0.3);
        return (
          <Burst key={name} open={!!detail} to={[Math.cos(a) * 0.42, 0.25, Math.sin(a) * 0.42]} delay={i * 0.07}>
            <mesh position={[0, h / 2, 0]}>
              <boxGeometry args={[0.07, h, 0.07]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} toneMapped={false} transparent opacity={0.92} />
            </mesh>
            <Label position={[0, h + 0.08, 0]} className="small">
              {name}
              <br />
              <b style={{ color }}>{pct(v)}</b>
            </Label>
          </Burst>
        );
      })}
    </group>
  );
}

export function Globe({
  world,
  heat,
  layers,
  sel,
  onSelect,
  marketDetail,
}: {
  world: World | undefined;
  heat: HotspotHeat[] | undefined;
  layers: Layers;
  sel: GlobeSel;
  onSelect: (s: GlobeSel) => void;
  marketDetail: MarketDetail | undefined;
}) {
  const heatMap = new Map(heat?.map((h) => [h.id, h.count]) ?? []);
  const selMarket = sel?.type === "market" ? world?.markets.find((m) => m.id === sel.id) : undefined;
  return (
    <group onPointerMissed={() => onSelect(null)}>
      <Earth />
      {layers.markets &&
        world?.markets.map((m) => (
          <Pillar
            key={m.id}
            lat={m.lat}
            lon={m.lon}
            changePct={ok(m.quote) ? m.quote.changePct : null}
            label={m.name}
            sub={`${m.index} · ${m.etf}`}
            selected={sel?.type === "market" && sel.id === m.id}
            onClick={() => onSelect({ type: "market", id: m.id })}
          />
        ))}
      {selMarket && <MarketBurst lat={selMarket.lat} lon={selMarket.lon} detail={marketDetail?.market.id === selMarket.id ? marketDetail : undefined} />}
      {layers.banks &&
        world?.banks.map((b) => (
          <BankRing key={b.id} bank={b} selected={sel?.type === "bank" && sel.id === b.id} onClick={() => onSelect({ type: "bank", id: b.id })} />
        ))}
      {layers.hotspots &&
        world?.hotspots.map((h) => (
          <HotspotOrb
            key={h.id}
            {...h}
            count={heatMap.get(h.id) ?? null}
            selected={sel?.type === "hotspot" && sel.id === h.id}
            onClick={() => onSelect({ type: "hotspot", id: h.id })}
          />
        ))}
    </group>
  );
}
