import { geoContains, geoEquirectangular, geoPath } from "d3-geo";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import countries from "world-atlas/countries-110m.json";
import land from "world-atlas/land-110m.json";
import { ok, type Bank, type CountryOverview, type GeoEvent, type HotspotHeat, type LaunchSite, type MarketDetail, type Prediction, type Sentiment, type Transit, type World } from "../api";
import { changeColor, fmt, mix, moodColor, pct } from "../format";
import { Burst, Label, Pulse, latLon, upTo, useHover } from "./common";

export const R = 2;

export type Layers = {
  sats: boolean;
  flights: boolean;
  aurora: boolean;
  cables: boolean;
  markets: boolean;
  banks: boolean;
  hotspots: boolean;
  chokepoints: boolean;
  events: boolean;
  countries: boolean;
  launches: boolean;
  mood: boolean;
};
export type GlobeSel = {
  type: "market" | "bank" | "hotspot" | "event" | "country" | "launch" | "mood" | "sat" | "body" | "view";
  id: string;
  lat?: number;
  lon?: number;
} | null;

export const EVENT_KIND: Record<GeoEvent["kind"], { name: string; color: string }> = {
  beben: { name: "Erdbeben", color: "#f5a742" },
  sturm: { name: "Tropensturm", color: "#8fd0ff" },
  flut: { name: "Flut", color: "#3d8bff" },
  vulkan: { name: "Vulkan", color: "#ff5a2b" },
  duerre: { name: "Dürre", color: "#c9a46b" },
  feuer: { name: "Waldbrand", color: "#ff7a3d" },
};
export const ALERT_DE = { green: "Grün", orange: "Orange", red: "Rot" } as const;

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

function LandDots({ explode }: { explode: boolean }) {
  const pts = useLandDots();
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const t = useRef(0);
  const speed = useMemo(() => pts.map(() => 1.5 + Math.random() * 5), [pts]);
  const place = (k: number) => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    pts.forEach((p, i) => {
      o.position.copy(p).multiplyScalar(1 + k * k * speed[i]);
      o.lookAt(p.clone().multiplyScalar(2 + k * 10));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  };
  useLayoutEffect(() => place(0), [pts]);
  // Explosion: Lichtpunkte fliegen mit zufälliger Geschwindigkeit nach außen und verblassen.
  useFrame((_, dt) => {
    if (!explode && t.current === 0) return;
    t.current = explode ? Math.min(1, t.current + dt / 1.1) : 0;
    place(t.current);
    if (mat.current) mat.current.opacity = 0.85 * (1 - t.current);
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]}>
      <circleGeometry args={[0.0105, 6]} />
      <meshBasicMaterial ref={mat} color="#2f8fa3" transparent opacity={0.85} />
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

function Earth({ explode }: { explode: boolean }) {
  const core = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!core.current) return;
    const target = explode ? 0.001 : 1;
    const s = THREE.MathUtils.lerp(core.current.scale.x, target, Math.min(1, dt * 4));
    core.current.scale.setScalar(s);
  });
  return (
    <group>
      <group ref={core}>
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
      </group>
      <LandDots explode={explode} />
      {!explode && <Borders />}
    </group>
  );
}


// ---------- Länderflächen: Konflikte, positive Meldungen, Auswahl ----------

type CountryFeature = GeoJSON.Feature<GeoJSON.Geometry, { name: string }> & { id?: string };

const COUNTRY_FEATURES: CountryFeature[] = (() => {
  const topo = countries as unknown as Topology<{ countries: GeometryCollection }>;
  return (feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection<GeoJSON.Geometry, { name: string }>).features as CountryFeature[];
})();

export const countryFeature = (num: string | null | undefined) => (num ? COUNTRY_FEATURES.find((f) => f.id === num) : undefined);

/** Punkt in einem Land? Für Ereignisse und Startbasen im Länderpanel. */
export const inCountry = (num: string | null | undefined, lat: number, lon: number) => {
  const f = countryFeature(num);
  return f ? geoContains(f, [lon, lat]) : false;
};

export const CONFLICT_RGB = "255,77,90";
export const POSITIVE_RGB = "46,230,140";
const TW = 4096;
const TH = 2048;
const PW = 2048;
const PH = 1024;

