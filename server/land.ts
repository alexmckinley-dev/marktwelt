// Beliebiges Land als eigene Karte: Provinzen, Bahn und Fernstraßen aus Natural Earth (10m),
// Städte aus GeoNames, Regierungschefs der Provinzen und des Landes samt Partei aus Wikidata.
// Die großen Natural-Earth-Dateien werden einmal geladen, verdichtet und auf Platte gehalten.
import { createRequire } from "node:module";
import iso from "i18n-iso-countries";
import { unzipSync } from "fflate";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { cached, diskCached, getBuffer, getJson, throttle } from "./lib.ts";
import { simplify, type Ring } from "./germany.ts";
import { deName } from "./countries.ts";

const require = createRequire(import.meta.url);
const DAY = 24 * 3600_000;
const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";

type Pos = [number, number];
type Geo = { type: string; coordinates: unknown };
type Fc = { features: { properties: Record<string, unknown>; geometry: Geo | null }[] };

const ringsOf = (g: Geo | null): Ring[][] => (!g ? [] : g.type === "Polygon" ? [g.coordinates as Ring[]] : g.type === "MultiPolygon" ? (g.coordinates as Ring[][]) : []);
const linesOf = (g: Geo | null): Ring[] => (!g ? [] : g.type === "LineString" ? [g.coordinates as Ring] : g.type === "MultiLineString" ? (g.coordinates as Ring[]) : []);

async function neRaw(name: string): Promise<Fc> {
  const buf = await getBuffer(`${NE}${name}.geojson`, 240000);
  return JSON.parse(new TextDecoder().decode(buf)) as Fc;
}

// ---------- verdichtete Indizes, einmal je Datei ----------

type Line = { c: number[]; k?: number; s?: string };

/** Provinzen weltweit: Name, Art, Wikidata-ID und Umriss (auf etwa 400 m vereinfacht). */
function admin1() {
  return diskCached("ne-admin1", 365 * DAY, async () => {
    const fc = await neRaw("ne_10m_admin_1_states_provinces");
    return fc.features.map((f) => {
      const p = f.properties;
      return {
        id: String(p.adm1_code),
        a3: String(p.adm0_a3),
        a2: String(p.iso_a2),
        name: String(p.name_de || p.name || p.name_en || "?"),
        type: String(p.type_en || p.type || ""),
        wd: p.wikidataid ? String(p.wikidataid) : null,
        polys: ringsOf(f.geometry).map((poly) => poly.map((r) => simplify(r, 0.004)).filter((r) => r.length >= 4)).filter((poly) => poly.length),
      };
    });
  });
}

/** Bahnstrecken weltweit (ohne Landeszuordnung, die kommt über den Umriss). */
function rail() {
  return diskCached("ne-rail", 365 * DAY, async () => {
    const fc = await neRaw("ne_10m_railroads");
    return fc.features.flatMap((f) => linesOf(f.geometry).map((l): Line => ({ c: simplify(l, 0.003).flat() }))).filter((l) => l.c.length >= 4);
  });
}

/** Straßen: k=1 Autobahn oder Schnellstraße, k=2 Fernstraße. Fähren und Pisten fallen weg. */
function roads() {
  return diskCached("ne-roads", 365 * DAY, async () => {
    const fc = await neRaw("ne_10m_roads");
    return fc.features
      .filter((f) => !/Ferry|Track|Unknown/.test(String(f.properties.type)))
      .flatMap((f) => {
        const p = f.properties;
        const k = p.expressway === 1 || /Major Highway|Beltway/.test(String(p.type)) ? 1 : 2;
        return linesOf(f.geometry).map((l): Line => ({ c: simplify(l, 0.003).flat(), k, s: String(p.sov_a3) }));
      })
      .filter((l) => l.c.length >= 4);
  });
}

/** Städte ab 15.000 Einwohnern je Land (ISO-2). */
function places() {
  return diskCached("geonames-15000", 60 * DAY, async () => {
    const files = unzipSync(await getBuffer("https://download.geonames.org/export/dump/cities15000.zip"));
    const out: Record<string, [string, number, number, number][]> = {};
    for (const l of new TextDecoder().decode(Object.values(files)[0]).split("\n")) {
      const c = l.split("\t");
      if (!c[8] || !c[7]?.startsWith("PPL")) continue;
      (out[c[8]] ??= []).push([c[1], +c[4], +c[5], +c[14]]);
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => b[3] - a[3]);
    return out;
  });
}

