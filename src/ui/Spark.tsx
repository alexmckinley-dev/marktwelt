import type { Point } from "../api";

/** Kleine Verlaufslinie als SVG. */
export function Spark({ points, width = 120, height = 32, color }: { points: (Point | number)[]; width?: number; height?: number; color?: string }) {
  const ys = points.map((p) => (typeof p === "number" ? p : p[1])).filter(Number.isFinite);
  if (ys.length < 2) return <svg width={width} height={height} />;
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const d = ys
    .map((v, i) => `${i ? "L" : "M"}${((i / (ys.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - lo) / (hi - lo || 1)) * (height - 4)).toFixed(1)}`)
    .join("");
  const c = color ?? (ys.at(-1)! >= ys[0] ? "var(--up)" : "var(--down)");
  return (
    <svg width={width} height={height} className="spark">
      <path d={`${d}L${width},${height}L0,${height}Z`} fill={c} opacity={0.12} />
      <path d={d} fill="none" stroke={c} strokeWidth={1.5} />
    </svg>
  );
}
