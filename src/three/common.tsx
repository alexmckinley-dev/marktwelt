import { createRoot, type Root } from "react-dom/client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

export function latLon(lat: number, lon: number, r: number) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

/** Quaternion, die die Y-Achse auf die Richtung `dir` dreht (für Objekte, die aus einer Kugel ragen). */
export function upTo(dir: THREE.Vector3) {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
}

/** Fliegt Kamera und Blickziel weich zu einem Ziel; danach übernimmt OrbitControls wieder. */
export function CameraRig({ position, target, flyKey }: { position: THREE.Vector3; target: THREE.Vector3; flyKey: string }) {
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.Camera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };
  const state = useRef({ key: "", t: 1 });
  useFrame((_, dt) => {
    const s = state.current;
    if (s.key !== flyKey) {
      s.key = flyKey;
      s.t = 0;
    }
    if (s.t >= 1 || !controls) return;
    s.t = Math.min(1, s.t + dt * 0.6);
    const k = 1 - Math.exp(-dt * 4);
    camera.position.lerp(position, k);
    controls.target.lerp(target, k);
    controls.update();
  });
  return null;
}

/** Bewegt ein Kind weich von `from` nach `to`, sobald `open` wahr ist (Explosionsansicht). */
export function Burst({
  open,
  to,
  from = [0, 0, 0],
  delay = 0,
  children,
}: {
  open: boolean;
  to: [number, number, number];
  from?: [number, number, number];
  delay?: number;
  children: ReactNode;
}) {
  const g = useRef<THREE.Group>(null);
  const clock = useRef(0);
  const vFrom = useMemo(() => new THREE.Vector3(...from), [from]);
  const vTo = useMemo(() => new THREE.Vector3(...to), [to]);
  useFrame((_, dt) => {
    if (!g.current) return;
    clock.current = open ? clock.current + dt : 0;
    const goal = open && clock.current > delay ? vTo : vFrom;
    g.current.position.lerp(goal, Math.min(1, dt * 5));
    const s = g.current.scale.x + ((open && clock.current > delay ? 1 : 0.001) - g.current.scale.x) * Math.min(1, dt * 6);
    g.current.scale.setScalar(s);
    g.current.visible = s > 0.01;
  });
  return (
    <group ref={g} position={from} scale={0.001}>
      {children}
    </group>
  );
}

/**
 * HTML-Beschriftung an einem Punkt der Szene. Eigene schlanke Fassung statt drei/Html: Diese baute
 * ihre React-Wurzel synchron im Aufräumen ab und entfernte Knoten, die schon weg waren
 * („removeChild“ und „synchronously unmount a root“ in der Konsole).
 */
export function Label({
  children,
  position = [0, 0, 0],
  className = "",
  onClick,
  hideIf,
}: {
  children: ReactNode;
  position?: [number, number, number] | THREE.Vector3;
  className?: string;
  onClick?: () => void;
  /** bekommt die Weltposition; true blendet das Schild aus (z. B. hinter der Erde) */
  hideIf?: (world: THREE.Vector3) => boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const { gl, camera, size, events } = useThree();
  const el = useRef<HTMLDivElement | null>(null);
  const root = useRef<Root | null>(null);
  const render = () =>
    root.current?.render(
      <div className={`label3d ${className}`} onClick={onClick} style={{ position: "absolute", transform: "translate3d(-50%,-50%,0)", pointerEvents: onClick ? "auto" : "none" }}>
        {children}
      </div>,
    );
  useLayoutEffect(() => {
    // je Einhängen ein frischer Knoten mit eigener Wurzel; die alte wird nach dem Rendern abgebaut
    const target = (events.connected as HTMLElement | undefined) ?? (gl.domElement.parentNode as HTMLElement | null);
    const d = document.createElement("div");
    d.style.cssText = "position:absolute;top:0;left:0;z-index:20;pointer-events:none;will-change:transform;display:none;";
    target?.appendChild(d);
    const r = createRoot(d);
    el.current = d;
    root.current = r;
    render();
    return () => {
      if (root.current === r) root.current = null;
      if (el.current === d) el.current = null;
      d.remove();
      setTimeout(() => r.unmount(), 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, events.connected]);
  useLayoutEffect(() => {
    render();
  });
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const g = group.current;
    const e = el.current;
    if (!g || !e) return;
    g.getWorldPosition(v);
    const hidden = hideIf?.(v) ?? false;
    v.project(camera);
    // hinter der Kamera ausblenden
    if (hidden || v.z > 1 || v.z < -1) {
      e.style.display = "none";
      return;
    }
    e.style.display = "";
    e.style.transform = `translate3d(${((v.x + 1) / 2) * size.width}px,${((1 - v.y) / 2) * size.height}px,0)`;
  });
  return <group ref={group} position={position as [number, number, number]} />;
}

/** Hover-Zustand plus Mauszeiger für ein klickbares 3D-Objekt. */
export function useHover() {
  const [hover, setHover] = useState(false);
  const bind = {
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      setHover(true);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      setHover(false);
      document.body.style.cursor = "";
    },
  };
  return [hover, bind] as const;
}