// ---------- Landesumriss und Bildausschnitt ----------

const topo = require("world-atlas/countries-50m.json") as Topology;
const COUNTRIES = feature(topo, topo.objects.countries as GeometryCollection).features;

const area = (r: Ring) => Math.abs(r.reduce((s, [x, y], i) => s + x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * y, 0) / 2);
const bboxOf = (pts: Pos[]) => {
  let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pts) {
    if (x < a) a = x;
    if (y < b) b = y;
    if (x > c) c = x;
    if (y > d) d = y;
  }
  return [a, b, c, d];
};
const hits = (a: number[], b: number[]) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** Punkt im Polygon (gerade-ungerade über alle Ringe, also mit Löchern). */
function inside(polys: Ring[][], x: number, y: number) {
  let inn = false;
  for (const p of polys)
    for (const r of p)
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i];
        const [xj, yj] = r[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inn = !inn;
      }
  return inn;
}

function frameOf(iso3: string) {
  const numId = iso.alpha3ToNumeric(iso3);
  const f = COUNTRIES.find((c) => c.id === numId);
  if (!f) throw new Error(`kein Umriss für ${iso3}`);
  const all = ringsOf(f.geometry as Geo);
  const main = all.reduce((a, p) => (area(p[0]) > area(a[0]) ? p : a), all[0]);
  const c = main[0].reduce((s, q) => s + q[0], 0) / main[0].length;
  // Längen um die Landesmitte legen, damit Länder über der Datumsgrenze (Russland, Fidschi) zusammenbleiben.
  const wrap = (lon: number) => ((((lon - c + 540) % 360) + 360) % 360) - 180 + c;
  const W = (r: Ring): Ring => r.map(([x, y]) => [wrap(x), y]);
  const mb = bboxOf(main[0].map(([x, y]) => [wrap(x), y]));
  const pad = Math.max(mb[2] - mb[0], mb[3] - mb[1]) * 0.35;
  const near = [mb[0] - pad, mb[1] - pad, mb[2] + pad, mb[3] + pad];
  // Überseegebiete weit weg (Französisch-Guayana, Alaska) bleiben draußen, nahe Inseln drin.
  const keep = all.map((p) => p.map(W)).filter((p) => hits(bboxOf(p[0]), near));
  const bb = bboxOf(keep.flatMap((p) => p[0]));
  const lat0 = (bb[1] + bb[3]) / 2;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const span = Math.max((bb[2] - bb[0]) * kx, bb[3] - bb[1]);
  return { c, lat0, kx, s: 9 / span, bb, span, wrap, outline: keep };
}

// ---------- Geometrie je Land ----------

function landGeo(iso3: string) {
  return diskCached(`land-${iso3}`, 120 * DAY, async () => {
    const fr = frameOf(iso3);
    const iso2 = iso.alpha3ToAlpha2(iso3) ?? "";
    const tolP = Math.max(0.004, fr.span / 900);
    const tolL = Math.max(0.003, fr.span / 1200);
    const box = [fr.bb[0] - 0.5, fr.bb[1] - 0.5, fr.bb[2] + 0.5, fr.bb[3] + 0.5];
    const wrapLine = (c: number[]) => c.map((v, i) => (i % 2 ? v : fr.wrap(v)));
    const midIn = (c: number[]) => {
      const i = (c.length >> 2) << 1;
      return inside(fr.outline, c[i], c[i + 1]);
    };
    const [a1, rl, rd, pl] = await Promise.all([admin1(), rail(), roads(), places()]);

    let regions = a1
      .filter((r) => r.a3 === iso3 || (iso2 && r.a2 === iso2))
      .map((r) => ({ ...r, polys: r.polys.map((p) => p.map((ring) => simplify(ring.map(([x, y]) => [fr.wrap(x), y] as Pos), tolP)).filter((ring) => ring.length >= 4)).filter((p) => p.length) }))
      .map((r) => ({ ...r, polys: r.polys.filter((p) => hits(bboxOf(p[0]), box)) }))
      .filter((r) => r.polys.length)
      .map(({ id, name, type, wd, polys }) => ({ id, name, type, wd, polys }));
    if (!regions.length)
      regions = [{ id: iso3, name: deName(iso3), type: "Land", wd: null, polys: fr.outline.map((p) => p.map((r) => simplify(r, tolP)).filter((r) => r.length >= 4)).filter((p) => p.length) }];

    const pick = (ls: Line[]) =>
      ls
        .map((l) => wrapLine(l.c))
        .filter((c) => hits(bboxOf(Array.from({ length: c.length / 2 }, (_, i) => [c[2 * i], c[2 * i + 1]] as Pos)), box) && midIn(c))
        .map((c) => simplify(Array.from({ length: c.length / 2 }, (_, i) => [c[2 * i], c[2 * i + 1]] as Pos), tolL).flat())
        .filter((c) => c.length >= 4);

    const cities = (pl[iso2] ?? [])
      .map(([name, lat, lon, pop]) => ({ name, lat, lon: fr.wrap(lon), pop }))
      .filter((p) => p.lon >= box[0] && p.lon <= box[2] && p.lat >= box[1] && p.lat <= box[3])
      .slice(0, 400);

    return {
      iso3,
      frame: { c: fr.c, lat0: fr.lat0, kx: fr.kx, s: fr.s },
      outline: fr.outline.map((p) => p.map((r) => simplify(r, tolP).flat())).flat(),
      regions,
      rail: pick(rl),
      motorway: pick(rd.filter((l) => l.k === 1)),
      road: pick(rd.filter((l) => l.k === 2)),
      cities,
    };
  });
}

