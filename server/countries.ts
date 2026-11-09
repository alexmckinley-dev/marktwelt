// Länder: Stammdaten und Kennzahlen der Weltbank, aktive Konflikte aus der Wikipedia-Liste
// laufender bewaffneter Konflikte, positive Meldungen aus Feeds guter Nachrichten.
import { createRequire } from "node:module";
import iso from "i18n-iso-countries";
import { cached, getJson } from "./lib.ts";
import { gnews, positiveFeeds, type NewsItem } from "./rss.ts";

const require = createRequire(import.meta.url);
iso.registerLocale(require("i18n-iso-countries/langs/en.json"));
iso.registerLocale(require("i18n-iso-countries/langs/de.json"));

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const display = new Intl.DisplayNames("de", { type: "region" });
/** Gebräuchlicher deutscher Name („Russland“ statt „Russische Föderation“). */
export const deName = (iso3: string) => {
  const a2 = iso.alpha3ToAlpha2(iso3);
  try {
    const n = a2 ? display.of(a2) : undefined;
    if (n && n !== a2) return n;
  } catch {}
  return iso.getName(iso3, "de") ?? iso3;
};

// ---------- Weltbank ----------

type WbCountry = { id: string; iso2Code: string; name: string; region: { id: string; value: string }; incomeLevel: { value: string }; capitalCity: string; longitude: string; latitude: string };

function wbCountries(): Promise<Map<string, WbCountry>> {
  return cached("wb:countries", DAY, async () => {
    const [, rows] = await getJson<[unknown, WbCountry[]]>("https://api.worldbank.org/v2/country?format=json&per_page=400", 20000);
    return new Map(rows.filter((r) => r.region.id !== "NA").map((r) => [r.id, r]));
  });
}

export const INDICATORS = [
  { id: "SP.POP.TOTL", name: "Bevölkerung", unit: "" },
  { id: "NY.GDP.MKTP.CD", name: "BIP", unit: "USD" },
  { id: "NY.GDP.PCAP.CD", name: "BIP je Einwohner", unit: "USD" },
  { id: "NY.GDP.MKTP.KD.ZG", name: "Wachstum", unit: "%" },
  { id: "FP.CPI.TOTL.ZG", name: "Inflation", unit: "%" },
  { id: "SL.UEM.TOTL.ZS", name: "Arbeitslosigkeit", unit: "%" },
  { id: "SP.DYN.LE00.IN", name: "Lebenserwartung", unit: "Jahre" },
  { id: "AG.SRF.TOTL.K2", name: "Fläche", unit: "km²" },
  { id: "BN.CAB.XOKA.GD.ZS", name: "Leistungsbilanz", unit: "% des BIP" },
] as const;

type WbValue = { countryiso3code: string; date: string; value: number | null };

function wbIndicator(id: string): Promise<Map<string, { value: number; year: string }>> {
  return cached(`wb:${id}`, DAY, async () => {
    // mrnev wirkt bei „all“ nicht für jede Reihe, deshalb ein Fenster von acht Jahren und je Land der jüngste Wert.
    const y = new Date().getFullYear();
    const [, rows] = await getJson<[unknown, WbValue[] | null]>(`https://api.worldbank.org/v2/country/all/indicator/${id}?format=json&date=${y - 8}:${y}&per_page=5000`, 25000);
    const out = new Map<string, { value: number; year: string }>();
    for (const r of rows ?? []) {
      if (r.value == null || !r.countryiso3code) continue;
      const cur = out.get(r.countryiso3code);
      if (!cur || r.date > cur.year) out.set(r.countryiso3code, { value: r.value, year: r.date });
    }
    return out;
  });
}

// ---------- Namen in Texten erkennen ----------