/** Kennfarben je Land für die Auswahl mit der Maus (Index + 1 im Rot- und Grünkanal). */
function usePickCanvas() {
  return useMemo(() => {
    const cv = document.createElement("canvas");
    cv.width = PW;
    cv.height = PH;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    const path = geoPath(geoEquirectangular().scale(PW / (2 * Math.PI)).translate([PW / 2, PH / 2]), ctx);
    COUNTRY_FEATURES.forEach((f, i) => {
      const k = i + 1;
      ctx.fillStyle = `rgb(${k & 255},${(k >> 8) & 255},0)`;
      ctx.beginPath();
      path(f);
      ctx.fill();
    });
    return ctx.getImageData(0, 0, PW, PH).data;
  }, []);
}

function pick(img: Uint8ClampedArray, lat: number, lon: number): CountryFeature | undefined {
  const x = Math.min(PW - 1, Math.floor(((lon + 180) / 360) * PW));
  const y = Math.min(PH - 1, Math.floor(((90 - lat) / 180) * PH));
  const o = (y * PW + x) * 4;
  const k = img[o] + (img[o + 1] << 8);
  const f = k ? COUNTRY_FEATURES[k - 1] : undefined;
  if (f && geoContains(f, [lon, lat])) return f;
  return COUNTRY_FEATURES.find((g) => geoContains(g, [lon, lat])) ?? (f && img[o + 3] > 200 ? f : undefined);
}

function toLatLon(p: THREE.Vector3) {
  const r = p.length();
  const lat = 90 - (Math.acos(p.y / r) * 180) / Math.PI;
  const lon = (((Math.atan2(p.z, -p.x) * 180) / Math.PI + 360) % 360) - 180;
  return { lat, lon };
}

function hatch(rgb: string, alpha: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 14;
  const x = c.getContext("2d")!;
  x.fillStyle = `rgba(${rgb},${alpha * 0.35})`;
  x.fillRect(0, 0, 14, 14);
  x.strokeStyle = `rgba(${rgb},${alpha})`;
  x.lineWidth = 2.2;
  x.beginPath();
  x.moveTo(-2, 16);
  x.lineTo(16, -2);
  x.moveTo(-2, 2);
  x.lineTo(2, -2);
  x.moveTo(12, 16);
  x.lineTo(16, 12);
  x.stroke();
  return c;
}

