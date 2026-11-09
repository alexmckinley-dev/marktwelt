// Lebende Ebenen für den Globus, alle keylos: Schiffsdurchfahrten an Meerengen (IMF PortWatch),
// Flugzeuge (OpenSky Network), Weltraumwetter und Polarlicht (NOAA SWPC), Unterseekabel
// (TeleGeography), dazu für Deutschland Strom (Energy-Charts, Fraunhofer ISE) und Pegel (PEGELONLINE).
import { cached, diskCached, getJson } from "./lib.ts";
import iso from "i18n-iso-countries";
import { simplify } from "./germany.ts";
import { deName } from "./countries.ts";

/** OpenSky nennt Länder englisch („Republic of Korea“); auf deutsche Kurznamen abbilden. */
const OS_ALIAS: Record<string, string> = { "United States": "USA", "Republic of Korea": "KOR", "Russian Federation": "RUS", "Viet Nam": "VNM", "Iran, Islamic Republic of": "IRN", Turkey: "TUR", "Kingdom of the Netherlands": "NLD" };
const countryDe = (en: string) => {
  const a3 = OS_ALIAS[en] ?? iso.getAlpha3Code(en, "en");
  return a3 ? deName(a3) : en;
};

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

// ---------- Schiffsverkehr an Meerengen ----------

const PW = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query";
type PwRow = { attributes: { date: string; portid: string; portname: string; n_total: number; n_tanker: number; n_container: number; n_dry_bulk: number } };

/** Unsere Engpässe → Namen bei PortWatch. */
const PW_NAME: Record<string, string> = {
  hormus: "Strait of Hormuz",
  "bab-al-mandab": "Bab el-Mandeb Strait",
  suez: "Suez Canal",
  malakka: "Malacca Strait",
  panama: "Panama Canal",
  bosporus: "Bosporus Strait",
};

export type Transit = {
  id: string | null;
  name: string;
  last: string;
  avg7: number;
  base: number;
  change: number | null;
  tanker7: number;
  series: [string, number][];
};

export function chokeTraffic(): Promise<{ items: Transit[]; asOf: string | null }> {
  return cached("pw:choke", 6 * 60 * MIN, async () => {
    const since = new Date(Date.now() - 400 * DAY).toISOString().slice(0, 10);
    const rows: PwRow[] = [];
    // Der Dienst gibt höchstens 1.000 Zeilen je Abruf heraus und meldet per exceededTransferLimit, ob mehr kommt.
    for (let off = 0; off < 30000; ) {
      const q = `${PW}?where=${encodeURIComponent(`date>='${since}'`)}&outFields=date,portid,portname,n_total,n_tanker,n_container,n_dry_bulk&orderByFields=date&resultOffset=${off}&resultRecordCount=2000&f=json`;
      const d = await getJson<{ features: PwRow[]; exceededTransferLimit?: boolean }>(q, 40000);
      rows.push(...d.features);
      off += d.features.length;
      if (!d.exceededTransferLimit || !d.features.length) break;
    }
    const by = new Map<string, PwRow["attributes"][]>();
    for (const r of rows) {
      const a = r.attributes;
      (by.get(a.portname) ?? by.set(a.portname, []).get(a.portname)!).push(a);
    }
    const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
    const items: Transit[] = [];
    for (const [name, list] of by) {
      list.sort((a, b) => a.date.localeCompare(b.date));
      const last7 = list.slice(-7);
      // Vergleich mit denselben sieben Tagen ein Jahr zuvor, sonst mit dem Schnitt der 90 Tage davor.
      const lastDate = new Date(list.at(-1)!.date);
      const yearAgo = list.filter((x) => {
        const d = (lastDate.getTime() - new Date(x.date).getTime()) / DAY;
        return d >= 365 && d < 372;
      });
      const prior = list.slice(-97, -7);
      const base = yearAgo.length >= 5 ? mean(yearAgo.map((x) => x.n_total)) : mean(prior.map((x) => x.n_total));
      const avg7 = mean(last7.map((x) => x.n_total));
      items.push({
        id: Object.entries(PW_NAME).find(([, n]) => n === name)?.[0] ?? null,
        name,
        last: list.at(-1)!.date,
        avg7,
        base,
        change: base ? (avg7 / base - 1) * 100 : null,
        tanker7: mean(last7.map((x) => x.n_tanker)),
        series: list.slice(-120).map((x) => [x.date, x.n_total]),
      });
    }
    items.sort((a, b) => b.avg7 - a.avg7);
    return { items, asOf: items[0]?.last ?? null };
  });
}

// ---------- Flugzeuge ----------