const EXTRA: [string, string][] = [
  ["Syria", "SYR"],
  ["DR Congo", "COD"],
  ["DRC", "COD"],
  ["Somaliland", "SOM"],
  ["Kosovo", "XKX"],
  ["UK", "GBR"],
  ["U.K.", "GBR"],
  ["Britain", "GBR"],
  ["British", "GBR"],
  ["England", "GBR"],
  ["Scotland", "GBR"],
  ["Wales", "GBR"],
  ["US", "USA"],
  ["U.S.", "USA"],
  ["America", "USA"],
  ["American", "USA"],
  ["South Korea", "KOR"],
  ["North Korea", "PRK"],
  ["Laos", "LAO"],
  ["Vietnam", "VNM"],
  ["Taiwan", "TWN"],
  ["Gaza", "PSE"],
  ["West Bank", "PSE"],
  ["Palestine", "PSE"],
];
// Mehrdeutige Namen (Vornamen, US-Bundesstaat, Tier) nicht aus Fließtext zuordnen.
const AMBIGUOUS = new Set(["Jordan", "Georgia", "Chad", "Turkey", "Guinea", "Niger", "Dominica", "Jersey", "Mali"]);

const matchers = (() => {
  const out: { re: RegExp; iso3: string }[] = [];
  const add = (name: string, iso3: string) => {
    if (AMBIGUOUS.has(name) || /[,()]/.test(name)) return;
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out.push({ re: new RegExp(`(^|[^\\p{L}])${esc}(?![\\p{L}])`, "u"), iso3 });
  };
  for (const [a2, names] of Object.entries(iso.getNames("en", { select: "all" }) as Record<string, string[]>)) {
    const a3 = iso.alpha2ToAlpha3(a2);
    if (a3) names.forEach((n) => add(n, a3));
  }
  EXTRA.forEach(([n, c]) => add(n, c));
  return out;
})();

export function countriesIn(text: string): string[] {
  const hit = new Set<string>();
  for (const m of matchers) if (m.re.test(text)) hit.add(m.iso3);
  return [...hit];
}

function nameToIso3(name: string): string | null {
  const n = name.trim();
  return EXTRA.find(([x]) => x === n)?.[1] ?? iso.getAlpha3Code(n, "en") ?? null;
}

// ---------- Konflikte ----------

/** countries[0] ist das Hauptland; die übrigen sind Nebenschauplätze (Übergriffe, Anschläge, Grenzgefechte). */
export type Conflict = { name: string; tier: 1 | 2 | 3; countries: string[] };
const TIERS: [RegExp, Conflict["tier"]][] = [
  [/^Major wars/, 1],
  [/^Minor wars/, 2],
  [/^Conflicts/, 3],
];

