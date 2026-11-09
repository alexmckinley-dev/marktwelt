// Deutschland im Detail: Grenzen (BKG VG2500), Wahlkreise und Ergebnisse der Bundestagswahl 2025
// (Bundeswahlleiterin), Landesregierungen (Wikidata), Städte (GeoNames), Bahn- und Straßennetz
// (BKG DLM250) und Baustellen auf Autobahnen (Autobahn GmbH). Alles keylos.
import { unzipSync } from "fflate";
import { read as readShp } from "shapefile";
import { cached, diskCached, getBuffer, getJson, getText, throttle } from "./lib.ts";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export type Ring = [number, number][];
export type Geom = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] } | { type: "MultiLineString" | "LineString"; coordinates: unknown };

// ---------- Geometrie vereinfachen ----------

/** Douglas-Peucker in Grad; tol 0.002 ≈ 150 m. */
export function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts;
  const [fx, fy] = pts[0];
  const [lx, ly] = pts[pts.length - 1];
  if (fx === lx && fy === ly && pts.length > 4) {
    // geschlossener Ring: in zwei Hälften teilen, sonst fallen beide Anker auf denselben Punkt
    const mid = pts.length >> 1;
    return [...simplify(pts.slice(0, mid + 1), tol).slice(0, -1), ...simplify(pts.slice(mid), tol)];
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let best = -1;
    let bd = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
}

export function polys(g: Geom, tol: number): Ring[][] {
  const list = g.type === "Polygon" ? [g.coordinates as Ring[]] : g.type === "MultiPolygon" ? (g.coordinates as Ring[][]) : [];
  return list.map((p) => p.map((r) => simplify(r, tol)).filter((r) => r.length >= 4)).filter((p) => p.length);
}

export function lines(g: Geom, tol: number): number[][] {
  const list = g.type === "LineString" ? [g.coordinates as Ring] : g.type === "MultiLineString" ? (g.coordinates as Ring[]) : [];
  return list.map((l) => simplify(l, tol).flat()).filter((l) => l.length >= 4);
}

// ---------- Grenzen, Wahl, Regierungen, Städte ----------

const BKG = "https://sgx.geodatenzentrum.de";

type Fc = { features: { properties: Record<string, unknown>; geometry: Geom }[] };

function laender() {
  return diskCached("de-laender", 30 * DAY, async () => {
    const d = await getJson<Fc>(`${BKG}/wfs_vg2500?service=WFS&version=2.0.0&request=GetFeature&typeNames=vg2500:vg2500_lan&outputFormat=application/json&srsName=EPSG:4326`, 60000);
    return d.features.map((f) => ({ ags: String(f.properties.ags ?? f.properties.AGS ?? ""), name: String(f.properties.gen ?? f.properties.GEN ?? ""), polys: polys(f.geometry, 0.003) }));
  });
}

const WK_ZIP = "https://www.bundeswahlleiterin.de/dam/jcr/556bec9c-be80-4818-a368-fe6596f15f08/btw25_geometrie_wahlkreise_shp_geo.zip";
const KERG = "https://www.bundeswahlleiterin.de/bundestagswahlen/2025/ergebnisse/opendata/btw25/csv/kerg2.csv";

function wahlkreise() {
  return diskCached("de-wahlkreise", 365 * DAY, async () => {
    const files = unzipSync(await getBuffer(WK_ZIP));
    const pick = (ext: string) => Object.entries(files).find(([n]) => n.toLowerCase().endsWith(ext))![1];
    const fc = (await readShp(pick(".shp").slice().buffer, pick(".dbf").slice().buffer, { encoding: "utf-8" })) as unknown as Fc;
    return fc.features.map((f) => ({
      nr: Number(f.properties.WKR_NR),
      name: String(f.properties.WKR_NAME),
      land: String(f.properties.LAND_NAME ?? ""),
      polys: polys(f.geometry, 0.002),
    }));
  });
}

type Party = { name: string; pct2: number | null; pct1: number | null };

