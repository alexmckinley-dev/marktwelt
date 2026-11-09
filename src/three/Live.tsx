// Lebende Ebenen auf dem Globus: Flugzeuge (fortgeschrieben nach Kurs und Tempo), Polarlichtoval,
// Unterseekabel und der Zeitraffer der Ereignisse der letzten 30 Tage.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Cables, Flights, GeoEvent, SpaceWeather } from "../api";
import { R, EVENT_KIND } from "./Globe";

const D2R = Math.PI / 180;
function setXYZ(a: Float32Array, i: number, lat: number, lon: number, r: number) {
  const phi = (90 - lat) * D2R;
  const th = (lon + 180) * D2R;
  a[i * 3] = -r * Math.sin(phi) * Math.cos(th);
  a[i * 3 + 1] = r * Math.cos(phi);
  a[i * 3 + 2] = r * Math.sin(phi) * Math.sin(th);
}

// ---------- Flugzeuge ----------

/** Flugzeuge als Lichtpunkte knapp über der Erde. Zwischen zwei Abrufen fliegen sie nach Kurs und Tempo weiter. */
export function FlightLayer({ data }: { data: Flights | undefined }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((data?.flights.length ?? 0) * 3), 3));
    return g;
  }, [data]);
  const t0 = useMemo(() => (data ? new Date(data.time).getTime() : 0), [data]);
  const last = useRef(0);
  useFrame(() => {
    if (!data) return;
    const now = Date.now();
    if (now - last.current < 500) return; // zweimal je Sekunde reicht, die Punkte bewegen sich langsam
    last.current = now;
    const dt = Math.min(20 * 60, (now - t0) / 1000);
    const a = (geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    data.flights.forEach(([lon, lat, track, alt, vel], i) => {
      const d = (vel * dt) / 111320; // zurückgelegte Grad
      const la = lat + d * Math.cos(track * D2R);
      const lo = lon + (d * Math.sin(track * D2R)) / Math.max(0.2, Math.cos(lat * D2R));
      setXYZ(a, i, la, lo, R * (1.006 + Math.min(alt, 13000) / 13000 * 0.012));
    });
    geo.attributes.position.needsUpdate = true;
  });
  if (!data) return null;
  return (
    <points geometry={geo}>
      <pointsMaterial size={1.6} sizeAttenuation={false} color="#ffc46b" transparent opacity={0.75} depthWrite={false} toneMapped={false} />
    </points>
  );
}

// ---------- Polarlicht ----------

export function AuroraLayer({ data }: { data: SpaceWeather | undefined }) {
  const geo = useMemo(() => {
    const pts = data?.aurora ?? [];
    const pos = new Float32Array(pts.length * 3);
    const col = new Float32Array(pts.length * 3);
    const c = new THREE.Color();
    pts.forEach(([lon, lat, p], i) => {
      setXYZ(pos, i, lat, lon, R * 1.025);
      const k = Math.min(1, p / 60);
      c.set(k > 0.6 ? "#b0ff8a" : "#2ee68c").multiplyScalar(0.25 + k * 0.9);
      col.set([c.r, c.g, c.b], i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [data]);
  if (!data) return null;
  return (
    <points geometry={geo}>
      <pointsMaterial size={3.2} sizeAttenuation={false} vertexColors transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}

// ---------- Unterseekabel ----------

export function CableLayer({ data }: { data: Cables | undefined }) {
  const geo = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    const v = new Float32Array(3);
    const push = (lat: number, lon: number) => {
      setXYZ(v, 0, lat, lon, R * 1.002);
      pos.push(v[0], v[1], v[2]);
      col.push(c.r, c.g, c.b);
    };
    for (const cab of data?.cables ?? []) {
      c.set(cab.color || "#46e0c8");
      for (const l of cab.lines) {
        for (let i = 2; i < l.length; i += 2) {
          const [lo0, la0, lo1, la1] = [l[i - 2], l[i - 1], l[i], l[i + 1]];
          if (Math.abs(lo1 - lo0) > 180) continue; // Datumsgrenze
          // lange Stücke unterteilen, sonst schneidet die Sehne durch die Erde
          const n = Math.max(1, Math.ceil(Math.hypot(lo1 - lo0, la1 - la0) / 2));
          for (let k = 0; k < n; k++) {
            const a = k / n;
            const b = (k + 1) / n;
            push(la0 + (la1 - la0) * a, lo0 + (lo1 - lo0) * a);
            push(la0 + (la1 - la0) * b, lo0 + (lo1 - lo0) * b);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [data]);
  if (!data) return null;
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial vertexColors transparent opacity={0.3} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}

// ---------- Zeitraffer ----------

const DAY = 86400_000;

/** Ereignisse bis zum Zeitpunkt t: frische groß und hell, ältere verblassen über sieben Tage. */
export function TimelapseLayer({ events, t }: { events: GeoEvent[]; t: number }) {
  const times = useMemo(() => events.map((e) => new Date(e.time).getTime()), [events]);
  const geos = useMemo(() => {
    const mk = () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(events.length * 3), 3));
      g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(events.length * 3), 3));
      return g;
    };
    return { fresh: mk(), old: mk() };
  }, [events]);
  useMemo(() => {
    const c = new THREE.Color();
    const fill = (g: THREE.BufferGeometry, pick: (age: number) => number | null) => {
      const pos = (g.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const col = (g.attributes.color as THREE.BufferAttribute).array as Float32Array;
      let n = 0;
      events.forEach((e, i) => {
        const age = t - times[i];
        const k = age < 0 ? null : pick(age);
        if (k == null) return;
        setXYZ(pos, n, e.lat, e.lon, R * 1.008);
        c.set(EVENT_KIND[e.kind].color).multiplyScalar(k);
        col.set([c.r, c.g, c.b], n * 3);
        n++;
      });
      g.setDrawRange(0, n);
      g.attributes.position.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
    };
    fill(geos.fresh, (age) => (age < DAY ? 1.4 - age / DAY / 2 : null));
    fill(geos.old, (age) => (age >= DAY ? Math.max(0.15, 0.7 - age / (7 * DAY)) : null));
  }, [t, events, times, geos]);
  return (
    <group>
      <points geometry={geos.old}>
        <pointsMaterial size={3} sizeAttenuation={false} vertexColors transparent opacity={0.8} depthWrite={false} toneMapped={false} />
      </points>
      <points geometry={geos.fresh}>
        <pointsMaterial size={9} sizeAttenuation={false} vertexColors transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </points>
    </group>
  );
}
