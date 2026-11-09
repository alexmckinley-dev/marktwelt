// Weltraum um den Globus: Satelliten aus echten Bahndaten (SGP4) und beim Rauszoomen das Sonnensystem
// mit den heutigen Positionen der Planeten. Höhen und Entfernungen sind gestaucht, Richtungen stimmen.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { eciToGeodetic, gstime, propagate, twoline2satrec, type SatRec } from "satellite.js";
import * as THREE from "three";
import type { Satellites } from "../api";
import { mix as mixHex } from "../format";
import { Label, latLon, useHover } from "./common";
import { R, type GlobeSel } from "./Globe";

// ---------- Maßstab ----------

/** Höhe über Grund (km) → Abstand vom Erdmittelpunkt in Szeneneinheiten, wurzelgestaucht. */
export const rSat = (km: number) => R * (1 + 0.29 * Math.sqrt(Math.max(0, km) / 1000));
/** Entfernung von der Sonne (AE) → Szeneneinheiten. */
const AU_S = 70;
const comp = (au: number) => AU_S * Math.pow(au, 0.55);

/** Ist die Kamera weiter als `d` vom Ursprung entfernt? Ändert sich nur beim Überschreiten. */
export function useFar(d: number) {
  const { camera } = useThree();
  const [far, setFar] = useState(false);
  useFrame(() => {
    const f = camera.position.length() > d;
    if (f !== far) setFar(f);
  });
  return far;
}

// ---------- Satelliten ----------

type Named = Satellites["named"][number] & { rec: SatRec };

export type SatState = { lat: number; lon: number; alt: number; speed: number; incl: number; period: number };

function satState(rec: SatRec, t: Date): (SatState & { p: THREE.Vector3 }) | null {
  const pv = propagate(rec, t);
  if (!pv || typeof pv.position !== "object") return null;
  const g = eciToGeodetic(pv.position, gstime(t));
  const lat = (g.latitude * 180) / Math.PI;
  const lon = (g.longitude * 180) / Math.PI;
  const v = pv.velocity;
  return {
    lat,
    lon,
    alt: g.height,
    speed: Math.hypot(v.x, v.y, v.z),
    incl: (rec.inclo * 180) / Math.PI,
    period: (2 * Math.PI) / rec.no,
    p: latLon(lat, lon, rSat(g.height)),
  };
}

/** Kleines Modell: Rumpf plus Solarflächen, dazu ein Lichtpunkt, damit es aus der Ferne sichtbar bleibt. */
function SatModel({ kind, hot }: { kind: string; hot: boolean }) {
  const c = hot ? "#ffffff" : "#dfe8f5";
  const panel = "#3d7bd9";
  if (kind === "Raumstation")
    return (
      <group scale={0.9}>
        <mesh>
          <boxGeometry args={[0.012, 0.012, 0.05]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={hot ? 1.5 : 0.6} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.11, 0.003, 0.016]} />
          <meshStandardMaterial color={panel} emissive={panel} emissiveIntensity={0.8} />
        </mesh>
      </group>
    );
  if (kind === "Weltraumteleskop")
    return (
      <group>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.04, 12]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={hot ? 1.5 : 0.6} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.05, 0.002, 0.012]} />
          <meshStandardMaterial color={panel} emissive={panel} emissiveIntensity={0.8} />
        </mesh>
      </group>
    );
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.01, 0.01, 0.014]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={hot ? 1.5 : 0.6} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.045, 0.002, 0.01]} />
        <meshStandardMaterial color={panel} emissive={panel} emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

