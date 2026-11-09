// Kurse rund um die Uhr: Aktien-Perps auf Hyperliquid (Börse „xyz“ von trade.xyz, 24/7)
// und CME-Futures über Yahoo (fast 24/5, rund 10 min verzögert). Beides wird an den
// Schlusskurs der regulären US-Sitzung angehängt.
import { cached, getJson, postJson, throttle } from "./lib.ts";
import type { Bar } from "./sources.ts";

const MIN = 60_000;
const HL = "https://api.hyperliquid.xyz/info";
const DEX = "xyz";
const hlQueue = throttle(2, 200);

// ---------- US-Handelszeiten (ohne Feiertage) ----------

const etFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

function et(t: number) {
  const p = Object.fromEntries(etFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute), wd: p.weekday as string };
}

export type Session = "regular" | "pre" | "post" | "closed";

export function usSession(t = Date.now()): Session {
  const { min, wd } = et(t);
  if (wd === "Sat" || wd === "Sun") return "closed";
  if (min < 240) return "closed";
  if (min < 570) return "pre";
  if (min < 960) return "regular";
  if (min < 1200) return "post";
  return "closed";
}

/** Zeitpunkt 16:00 Uhr New York am Tag d (YYYY-MM-DD) in ms. */
function closeAt(d: string): number {
  for (const off of ["-05:00", "-04:00"]) {
    const t = Date.parse(`${d}T16:00:00${off}`);
    const p = et(t);
    if (p.date === d && p.min === 960) return t;
  }
  return Date.parse(`${d}T21:00:00Z`);
}

// ---------- Quellen ----------

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

type HlCtx = { markPx: string; prevDayPx: string; dayNtlVlm: string; oraclePx: string };

function hlMarkets(): Promise<Map<string, HlCtx>> {
  return cached("hl:ctx", MIN, async () => {
    const [meta, ctx] = await hlQueue(() => postJson<[{ universe: { name: string; isDelisted?: boolean }[] }, HlCtx[]]>(HL, { type: "metaAndAssetCtxs", dex: DEX }));
    const out = new Map<string, HlCtx>();
    meta.universe.forEach((u, i) => {
      if (!u.isDelisted) out.set(u.name.replace(`${DEX}:`, ""), ctx[i]);
    });
    return out;
  });
}

function hlCandles(coin: string): Promise<Candle[]> {
  return cached(`hl:c:${coin}`, 5 * MIN, async () => {
    const end = Date.now();
    const rows = await hlQueue(() =>
      postJson<{ t: number; o: string; h: string; l: string; c: string; v: string }[]>(HL, {
        type: "candleSnapshot",
        req: { coin: `${DEX}:${coin}`, interval: "1h", startTime: end - 7 * 86400_000, endTime: end },
      }),
    );
    return rows.map((r) => ({ t: r.t, o: +r.o, h: +r.h, l: +r.l, c: +r.c, v: +r.v }));
  });
}

type YahooChart = {
  chart: {
    result: { meta: { regularMarketPrice: number; regularMarketTime: number }; timestamp: number[]; indicators: { quote: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }[] } }[] | null;
  };
};

