// Naturereignisse für den Globus: Erdbeben von der USGS, übrige Katastrophen von GDACS
// (Global Disaster Alert and Coordination System, UN und EU-Kommission). Beide keylos.
import { cached, getJson } from "./lib.ts";

const MIN = 60_000;

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

type UsgsFeed = {
  features: { id: string; properties: { mag: number; place: string; time: number; url: string; alert: string | null }; geometry: { coordinates: [number, number, number] } }[];
};

function quakes(): Promise<GeoEvent[]> {
  return cached("ev:usgs", 15 * MIN, async () => {
    const d = await getJson<UsgsFeed>("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson");
    return d.features.map((f) => ({
      id: `usgs-${f.id}`,
      kind: "beben" as const,
      name: `M ${f.properties.mag.toFixed(1)} · ${f.properties.place}`,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      mag: f.properties.mag,
      alert: (f.properties.alert as GeoEvent["alert"]) ?? null,
      time: new Date(f.properties.time).toISOString(),
      url: f.properties.url,
    }));
  });
}

type GdacsFeed = {
  features?: {
    properties: { eventtype: string; eventid: number; name: string; alertlevel: string; fromdate: string; todate: string; iscurrent: string; url: { report: string } };
    geometry: { coordinates: [number, number] };
  }[];
};

const GDACS_KIND: Record<string, GeoEvent["kind"]> = { TC: "sturm", FL: "flut", VO: "vulkan", DR: "duerre", WF: "feuer" };

function disasters(): Promise<GeoEvent[]> {
  return cached("ev:gdacs", 30 * MIN, async () => {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 21 * 86400_000).toISOString().slice(0, 10);
    const base = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
    // Waldbrände nur ab Orange, sonst verdrängen sie alles andere (Seitengröße 100).
    const [main, fires] = await Promise.all([
      getJson<GdacsFeed>(`${base}?eventlist=TC;FL;VO;DR&fromDate=${from}&toDate=${to}&alertlevel=Green;Orange;Red`, 20000),
      getJson<GdacsFeed>(`${base}?eventlist=WF&fromDate=${from}&toDate=${to}&alertlevel=Orange;Red`, 20000).catch(() => ({ features: [] })),
    ]);
    const seen = new Set<string>();
    return [...(main.features ?? []), ...(fires.features ?? [])]
      .filter((f) => f.properties.iscurrent === "true" && GDACS_KIND[f.properties.eventtype])
      .filter((f) => {
        const k = `${f.properties.eventtype}${f.properties.eventid}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((f) => ({
        id: `gdacs-${f.properties.eventtype}${f.properties.eventid}`,
        kind: GDACS_KIND[f.properties.eventtype],
        name: f.properties.name,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        mag: null,
        alert: (f.properties.alertlevel?.toLowerCase() as GeoEvent["alert"]) ?? null,
        time: new Date(`${f.properties.todate}Z`).toISOString(),
        url: f.properties.url.report,
      }));
  });
}

export async function events(): Promise<{ events: GeoEvent[]; errors: string[] }> {
  const res = await Promise.allSettled([quakes(), disasters()]);
  const errors: string[] = [];
  const out: GeoEvent[] = [];
  res.forEach((r, i) => {
    if (r.status === "fulfilled") out.push(...r.value);
    else errors.push(`${i === 0 ? "USGS" : "GDACS"}: ${(r.reason as Error).message}`);
  });
  return { events: out, errors };
}
