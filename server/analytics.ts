// Kennzahlen aus Kursreihen. Alles wird hier gerechnet, nichts kommt fertig von einer Quelle.
import type { Bar, Point } from "./sources.ts";

export const sma = (xs: number[], n: number) =>
  xs.map((_, i) => (i + 1 < n ? null : xs.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n));

export function rsi(xs: number[], n = 14): number | null {
  if (xs.length <= n) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = xs[i] - xs[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  for (let i = n + 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

const returns = (xs: number[]) => xs.slice(1).map((x, i) => x / xs[i] - 1);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};

export function maxDrawdown(xs: number[]) {
  let peak = xs[0];
  let mdd = 0;
  for (const x of xs) {
    peak = Math.max(peak, x);
    mdd = Math.min(mdd, x / peak - 1);
  }
  return mdd;
}

function perfSince(bars: Bar[], days: number) {
  const last = bars.at(-1);
  if (!last) return null;
  const cut = new Date(new Date(last.d).getTime() - days * 86400_000).toISOString().slice(0, 10);
  const base = bars.find((b) => b.d >= cut);
  return base ? last.c / base.c - 1 : null;
}

function ytd(bars: Bar[]) {
  const last = bars.at(-1);
  if (!last) return null;
  const prevYear = bars.filter((b) => b.d < `${last.d.slice(0, 4)}-01-01`).at(-1);
  return prevYear ? last.c / prevYear.c - 1 : null;
}

/** Beta und Korrelation der Tagesrenditen gegen einen Vergleichswert, über gemeinsame Tage. */
export function betaCorr(a: Bar[], b: Bar[], window = 250) {
  const mb = new Map(b.map((x) => [x.d, x.c]));
  const pairs = a.filter((x) => mb.has(x.d)).slice(-window - 1);
  if (pairs.length < 30) return { beta: null, corr: null };
  const ra = returns(pairs.map((x) => x.c));
  const rb = returns(pairs.map((x) => mb.get(x.d)!));
  const ma = mean(ra);
  const mbm = mean(rb);
  let cov = 0;
  for (let i = 0; i < ra.length; i++) cov += (ra[i] - ma) * (rb[i] - mbm);
  cov /= ra.length - 1;
  return { beta: cov / std(rb) ** 2, corr: cov / (std(ra) * std(rb)) };
}

export function indicators(bars: Bar[], bench?: Bar[]) {
  const c = bars.map((b) => b.c);
  const s50 = sma(c, 50);
  const s200 = sma(c, 200);
  const r = returns(c);
  const last = c.at(-1) ?? null;
  const yr = bars.slice(-252);
  const hi52 = Math.max(...yr.map((b) => b.h || b.c));
  const lo52 = Math.min(...yr.map((b) => b.l || b.c));
  const bc = bench ? betaCorr(bars, bench) : { beta: null, corr: null };
  const trend =
    last == null || s50.at(-1) == null
      ? "unklar"
      : s200.at(-1) == null
        ? last > s50.at(-1)! ? "über 50-Tage-Linie" : "unter 50-Tage-Linie"
        : s50.at(-1)! > s200.at(-1)! && last > s50.at(-1)!
          ? "Aufwärtstrend"
          : s50.at(-1)! < s200.at(-1)! && last < s50.at(-1)!
            ? "Abwärtstrend"
            : "Seitwärts / Übergang";
  return {
    last,
    perf: { m1: perfSince(bars, 30), m3: perfSince(bars, 91), ytd: ytd(bars), y1: perfSince(bars, 365) },
    sma50: s50.at(-1),
    sma200: s200.at(-1),
    rsi14: rsi(c.slice(-200)),
    vol30: r.length >= 30 ? std(r.slice(-30)) * Math.sqrt(252) : null,
    vol1y: r.length >= 200 ? std(r.slice(-252)) * Math.sqrt(252) : null,
    maxDrawdown1y: yr.length ? maxDrawdown(yr.map((b) => b.c)) : null,
    hi52,
    lo52,
    fromHigh: last != null ? last / hi52 - 1 : null,
    beta: bc.beta,
    corr: bc.corr,
    trend,
    series: { sma50: s50, sma200: s200 },
  };
}

/** Anteil der letzten `n` Werte, die unter dem aktuellen liegen (0..1). */
export function percentile(points: Point[], n = 252) {
  const xs = points.slice(-n).map((p) => p[1]);
  const cur = xs.at(-1);
  if (cur == null) return null;
  return xs.filter((x) => x < cur).length / Math.max(1, xs.length - 1);
}

export function pctRank(xs: number[], cur: number) {
  return xs.filter((x) => x < cur).length / Math.max(1, xs.length - 1);
}

/** Verdünnt eine Reihe auf höchstens `max` Punkte, behält den letzten. */
export function thin<T>(xs: T[], max = 260): T[] {
  if (xs.length <= max) return xs;
  const step = xs.length / max;
  const out: T[] = [];
  for (let i = 0; i < max - 1; i++) out.push(xs[Math.floor(i * step)]);
  out.push(xs.at(-1)!);
  return out;
}
