import { cached, getJson, getText, num, throttle } from "./lib.ts";
import { CENTRAL_BANKS, HOTSPOTS, MARKETS, SECTORS } from "./universe.ts";

const MIN = 60_000;

// ---------- FRED (keylos, CSV) ----------

export type Point = [string, number]; // [ISO-Datum, Wert]

export function fredSeries(id: string): Promise<Point[]> {
  return cached(`fred:${id}`, 60 * MIN, async () => {
    const csv = await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`);
    const out: Point[] = [];
    for (const line of csv.trim().split("\n").slice(1)) {
      const [d, v] = line.split(",");
      const n = Number(v);
      if (d && v !== "." && v !== "" && Number.isFinite(n)) out.push([d, n]);
    }
    return out;
  });
}

// ---------- EZB Data Portal (keylos) ----------

export function ecbSeries(key: string): Promise<Point[]> {
  return cached(`ecb:${key}`, 6 * 60 * MIN, async () => {
    const csv = await getText(`https://data-api.ecb.europa.eu/service/data/${key}?format=csvdata&lastNObservations=40`);
    const rows = csv.trim().split("\n");
    const head = rows[0].split(",");
    const iD = head.indexOf("TIME_PERIOD");
    const iV = head.indexOf("OBS_VALUE");
    return rows
      .slice(1)
      .map((r) => r.split(","))
      .map((c) => [c[iD], Number(c[iV])] as Point)
      .filter((p) => Number.isFinite(p[1]));
  });
}

// ---------- BIS: Leitzinsen als Tagesreihe (keylos, CSV) ----------

export function bisRates(): Promise<Map<string, Point[]>> {
  return cached("bis:cbpol", 6 * 60 * MIN, async () => {
    const codes = CENTRAL_BANKS.flatMap((b) => (b.source.kind === "bis" ? [b.source.country] : []));
    const from = new Date(Date.now() - 5 * 366 * 86400_000).toISOString().slice(0, 10);
    const csv = await getText(
      `https://stats.bis.org/api/v1/data/WS_CBPOL/D.${codes.join("+")}/all?startPeriod=${from}&detail=dataonly&format=csv`,
      30000,
    );
    const rows = csv.trim().split("\n");
    const head = rows[0].split(",");
    const iA = head.indexOf("REF_AREA");
    const iD = head.indexOf("TIME_PERIOD");
    const iV = head.indexOf("OBS_VALUE");
    const out = new Map<string, Point[]>();
    for (const r of rows.slice(1)) {
      const c = r.split(",");
      const v = Number(c[iV]);
      if (c[iV] === "" || !Number.isFinite(v)) continue;
      if (!out.has(c[iA])) out.set(c[iA], []);
      out.get(c[iA])!.push([c[iD], v]);
    }
    for (const pts of out.values()) pts.sort((a, b) => a[0].localeCompare(b[0]));
    return out;
  });
}

// ---------- Cboe: Volatilitätsindizes (keylos, CSV) ----------

export function cboeSeries(symbol: "VIX" | "VIX9D" | "VIX3M"): Promise<Point[]> {
  return cached(`cboe:${symbol}`, 60 * MIN, async () => {
    const csv = await getText(`https://cdn-api.cboe.com/api/global/us_indices/daily_prices/${symbol}_History.csv`, 20000);
    const out: Point[] = [];
    for (const line of csv.trim().split("\n").slice(1)) {
      const c = line.split(",");
      const [m, d, y] = c[0].split("/");
      const v = Number(c[4]);
      if (y && Number.isFinite(v)) out.push([`${y}-${m}-${d}`, v]);
    }
    return out;
  });
}

// ---------- Polymarket: Prognosemärkte zur Geopolitik (keylos) ----------

export type Prediction = {
  id: string;
  title: string;
  pick: string | null; // Ausprägung bei Märkten mit mehreren Antworten oder Fristen
  prob: number; // Wahrscheinlichkeit für „Ja“, 0..1
  change7d: number | null;
  volume: number;
  endDate: string | null;
  url: string;
  hotspots: string[];
};

type PmMarket = {
  question: string;
  groupItemTitle?: string;
  outcomePrices?: string;
  oneWeekPriceChange?: number;
  volume?: string;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
};
type PmEvent = { id: string; slug: string; title: string; volume?: number; negRisk?: boolean; markets?: PmMarket[] };