function results() {
  return diskCached("de-btw25", 365 * DAY, async () => {
    const csv = await getText(KERG, 60000);
    const byArea = new Map<string, { type: string; nr: string; name: string; parties: Map<string, Party>; turnout: number | null }>();
    const p = (s: string) => (s ? Number(s.replace(",", ".")) : null);
    for (const line of csv.split(/\r?\n/)) {
      const c = line.split(";");
      if (c[0] !== "BT" || !["Wahlkreis", "Land", "Bund"].includes(c[2])) continue;
      const key = `${c[2]}:${c[3]}`;
      const a = byArea.get(key) ?? { type: c[2], nr: c[3], name: c[4], parties: new Map(), turnout: null };
      byArea.set(key, a);
      if (c[7] === "System-Gruppe" && c[8] === "Wählende" && c[10] === "") a.turnout = p(c[12]);
      if (c[7] !== "Partei" && c[7] !== "Einzelbewerber") continue;
      const party = a.parties.get(c[8]) ?? { name: c[8], pct2: null, pct1: null };
      if (c[10] === "2") party.pct2 = p(c[12]);
      if (c[10] === "1") party.pct1 = p(c[12]);
      a.parties.set(c[8], party);
    }
    return [...byArea.values()].map((a) => ({
      type: a.type,
      nr: Number(a.nr),
      name: a.name,
      turnout: a.turnout,
      parties: [...a.parties.values()].filter((x) => (x.pct2 ?? 0) >= 1 || (x.pct1 ?? 0) >= 5).sort((x, y) => (y.pct2 ?? 0) - (x.pct2 ?? 0)),
    }));
  });
}

type Sparql = { results: { bindings: Record<string, { value: string }>[] } };

function governments() {
  return cached("de-regierungen", DAY, async () => {
    const q = `SELECT ?l ?lLabel ?hLabel ?pLabel ?ags WHERE { ?l wdt:P31 wd:Q1221156; wdt:P1388 ?ags. OPTIONAL { ?l p:P6 ?st. ?st ps:P6 ?h. FILTER NOT EXISTS { ?st pq:P582 ?e } OPTIONAL { ?h wdt:P102 ?p } } SERVICE wikibase:label { bd:serviceParam wikibase:language "de". } }`;
    const d = await getJson<Sparql>(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, 30000);
    const seen = new Set<string>();
    return d.results.bindings
      .map((b) => ({ ags: b.ags?.value ?? "", land: b.lLabel.value, head: b.hLabel?.value ?? null, party: b.pLabel?.value ?? null }))
      .filter((x) => (seen.has(x.ags) ? false : (seen.add(x.ags), true)));
  });
}

// GeoNames führt einige Städte unter dem englischen Namen.
const DE_NAME: Record<string, string> = { Munich: "München", Cologne: "Köln", Nuremberg: "Nürnberg", Hanover: "Hannover", Brunswick: "Braunschweig", "Frankfurt am Main": "Frankfurt am Main" };

function cities() {
  return diskCached("de-staedte", 30 * DAY, async () => {
    const files = unzipSync(await getBuffer("https://download.geonames.org/export/dump/cities15000.zip"));
    const txt = new TextDecoder().decode(Object.values(files)[0]);
    return txt
      .split("\n")
      .map((l) => l.split("\t"))
      .filter((c) => c[8] === "DE" && c[7]?.startsWith("PPL"))
      .map((c) => ({ name: DE_NAME[c[1]] ?? c[1], lat: +c[4], lon: +c[5], pop: +c[14] }))
      .filter((c) => c.pop >= 20000)
      .sort((a, b) => b.pop - a.pop);
  });
}

export async function germanyBase() {
  const [l, wk, res, gov, st] = await Promise.allSettled([laender(), wahlkreise(), results(), governments(), cities()]);
  const v = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
  const errors = [l, wk, res, gov, st].flatMap((r, i) => (r.status === "rejected" ? [`${["BKG", "Wahlkreise", "Ergebnisse", "Wikidata", "GeoNames"][i]}: ${(r.reason as Error).message.slice(0, 80)}`] : []));
  const rs = v(res) ?? [];
  return {
    laender: v(l) ?? [],
    wahlkreise: v(wk) ?? [],
    results: { bund: rs.find((r) => r.type === "Bund") ?? null, laender: rs.filter((r) => r.type === "Land"), wahlkreise: rs.filter((r) => r.type === "Wahlkreis") },
    governments: v(gov) ?? [],
    cities: v(st) ?? [],
    errors,
  };
}

// ---------- Bahn- und Straßennetz ----------

const DLM = `${BKG}/wfs_dlm250?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&srsName=EPSG:4326`;
const dlmQueue = throttle(2, 300);