function NamedSat({ sat, selected, onClick, onState }: { sat: Named; selected: boolean; onClick: () => void; onState: (s: SatState) => void }) {
  const [hover, bind] = useHover();
  const g = useRef<THREE.Group>(null);
  const last = useRef(0);
  useFrame(() => {
    const st = satState(sat.rec, new Date());
    if (!st || !g.current) return;
    g.current.position.copy(st.p);
    g.current.lookAt(0, 0, 0);
    if (selected && performance.now() - last.current > 1000) {
      last.current = performance.now();
      onState(st);
    }
  });
  // eine Bahnumrundung als Linie, nur bei Hover oder Auswahl
  const orbit = useMemo(() => {
    if (!hover && !selected) return null;
    const now = Date.now();
    const per = ((2 * Math.PI) / sat.rec.no) * 60_000;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 160; i++) {
      const st = satState(sat.rec, new Date(now + (i / 160) * per));
      if (st) pts.push(st.p);
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [hover, selected, sat.rec]);
  return (
    <>
      <group ref={g}>
        <group
          {...bind}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <SatModel kind={sat.kind} hot={hover || selected} />
          <mesh>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
        <mesh>
          <sphereGeometry args={[0.009, 8, 8]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        {(hover || selected) && (
          <Label position={[0, 0, 0.12]} className="small">
            <b>{sat.name}</b> · {sat.kind}
          </Label>
        )}
      </group>
      {orbit && (
        <line>
          <primitive object={orbit} attach="geometry" />
          <lineBasicMaterial color="#9fd8ff" transparent opacity={0.45} />
        </line>
      )}
    </>
  );
}

/** Schwärme (Starlink, GPS …) als feine Punkte; je Bild wird nur ein Teil neu berechnet. */
/** focus: 1 hervorgehoben, 0 normal, −1 abgeblendet, weil eine andere Gruppe im Fokus ist. */
function Swarm({ tle, color, focus }: { tle: readonly (readonly [string, string])[]; color: string; focus: 1 | 0 | -1 }) {
  const recs = useMemo(() => tle.map(([a, b]) => twoline2satrec(a, b)), [tle]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(recs.length * 3), 3));
    return g;
  }, [recs]);
  const cursor = useRef(0);
  const first = useRef(true);
  useFrame(() => {
    const n = recs.length;
    if (!n) return;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const t = new Date();
    const gmst = gstime(t);
    const step = first.current ? n : Math.ceil(n / 40);
    first.current = false;
    for (let k = 0; k < step; k++) {
      const i = cursor.current;
      cursor.current = (i + 1) % n;
      const pv = propagate(recs[i], t);
      if (!pv || typeof pv.position !== "object") {
        pos.setXYZ(i, 0, 0, 0);
        continue;
      }
      const g = eciToGeodetic(pv.position, gmst);
      const r = rSat(g.height);
      const phi = Math.PI / 2 - g.latitude;
      const th = g.longitude + Math.PI;
      pos.setXYZ(i, -r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
    }
    pos.needsUpdate = true;
  });
  return (
    <points geometry={geo}>
      <pointsMaterial
        size={focus === 1 ? 3 : 1.2}
        sizeAttenuation={false}
        color={focus === 1 ? mixHex(color, "#ffffff", 0.25) : color}
        transparent
        opacity={focus === 1 ? 1 : focus === -1 ? 0.05 : 0.32}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

export function SatelliteLayer({
  data,
  sel,
  onSelect,
  onState,
  show = {},
  focus = null,
}: {
  data: Satellites | undefined;
  sel: GlobeSel;
  onSelect: (s: GlobeSel) => void;
  onState: (s: SatState) => void;
  show?: Record<string, boolean>;
  focus?: string | null;
}) {
  const named = useMemo(() => data?.named.map((n) => ({ ...n, rec: twoline2satrec(n.l1, n.l2) })) ?? [], [data]);
  return (
    <group>
      {data?.swarms
        .filter((s) => show[s.id] !== false)
        .map((s) => (
          <Swarm key={s.id} tle={s.tle} color={s.color} focus={!focus ? 0 : focus === s.id ? 1 : -1} />
        ))}
      {show.named !== false && named.map((n) => (
        <NamedSat key={n.id} sat={n} selected={sel?.type === "sat" && sel.id === n.id} onClick={() => onSelect({ type: "sat", id: n.id })} onState={onState} />
      ))}
    </group>
  );
}

// ---------- Sonnensystem ----------

// Bahnelemente nach JPL (Standish), gültig 1800 bis 2050: a, e, I, L, ϖ, Ω und ihre Änderung je Jahrhundert.
type Elements = [number, number, number, number, number, number];
export const BODIES: {
  id: string;
  name: string;
  el: Elements;
  rate: Elements;
  size: number;
  color: string;
  rings?: boolean;
}[] = [
  { id: "merkur", name: "Merkur", el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081], size: 0.5, color: "#a8a39d" },
  { id: "venus", name: "Venus", el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418], size: 0.95, color: "#e8c98a" },
  { id: "erde", name: "Erde", el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0], size: 0, color: "#2bd4e0" },
  { id: "mars", name: "Mars", el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343], size: 0.7, color: "#d0643c" },
  { id: "jupiter", name: "Jupiter", el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106], size: 3.2, color: "#d8b48a" },
  { id: "saturn", name: "Saturn", el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794], size: 2.7, color: "#e6d29a", rings: true },
  { id: "uranus", name: "Uranus", el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589], size: 1.6, color: "#9fe0e6" },
  { id: "neptun", name: "Neptun", el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664], size: 1.55, color: "#4f7dff" },
  { id: "pluto", name: "Pluto", el: [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684], rate: [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482], size: 0.35, color: "#c9b8a6" },
];

