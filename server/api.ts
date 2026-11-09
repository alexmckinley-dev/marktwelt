// API-Routen. Wird vom Vite-Dev-Server als Middleware und von server/index.ts genutzt.
import type { IncomingMessage, ServerResponse } from "node:http";
import { indicators, pctRank, percentile, sma, thin } from "./analytics.ts";
import { countryDetail, countryOverview, warmCountries } from "./countries.ts";
import { events } from "./events.ts";
import { germanyBase, germanyNet, roadworks } from "./germany.ts";
import { satellites } from "./space.ts";
import { extended } from "./extended.ts";
import { launches } from "./launches.ts";
import { settle } from "./lib.ts";
import { gnews, TOPICS } from "./rss.ts";
import { bisRates, cboeSeries, earnings, ecbSeries, fredSeries, gdeltStatus, history, news, predictions, quote, summary, type Point } from "./sources.ts";
import { CENTRAL_BANKS, HOTSPOTS, MACRO_SERIES, MARKETS, SECTORS } from "./universe.ts";

type Handler = (params: Record<string, string>, query: URLSearchParams) => Promise<unknown>;

const daysOld = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86400_000;

async function bankRate(b: (typeof CENTRAL_BANKS)[number]) {
  const src = b.source;
  const pts: Point[] =
    src.kind === "fred" ? await fredSeries(src.series) : src.kind === "ecb" ? await ecbSeries(src.key) : ((await bisRates()).get(src.country) ?? []);
  const last = pts.at(-1);
  if (!last) throw new Error("keine Werte");
  // letzte echte Änderung suchen
  let prev: Point | undefined;
  for (let i = pts.length - 2; i >= 0; i--)
    if (Math.abs(pts[i][1] - last[1]) > 0.004) {
      prev = pts[i];
      break;
    }
  const changedAt = prev ? pts[pts.indexOf(prev) + 1][0] : null;
  return {
    rate: last[1],
    asOf: last[0],
    stale: daysOld(last[0]) > 120,
    label: b.source.label,
    lastChange: prev ? { from: prev[1], to: last[1], date: changedAt } : null,
    history: thin(pts.filter((p) => daysOld(p[0]) < 365 * 5), 120),
  };
}

async function sentiment() {
  const [vix, vix3m, hy, spx, tlt, spy, sectorHist] = await Promise.all([
    cboeSeries("VIX").catch(() => fredSeries("VIXCLS")),
    cboeSeries("VIX3M").catch(() => null),
    fredSeries("BAMLH0A0HYM2"),
    fredSeries("SP500"),
    history("TLT", 500).catch(() => null),
    history("SPY", 500).catch(() => null),
    settle(SECTORS, (s) => history(s.etf, 200)),
  ]);

  const parts: { id: string; name: string; score: number; value: string; explain: string }[] = [];

  const vixP = percentile(vix);
  if (vixP != null)
    parts.push({
      id: "vix",
      name: "Volatilität (VIX)",
      score: Math.round((1 - vixP) * 100),
      value: vix.at(-1)![1].toFixed(1),
      explain: "Hoher VIX im Jahresvergleich heißt Angst.",
    });

  if (vix3m && vix3m.length > 260) {
    // Laufzeitstruktur: Liegt die Ein-Monats- über der Drei-Monats-Volatilität, ist die Angst akut.
    const m3 = new Map(vix3m);
    const ratios = vix.filter((p) => m3.has(p[0])).map((p) => p[1] / m3.get(p[0])!);
    const cur = ratios.at(-1)!;
    parts.push({
      id: "term",
      name: "Laufzeitstruktur (VIX zu VIX3M)",
      score: Math.round((1 - pctRank(ratios.slice(-252), cur)) * 100),
      value: `${cur.toFixed(2)} · ${cur > 1 ? "invers" : "normal"}`,
      explain: "Über 1 heißt: kurzfristig mehr Angst als langfristig.",
    });
  }

  const hyP = percentile(hy);
  if (hyP != null)
    parts.push({
      id: "hy",
      name: "Kreditrisiko (Hochzins-Spread)",
      score: Math.round((1 - hyP) * 100),
      value: `${hy.at(-1)![1].toFixed(2)} %`,
      explain: "Steigende Risikoaufschläge heißen Angst.",
    });

  const c = spx.map((p) => p[1]);
  const s125 = sma(c, 125);
  const ratios = c.map((x, i) => (s125[i] ? x / s125[i]! - 1 : null)).filter((x): x is number => x != null);
  if (ratios.length > 50) {
    const cur = ratios.at(-1)!;
    parts.push({
      id: "momentum",
      name: "Momentum (S&P 500 zur 125-Tage-Linie)",
      score: Math.round(pctRank(ratios.slice(-252), cur) * 100),
      value: `${(cur * 100).toFixed(1)} %`,
      explain: "Weit über dem Schnitt heißt Gier.",
    });
  }

  if (spy && tlt && spy.length > 60 && tlt.length > 60) {
    const mt = new Map(tlt.map((b) => [b.d, b.c]));
    const common = spy.filter((b) => mt.has(b.d));
    const diff: number[] = [];
    for (let i = 20; i < common.length; i++)
      diff.push(common[i].c / common[i - 20].c - mt.get(common[i].d)! / mt.get(common[i - 20].d)!);
    const cur = diff.at(-1)!;
    parts.push({
      id: "haven",
      name: "Sichere Häfen (Aktien gegen Anleihen, 20 Tage)",
      score: Math.round(pctRank(diff.slice(-252), cur) * 100),
      value: `${(cur * 100).toFixed(1)} %-Pkt.`,
      explain: "Anleihen schlagen Aktien heißt Flucht in Sicherheit.",
    });
  }

  const above = sectorHist
    .map((h) => (Array.isArray(h) && h.length >= 50 ? h : null))
    .filter((h): h is NonNullable<typeof h> => h != null)
    .map((h) => {
      const cs = h.map((b) => b.c);
      return cs.at(-1)! > sma(cs, 50).at(-1)!;
    });
  if (above.length >= 6) {
    const share = above.filter(Boolean).length / above.length;
    parts.push({
      id: "breadth",
      name: "Marktbreite (Sektoren über 50-Tage-Linie)",
      score: Math.round(share * 100),
      value: `${above.filter(Boolean).length} von ${above.length}`,
      explain: "Viele Sektoren im Aufwärtstrend heißt breite Zuversicht.",
    });
  }

  const score = parts.length ? Math.round(parts.reduce((a, p) => a + p.score, 0) / parts.length) : null;
  const label =
    score == null ? "unbekannt" : score < 25 ? "Extreme Angst" : score < 45 ? "Angst" : score <= 55 ? "Neutral" : score <= 75 ? "Gier" : "Extreme Gier";
  return {
    score,
    label,
    parts,
    vixHistory: thin(vix.filter((p) => daysOld(p[0]) < 365), 180),
    asOf: vix.at(-1)?.[0] ?? null,
  };
}

