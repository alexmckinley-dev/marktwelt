// Seitenleiste der Länderkarte: Staats- und Regierungschef, Provinzen nach Partei ihres
// Regierungschefs, Städte, darunter Kennzahlen und Nachrichten des Landes.
import { useState } from "react";
import { useApi, type CountryDetail, type CountryOverview, type Events, type Land, type Launches, type Leader, type World } from "../api";
import { fmt } from "../format";
import { cityCut, leaderColor, type LandLayers, type LandSel } from "../three/Country";
import type { GlobeSel } from "../three/Globe";
import { CountryPanel, Loading, statValue } from "./Panels";

/** Sitzverteilung als Halbring, Parteien von links nach rechts nach Größe. */
function Hemicycle({ parl }: { parl: NonNullable<Land["parliament"]> }) {
  const W = 300;
  const H = 160;
  const cx = W / 2;
  const cy = H - 6;
  const ro = 140;
  const ri = 78;
  const total = parl.parties.reduce((s, p) => s + p.seats, 0) || 1;
  let a0 = Math.PI;
  const arcs = parl.parties.map((p) => {
    const a1 = a0 - (p.seats / total) * Math.PI;
    const pt = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy - r * Math.sin(a)).toFixed(1)}`;
    const large = a0 - a1 > Math.PI ? 1 : 0;
    const d = `M${pt(ro, a0)}A${ro},${ro} 0 ${large} 1 ${pt(ro, a1)}L${pt(ri, a1)}A${ri},${ri} 0 ${large} 0 ${pt(ri, a0)}Z`;
    a0 = a1;
    return { p, d };
  });
  const color = (p: { name: string; color: string | null }) => leaderColor({ name: "", party: p.name, color: p.color });
  return (
    <>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {arcs.map(({ p, d }) => (
          <path key={p.name} d={d} fill={color(p)} stroke="#030812" strokeWidth={1}>
            <title>{`${p.name}: ${p.seats}`}</title>
          </path>
        ))}
        <text x={cx} y={cy - 18} textAnchor="middle" fill="currentColor" fontSize={22}>
          {parl.size ?? total}
        </text>
        <text x={cx} y={cy - 2} textAnchor="middle" fill="currentColor" fontSize={11} opacity={0.6}>
          Sitze
        </text>
      </svg>
      <table>
        <tbody>
          {parl.parties.slice(0, 9).map((p) => (
            <tr key={p.name}>
              <td>
                <span style={{ color: color(p) }}>●</span> {p.name}
              </td>
              <td>{p.seats}</td>
              <td className="dim small">{((p.seats / total) * 100).toFixed(0)} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Kennzahlen zweier Länder nebeneinander. */
function Compare({ iso3, overview }: { iso3: string; overview?: CountryOverview }) {
  const [other, setOther] = useState("");
  const a = useApi<CountryDetail>(`country/${iso3}`);
  const b = useApi<CountryDetail>(other ? `country/${other}` : null);
  const list = [...(overview?.list ?? [])].filter((c) => c.iso3 !== iso3).sort((x, y) => x.name.localeCompare(y.name, "de"));
  return (
    <>
      <h3>Vergleichen</h3>
      <select value={other} onChange={(e) => setOther(e.target.value)} style={{ width: "100%" }}>
        <option value="">Land wählen …</option>
        {list.map((c) => (
          <option key={c.iso3} value={c.iso3}>
            {c.name}
          </option>
        ))}
      </select>
      {other && (
        <table>
          <thead>
            <tr>
              <th />
              <th>{a.data?.name ?? iso3}</th>
              <th>{b.data?.name ?? other}</th>
            </tr>
          </thead>
          <tbody>
            {(a.data?.stats ?? []).map((s, i) => {
              const t = b.data?.stats[i];
              const better = s.value != null && t?.value != null ? (s.value > t.value ? 0 : s.value < t.value ? 1 : -1) : -1;
              return (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td style={{ fontWeight: better === 0 ? 600 : undefined }}>{statValue(s)}</td>
                  <td style={{ fontWeight: better === 1 ? 600 : undefined }}>{t ? statValue(t) : b.error ? "–" : "…"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {other && <p className="dim small">Fett: der höhere Wert, nicht unbedingt der bessere (Inflation, Arbeitslosigkeit). Weltbank, jüngster Jahreswert.</p>}
    </>
  );
}

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
      {data.parliament && data.parliament.parties.length > 0 && (
        <>
          <h3>{data.parliament.name}</h3>
          {data.parliament.complete ? (
            <Hemicycle parl={data.parliament} />
          ) : (
            <p className="dim small">
              Wikidata führt für diese Kammer nur {data.parliament.sum} von {data.parliament.size ?? "?"} Sitzen; die Verteilung wäre irreführend und fehlt deshalb.
            </p>
          )}
          {data.parliament.complete && (
            <p className="dim small">
              Wikidata, jüngster Stand je Partei; erfasst sind {data.parliament.sum} von {data.parliament.size} Sitzen.
            </p>
          )}
        </>
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
          Die Karte zeigt {fmt(data.rail.length, 0)} Bahnabschnitte, {fmt(data.motorway.length, 0)} Autobahnabschnitte, {fmt(data.road.length, 0)} Abschnitte von
          Fernstraßen und {pillars} Städte als Säulen.
          {data.rail.length === 0 && " Natural Earth verzeichnet hier keine Eisenbahn."}
          {data.motorway.length === 0 && " Autobahnen im engeren Sinn gibt es keine, das Netz bilden die Fernstraßen."}
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
      <Compare iso3={iso3} overview={overview} />
      {world && <CountryPanel key={iso3} iso3={iso3} world={world} overview={overview} events={events} launches={launches} onSel={onGlobe} />}
    </>
  );
}