export function Starfield({ count = 2500, radius = 60, px = 0 }: { count?: number; radius?: number; px?: number }) {
  const geo = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(radius * (0.6 + Math.random() * 0.4));
      p.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, [count, radius]);
  return (
    <points geometry={geo}>
      <pointsMaterial size={px || 0.12} color="#9fb7d9" transparent opacity={0.7} sizeAttenuation={!px} depthWrite={false} fog={false} />
    </points>
  );
}

/** Dreht ein Objekt langsam, solange `spin` wahr ist. */
export function Spinner({ spin = true, speed = 0.08, children }: { spin?: boolean; speed?: number; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spin && g.current) g.current.rotation.y += dt * speed;
  });
  return <group ref={g}>{children}</group>;
}

export function Pulse({ speed = 2, amp = 0.25, children }: { speed?: number; amp?: number; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const off = useMemo(() => Math.random() * 10, []);
  useFrame(({ clock }) => {
    if (g.current) g.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * speed + off) * amp);
  });
  return <group ref={g}>{children}</group>;
}

/** Verschiebt die Bildmitte nach links, damit die Szene neben dem Seitenpanel zentriert ist. */
export function PanelOffset({ px = 384 }: { px?: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (size.width > 820) cam.setViewOffset(size.width + px, size.height, px, 0, size.width, size.height);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }, [camera, size, px]);
  return null;
}

/** Weiches Zoomen mit Mausrad und Trackpad. OrbitControls springt je Ereignis und verzehnfacht
 *  Pinch-Gesten; hier sammeln Rad, Zwei-Finger-Scrollen und Pinch ein Ziel, dem die Kamera
 *  gedämpft folgt. Der Abstand ändert sich exponentiell, so fühlt sich der Zoom nah und fern gleich an.
 *  Touch-Pinch auf dem Handy bleibt bei OrbitControls. */
export function SmoothZoom({ speed = 1 }: { speed?: number }) {
  const { camera, gl, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    gl: THREE.WebGLRenderer;
    controls: { target: THREE.Vector3; minDistance: number; maxDistance: number } | null;
  };
  const goal = useRef<number | null>(null);
  const ctl = useRef(controls);
  ctl.current = controls;
  const sp = useRef(speed);
  sp.current = speed;

  useEffect(() => {
    const canvas = gl.domElement;
    const area = canvas.parentElement ?? canvas;
    const dist = () => (ctl.current ? camera.position.distanceTo(ctl.current.target) : 0);
    const push = (logStep: number) => {
      const c = ctl.current;
      if (!c) return;
      const d = goal.current ?? dist();
      goal.current = THREE.MathUtils.clamp(d * Math.exp(logStep), c.minDistance, c.maxDistance);
    };
    const onWheel = (e: WheelEvent) => {
      if (!area.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation(); // OrbitControls soll das Rad nicht auch noch verarbeiten
      let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      dy = THREE.MathUtils.clamp(dy, -200, 200); // einzelne Ausreißer großer Mausräder bremsen
      // Pinch kommt als Rad mit ctrlKey und kleinen Werten
      push(e.ctrlKey ? dy * 0.008 : dy * 0.0016 * sp.current); // Pinch etwa 1:1 zur Fingerbewegung
    };
    // Safari meldet Pinch als eigene Geste
    let lastScale = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      lastScale = 1;
    };
    const onGesture = (e: Event) => {
      e.preventDefault();
      const s = (e as unknown as { scale: number }).scale;
      push(-Math.log(s / lastScale) * 1.2 * sp.current);
      lastScale = s;
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    area.addEventListener("gesturestart", onGestureStart);
    area.addEventListener("gesturechange", onGesture);
    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      area.removeEventListener("gesturestart", onGestureStart);
      area.removeEventListener("gesturechange", onGesture);
    };
  }, [gl, camera]);

  const off = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const c = ctl.current;
    const g = goal.current;
    if (!c || g == null) return;
    off.copy(camera.position).sub(c.target);
    const d = off.length();
    const nd = d + (g - d) * (1 - Math.exp(-Math.min(dt, 0.05) * 10));
    camera.position.copy(c.target).add(off.multiplyScalar(nd / d));
    if (Math.abs(g - nd) / g < 0.002) goal.current = null;
  });
  return null;
}