function nextWeekdays(n: number) {
  const out: string[] = [];
  const d = new Date();
  while (out.length < n) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const routes: [RegExp, string[], Handler][] = [
  [
    /^\/api\/world$/,
    [],
    async () => {
      const [markets, banks] = await Promise.all([
        settle(MARKETS, (m) => quote(m.etf)),
        settle(CENTRAL_BANKS, (b) => bankRate(b)),
      ]);
      return {
        markets: MARKETS.map((m, i) => ({ ...m, quote: markets[i] })),
        banks: CENTRAL_BANKS.map(({ source, ...b }, i) => ({ ...b, data: banks[i] })),
        hotspots: HOTSPOTS.map(({ query, match, ...h }) => h),
      };
    },
  ],
  [
    /^\/api\/hotspots$/,
    [],
    async () => {
      // Nur bereits geladene Brennpunkte melden, der Rest lädt im Hintergrund (GDELT-Drossel).
      const res = await Promise.all(
        HOTSPOTS.map((h) =>
          Promise.race([
            news(h.query).then((a) => ({ id: h.id, count: a.length, top: a.slice(0, 3) })),
            new Promise((r) => setTimeout(() => r({ id: h.id, count: null, top: [] }), 300)),
          ]).catch(() => ({ id: h.id, count: null, top: [], error: true })),
        ),
      );
      return res;
    },
  ],
  [
    /^\/api\/hotspot\/([\w-]+)$/,
    ["id"],
    async ({ id }) => {
      const h = HOTSPOTS.find((x) => x.id === id);
      if (!h) throw new Error("unbekannter Brennpunkt");
      const { query, match, ...rest } = h;
      // Höchstens 8 s auf GDELT warten; der Abruf läuft im Hintergrund weiter.
      const wait = new Promise<null>((r) => setTimeout(() => r(null), 8000));
      const [articles, assets] = await Promise.all([
        Promise.race([news(query), wait]).catch((e: Error) => e),
        settle(h.assets ?? [], (a) => quote(a.symbol)),
      ]);
      return {
        ...rest,
        articles: Array.isArray(articles) ? articles : null,
        newsNote: Array.isArray(articles) ? null : articles instanceof Error ? articles.message : gdeltStatus(),
        assets: (h.assets ?? []).map((a, i) => ({ ...a, quote: assets[i] })),
      };
    },
  ],
  [
    /^\/api\/macro$/,
    [],
    async () => {
      const rows = await settle([...MACRO_SERIES], (s) => fredSeries(s.id));
      return MACRO_SERIES.map((s, i) => {
        const pts = rows[i] as Point[] | { error: string };
        if (!Array.isArray(pts)) return { ...s, error: pts.error };
        const last = pts.at(-1)!;
        const prev = pts.at(-2);
        const yearAgo = pts.find((p) => daysOld(p[0]) < 366);
        return {
          ...s,
          value: last[1],
          asOf: last[0],
          change: prev ? last[1] - prev[1] : null,
          changeY: yearAgo ? last[1] - yearAgo[1] : null,
          history: thin(pts.filter((p) => daysOld(p[0]) < 366), 160),
        };
      });
    },
  ],
  [/^\/api\/sentiment$/, [], () => sentiment()],
  [/^\/api\/predictions$/, [], () => predictions()],
  [/^\/api\/events$/, [], () => events()],
  [/^\/api\/launches$/, [], () => launches()],
  [/^\/api\/satellites$/, [], () => satellites()],
  [/^\/api\/de\/base$/, [], () => germanyBase()],
  [/^\/api\/de\/netz$/, [], () => germanyNet()],
  [/^\/api\/de\/baustellen$/, [], () => roadworks()],
  [/^\/api\/countries$/, [], () => countryOverview()],
  [/^\/api\/country\/([A-Za-z]{3})$/, ["iso3"], ({ iso3 }) => countryDetail(iso3)],
  [
    /^\/api\/news\/(\w+)$/,
    ["topic"],
    async ({ topic }) => {
      const t = TOPICS[topic];
      if (!t) throw new Error("unbekanntes Thema");
      return { ...t, items: await gnews(t.query, 20) };
    },
  ],
  [
    /^\/api\/sectors$/,
    [],
    async () => {
      const q = await settle(SECTORS, (s) => quote(s.etf));
      return SECTORS.map((s, i) => ({ ...s, quote: q[i] }));
    },
  ],
  [
    /^\/api\/sector\/([\w-]+)$/,
    ["id"],
    async ({ id }) => {
      const s = SECTORS.find((x) => x.id === id);
      if (!s) throw new Error("unbekannter Sektor");
      const q = await settle(s.members, (m) => quote(m));
      const sum = await settle(s.members, (m) => summary(m));
      return {
        ...s,
        members: s.members.map((m, i) => ({
          symbol: m,
          quote: q[i],
          marketCap: (sum[i] as Record<string, string>)?.MarketCap ?? null,
        })),
      };
    },
  ],
  [
    /^\/api\/stock\/([\w.\-^]+)$/,
    ["symbol"],
    async ({ symbol }) => {
      const sym = symbol.toUpperCase();
      const [q, s, h, bench] = await Promise.all([
        quote(sym),
        summary(sym).catch(() => ({})),
        history(sym, 800),
        history("SPY", 800).catch(() => undefined),
      ]);
      const ind = indicators(h, bench);
      const tail = h.slice(-260);
      const off = h.length - tail.length;
      return {
        quote: q,
        extended: await extended(sym, h).catch(() => null),
        summary: s,
        indicators: { ...ind, series: undefined },
        bars: tail,
        sma50: ind.series.sma50.slice(off),
        sma200: ind.series.sma200.slice(off),
      };
    },
  ],
  [
    /^\/api\/market\/([\w-]+)$/,
    ["id"],
    async ({ id }) => {
      const m = MARKETS.find((x) => x.id === id);
      if (!m) throw new Error("unbekannter Markt");
      const [q, h, bench] = await Promise.all([quote(m.etf), history(m.etf, 800), history("SPY", 800).catch(() => undefined)]);
      const ind = indicators(h, m.etf === "SPY" ? undefined : bench);
      const tail = h.slice(-260);
      const off = h.length - tail.length;
      return {
        market: m,
        quote: q,
        extended: await extended(m.etf, h).catch(() => null),
        indicators: { ...ind, series: undefined },
        bars: tail,
        sma50: ind.series.sma50.slice(off),
        sma200: ind.series.sma200.slice(off),
      };
    },
  ],
  [
    /^\/api\/calendar$/,
    [],
    async (_p, query) => {
      const days = Math.min(15, Number(query.get("days") ?? 10));
      const minCap = Number(query.get("minCap") ?? 10e9);
      const lists = await settle(nextWeekdays(days), (d) => earnings(d));
      return lists
        .flatMap((l) => (Array.isArray(l) ? (l as Awaited<ReturnType<typeof earnings>>) : []))
        .filter((e) => (e.marketCap ?? 0) >= minCap)
        .sort((a, b) => a.date.localeCompare(b.date) || (b.marketCap ?? 0) - (a.marketCap ?? 0));
    },
  ],
];

export async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://x");
  if (!url.pathname.startsWith("/api/")) return false;
  for (const [re, names, fn] of routes) {
    const m = url.pathname.match(re);
    if (!m) continue;
    const params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    try {
      const body = await fn(params, url.searchParams);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return true;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "unbekannte Route" }));
  return true;
}

/** Lädt die gedrosselten Nachrichten der Brennpunkte im Hintergrund vor. */
export function warmUp() {
  for (const h of HOTSPOTS) news(h.query).catch(() => {});
  bisRates().catch(() => {});
  predictions().catch(() => {});
  events().catch(() => {});
  launches().catch(() => {});
  warmCountries();
}