// ---------- Politik (Wikidata) ----------

type Sparql = { results: { bindings: Record<string, { value: string }>[] } };
// Wikidata weist parallele Abfragen gern mit 502 ab: eine nach der anderen, bei Fehler einmal nachfassen.
const wdQueue = throttle(1, 800);
const wdOnce = (q: string) => wdQueue(() => getJson<Sparql>(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, 40000));
const wd = (q: string) => wdOnce(q).catch(() => new Promise((r) => setTimeout(r, 2500)).then(() => wdOnce(q)));
// Aufgelöste Parteien (UMP) durch ihre Nachfolger ersetzen; Wikidata hinkt hier oft hinterher.
const PARTY = `OPTIONAL { ?h p:P102 ?ps. ?ps ps:P102 ?p0. FILTER NOT EXISTS { ?ps pq:P582 ?e2 } OPTIONAL { ?p0 wdt:P576 ?d. ?p0 wdt:P1366|wdt:P156 ?succ } BIND(COALESCE(?succ, ?p0) AS ?p) OPTIONAL { ?p wdt:P465 ?col } } OPTIONAL { ?st pq:P580 ?start }`;
const LABEL = `SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }`;

type Leader = { name: string; party: string | null; color: string | null };

function regionHeads(iso3: string, ids: string[]) {
  return cached(`land-heads:${iso3}`, DAY, async () => {
    if (!ids.length) return {} as Record<string, Leader>;
    const q = `SELECT ?r ?hLabel ?pLabel ?col ?start WHERE { VALUES ?r { ${ids.map((i) => `wd:${i}`).join(" ")} } ?r p:P6 ?st. ?st ps:P6 ?h. FILTER NOT EXISTS { ?st pq:P582 ?e } ${PARTY} ${LABEL} } ORDER BY DESC(?start)`;
    const d = await wd(q);
    const out: Record<string, Leader> = {};
    for (const b of d.results.bindings) {
      const id = b.r.value.split("/").pop()!;
      // jüngster Amtsantritt zuerst; eine Zeile mit Partei schlägt eine ohne beim selben Amtsinhaber
      if (out[id] && (out[id].party || out[id].name !== b.hLabel.value)) continue;
      out[id] = { name: b.hLabel.value, party: b.pLabel?.value ?? null, color: b.col ? `#${b.col.value}` : null };
    }
    return out;
  });
}

function nationalHeads(iso3: string) {
  return cached(`land-nation:${iso3}`, DAY, async () => {
    const q = `SELECT ?role ?hLabel ?pLabel ?col ?govLabel ?start WHERE { ?c wdt:P298 "${iso3}". FILTER NOT EXISTS { ?c wdt:P576 ?x } { ?c p:P35 ?st. ?st ps:P35 ?h. BIND("staat" AS ?role) } UNION { ?c p:P6 ?st. ?st ps:P6 ?h. BIND("regierung" AS ?role) } FILTER NOT EXISTS { ?st pq:P582 ?e } ${PARTY} OPTIONAL { ?c wdt:P122 ?gov } ${LABEL} } ORDER BY DESC(?start)`;
    const d = await wd(q);
    const pick = (role: string): Leader | null => {
      const first = d.results.bindings.find((x) => x.role.value === role);
      const b = d.results.bindings.find((x) => x.role.value === role && x.hLabel.value === first?.hLabel.value && x.pLabel) ?? first;
      return b ? { name: b.hLabel.value, party: b.pLabel?.value ?? null, color: b.col ? `#${b.col.value}` : null } : null;
    };
    const forms = [...new Set(d.results.bindings.map((b) => b.govLabel?.value).filter(Boolean))] as string[];
    return { state: pick("staat"), government: pick("regierung"), forms };
  });
}

