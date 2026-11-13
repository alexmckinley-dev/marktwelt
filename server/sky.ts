// Echter Sternenhimmel: Hipparcos-Sterne bis Größenklasse 6 (etwa die Grenze des bloßen Auges),
// Sternbildlinien und -namen. Daten aus d3-celestial (Olaf Frohn, BSD-Lizenz), einmal im Jahr geladen.
import { diskCached, getJson } from "./lib.ts";

const DAY = 86400_000;
const BASE = "https://cdn.jsdelivr.net/gh/ofrohn/d3-celestial@master/data";
const MAG_LIMIT = 6;

type Fc<P, G> = { features: { id: string | number; properties: P; geometry: G }[] };
type PointG = { type: "Point"; coordinates: [number, number] };
type LinesG = { type: "MultiLineString"; coordinates: [number, number][][] };

const r2 = (x: number) => Math.round(x * 100) / 100;

export function sky() {
  return diskCached("sterne", 365 * DAY, async () => {
    const [stars, names, lines, cons] = await Promise.all([
      getJson<Fc<{ mag: number; bv: string }, PointG>>(`${BASE}/stars.6.json`, 60000),
      getJson<Record<string, { name?: string; de?: string }>>(`${BASE}/starnames.json`, 60000),
      getJson<Fc<{ rank: string }, LinesG>>(`${BASE}/constellations.lines.json`, 60000),
      getJson<Fc<{ name: string; de?: string; rank: string }, PointG>>(`${BASE}/constellations.json`, 60000),
    ]);
    // [Rektaszension in Grad, Deklination, Größenklasse, Farbindex B−V]
    const list = stars.features
      .filter((f) => f.properties.mag <= MAG_LIMIT)
      .map((f) => [r2(f.geometry.coordinates[0]), r2(f.geometry.coordinates[1]), r2(f.properties.mag), r2(Number(f.properties.bv) || 0.6)] as const)
      .sort((a, b) => a[2] - b[2]);
    const named = stars.features
      .filter((f) => f.properties.mag < 1.6 && (names[f.id]?.de || names[f.id]?.name))
      .map((f) => ({ name: names[f.id].de || names[f.id].name!, ra: f.geometry.coordinates[0], dec: f.geometry.coordinates[1], mag: f.properties.mag }))
      .sort((a, b) => a.mag - b.mag);
    return {
      stars: list,
      named,
      lines: lines.features.flatMap((f) => f.geometry.coordinates.map((l) => l.flat().map(r2))),
      constellations: cons.features.map((f) => ({ id: String(f.id), name: f.properties.de || f.properties.name, ra: f.geometry.coordinates[0], dec: f.geometry.coordinates[1], rank: Number(f.properties.rank) })),
      magLimit: MAG_LIMIT,
    };
  });
}
