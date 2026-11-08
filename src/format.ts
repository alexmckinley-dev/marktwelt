const de = (d: number) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmt = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? "–" : de(d).format(x));
export const pct = (x: number | null | undefined, d = 1, fromFraction = true) =>
  x == null || !Number.isFinite(x) ? "–" : `${x > 0 ? "+" : ""}${de(d).format(fromFraction ? x * 100 : x)} %`;
export const signed = (x: number | null | undefined, d = 2) =>
  x == null || !Number.isFinite(x) ? "–" : `${x > 0 ? "+" : ""}${de(d).format(x)}`;

export function big(x: number | null | undefined) {
  if (x == null || !Number.isFinite(x)) return "–";
  if (x >= 1e12) return `${fmt(x / 1e12, 2)} Bio.`;
  if (x >= 1e9) return `${fmt(x / 1e9, 1)} Mrd.`;
  if (x >= 1e6) return `${fmt(x / 1e6, 1)} Mio.`;
  return fmt(x, 0);
}

export const parseBig = (s: string | null | undefined) => (s ? Number(s.replace(/[^0-9.]/g, "")) || null : null);

export const dateDe = (iso: string | null | undefined) => {
  if (!iso) return "–";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
};
export const weekdayDe = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });

/** Farbe für eine Tagesänderung in Prozent: Rot über Grau zu Grün. */
export function changeColor(p: number | null | undefined) {
  if (p == null || !Number.isFinite(p)) return "#5b6b7f";
  const t = Math.max(-1, Math.min(1, p / 3));
  if (t >= 0) return mix("#7d8da1", "#2ee6a6", Math.sqrt(t));
  return mix("#7d8da1", "#ff4d6d", Math.sqrt(-t));
}

/** Farbe für einen Stimmungswert 0..100. */
export function moodColor(s: number | null | undefined) {
  if (s == null) return "#5b6b7f";
  return s < 50 ? mix("#ff4d6d", "#f5c451", s / 50) : mix("#f5c451", "#2ee6a6", (s - 50) / 50);
}

export function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const c = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, "0")}`;
}