export function predictions(): Promise<Prediction[]> {
  return cached("pm:geo", 15 * MIN, async () => {
    const events = await getJson<PmEvent[]>(
      "https://gamma-api.polymarket.com/events?tag_slug=geopolitics&closed=false&active=true&limit=150&order=volume&ascending=false",
      20000,
    );
    const now = Date.now();
    const out: Prediction[] = [];
    for (const e of events) {
      const open = (e.markets ?? [])
        .filter((m) => m.active && !m.closed && (!m.endDate || new Date(m.endDate).getTime() > now))
        .map((m) => ({ m, p: Number(JSON.parse(m.outcomePrices ?? "[]")[0]), v: Number(m.volume ?? 0) }))
        .filter((x) => Number.isFinite(x.p));
      if (!open.length) continue;
      // Mehrere Antworten (z. B. Kandidaten): die führende; Fristen-Leitern: die meistgehandelte.
      const best = open.reduce((a, b) => ((e.negRisk ? b.p > a.p : b.v > a.v) ? b : a));
      const hotspots = HOTSPOTS.filter((h) => h.match.test(e.title) || h.match.test(best.m.question)).map((h) => h.id);
      out.push({
        id: e.id,
        title: e.title,
        pick: open.length > 1 ? best.m.groupItemTitle || null : null,
        prob: best.p,
        change7d: best.m.oneWeekPriceChange ?? null,
        volume: e.volume ?? 0,
        endDate: best.m.endDate ?? null,
        url: `https://polymarket.com/event/${e.slug}`,
        hotspots,
      });
    }
    return out.filter((p) => p.volume >= 500_000);
  });
}

// ---------- Nasdaq (Kurse US-gelisteter Aktien und ETFs) ----------

const nasdaqQueue = throttle(3, 150);
const NQ = "https://api.nasdaq.com/api";

type NasdaqEnvelope<T> = { data: T | null; status?: { rCode: number } };

async function nasdaq<T>(path: string): Promise<T> {
  const r = await nasdaqQueue(() => getJson<NasdaqEnvelope<T>>(`${NQ}${path}`));
  if (!r.data) throw new Error(`Nasdaq: keine Daten für ${path}`);
  return r.data;
}

export type Quote = {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  time: string | null;
  marketStatus: string | null;
};

type InfoData = {
  symbol: string;
  companyName: string;
  marketStatus?: string;
  primaryData: { lastSalePrice: string; netChange: string; percentageChange: string; lastTradeTimestamp: string };
};

const ETFS = new Set([...MARKETS.map((m) => m.etf), ...SECTORS.map((s) => s.etf), "DIA", "IWM", "TLT", "GLD", "HYG", "USO", "WEAT"]);
const assetGuess = (s: string) => (ETFS.has(s.toUpperCase()) ? "etf" : "stocks");

export function quote(symbol: string, assetclass = assetGuess(symbol)): Promise<Quote> {
  return cached(`q:${symbol}`, 3 * MIN, async () => {
    const d = await nasdaq<InfoData>(`/quote/${encodeURIComponent(symbol)}/info?assetclass=${assetclass}`);
    return {
      symbol: d.symbol,
      name: d.companyName,
      price: num(d.primaryData.lastSalePrice),
      change: num(d.primaryData.netChange),
      changePct: num(d.primaryData.percentageChange),
      time: d.primaryData.lastTradeTimestamp ?? null,
      marketStatus: d.marketStatus ?? null,
    };
  });
}

export type Bar = { d: string; o: number; h: number; l: number; c: number; v: number };

type HistData = { tradesTable: { rows: { date: string; close: string; open: string; high: string; low: string; volume: string }[] } };

export function history(symbol: string, days = 400, assetclass = assetGuess(symbol)): Promise<Bar[]> {
  return cached(`h:${symbol}:${days}`, 30 * MIN, async () => {
    const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const d = await nasdaq<HistData>(
      `/quote/${encodeURIComponent(symbol)}/historical?assetclass=${assetclass}&fromdate=${from}&limit=9999`,
    );
    return d.tradesTable.rows
      .map((r) => {
        const [m, day, y] = r.date.split("/");
        return {
          d: `${y}-${m}-${day}`,
          o: num(r.open) ?? NaN,
          h: num(r.high) ?? NaN,
          l: num(r.low) ?? NaN,
          c: num(r.close) ?? NaN,
          v: num(r.volume) ?? 0,
        };
      })
      .filter((b) => Number.isFinite(b.c))
      .reverse();
  });
}

type SummaryData = { summaryData: Record<string, { label: string; value: string | number }> };

