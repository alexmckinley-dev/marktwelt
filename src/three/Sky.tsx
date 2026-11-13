// Echter Sternenhimmel um den Globus. Der Globus steht fest (Längengrad 0 bleibt, wo er ist),
// also dreht sich der Himmel einmal je Sterntag um ihn: Ein Stern mit Rektaszension α und
// Deklination δ steht genau über dem Punkt Breite δ, Länge α − Sternzeit Greenwich.
// Die Kugel wandert mit der Kamera mit, damit die Sterne wie unendlich fern wirken.
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { gstime } from "satellite.js";
import * as THREE from "three";
import type { Sky } from "../api";
import { R } from "./Globe";
import { Label, latLon } from "./common";

const SKY_R = 2600;

/** Sternfarbe aus dem Farbindex B−V, leicht entsättigt wie mit bloßem Auge. */
const BV: [number, string][] = [
  [-0.4, "#9bb2ff"],
  [0, "#c8d6ff"],
  [0.4, "#f4f3ff"],
  [0.8, "#fff1e0"],
  [1.2, "#ffd9a8"],
  [1.6, "#ffc07a"],
  [2.0, "#ffa860"],
];
function bvColor(bv: number, out: THREE.Color) {
  const i = BV.findIndex(([b]) => b > bv);
  if (i <= 0) return out.set(BV[i === 0 ? 0 : BV.length - 1][1]);
  const [b0, c0] = BV[i - 1];
  const [b1, c1] = BV[i];
  return out.set(c0).lerp(new THREE.Color(c1), (bv - b0) / (b1 - b0));
}

const vert = /* glsl */ `
  attribute float size;
  attribute vec3 color;
  varying vec3 vColor;
  uniform float px;
  void main() {
    vColor = color;
    gl_PointSize = size * px;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const frag = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    a *= a;
    gl_FragColor = vec4(vColor, a);
  }`;

export function SkyLayer({ data, constellations }: { data: Sky | undefined; constellations: boolean }) {
  const { camera, gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);

  // Sterne in Rektaszension/Deklination aufbauen; die Drehung um die Erdachse macht danach die Gruppe.
  const stars = useMemo(() => {
    const list = data?.stars ?? [];
    const pos = new Float32Array(list.length * 3);
    const col = new Float32Array(list.length * 3);
    const size = new Float32Array(list.length);
    const c = new THREE.Color();
    list.forEach(([ra, dec, mag, bv], i) => {
      const v = latLon(dec, ra, SKY_R);
      pos.set([v.x, v.y, v.z], i * 3);
      // Helligkeit: jede Größenklasse ist 2,5-mal schwächer; auf dem Bildschirm gestaucht
      const k = Math.pow(10, -0.4 * (mag - 6)) ** 0.33; // 1 bei mag 6, ~6 bei Sirius
      bvColor(bv, c).multiplyScalar(Math.min(1, 0.32 + k * 0.17));
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = Math.min(9, 1.6 + k * 1.15);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("size", new THREE.BufferAttribute(size, 1));
    return g;
  }, [data]);

  const lines = useMemo(() => {
    const pos: number[] = [];
    for (const l of data?.lines ?? []) {
      for (let i = 2; i < l.length; i += 2) {
        const a = latLon(l[i - 1], l[i - 2], SKY_R * 0.999);
        const b = latLon(l[i + 1], l[i], SKY_R * 0.999);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [data]);

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { px: { value: Math.min(2, gl.getPixelRatio()) } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [gl],
  );

  // Schild ausblenden, wenn die Erde zwischen Kamera und Stern steht
  const ray = useMemo(() => new THREE.Ray(), []);
  const sphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(), R * 1.02), []);
  const behindEarth = (w: THREE.Vector3) => {
    ray.origin.copy(camera.position);
    ray.direction.copy(w).sub(camera.position).normalize();
    return ray.intersectsSphere(sphere);
  };

  const last = useRef(0);
  useFrame(() => {
    if (group.current) group.current.position.copy(camera.position);
    const now = Date.now();
    if (spin.current && now - last.current > 5000) {
      last.current = now;
      // Länge = α − GMST; eine Drehung um +y um a erhöht in latLon die Länge um a, also a = −GMST
      spin.current.rotation.y = -gstime(new Date());
    }
  });

  if (!data) return null;
  return (
    <group ref={group}>
      <group ref={spin}>
        <points geometry={stars} material={mat} frustumCulled={false} />
        {constellations && (
          <>
            <lineSegments geometry={lines} frustumCulled={false}>
              <lineBasicMaterial color="#5f86c4" transparent opacity={0.35} depthWrite={false} fog={false} />
            </lineSegments>
            {data.constellations
              .filter((c) => c.rank <= 2)
              .map((c) => (
                <Label key={c.id} position={latLon(c.dec, c.ra, SKY_R * 0.998)} className="sky" hideIf={behindEarth}>
                  {c.name}
                </Label>
              ))}
            {data.named.map((s) => (
              <Label key={s.name} position={latLon(s.dec, s.ra, SKY_R * 0.998)} className="sky star" hideIf={behindEarth}>
                {s.name}
              </Label>
            ))}
          </>
        )}
      </group>
    </group>
  );
}