const unlink = (s: string) =>
  s
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/<ref[\s\S]*?(\/>|<\/ref>)/g, "")
    .replace(/'{2,}/g, "")
    .trim();

export function conflicts(): Promise<{ list: Conflict[]; unmatched: string[] }> {
  return cached("conflicts", 12 * 60 * MIN, async () => {
    const d = await getJson<{ parse: { wikitext: string } }>(
      "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_ongoing_armed_conflicts&prop=wikitext&format=json&formatversion=2",
      20000,
    );
    const w = d.parse.wikitext;
    const heads = [...w.matchAll(/\n===([^=\n]+)===/g)];
    const list: Conflict[] = [];
    const unmatched = new Set<string>();
    heads.forEach((h, i) => {
      const tier = TIERS.find(([re]) => re.test(h[1].trim()))?.[1];
      if (!tier) return;
      const sec = w.slice(h.index!, heads[i + 1]?.index ?? w.length);
      for (const row of sec.split("\n|-").slice(1)) {
        const cells = row.split(/\n\|(?!\})/);
        const loc = cells.find((c) => c.includes("{{flag|"));
        if (!loc || cells.length < 4) continue;
        const countries = new Set<string>();
        for (const [, n] of loc.matchAll(/\{\{flag\|([^}|]+)/g)) {
          const c = nameToIso3(n);
          if (c) countries.add(c);
          else unmatched.add(n);
        }
        const first = cells[2]?.split("\n").find((l) => l.startsWith("*")) ?? cells[2] ?? "";
        const name = unlink(first.replace(/^\*+/, "")).replace(/\s+/g, " ");
        if (countries.size) list.push({ name: name || "Konflikt", tier, countries: [...countries] });
      }
    });
    return { list, unmatched: [...unmatched] };
  });
}

// ---------- Positive Meldungen ----------

export function positive(): Promise<{ byCountry: Record<string, NewsItem[]>; total: number; errors: string[] }> {
  return cached("positive", 60 * MIN, async () => {
    const { items, errors } = await positiveFeeds();
    const byCountry: Record<string, NewsItem[]> = {};
    for (const it of items) {
      for (const c of countriesIn(`${it.title} ${it.text ?? ""}`)) (byCountry[c] ??= []).push({ ...it, text: undefined });
    }
    return { byCountry, total: items.length, errors };
  });
}

// ---------- Übersicht und Detail ----------

export async function countryOverview() {
  const [meta, conf, pos] = await Promise.allSettled([wbCountries(), conflicts(), positive()]);
  const m = meta.status === "fulfilled" ? meta.value : new Map<string, WbCountry>();
  const list = [...m.values()].map((c) => ({ iso3: c.id, iso2: c.iso2Code, num: iso.alpha3ToNumeric(c.id) ?? null, name: deName(c.id) }));
  const conflict: Record<string, { tier: number; names: string[] }> = {};
  if (conf.status === "fulfilled")
    for (const c of conf.value.list)
      for (const k of c.countries) {
        // Nebenschauplätze großer Kriege zählen nur schwach, die kleiner Konflikte gar nicht.
        const tier = k === c.countries[0] ? c.tier : c.tier < 3 ? 3 : null;
        if (!tier) continue;
        const e = (conflict[k] ??= { tier, names: [] });
        e.tier = Math.min(e.tier, tier);
        e.names.push(c.name);
      }
  const positiveCount: Record<string, number> = {};
  if (pos.status === "fulfilled") for (const [k, v] of Object.entries(pos.value.byCountry)) positiveCount[k] = v.length;
  const errors = [meta, conf, pos].flatMap((r, i) => (r.status === "rejected" ? [`${["Weltbank", "Wikipedia", "Positive Feeds"][i]}: ${(r.reason as Error).message.slice(0, 60)}`] : []));
  return { list, conflict, positive: positiveCount, errors };
}

// Suchbegriff für Nachrichten, wo der amtliche Name in Schlagzeilen kaum vorkommt.
const NEWS_NAME: Record<string, string> = { USA: "USA", GBR: "Großbritannien", PSE: "Palästinenser", COD: "Kongo", ARE: "Emirate", PRK: "Nordkorea", CZE: "Tschechien", NLD: "Niederlande" };

export async function countryDetail(iso3: string) {
  const code = iso3.toUpperCase();
  const name = deName(code);
  const [meta, ind, conf, pos, news] = await Promise.all([
    wbCountries().then((m) => m.get(code) ?? null).catch(() => null),
    Promise.all(INDICATORS.map((i) => wbIndicator(i.id).then((m) => m.get(code) ?? null).catch(() => null))),
    conflicts().catch(() => null),
    positive().catch(() => null),
    gnews(`"${NEWS_NAME[code] ?? name}" when:3d`, 15).catch((e: Error) => e),
  ]);
  return {
    iso3: code,
    iso2: iso.alpha3ToAlpha2(code) ?? null,
    name,
    capital: meta?.capitalCity || null,
    region: meta?.region.value.trim() ?? null,
    income: meta?.incomeLevel.value ?? null,
    stats: INDICATORS.map((d, i) => ({ ...d, value: ind[i]?.value ?? null, year: ind[i]?.year ?? null })),
    conflicts: conf?.list.filter((c) => c.countries.includes(code)) ?? [],
    positive: pos?.byCountry[code] ?? [],
    news: Array.isArray(news) ? news : [],
    newsError: news instanceof Error ? news.message : null,
  };
}

/** Kennzahlen vorladen, damit der erste Klick auf ein Land schnell ist. */
export function warmCountries() {
  wbCountries().catch(() => {});
  conflicts().catch(() => {});
  positive().catch(() => {});
  for (const i of INDICATORS) wbIndicator(i.id).catch(() => {});
}
