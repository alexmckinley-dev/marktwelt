import { cached, getJson, getText, num, throttle } from "./lib.ts";
import { MARKETS, SECTORS } from "./universe.ts";

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

const ETFS = new Set([...MARKETS.map((m) => m.etf), ...SECTORS.map((s) => s.etf), "DIA", "IWM", "TLT", "GLD", "HYG", "USO"]);
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

const gdeltQueue = throttle(1, 5500);

export type Article = { title: string; url: string; domain: string; seen: string; country: string };

type GdeltResp = { articles?: { title: string; url: string; domain: string; seendate: string; sourcecountry: string }[] };

export function news(query: string): Promise<Article[]> {
  return cached(`g:${query}`, 60 * MIN, async () => {
    const q = encodeURIComponent(`${query} sourcelang:english`);
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=250&format=json&timespan=24h&sort=hybridrel`;
    const text = await gdeltQueue(() => getText(url, 20000));
    if (!text.trim().startsWith("{")) throw new Error(`GDELT: ${text.slice(0, 80)}`);
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
