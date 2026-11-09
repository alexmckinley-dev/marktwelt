// Satellitenbahnen von CelesTrak (keylos). CelesTrak bittet, eine Gruppe höchstens alle
// zwei Stunden zu laden; Marktwelt hält sie sechs Stunden auf der Platte.
import { diskCached, getText } from "./lib.ts";

const H = 3600_000;

type Tle = { name: string; l1: string; l2: string };

function parseTle(text: string): Tle[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const out: Tle[] = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    if (!lines[i + 2]?.startsWith("2 ")) break;
    out.push({ name: lines[i].trim(), l1: lines[i + 1], l2: lines[i + 2] });
  }
  return out;
}

const gp = (q: string) =>
  diskCached(`celestrak-${q}`, 6 * H, async () => parseTle(await getText(`https://celestrak.org/NORAD/elements/gp.php?${q}&FORMAT=tle`, 30000)));

// Einzelne große Objekte mit Name, Bild im Panel und eigener Bahnlinie.
const NAMED = [
  { id: "iss", catnr: 25544, name: "ISS", kind: "Raumstation", note: "Internationale Raumstation, seit 2000 durchgehend bewohnt. Etwa 109 m breit, rund 420 t." },
  { id: "css", catnr: 48274, name: "Tiangong", kind: "Raumstation", note: "Chinesische Raumstation, seit 2022 vollständig, drei Module." },
  { id: "hst", catnr: 20580, name: "Hubble", kind: "Weltraumteleskop", note: "Weltraumteleskop von NASA und ESA, seit 1990 im Orbit, 13,2 m lang." },
  { id: "tess", catnr: 43435, name: "TESS", kind: "Weltraumteleskop", note: "Sucht Exoplaneten auf einer stark elliptischen Bahn bis zur Mondentfernung." },
  { id: "terra", catnr: 25994, name: "Terra", kind: "Erdbeobachtung", note: "NASA-Satellit für Klima und Landoberfläche, seit 1999." },
  { id: "s2a", catnr: 40697, name: "Sentinel-2A", kind: "Erdbeobachtung", note: "Copernicus-Satellit der EU, optische Bilder in 10 m Auflösung." },
];

const SWARMS = [
  { id: "starlink", q: "GROUP=starlink", name: "Starlink", color: "#8fd0ff" },
  { id: "oneweb", q: "GROUP=oneweb", name: "OneWeb", color: "#b58cff" },
  { id: "gps", q: "GROUP=gps-ops", name: "GPS", color: "#2ee6a6" },
  { id: "galileo", q: "GROUP=galileo", name: "Galileo", color: "#f5c451" },
  { id: "geo", q: "GROUP=geo", name: "Geostationär", color: "#ff9f6b" },
] as const;

export async function satellites() {
  const named = await Promise.all(
    NAMED.map(async (n) => {
      const t = (await gp(`CATNR=${n.catnr}`).catch(() => []))[0];
      return t ? { ...n, l1: t.l1, l2: t.l2 } : null;
    }),
  );
  const swarms = await Promise.all(
    SWARMS.map(async (s) => {
      const tle = await gp(s.q).catch(() => [] as Tle[]);
      return { id: s.id, name: s.name, color: s.color, tle: tle.map((t) => [t.l1, t.l2] as const) };
    }),
  );
  return { named: named.filter((x) => x != null), swarms, asOf: new Date().toISOString() };
}