type OsStates = { time: number; states: (string | number | boolean | null)[][] | null };

/** Alle Flugzeuge in der Luft: [lon, lat, Kurs, Höhe in m, Tempo in m/s]. Anonym gibt es rund 100 Abrufe am Tag. */
export function flights() {
  return cached("os:states", 15 * MIN, async () => {
    const d = await getJson<OsStates>("https://opensky-network.org/api/states/all", 40000);
    const pts: number[][] = [];
    const byCountry = new Map<string, number>();
    for (const s of d.states ?? []) {
      const [lon, lat, alt, ground, vel, track] = [s[5], s[6], s[7] ?? s[13], s[8], s[9], s[10]] as (number | null)[];
      if (lon == null || lat == null || ground) continue;
      pts.push([Math.round(lon * 100) / 100, Math.round(lat * 100) / 100, Math.round(track ?? 0), Math.round(alt ?? 0), Math.round(vel ?? 0)]);
      const c = countryDe(String(s[2]));
      byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
    }
    return {
      time: new Date(d.time * 1000).toISOString(),
      flights: pts,
      top: [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  });
}

// ---------- Weltraumwetter ----------

const SWPC = "https://services.swpc.noaa.gov";
type Scale = { Scale: string | null; Text: string | null };

export function spaceWeather() {
  return cached("swpc", 15 * MIN, async () => {
    const [kp, fc, scales, aurora] = await Promise.all([
      getJson<{ time_tag: string; Kp: number }[]>(`${SWPC}/products/noaa-planetary-k-index.json`, 20000).catch(() => null),
      getJson<{ time_tag: string; kp: number; observed: string }[]>(`${SWPC}/products/noaa-planetary-k-index-forecast.json`, 20000).catch(() => null),
      getJson<Record<string, { R: Scale; S: Scale; G: Scale }>>(`${SWPC}/products/noaa-scales.json`, 20000).catch(() => null),
      getJson<{ "Forecast Time": string; coordinates: [number, number, number][] }>(`${SWPC}/json/ovation_aurora_latest.json`, 30000),
    ]);
    const now = scales?.["0"];
    const kpNow = kp?.length ? kp[kp.length - 1].Kp : null;
    const forecast = (fc ?? [])
      .filter((r) => r.observed === "predicted")
      .map((r) => ({ time: `${r.time_tag}Z`, kp: Number(r.kp) }))
      .slice(0, 24);
    return {
      kp: kpNow,
      kpMax24: forecast.length ? Math.max(...forecast.slice(0, 8).map((r) => r.kp)) : null,
      forecast,
      scales: now ? { R: Number(now.R.Scale ?? 0), S: Number(now.S.Scale ?? 0), G: Number(now.G.Scale ?? 0) } : null,
      auroraTime: aurora["Forecast Time"],
      // Nur Gitterpunkte mit nennenswerter Polarlicht-Wahrscheinlichkeit (Prozent).
      aurora: aurora.coordinates.filter((c) => c[2] >= 8).map(([lon, lat, p]) => [lon > 180 ? lon - 360 : lon, lat, p]),
    };
  });
}

// ---------- Unterseekabel ----------

type CableFc = { features: { properties: { id: string; name: string; color: string }; geometry: { type: string; coordinates: [number, number][][] } }[] };

export function cables() {
  return diskCached("kabel", 30 * DAY, async () => {
    const fc = await getJson<CableFc>("https://www.submarinecablemap.com/api/v3/cable/cable-geo.json", 60000);
    const out = new Map<string, { id: string; name: string; color: string; lines: number[][] }>();
    for (const f of fc.features) {
      const p = f.properties;
      const e = out.get(p.id) ?? { id: p.id, name: p.name, color: p.color, lines: [] };
      const ls = f.geometry.type === "LineString" ? [f.geometry.coordinates as unknown as [number, number][]] : f.geometry.coordinates;
      for (const l of ls) e.lines.push(simplify(l, 0.05).flat());
      out.set(p.id, e);
    }
    return { cables: [...out.values()], asOf: new Date().toISOString() };
  });
}

// ---------- Deutschland: Strom ----------

type EcPower = { unix_seconds: number[]; production_types: { name: string; data: (number | null)[] }[] };

const POWER_GROUP: [RegExp, string, string][] = [
  [/^Solar/, "Solar", "#ffd23f"],
  [/^Wind onshore/, "Wind an Land", "#7fd6ff"],
  [/^Wind offshore/, "Wind auf See", "#3a9bdc"],
  [/^Biomass|^Waste|^Geothermal/, "Biomasse und Müll", "#7cbf5a"],
  [/^Hydro Run|^Hydro water|^Hydro pumped storage$/, "Wasser", "#2d7bd6"],
  [/lignite/, "Braunkohle", "#8a5a3c"],
  [/hard coal|coal-derived/, "Steinkohle", "#555b66"],
  [/Fossil gas/, "Erdgas", "#e8823a"],
  [/Fossil oil|^Others/, "Öl und Sonstiges", "#9a8f86"],
];

export function power() {
  return cached("ec:power", 15 * MIN, async () => {
    const [p, pr] = await Promise.all([
      getJson<EcPower>("https://api.energy-charts.info/public_power?country=de", 30000),
      getJson<{ unix_seconds: number[]; price: (number | null)[]; unit: string }>("https://api.energy-charts.info/price?bzn=DE-LU", 30000).catch(() => null),
    ]);
    // jüngster Zeitpunkt, zu dem Solar und Last gemeldet sind
    const col = (name: RegExp) => p.production_types.find((t) => name.test(t.name))?.data ?? [];
    const load = col(/^Load$/);
    let i = p.unix_seconds.length - 1;
    while (i > 0 && (load[i] == null || col(/^Solar/)[i] == null)) i--;
    const mix = POWER_GROUP.map(([re, name, color]) => ({
      name,
      color,
      mw: p.production_types.filter((t) => re.test(t.name)).reduce((s, t) => s + Math.max(0, t.data[i] ?? 0), 0),
    })).filter((m) => m.mw > 0);
    const gen = mix.reduce((s, m) => s + m.mw, 0);
    const trade = col(/Cross border/)[i] ?? null;
    const renewable = mix.filter((m) => /Solar|Wind|Biomasse|Wasser/.test(m.name)).reduce((s, m) => s + m.mw, 0);
    // Tagesverlauf der Erzeugung in Viertelstunden für den Sparkline-Streifen
    const series = p.unix_seconds.slice(0, i + 1).map((t, k) => [t, load[k] ?? 0, (col(/^Solar/)[k] ?? 0) + (col(/^Wind onshore/)[k] ?? 0) + (col(/^Wind offshore/)[k] ?? 0)]);
    let price: number | null = null;
    let priceAt: string | null = null;
    if (pr) {
      const now = Date.now() / 1000;
      let k = pr.unix_seconds.findLastIndex((t) => t <= now);
      if (k < 0) k = pr.price.length - 1;
      price = pr.price[k] ?? null;
      priceAt = new Date(pr.unix_seconds[k] * 1000).toISOString();
    }
    return {
      time: new Date(p.unix_seconds[i] * 1000).toISOString(),
      mix: mix.sort((a, b) => b.mw - a.mw),
      generation: gen,
      load: load[i],
      import: trade,
      renewableShare: gen ? (renewable / gen) * 100 : null,
      price,
      priceAt,
      series,
    };
  });
}

// ---------- Deutschland: Pegel ----------

type PoStation = {
  uuid: string;
  shortname: string;
  longname: string;
  longitude?: number;
  latitude?: number;
  water: { longname: string };
  timeseries: { shortname: string; unit: string; currentMeasurement?: { timestamp: string; value: number; stateMnwMhw?: string; stateNswHsw?: string } }[];
};

/** „FÜRSTENWALDE UP“ → „Fürstenwalde Up“; Unicode-fest, damit Umlaute nicht als Wortgrenze gelten. */
const title = (x: string) => x.toLowerCase().replace(/(^|[\s\-(/])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\bUp\b/, "UP").replace(/\bOp\b/, "OP");

export function pegel() {
  return cached("po:pegel", 15 * MIN, async () => {
    const d = await getJson<PoStation[]>("https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations.json?includeTimeseries=true&includeCurrentMeasurement=true&timeseries=W", 40000);
    const items = d
      .filter((s) => s.latitude && s.longitude)
      .map((s) => {
        const m = s.timeseries.find((t) => t.shortname === "W")?.currentMeasurement;
        return {
          id: s.uuid,
          name: title(s.longname),
          water: title(s.water.longname),
          lat: s.latitude!,
          lon: s.longitude!,
          cm: m?.value ?? null,
          time: m?.timestamp ?? null,
          // low | normal | high nach mittlerem Niedrig- und Hochwasser; NSW/HSW sind Schifffahrtsgrenzen
          state: (m?.stateMnwMhw ?? "unknown") as string,
          ship: (m?.stateNswHsw ?? "unknown") as string,
        };
      })
      .filter((s) => s.cm != null);
    return { items, asOf: new Date().toISOString() };
  });
}