async function dlmAll(type: string, filter?: string) {
  const out: Fc["features"] = [];
  for (let start = 0; ; start += 10000) {
    const url = `${DLM}&typeNames=dlm250:${type}&count=10000&startIndex=${start}${filter ? `&FILTER=${encodeURIComponent(filter)}` : ""}`;
    const d = await dlmQueue(() => getJson<Fc>(url, 120000));
    out.push(...d.features);
    if (d.features.length < 10000) return out;
  }
}

const wdm = (codes: string[]) =>
  `<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0"><fes:Or>${codes
    .map((c) => `<fes:PropertyIsEqualTo><fes:ValueReference>wdm</fes:ValueReference><fes:Literal>${c}</fes:Literal></fes:PropertyIsEqualTo>`)
    .join("")}</fes:Or></fes:Filter>`;

export async function germanyNet() {
  const n = await netRaw();
  return { bahn: [...n.fern, ...n.bahn], autobahn: n.autobahn, bundesstrasse: n.bundesstrasse };
}

function netRaw() {
  return diskCached("de-netz", 90 * DAY, async () => {
    const [rail, roads] = await Promise.all([dlmAll("objart_42014_l"), dlmAll("objart_42003_l", wdm(["1301", "1303"]))]);
    // Bahn: nur Strecken in Betrieb (Zustand leer). „fern“ sind Strecken mit Personenverkehr (Kategorie 1101).
    const r = rail.filter((f) => !f.properties.zus);
    return {
      fern: r.filter((f) => String(f.properties.bkt).includes("1101")).flatMap((f) => lines(f.geometry, 0.0015)),
      bahn: r.filter((f) => !String(f.properties.bkt).includes("1101")).flatMap((f) => lines(f.geometry, 0.0015)),
      autobahn: roads.filter((f) => f.properties.wdm === "1301").flatMap((f) => lines(f.geometry, 0.0015)),
      bundesstrasse: roads.filter((f) => f.properties.wdm === "1303").flatMap((f) => lines(f.geometry, 0.002)),
    };
  });
}

// ---------- Baustellen ----------

const AB = "https://verkehr.autobahn.de/o/autobahn";
const abQueue = throttle(6, 50);

type Roadwork = {
  identifier: string;
  title: string;
  subtitle: string;
  coordinate: { lat: number | string; long: number | string };
  isBlocked: string;
  future: boolean;
  display_type: string;
  description: string[];
  startTimestamp?: string;
};

export type Baustelle = { id: string; road: string; title: string; dir: string; lat: number; lon: number; blocked: boolean; short: boolean; start: string | null; end: string | null; length: string | null; text: string };

export function roadworks() {
  return cached("de-baustellen", 30 * MIN, async () => {
    const { roads } = await getJson<{ roads: string[] }>(`${AB}/`);
    const clean = [...new Set(roads.map((r) => r.trim()).filter((r) => /^A\d+$/.test(r)))];
    const lists = await Promise.all(
      clean.map((road) =>
        abQueue(() => getJson<{ roadworks: Roadwork[] }>(`${AB}/${road}/services/roadworks`, 30000))
          .then((d) => d.roadworks.filter((w) => !w.future).map((w) => ({ w, road })))
          .catch(() => []),
      ),
    );
    const seen = new Set<string>();
    const out: Baustelle[] = [];
    for (const { w, road } of lists.flat()) {
      if (seen.has(w.identifier)) continue;
      seen.add(w.identifier);
      const d = w.description ?? [];
      const end = d.find((x) => x.startsWith("Ende:"))?.replace("Ende: ", "") ?? null;
      const len = d.find((x) => x.startsWith("Länge:"))?.split("|")[0].replace("Länge: ", "").trim() ?? null;
      out.push({
        id: w.identifier,
        road,
        title: w.title.replace(/^A\d+\s*\|\s*/, ""),
        dir: w.subtitle.trim(),
        lat: +w.coordinate.lat,
        lon: +w.coordinate.long,
        blocked: w.isBlocked === "true",
        short: w.display_type === "SHORT_TERM_ROADWORKS",
        start: w.startTimestamp ?? null,
        end,
        length: len,
        text: d.filter((x) => x && !/^(Beginn|Ende|Zeitraum)/.test(x)).slice(0, 4).join(" · "),
      });
    }
    return { items: out.filter((b) => Number.isFinite(b.lat)), roads: clean.length, asOf: new Date().toISOString() };
  });
}