function futureCandles(sym: string): Promise<{ candles: Candle[]; price: number; time: number }> {
  return cached(`fut:${sym}`, 5 * MIN, async () => {
    const d = await getJson<YahooChart>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1h&range=7d`);
    const r = d.chart.result?.[0];
    if (!r) throw new Error(`Yahoo: keine Daten für ${sym}`);
    const q = r.indicators.quote[0];
    const candles = r.timestamp
      .map((t, i) => ({ t: t * 1000, o: q.open[i] ?? NaN, h: q.high[i] ?? NaN, l: q.low[i] ?? NaN, c: q.close[i] ?? NaN, v: q.volume[i] ?? 0 }))
      .filter((c) => Number.isFinite(c.c));
    return { candles, price: r.meta.regularMarketPrice, time: r.meta.regularMarketTime * 1000 };
  });
}

// ---------- Zuordnung Symbol → Rund-um-die-Uhr-Instrument ----------

type Map24 = { perp?: string; perpName?: string; future?: string; futureName?: string };

// Indizes und Rohstoffe: ETF → Perp auf den Basiswert bzw. CME-Future.
// Einzelaktien und ETFs mit eigenem Perp (NVDA, EWJ, TLT …) werden automatisch erkannt.
const PROXIES: Record<string, Map24> = {
  SPY: { perp: "SP500", perpName: "S&P 500", future: "ES=F", futureName: "E-mini S&P 500" },
  QQQ: { perp: "XYZ100", perpName: "Nasdaq 100 (XYZ100)", future: "NQ=F", futureName: "E-mini Nasdaq 100" },
  DIA: { future: "YM=F", futureName: "E-mini Dow" },
  IWM: { future: "RTY=F", futureName: "E-mini Russell 2000" },
  GLD: { perp: "GOLD", perpName: "Gold", future: "GC=F", futureName: "Gold" },
  USO: { perp: "CL", perpName: "WTI-Rohöl", future: "CL=F", futureName: "WTI-Rohöl" },
  XLE: { future: "CL=F", futureName: "WTI-Rohöl (Bezug)" },
};

export type ExtSource = {
  kind: "perp" | "future";
  label: string;
  instrument: string;
  price: number;
  /** Veränderung seit dem letzten regulären US-Schluss, in Prozent */
  changePct: number;
  /** auf den Schlusskurs des Wertpapiers umgerechneter Preis */
  implied: number;
  time: string;
  volume24h: number | null;
  url: string;
};

export type ExtBar = Bar & { x: "off" | "mixed" };

export type Extended = {
  session: Session;
  ref: { d: string; close: number };
  sources: ExtSource[];
  hours: { t: number; c: number; off: boolean }[];
  bars: ExtBar[];
};

/** Preis des Instruments zum Zeitpunkt des regulären Schlusses. */
function priceAt(candles: Candle[], t: number): number | null {
  let best: Candle | null = null;
  for (const c of candles) if (c.t < t) best = c;
  return best ? best.c : (candles[0]?.o ?? null);
}

function build(kind: ExtSource["kind"], label: string, instrument: string, url: string, candles: Candle[], price: number, time: number, vol: number | null, last: Bar) {
  const t0 = closeAt(last.d);
  const atClose = priceAt(candles, t0);
  if (!atClose || !Number.isFinite(price)) return null;
  const ratio = last.c / atClose;
  const src: ExtSource = {
    kind,
    label,
    instrument,
    price,
    changePct: (price / atClose - 1) * 100,
    implied: price * ratio,
    time: new Date(time).toISOString(),
    volume24h: vol,
    url,
  };
  return { src, candles, ratio, t0 };
}

/** Tagesbalken aus Stundenkerzen nach dem letzten regulären Schluss, auf den Kurs des Wertpapiers skaliert. */
function extraBars(candles: Candle[], ratio: number, t0: number, lastD: string): ExtBar[] {
  const groups = new Map<string, Candle[]>();
  for (const c of candles) {
    if (c.t < t0) continue;
    let d = et(c.t).date;
    if (d === lastD) d = et(c.t + 86400_000).date; // Abend nach Schluss gehört zum Folgetag
    const g = groups.get(d) ?? [];
    g.push(c);
    groups.set(d, g);
  }
  return [...groups.entries()].map(([d, g]) => ({
    d,
    o: g[0].o * ratio,
    h: Math.max(...g.map((c) => c.h)) * ratio,
    l: Math.min(...g.map((c) => c.l)) * ratio,
    c: g.at(-1)!.c * ratio,
    v: 0,
    x: g.some((c) => usSession(c.t) === "regular" || usSession(c.t + 30 * MIN) === "regular") ? "mixed" : "off",
  }));
}

export async function extended(symbol: string, bars: Bar[]): Promise<Extended | null> {
  const last = bars.at(-1);
  if (!last) return null;
  const sym = symbol.toUpperCase();
  const hl = await hlMarkets().catch(() => null);
  const m: Map24 = { ...PROXIES[sym] };
  if (!m.perp && hl?.has(sym)) {
    m.perp = sym;
    m.perpName = sym;
  }

  const [perp, fut] = await Promise.all([
    m.perp && hl?.has(m.perp)
      ? hlCandles(m.perp)
          .then((c) => {
            const ctx = hl.get(m.perp!)!;
            return build("perp", `Hyperliquid-Perp ${m.perpName}`, `${DEX}:${m.perp}`, `https://app.hyperliquid.xyz/trade/${DEX}:${m.perp}`, c, +ctx.markPx, Date.now(), +ctx.dayNtlVlm, last);
          })
          .catch(() => null)
      : null,
    m.future
      ? futureCandles(m.future)
          .then((f) => build("future", `CME-Future ${m.futureName}`, m.future!, `https://finance.yahoo.com/quote/${encodeURIComponent(m.future!)}`, f.candles, f.price, f.time, null, last))
          .catch(() => null)
      : null,
  ]);
  const ok = [perp, fut].filter((x): x is NonNullable<typeof x> => x != null);
  if (!ok.length) return null;
  // Für Chart und Stundenkurve zählt das Instrument mit dem jüngsten Preis, bevorzugt der Perp.
  const main = ok[0];
  const hours = main.candles
    .filter((c) => c.t > Date.now() - 3 * 86400_000)
    .map((c) => ({ t: c.t, c: c.c * main.ratio, off: usSession(c.t) !== "regular" }));
  return {
    session: usSession(),
    ref: { d: last.d, close: last.c },
    sources: ok.map((x) => x.src),
    hours,
    bars: extraBars(main.candles, main.ratio, main.t0, last.d),
  };
}
