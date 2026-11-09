import { useEffect, useState } from "react";

export type Point = [string, number];

export type Quote = {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  time: string | null;
  marketStatus: string | null;
};
type Maybe<T> = T | { error: string };
export const ok = <T,>(x: Maybe<T> | undefined | null): x is T => !!x && !(typeof x === "object" && "error" in (x as object));

export type Market = {
  id: string;
  name: string;
  region: string;
  etf: string;
  index: string;
  lat: number;
  lon: number;
  quote: Maybe<Quote>;
};
export type Bank = {
  id: string;
  name: string;
  short: string;
  lat: number;
  lon: number;
  data: Maybe<{
    rate: number;
    asOf: string;
    stale: boolean;
    label: string;
    lastChange: { from: number; to: number; date: string } | null;
    history: Point[];
  }>;
};
export type Hotspot = {
  id: string;
  name: string;
  kind: "brennpunkt" | "engpass";
  lat: number;
  lon: number;
  note?: string;
  assets?: { symbol: string; name: string }[];
};
export type HotspotDetail = Omit<Hotspot, "assets"> & { articles: Article[] | null; newsNote: string | null; assets: { symbol: string; name: string; quote: Maybe<Quote> }[] };
export type Prediction = {
  id: string;
  title: string;
  pick: string | null;
  prob: number;
  change7d: number | null;
  volume: number;
  endDate: string | null;
  url: string;
  hotspots: string[];
};
export type World = { markets: Market[]; banks: Bank[]; hotspots: Hotspot[] };
export type Article = { title: string; url: string; domain: string; seen: string; country: string };
export type HotspotHeat = { id: string; count: number | null; top: Article[] };

export type Macro = {
  id: string;
  name: string;
  unit: string;
  group: string;
  value: number;
  asOf: string;
  change: number | null;
  changeY: number | null;
  history: Point[];
  error?: string;
};

export type Sentiment = {
  score: number | null;
  label: string;
  parts: { id: string; name: string; score: number; value: string; explain: string }[];
  vixHistory: Point[];
  asOf: string | null;
};

export type Sector = { id: string; name: string; etf: string; members: string[]; quote: Maybe<Quote> };
export type SectorDetail = {
  id: string;
  name: string;
  etf: string;
  members: { symbol: string; quote: Maybe<Quote>; marketCap: string | null }[];
};

export type GeoEvent = {
  id: string;
  kind: "beben" | "sturm" | "flut" | "vulkan" | "duerre" | "feuer";
  name: string;
  lat: number;
  lon: number;
  mag: number | null;
  alert: "green" | "orange" | "red" | null;
  time: string;
  url: string;
};
export type Events = { events: GeoEvent[]; errors: string[] };

export type Bar = { d: string; o: number; h: number; l: number; c: number; v: number; x?: "off" | "mixed" };
export type ExtSource = {
  kind: "perp" | "future";
  label: string;
  instrument: string;
  price: number;
  changePct: number;
  implied: number;
  time: string;
  volume24h: number | null;
  url: string;
};
export type Extended = {
  session: "regular" | "pre" | "post" | "closed";
  ref: { d: string; close: number };
  sources: ExtSource[];
  hours: { t: number; c: number; off: boolean }[];
  bars: Bar[];
};
export type Indicators = {
  last: number | null;
  perf: { m1: number | null; m3: number | null; ytd: number | null; y1: number | null };
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  vol30: number | null;
  vol1y: number | null;
  maxDrawdown1y: number | null;
  hi52: number;
  lo52: number;
  fromHigh: number | null;
  beta: number | null;
  corr: number | null;
  trend: string;
};
export type Stock = {
  quote: Quote;
  extended: Extended | null;
  summary: Record<string, string>;
  indicators: Indicators;
  bars: Bar[];
  sma50: (number | null)[];
  sma200: (number | null)[];
};
export type MarketDetail = {
  market: Omit<Market, "quote">;
  quote: Quote;
  extended: Extended | null;
  indicators: Indicators;
  bars: Bar[];
  sma50: (number | null)[];
  sma200: (number | null)[];
};
export type Earning = {
  date: string;
  symbol: string;
  name: string;
  time: string;
  marketCap: number | null;
  epsForecast: string;
  lastYearEps: string;
};

export async function api<T>(path: string): Promise<T> {
  const r = await fetch(`/api/${path}`);
  const body = await r.json();
  if (!r.ok) throw new Error(body?.error ?? r.statusText);
  return body as T;
}

export function useApi<T>(path: string | null, refreshMs = 0) {
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: !!path });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    const load = () =>
      api<T>(path)
        .then((data) => alive && set({ data, loading: false }))
        .catch((e: Error) => alive && set((s) => ({ ...s, error: e.message, loading: false })));
    set({ loading: true });
    load();
    const t = refreshMs ? setInterval(load, refreshMs) : undefined;
    return () => {
      alive = false;
      if (t) clearInterval(t);
    };
  }, [path, refreshMs]);
  return state;
}