const D2R = Math.PI / 180;

/** Heliozentrische Ekliptik-Koordinaten in AE; `mOverride` setzt die mittlere Anomalie (für Bahnlinien). */
export function helio(b: (typeof BODIES)[number], t: Date, mOverride?: number) {
  const T = (t.getTime() / 86400000 + 2440587.5 - 2451545) / 36525;
  const [a, e, I, L, wbar, O] = b.el.map((v, i) => v + b.rate[i] * T);
  const w = (wbar - O) * D2R;
  const M = mOverride ?? (((L - wbar) % 360) + 360) % 360 * D2R;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O * D2R), sO = Math.sin(O * D2R), cI = Math.cos(I * D2R), sI = Math.sin(I * D2R);
  return new THREE.Vector3(
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  );
}

const compress = (v: THREE.Vector3) => v.clone().setLength(comp(v.length()));

/** Ekliptik → Szene: über Äquator (Schiefe 23,44°) und Erddrehung (Sternzeit) in den erdfesten Rahmen des Globus. */
function eclToSceneMatrix(t: Date) {
  const eps = 23.43928 * D2R;
  const g = gstime(t);
  const f = (v: THREE.Vector3) => {
    const xe = v.x, ye = v.y * Math.cos(eps) - v.z * Math.sin(eps), ze = v.y * Math.sin(eps) + v.z * Math.cos(eps);
    const xf = xe * Math.cos(g) + ye * Math.sin(g), yf = -xe * Math.sin(g) + ye * Math.cos(g);
    return new THREE.Vector3(xf, ze, -yf);
  };
  return new THREE.Matrix4().makeBasis(f(new THREE.Vector3(1, 0, 0)), f(new THREE.Vector3(0, 1, 0)), f(new THREE.Vector3(0, 0, 1)));
}

/** Szenenposition eines Körpers jetzt (für Kameraflug und Panel). */
export function bodyScenePos(id: string, t = new Date()) {
  const earth = compress(helio(BODIES[2], t));
  const local = id === "sonne" ? new THREE.Vector3() : compress(helio(BODIES.find((b) => b.id === id)!, t));
  return local.sub(earth).applyMatrix4(eclToSceneMatrix(t));
}

function OrbitLine({ b }: { b: (typeof BODIES)[number] }) {
  const geo = useMemo(() => {
    const t = new Date();
    const pts = Array.from({ length: 241 }, (_, i) => compress(helio(b, t, (i / 240) * Math.PI * 2)));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [b]);
  return (
    <line>
      <primitive object={geo} attach="geometry" />
      <lineBasicMaterial color={b.color} transparent opacity={b.id === "erde" ? 0.35 : 0.22} depthWrite={false} />
    </line>
  );
}

function Planet({ b, far, selected, onClick }: { b: (typeof BODIES)[number]; far: boolean; selected: boolean; onClick: () => void }) {
  const [hover, bind] = useHover();
  const pos = useMemo(() => compress(helio(b, new Date())), [b]);
  const spin = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.15;
  });
  return (
    <group position={pos}>
      <mesh
        ref={spin}
        {...bind}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <sphereGeometry args={[b.size, 40, 40]} />
        <meshStandardMaterial color={b.color} emissive={b.color} emissiveIntensity={hover || selected ? 0.25 : 0.07} roughness={0.9} />
      </mesh>
      {b.rings && (
        <mesh rotation={[Math.PI / 2 - 0.47, 0, 0]}>
          <ringGeometry args={[b.size * 1.3, b.size * 2.2, 96]} />
          <meshBasicMaterial color="#d9c48f" transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      )}
      {(far || hover || selected) && (
        <Label position={[0, b.size + 1.2, 0]} className="small">
          <b>{b.name}</b>
        </Label>
      )}
    </group>
  );
}

