// Orientierung auf dem Globus: Grenzen der 24 Zeitzonen (Meridiane bei 7,5° + n·15°) mit
// UTC-Versatz und Ortszeit, der Äquator und die Erdachse durch die Pole. Die Achse steht im
// erdfesten Rahmen senkrecht; gegen die Bahnen der Planeten sieht man so die Neigung von 23,4°.
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { R } from "./Globe";
import { Label, latLon } from "./common";

const ring = (pts: THREE.Vector3[]) => new THREE.BufferGeometry().setFromPoints(pts);

export function GridLayer() {
  const { camera } = useThree();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const geo = useMemo(() => {
    const r = R * 1.004;
    const zones: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 24; k++) {
      const lon = -172.5 + k * 15;
      const pts: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 3) pts.push(latLon(lat, lon, r));
      zones.push(ring(pts));
    }
    const eq: THREE.Vector3[] = [];
    for (let lon = -180; lon <= 180; lon += 2) eq.push(latLon(0, lon, R * 1.005));
    const prime: THREE.Vector3[] = [];
    for (let lat = -90; lat <= 90; lat += 3) prime.push(latLon(lat, 0, r));
    return { zones, equator: ring(eq), prime: ring(prime), axis: ring([new THREE.Vector3(0, -R * 1.45, 0), new THREE.Vector3(0, R * 1.45, 0)]) };
  }, []);

  // Schild nur auf der zugewandten Seite
  const facing = (w: THREE.Vector3) => w.dot(camera.position.clone().sub(w)) < 0;

  const labels = useMemo(() => {
    const out: { off: number; pos: THREE.Vector3; time: string }[] = [];
    for (let off = -11; off <= 12; off++) {
      const t = new Date(now.getTime() + off * 3600_000);
      out.push({ off, pos: latLon(-4, off * 15, R * 1.01), time: `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}` });
    }
    return out;
  }, [now]);

  return (
    <group>
      {geo.zones.map((g, i) => (
        <line key={i}>
          <primitive object={g} attach="geometry" />
          <lineBasicMaterial color="#7fb2e8" transparent opacity={0.16} depthWrite={false} />
        </line>
      ))}
      <line>
        <primitive object={geo.prime} attach="geometry" />
        <lineBasicMaterial color="#7fb2e8" transparent opacity={0.3} depthWrite={false} />
      </line>
      <line>
        <primitive object={geo.equator} attach="geometry" />
        <lineBasicMaterial color="#ffd27a" transparent opacity={0.6} depthWrite={false} />
      </line>
      <line>
        <primitive object={geo.axis} attach="geometry" />
        <lineBasicMaterial color="#e8f6ff" transparent opacity={0.7} depthWrite={false} />
      </line>
      <Label position={[0, R * 1.5, 0]} className="small grid">
        Nordpol
      </Label>
      <Label position={[0, -R * 1.5, 0]} className="small grid">
        Südpol
      </Label>
      {labels.map((l) => (
        <Label key={l.off} position={l.pos} className="grid tz" hideIf={facing}>
          <b>{l.off === 0 ? "UTC" : `UTC${l.off > 0 ? "+" : "−"}${Math.abs(l.off)}`}</b> {l.time}
        </Label>
      ))}
    </group>
  );
}
