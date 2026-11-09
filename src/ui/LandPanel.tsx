// Seitenleiste der Länderkarte: Staats- und Regierungschef, Provinzen nach Partei ihres
// Regierungschefs, Städte, darunter Kennzahlen und Nachrichten des Landes.
import type { CountryOverview, Events, Land, Launches, Leader, World } from "../api";
import { fmt } from "../format";
import { cityCut, leaderColor, type LandLayers, type LandSel } from "../three/Country";
import type { GlobeSel } from "../three/Globe";
import { CountryPanel, Loading } from "./Panels";

function Who({ l }: { l: Leader | null | undefined }) {
  if (!l) return <span className="dim">unbekannt</span>;
  return (
    <>
      {l.party && <span style={{ color: leaderColor(l) }}>● </span>}
      {l.name}
      {l.party && <span className="dim small"> · {l.party}</span>}
    </>
  );
}

export function LandPanel({
  iso3,
  data,
  error,
  layers,
  setLayers,
  sel,
  onSel,
  world,
  overview,
  events,
  launches,
  onGlobe,
}: {
  iso3: string;
  data: Land | undefined;
  error?: string;
  layers: LandLayers;
  setLayers: (l: LandLayers) => void;
  sel: LandSel;
  onSel: (s: LandSel) => void;
  world: World | undefined;
  overview?: CountryOverview;
  events?: Events;
  launches?: Launches;
  onGlobe: (s: GlobeSel) => void;
}) {
  if (!data) return <Loading error={error} />;
  const back = (
    <button className="closebtn" onClick={() => onSel(null)}>
      ← {data.name}
    </button>
  );
  if (sel?.type === "region") {
    const r = data.regions.find((x) => x.id === sel.id);
    return (
      <>
        {back}
        <h2>{r?.name}</h2>
        <p className="dim">{r?.type}</p>
        <table>
          <tbody>
            <tr>
              <td>Regierungschef</td>
              <td>
                <Who l={r?.head} />
              </td>
            </tr>
          </tbody>
        </table>
        <p className="dim small">Quelle: Wikidata (Eigenschaft „Regierungschef“, laufende Amtszeit). Bei Provinzen ist Wikidata nicht immer aktuell.</p>
      </>
    );
  }
  if (sel?.type === "city") {
    const i = data.cities.findIndex((x) => x.name === sel.id);
    const c = data.cities[i];
    return (
      <>
        {back}
        <h2>{c?.name}</h2>
        <div className="hero">
          {c && fmt(c.pop, 0)} <small>Einwohner</small>
        </div>
        <p className="dim">Platz {i + 1} der Städte in {data.name} laut GeoNames</p>
        <p className="dim small">Quelle: GeoNames (cities15000). Einwohnerzahlen sind teils einige Jahre alt, oft nur die Kernstadt.</p>
      </>
    );
  }

  const byParty = new Map<string, { n: number; color: string }>();
  for (const r of data.regions) {
    const p = r.head?.party;
    if (!p) continue;
    const e = byParty.get(p) ?? { n: 0, color: leaderColor(r.head) };
    e.n++;
    byParty.set(p, e);
  }
  const parties = [...byParty.entries()].sort((a, b) => b[1].n - a[1].n);
  const known = data.regions.filter((r) => r.head).length;
  const types = [...new Set(data.regions.map((r) => r.type).filter(Boolean))];
  const pillars = data.cities.filter((c) => c.pop >= cityCut(data.cities)).length;
  const n = data.nation;
  return (
    <>
      <h2>{data.name}</h2>
      {n && (
        <table>
          <tbody>
            <tr>
              <td>Staatsoberhaupt</td>
              <td>
                <Who l={n.state} />
              </td>
            </tr>
            {n.government && n.government.name !== n.state?.name && (
              <tr>
                <td>Regierungschef</td>
                <td>
                  <Who l={n.government} />
                </td>
              </tr>
            )}
            {n.forms.length > 0 && (
              <tr>
                <td>System</td>
                <td className="dim">{n.forms.slice(0, 2).join(", ")}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      <div className="chips">
        {(
          [
            ["regionen", "Parteien"],
            ["bahn", "Bahn"],
            ["autobahn", "Autobahnen"],
            ["strassen", "Fernstraßen"],
            ["staedte", "Städte"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="chip">
            <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} /> {label}
          </label>
        ))}
      </div>
      <div className="summary">
        <p>
          {data.regions.length > 1 ? (
            <>
              {data.name} gliedert sich in {data.regions.length} Einheiten erster Ebene{types.length ? ` (${types.slice(0, 2).join(", ")})` : ""}.{" "}
              {parties.length ? (
                <>
                  Für {known} davon kennt Wikidata den Regierungschef; die Partei steht bei {parties.reduce((s, [, e]) => s + e.n, 0)}. Am häufigsten:{" "}
                  {parties.slice(0, 4).map(([p, e]) => `${p} (${e.n})`).join(", ")}.
                </>
              ) : (
                "Zu den Regierungschefs der Provinzen hat Wikidata keine Parteien, die Kacheln bleiben deshalb neutral."
              )}
            </>
          ) : (
            `${data.name} hat in Natural Earth keine Provinzgliederung; die Karte zeigt das ganze Land.`
          )}{" "}
          Die Karte zeigt {fmt(data.rail.length, 0)} Bahnabschnitte, {fmt(data.motorway.length, 0)} Autobahnabschnitte und {pillars} Städte als Säulen.
        </p>
      </div>
      {parties.length > 0 && (
        <>
          <h3>Provinzen nach Partei</h3>
          <table>
            <tbody>
              {parties.slice(0, 8).map(([p, e]) => (
                <tr key={p}>
                  <td>
                    <span style={{ color: e.color }}>●</span> {p}
                  </td>
                  <td className="dim">{e.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <h3>Größte Städte</h3>
      <table className="click">
        <tbody>
          {data.cities.slice(0, 10).map((c) => (
            <tr key={c.name} onClick={() => onSel({ type: "city", id: c.name })}>
              <td>{c.name}</td>
              <td className="dim">{fmt(c.pop / 1e6, 2)} Mio.</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dim small">
        Quellen: Natural Earth 1:10 Mio. (Provinzen, Bahn, Straßen; grob, Stand der Datenbasis teils älter), GeoNames (Städte), Wikidata (Regierungschefs und Parteifarben, täglich).
        {data.errors.length > 0 && <span className="warn"> {data.errors.join(" · ")}</span>}
      </p>
      {world && <CountryPanel key={iso3} iso3={iso3} world={world} overview={overview} events={events} launches={launches} onSel={onGlobe} />}
    </>
  );
}