function Belt() {
  const geo = useMemo(() => {
    const n = 1800;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = 2.2 + Math.random() * 1.1;
      const th = Math.random() * Math.PI * 2;
      const z = (Math.random() - 0.5) * 0.25 * a;
      const v = compress(new THREE.Vector3(Math.cos(th) * a, Math.sin(th) * a, z));
      p.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, []);
  return (
    <points geometry={geo}>
      <pointsMaterial size={1.4} sizeAttenuation={false} color="#a99c88" transparent opacity={0.5} depthWrite={false} />
    </points>
  );
}

export function SolarSystem({ sel, onSelect }: { sel: GlobeSel; onSelect: (s: GlobeSel) => void }) {
  const grp = useRef<THREE.Group>(null);
  const far = useFar(40);
  const [sunHover, sunBind] = useHover();
  // Rahmen alle 5 s nachführen: Erde wandert, der Globus dreht sich mit der Sternzeit.
  const update = () => {
    const t = new Date();
    const m = eclToSceneMatrix(t).multiply(new THREE.Matrix4().makeTranslation(compress(helio(BODIES[2], t)).negate()));
    if (grp.current) {
      grp.current.matrix.copy(m);
      grp.current.matrixWorldNeedsUpdate = true;
    }
  };
  useLayoutEffect(update, []);
  useEffect(() => {
    const id = setInterval(update, 5000);
    return () => clearInterval(id);
  }, []);
  return (
    <group ref={grp} matrixAutoUpdate={false}>
      <mesh
        {...sunBind}
        onClick={(e) => {
          e.stopPropagation();
          onSelect({ type: "body", id: "sonne" });
        }}
      >
        <sphereGeometry args={[7, 48, 48]} />
        <meshBasicMaterial color="#ffd27a" toneMapped={false} />
      </mesh>
      <mesh scale={1.35}>
        <sphereGeometry args={[7, 32, 32]} />
        <meshBasicMaterial color="#ff9f40" transparent opacity={sunHover ? 0.22 : 0.12} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight intensity={4000} distance={0} decay={1.6} color="#fff1d6" />
      {(far || sunHover || sel?.id === "sonne") && (
        <Label position={[0, 10, 0]} className="small">
          <b>Sonne</b>
        </Label>
      )}
      {BODIES.map((b) => (
        <OrbitLine key={b.id} b={b} />
      ))}
      {BODIES.filter((b) => b.id !== "erde").map((b) => (
        <Planet key={b.id} b={b} far={far} selected={sel?.type === "body" && sel.id === b.id} onClick={() => onSelect({ type: "body", id: b.id })} />
      ))}
      <Belt />
    </group>
  );
}

/** James-Webb-Teleskop am Lagrange-Punkt L2, 1,5 Mio. km von der Erde auf der sonnenabgewandten Seite. */
export function Jwst({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  const [hover, bind] = useHover();
  const pos = useMemo(() => bodyScenePos("sonne").normalize().multiplyScalar(-rSat(1_500_000)), []);
  return (
    <group position={pos}>
      <group
        {...bind}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <mesh rotation={[0, 0, Math.PI / 6]}>
          <cylinderGeometry args={[0.35, 0.35, 0.03, 6]} />
          <meshStandardMaterial color="#e9c46a" emissive="#e9c46a" emissiveIntensity={hover || selected ? 1.2 : 0.5} metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.25, 0]}>
          <boxGeometry args={[0.9, 0.02, 0.5]} />
          <meshStandardMaterial color="#b58cff" emissive="#b58cff" emissiveIntensity={0.4} />
        </mesh>
      </group>
      {(hover || selected) && (
        <Label position={[0, 0.8, 0]} className="small">
          <b>James Webb</b> · am Punkt L2
        </Label>
      )}
    </group>
  );
}