export function summary(symbol: string): Promise<Record<string, string>> {
  return cached(`s:${symbol}`, 60 * MIN, async () => {
    const d = await nasdaq<SummaryData>(`/quote/${encodeURIComponent(symbol)}/summary?assetclass=stocks`);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(d.summaryData ?? {})) out[k] = String(v.value);
    return out;
  });
}

export type Earning = {
  date: string;
  symbol: string;
  name: string;
  time: string;
  marketCap: number | null;
  epsForecast: string;
  lastYearEps: string;
};

type EarnData = {
  rows: { symbol: string; name: string; time: string; marketCap: string; epsForecast: string; lastYearEPS: string }[] | null;
};

export function earnings(date: string): Promise<Earning[]> {
  return cached(`e:${date}`, 6 * 60 * MIN, async () => {
    const d = await nasdaq<EarnData>(`/calendar/earnings?date=${date}`);
    return (d.rows ?? []).map((r) => ({
      date,
      symbol: r.symbol,
      name: r.name,
      time: r.time === "time-pre-market" ? "vor Börse" : r.time === "time-after-hours" ? "nach Börse" : "–",
      marketCap: num(r.marketCap),
      epsForecast: r.epsForecast,
      lastYearEps: r.lastYearEPS,
    }));
  });
}

// ---------- GDELT (Nachrichten, höchstens eine Anfrage je 5 Sekunden) ----------

// GDELT erlaubt einen Abruf je 5 s und sperrt bei Überschreitung länger. Deshalb ein Abruf alle 10 s
// und nach einer Sperre ein wachsender Rückzug: 1, 2, 4 … höchstens 15 Minuten.
const gdeltQueue = throttle(1, 10_000);
let gdeltPauseUntil = 0;
let gdeltBackoff = 0;
const gdeltBlocked = () => {
  gdeltBackoff = Math.min(15 * MIN, gdeltBackoff ? gdeltBackoff * 2 : MIN);
  gdeltPauseUntil = Date.now() + gdeltBackoff;
};
const gdeltFailed = new Map<string, number>(); // nach Fehler: diese Suche drei Minuten nicht neu einreihen
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Kurzer Satz für die Oberfläche, solange Nachrichten fehlen. */
export function gdeltStatus() {
  if (gdeltPauseUntil > Date.now()) {
    const at = new Date(gdeltPauseUntil).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    return `GDELT drosselt gerade. Neuer Versuch ab ${at} Uhr.`;
  }
  return "Nachrichten werden geladen. GDELT antwortet langsam, das kann einige Minuten dauern.";
}

export type Article = { title: string; url: string; domain: string; seen: string; country: string };

type GdeltResp = { articles?: { title: string; url: string; domain: string; seendate: string; sourcecountry: string }[] };

export function news(query: string): Promise<Article[]> {
  return cached(`g:${query}`, 60 * MIN, async () => {
    if (gdeltPauseUntil > Date.now()) {
      const at = new Date(gdeltPauseUntil).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      throw new Error(`GDELT drosselt gerade. Neuer Versuch ab ${at} Uhr.`);
    }
    if (Date.now() - (gdeltFailed.get(query) ?? 0) < 3 * MIN) throw new Error("GDELT hat nicht geantwortet. Neuer Versuch in wenigen Minuten.");
    const q = encodeURIComponent(`${query} sourcelang:english`);
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=250&format=json&timespan=24h&sort=hybridrel`;
    const text = await gdeltQueue(async () => {
      if (gdeltPauseUntil > Date.now()) await sleep(gdeltPauseUntil - Date.now());
      return getText(url, 60000);
    }).catch((e: Error) => {
      gdeltFailed.set(query, Date.now());
      if (e.message.startsWith("429")) gdeltBlocked();
      console.warn(`[gdelt] ${e.name === "TimeoutError" ? "Zeitüberschreitung" : e.message.slice(0, 3)} · Rückzug ${gdeltBackoff / MIN} min · ${query.slice(0, 40)}`);
      throw e;
    });
    if (!text.trim().startsWith("{")) {
      gdeltFailed.set(query, Date.now());
      gdeltBlocked();
      throw new Error(`GDELT: ${text.slice(0, 80)}`);
    }
    gdeltBackoff = 0;
    console.info(`[gdelt] ok · ${query.slice(0, 40)}`);
    const r = JSON.parse(text) as GdeltResp;
    return (r.articles ?? []).map((a) => ({
      title: a.title.replace(/\s+-\s+/g, "-").replace(/\s+([,.?!:;])/g, "$1"),
      url: a.url,
      domain: a.domain,
      seen: a.seendate,
      country: a.sourcecountry,
    }));
  });
}