function CountryLayer({
  overview,
  show,
  selected,
  onPick,
}: {
  overview: CountryOverview | undefined;
  show: boolean;
  selected: string | null;
  onPick: (iso3: string | null, lat: number, lon: number) => void;
}) {
  const img = usePickCanvas();
  const byNum = useMemo(() => new Map(overview?.list.filter((c) => c.num).map((c) => [c.num!, c]) ?? []), [overview]);
  const [hover, setHover] = useState<{ name: string; p: THREE.Vector3; note: string } | null>(null);
  const { canvas, tex } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = TW;
    canvas.height = TH;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return { canvas, tex };
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);

  useEffect(() => {
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, TW, TH);
    const path = geoPath(geoEquirectangular().scale(TW / (2 * Math.PI)).translate([TW / 2, TH / 2]), ctx);
    const patterns = [0.7, 0.5, 0.3].map((a) => ctx.createPattern(hatch(CONFLICT_RGB, a), "repeat")!);
    for (const f of COUNTRY_FEATURES) {
      const c = byNum.get(f.id ?? "");
      const isSel = !!c && c.iso3 === selected;
      const conf = c && show ? overview?.conflict[c.iso3] : undefined;
      const pos = c && show ? overview?.positive[c.iso3] ?? 0 : 0;
      if (!conf && !pos && !isSel) continue;
      ctx.beginPath();
      path(f);
      if (pos) {
        ctx.fillStyle = `rgba(${POSITIVE_RGB},${Math.min(0.3, 0.12 + pos * 0.04)})`;
        ctx.fill();
      }
      if (conf) {
        ctx.fillStyle = patterns[Math.min(3, conf.tier) - 1];
        ctx.fill();
      }
      if (isSel) {
        ctx.fillStyle = "rgba(43,212,224,0.32)";
        ctx.fill();
        ctx.strokeStyle = "rgba(120,240,255,0.95)";
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    }
    tex.needsUpdate = true;
  }, [canvas, tex, overview, byNum, show, selected]);

  const at = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const { lat, lon } = toLatLon(e.point);
    const f = pick(img, lat, lon);
    return { f, lat, lon, c: f ? byNum.get(f.id ?? "") : undefined };
  };
  return (
    <group>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta > 5) return;
          const { c, lat, lon } = at(e);
          onPick(c?.iso3 ?? null, lat, lon);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          const { f, c } = at(e);
          const name = c?.name ?? f?.properties.name;
          if (!name) return setHover(null);
          if (hover?.name === name) return;
          const conf = c ? overview?.conflict[c.iso3] : undefined;
          const pos = c ? overview?.positive[c.iso3] : undefined;
          const note = [conf ? (conf.tier === 1 ? "Krieg" : conf.tier === 2 ? "bewaffneter Konflikt" : "Konfliktgebiet") : "", pos ? `${pos} positive Meldung${pos > 1 ? "en" : ""}` : ""]
            .filter(Boolean)
            .join(" · ");
          setHover({ name, p: e.point.clone().multiplyScalar(1.02), note });
        }}
        onPointerOut={() => setHover(null)}
      >
        <sphereGeometry args={[R * 0.9995, 128, 96]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {hover && (
        <Label position={hover.p} className="small">
          <b>{hover.name}</b>
          {hover.note && (
            <>
              <br />
              <small>{hover.note}</small>
            </>
          )}
        </Label>
      )}
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
  preds,
  selected,
  onClick,
}: {
  name: string;
  lat: number;
  lon: number;
  count: number | null;
  preds: number;
  selected: boolean;
  onClick: () => void;
}) {
  const [hover, bind] = useHover();
  const p = latLon(lat, lon, R * 1.01);
  const ring = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ring.current) ring.current.rotation.z += dt * 0.8;
  });
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
      {preds > 0 && (
        <mesh ref={ring} rotation={[1.1, 0.3, 0]}>
          <torusGeometry args={[size + 0.035, 0.004, 6, 48, Math.PI * (0.4 + Math.min(preds, 8) * 0.2)]} />
          <meshBasicMaterial color="#b58cff" toneMapped={false} />
        </mesh>
      )}
      {(hover || selected) && (
        <Label position={[0, size + 0.12, 0]}>
          <b>{name}</b>
          <br />
          <small>
            {count == null ? "Nachrichten laden …" : `${count}${count >= 250 ? "+" : ""} Meldungen in 24 h`}
            {preds > 0 && ` · ${preds} Prognosen`}
          </small>
        </Label>
      )}
    </group>
  );
}