/** Fehlt in Wikidata das Label (dann steht dort nur die Q-Nummer), den Titel des Wikipedia-Artikels nehmen. */
async function fixNames(ls: (Leader | null | undefined)[]) {
  const bad = [...new Set(ls.filter((l): l is Leader => !!l && /^Q\d+$/.test(l.name)).map((l) => l.name))];
  if (!bad.length) return;
  const d = await getJson<{ entities: Record<string, { sitelinks?: Record<string, { title: string }> }> }>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${bad.slice(0, 50).join("|")}&props=sitelinks&sitefilter=dewiki|enwiki&format=json`,
  ).catch(() => null);
  for (const l of ls) {
    const sl = l && d?.entities[l.name]?.sitelinks;
    if (l && sl) l.name = (sl.dewiki ?? sl.enwiki)?.title ?? l.name;
  }
}

/** Sitzverteilung der größten Kammer aus Wikidata; nur, wenn die Summe zur Kammergröße passt. */
function parliament(iso3: string) {
  return cached(`land-parl:${iso3}`, DAY, async () => {
    const q = `SELECT ?leg ?legLabel ?size ?p ?pLabel ?n ?t ?col WHERE { ?c wdt:P298 "${iso3}". FILTER NOT EXISTS { ?c wdt:P576 ?x } ?c wdt:P194 ?l0. ?l0 wdt:P527* ?leg. OPTIONAL { ?leg wdt:P1342 ?size } ?p p:P1410 ?st. ?st ps:P1410 ?n; pq:P194 ?leg. ?p wdt:P31/wdt:P279* wd:Q7278. FILTER NOT EXISTS { ?st pq:P582 ?e } OPTIONAL { ?st pq:P585 ?t } OPTIONAL { ?p wdt:P465 ?col } ${LABEL} }`;
    const d = await wd(q);
    const chambers = new Map<string, { name: string; size: number | null; parties: Map<string, { name: string; seats: number; color: string | null; t: string }> }>();
    for (const b of d.results.bindings) {
      const c = chambers.get(b.leg.value) ?? { name: b.legLabel.value, size: b.size ? Number(b.size.value) : null, parties: new Map() };
      chambers.set(b.leg.value, c);
      const t = b.t?.value ?? "";
      const cur = c.parties.get(b.p.value);
      if (!cur || t > cur.t) c.parties.set(b.p.value, { name: b.pLabel.value, seats: Math.round(Number(b.n.value)), color: b.col ? `#${b.col.value}` : null, t });
    }
    const list = [...chambers.values()]
      .map((c) => {
        const parties = [...c.parties.values()].filter((p) => p.seats > 0).sort((a, b) => b.seats - a.seats);
        const sum = parties.reduce((s, p) => s + p.seats, 0);
        return { name: c.name, size: c.size, sum, complete: !!c.size && sum >= c.size * 0.85 && sum <= c.size * 1.03, parties: parties.map(({ name, seats, color }) => ({ name, seats, color })) };
      })
      .sort((a, b) => (b.size ?? b.sum) - (a.size ?? a.sum));
    return list.find((c) => c.complete) ?? list[0] ?? null;
  });
}

export async function landDetail(iso3: string) {
  const code = iso3.toUpperCase();
  const geo = await landGeo(code);
  const ids = geo.regions.map((r) => r.wd).filter(Boolean) as string[];
  const [heads, nation, parl] = await Promise.allSettled([regionHeads(code, ids), nationalHeads(code), parliament(code)]);
  const h = heads.status === "fulfilled" ? heads.value : {};
  if (nation.status === "fulfilled") await fixNames([nation.value.state, nation.value.government, ...Object.values(h)]);
  return {
    ...geo,
    name: deName(code),
    regions: geo.regions.map((r) => ({ ...r, head: (r.wd && h[r.wd]) || null })),
    nation: nation.status === "fulfilled" ? nation.value : null,
    parliament: parl.status === "fulfilled" ? parl.value : null,
    errors: [heads, nation].flatMap((r) => (r.status === "rejected" ? [`Wikidata: ${(r.reason as Error).message.split(" ")[0]}`] : [])),
  };
}