/** Engpass des Seehandels: ein Tor auf der Oberfläche, Farbe nach Nachrichtenlage. */
function ChokeGate({
  name,
  lat,
  lon,
  count,
  preds,
  selected,
  onClick,
  transit,
}: {
  name: string;
  lat: number;
  lon: number;
  count: number | null;
  preds: number;
  transit?: Transit;
  selected: boolean;
  onClick: () => void;
}) {
  const [hover, bind] = useHover();
  const p = latLon(lat, lon, R);
  const q = upTo(p);
  const t = count == null ? 0 : Math.sqrt(Math.min(count, 150) / 150);
  // Mit Schiffsdaten färbt der Rückgang zum Vorjahr das Tor, sonst die Nachrichtenlage.
  const drop = transit?.change != null ? Math.min(1, Math.max(0, -transit.change / 60)) : null;
  const color = drop != null ? mix("#46e0c8", "#ff4d6d", drop) : count == null ? "#55606e" : mix("#46e0c8", "#ff4d6d", t);
  const r = 0.055;
  return (
    <group position={p} quaternion={q}>
      <Pulse speed={0.6 + t * 1.5} amp={0.08}>
        <mesh
          position={[0, r, 0]}
          {...bind}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <torusGeometry args={[r, 0.011, 10, 40, Math.PI]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hover || selected ? 3 : 1.5} toneMapped={false} />
        </mesh>
      </Pulse>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[r - 0.012, r + 0.012, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      {(hover || selected) && (
        <Label position={[0, r * 2 + 0.12, 0]}>
          <b>{name}</b>
          {transit && <><br />{Math.round(transit.avg7)} Schiffe am Tag{transit.change != null && ` (${transit.change > 0 ? "+" : ""}${Math.round(transit.change)} % zum Vorjahr)`}</>}
          <br />
          <small>
            Engpass · {count == null ? "Nachrichten laden …" : `${count}${count >= 250 ? "+" : ""} Meldungen in 24 h`}
            {preds > 0 && ` · ${preds} Prognosen`}
          </small>
        </Label>
      )}
    </group>
  );
}

/** Naturereignis: flacher Ring auf der Oberfläche, Größe nach Stärke bzw. Warnstufe. */
function EventMarker({ ev, selected, onClick }: { ev: GeoEvent; selected: boolean; onClick: () => void }) {
  const [hover, bind] = useHover();
  const p = latLon(ev.lat, ev.lon, R * 1.002);
  const q = upTo(p);
  const k = EVENT_KIND[ev.kind];
  const sev = ev.mag != null ? Math.max(0, ev.mag - 4.5) / 3 : ev.alert === "red" ? 1 : ev.alert === "orange" ? 0.6 : 0.25;
  const r = 0.018 + Math.min(1, sev) * 0.05;
  const loud = sev >= 0.5 || ev.alert === "orange" || ev.alert === "red";
  const ring = (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[r * 0.55, r, 28]} />
      <meshBasicMaterial color={k.color} transparent opacity={hover || selected ? 1 : 0.75} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
  return (
    <group position={p} quaternion={q}>
      <mesh
        {...bind}
        position={[0, 0.006, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <sphereGeometry args={[r * 0.45, 12, 12]} />
        <meshStandardMaterial color={k.color} emissive={k.color} emissiveIntensity={hover || selected ? 3 : 1.4} toneMapped={false} />
      </mesh>
      {loud ? (
        <Pulse speed={1.4} amp={0.35}>
          {ring}
        </Pulse>
      ) : (
        ring
      )}
      {(hover || selected) && (
        <Label position={[0, r + 0.1, 0]}>
          <b>{ev.name}</b>
          <br />
          <small>
            {k.name}
            {ev.alert ? ` · Warnstufe ${ALERT_DE[ev.alert]}` : ""} · {new Date(ev.time).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
          </small>
        </Label>
      )}
    </group>
  );
}


/** Startbasis: schlanke Rakete auf der Oberfläche, Höhe nach Zahl der angekündigten Starts. */
function LaunchMarker({ site, selected, onClick }: { site: LaunchSite; selected: boolean; onClick: () => void }) {
  const [hover, bind] = useHover();
  const p = latLon(site.lat, site.lon, R);
  const q = upTo(p);
  const next = site.launches.find((l) => Date.parse(l.net) > Date.now() - 3600_000);
  const soon = next ? Date.parse(next.net) - Date.now() < 2 * 86400_000 : false;
  const h = 0.07 + Math.min(site.launches.length, 20) * 0.006;
  const color = "#d7c8ff";
  return (
    <group position={p} quaternion={q}>
      <group
        {...bind}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <mesh position={[0, h / 2, 0]}>
          <cylinderGeometry args={[0.009, 0.012, h, 10]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hover || selected ? 2.6 : 1.2} toneMapped={false} />
        </mesh>
        <mesh position={[0, h + 0.018, 0]}>
          <coneGeometry args={[0.012, 0.036, 10]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
      </group>
      {soon ? (
        <Pulse speed={1.8} amp={0.4}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
            <ringGeometry args={[0.022, 0.034, 24]} />
            <meshBasicMaterial color="#b58cff" transparent opacity={0.8} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        </Pulse>
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
          <ringGeometry args={[0.022, 0.03, 24]} />
          <meshBasicMaterial color="#b58cff" transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      )}
      {(hover || selected) && (
        <Label position={[0, h + 0.13, 0]}>
          <b>{site.name.split(",")[0]}</b>
          <br />
          <small>
            {site.launches.length} Start{site.launches.length > 1 ? "s" : ""} angekündigt
            {next && ` · nächster ${new Date(next.net).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
          </small>
        </Label>
      )}
    </group>
  );
}

/** Stimmungsbarometer als Mond: kreist schräg um die Erde, Farbe und Glut nach dem Indexwert. */
function MoodMoon({ data, selected, onClick }: { data: Sentiment | undefined; selected: boolean; onClick: () => void }) {
  const [hover, bind] = useHover();
  const orbit = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  useFrame((st, dt) => {
    if (orbit.current && !hover && !selected) orbit.current.rotation.y += dt * 0.07;
    if (halo.current) halo.current.scale.setScalar(1 + Math.sin(st.clock.elapsedTime * 1.6) * 0.06);
  });
  const score = data?.score ?? null;
  const c = moodColor(score);
  const d = 3.35;
  return (
    <group rotation={[0.38, 0, 0.12]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[d, 0.003, 6, 160]} />
        <meshBasicMaterial color={c} transparent opacity={0.18} toneMapped={false} />
      </mesh>
      <group ref={orbit} rotation={[0, 0.9, 0]}>
        <group position={[d, 0, 0]}>
          <mesh
            {...bind}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            <sphereGeometry args={[0.16, 40, 40]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={hover || selected ? 1.6 : 0.75} roughness={0.55} toneMapped={false} />
          </mesh>
          <mesh ref={halo}>
            <sphereGeometry args={[0.22, 32, 32]} />
            <meshBasicMaterial color={c} transparent opacity={0.12} depthWrite={false} toneMapped={false} />
          </mesh>
          {score != null && (
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.27, 0.007, 8, 64, (score / 100) * Math.PI * 2]} />
              <meshBasicMaterial color={c} toneMapped={false} />
            </mesh>
          )}
          <Label position={[0, 0.42, 0]} className="small">
            <b style={{ color: c }}>{score ?? "…"}</b> Stimmung
            {(hover || selected) && data && (
              <>
                <br />
                <small>{data.label}</small>
              </>
            )}
          </Label>
        </group>
      </group>
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
  predictions,
  events,
  overview,
  launches,
  mood,
  explode = false,
  traffic,
}: {
  traffic?: Transit[];
  explode?: boolean;
  world: World | undefined;
  events: GeoEvent[] | undefined;
  overview: CountryOverview | undefined;
  launches: LaunchSite[] | undefined;
  mood: Sentiment | undefined;
  heat: HotspotHeat[] | undefined;
  predictions: Prediction[] | undefined;
  layers: Layers;
  sel: GlobeSel;
  onSelect: (s: GlobeSel) => void;
  marketDetail: MarketDetail | undefined;
}) {
  const heatMap = new Map(heat?.map((h) => [h.id, h.count]) ?? []);
  const predCount = (id: string) => predictions?.filter((p) => p.hotspots.includes(id)).length ?? 0;
  const selMarket = sel?.type === "market" ? world?.markets.find((m) => m.id === sel.id) : undefined;
  return (
    <group onPointerMissed={() => onSelect(null)}>
      <Earth explode={explode} />
      {!explode && (
        <>
      <CountryLayer
        overview={overview}
        show={layers.countries}
        selected={sel?.type === "country" ? sel.id : null}
        onPick={(iso3, lat, lon) => onSelect(iso3 ? { type: "country", id: iso3, lat, lon } : null)}
      />
      {layers.mood && <MoodMoon data={mood} selected={sel?.type === "mood"} onClick={() => onSelect({ type: "mood", id: "mood" })} />}
      {layers.launches &&
        launches?.map((s) => (
          <LaunchMarker key={s.id} site={s} selected={sel?.type === "launch" && sel.id === s.id} onClick={() => onSelect({ type: "launch", id: s.id })} />
        ))}
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
      {world?.hotspots.map((h) => {
        const common = {
          name: h.name,
          lat: h.lat,
          lon: h.lon,
          count: heatMap.get(h.id) ?? null,
          preds: predCount(h.id),
          selected: sel?.type === "hotspot" && sel.id === h.id,
          onClick: () => onSelect({ type: "hotspot", id: h.id }),
        };
        if (h.kind === "engpass") return layers.chokepoints ? <ChokeGate key={h.id} {...common} transit={traffic?.find((t) => t.id === h.id)} /> : null;
        return layers.hotspots ? <HotspotOrb key={h.id} {...common} /> : null;
      })}
      {events
        ?.filter(() => layers.events)
        .map((ev) => (
          <EventMarker key={ev.id} ev={ev} selected={sel?.type === "event" && sel.id === ev.id} onClick={() => onSelect({ type: "event", id: ev.id })} />
        ))}
        </>
      )}
    </group>
  );
}
