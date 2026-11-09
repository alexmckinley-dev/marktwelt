// Panels für Satelliten, Himmelskörper und die Deutschlandkarte.
import { createContext, useContext, useMemo } from "react";
import type { Baustellen, GermanyBase, Pegel, Power, Satellites } from "../api";
import { fmt } from "../format";
import { type DeLayers, type DeMode, type DeSel, PEGEL_COLOR, PEGEL_DE, partyColor, sameLand, shortParty, winner } from "../three/Germany";
import { Spark } from "./Spark";
import { BODIES, helio, type SatState } from "../three/Space";

const AU_KM = 149_597_870.7;
const km = (x: number) => `${fmt(x, 0)} km`;

export function SatPanel({ sat, state, data }: { sat: Satellites["named"][number] | undefined; state: SatState | null; data: Satellites | undefined }) {
  if (!sat) return null;
  return (
    <>
      <h2>{sat.name}</h2>
      <p className="dim">{sat.kind} · NORAD {sat.catnr}</p>
      <p>{sat.note}</p>
      {state && (
        <table>
          <tbody>
            <tr><td>Höhe</td><td>{km(state.alt)}</td></tr>
            <tr><td>Geschwindigkeit</td><td>{fmt(state.speed * 3600, 0)} km/h</td></tr>
            <tr><td>Umlaufzeit</td><td>{fmt(state.period, 0)} min</td></tr>
            <tr><td>Bahnneigung</td><td>{fmt(state.incl, 1)}°</td></tr>
            <tr><td>Über</td><td>{fmt(state.lat, 1)}° {state.lat >= 0 ? "N" : "S"}, {fmt(Math.abs(state.lon), 1)}° {state.lon >= 0 ? "O" : "W"}</td></tr>
          </tbody>
        </table>
      )}
      <p className="dim small">
        Bahn aus aktuellen Bahnelementen von CelesTrak, live mit SGP4 gerechnet. Höhen sind im Bild gestaucht, damit Satelliten nicht an der Oberfläche kleben.
      </p>
      {data && <SwarmTable data={data} />}
    </>
  );
}

export type SatCtl = { show: Record<string, boolean>; setShow: (id: string, v: boolean) => void; focus: string | null; setFocus: (id: string | null) => void };
/** Sichtbarkeit und Fokus der Satellitengruppen, geteilt zwischen Seitenleiste und Szene. */
export const SatControl = createContext<SatCtl | null>(null);

/** Mittlere Höhe (Median) und Bahnneigung aus den Bahnelementen. */
function swarmStats(tle: readonly (readonly [string, string])[]) {
  const alt: number[] = [];
  const inc: number[] = [];
  for (const [, l2] of tle) {
    const n = Number(l2.slice(52, 63));
    const i = Number(l2.slice(8, 16));
    if (!n) continue;
    const w = (n * 2 * Math.PI) / 86400;
    alt.push(Math.cbrt(398600.4418 / (w * w)) - 6378.137);
    inc.push(i);
  }
  const med = (a: number[]) => (a.length ? a.sort((x, y) => x - y)[a.length >> 1] : null);
  return { alt: med(alt), inc: med(inc) };
}

export function SwarmTable({ data }: { data: Satellites }) {
  const ctl = useContext(SatControl);
  const stats = useMemo(() => new Map(data.swarms.map((s) => [s.id, swarmStats(s.tle)])), [data]);
  const focused = data.swarms.find((s) => s.id === ctl?.focus);
  return (
    <>
      <h3>Im Orbit</h3>
      <table className="click">
        <tbody>
          {data.swarms.map((s) => {
            const st = stats.get(s.id);
            const on = ctl?.show[s.id] !== false;
            return (
              <tr key={s.id} className={ctl?.focus === s.id ? "on" : ""} onClick={() => ctl?.setFocus(ctl.focus === s.id ? null : s.id)}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={on} onChange={(e) => ctl?.setShow(s.id, e.target.checked)} title="ein- oder ausblenden" />
                </td>
                <td>
                  <span style={{ color: s.color }}>●</span> {s.name}
                </td>
                <td>{fmt(s.tle.length, 0)}</td>
                <td className="dim small">{st?.alt != null ? km(st.alt) : ""}</td>
              </tr>
            );
          })}
          <tr onClick={() => ctl?.setFocus(ctl.focus === "named" ? null : "named")} className={ctl?.focus === "named" ? "on" : ""}>
            <td onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={ctl?.show.named !== false} onChange={(e) => ctl?.setShow("named", e.target.checked)} title="ein- oder ausblenden" />
            </td>
            <td>Große Objekte</td>
            <td>{data.named.length}</td>
            <td className="dim small">ISS, Hubble …</td>
          </tr>
        </tbody>
      </table>
      {focused ? (
        <p className="small">
          <b style={{ color: focused.color }}>{focused.name}</b> hervorgehoben: {fmt(focused.tle.length, 0)} Satelliten, mittlere Höhe {km(stats.get(focused.id)?.alt ?? 0)}, Bahnneigung meist{" "}
          {fmt(stats.get(focused.id)?.inc ?? 0, 1)}°. Nochmal klicken hebt den Fokus auf.
        </p>
      ) : (
        <p className="dim small">Zeile anklicken hebt eine Gruppe hervor, Häkchen blendet sie aus.</p>
      )}
    </>
  );
}

const FACTS: Record<string, { kind: string; rows: [string, string][]; note: string }> = {
  sonne: { kind: "Stern", rows: [["Durchmesser", "1.392.700 km"], ["Masse", "333.000 Erdmassen"], ["Oberfläche", "rund 5.500 °C"], ["Alter", "4,6 Mrd. Jahre"]], note: "Hält 99,86 % der Masse des Sonnensystems." },
  merkur: { kind: "Gesteinsplanet", rows: [["Durchmesser", "4.879 km"], ["Masse", "0,055 Erdmassen"], ["Umlauf", "88 Tage"], ["Sonnentag", "176 Tage"], ["Monde", "0"], ["Temperatur", "−173 bis 427 °C"]], note: "Kleinster Planet, fast ohne Atmosphäre." },
  venus: { kind: "Gesteinsplanet", rows: [["Durchmesser", "12.104 km"], ["Masse", "0,815 Erdmassen"], ["Umlauf", "225 Tage"], ["Sonnentag", "117 Tage"], ["Monde", "0"], ["Temperatur", "464 °C"]], note: "Heißester Planet wegen dichter CO₂-Atmosphäre; dreht sich rückwärts." },
  mars: { kind: "Gesteinsplanet", rows: [["Durchmesser", "6.779 km"], ["Masse", "0,107 Erdmassen"], ["Umlauf", "687 Tage"], ["Tag", "24 h 40 min"], ["Monde", "2"], ["Temperatur", "im Mittel −63 °C"]], note: "Ziel der meisten Landemissionen; Olympus Mons ist der höchste Vulkan des Sonnensystems." },
  jupiter: { kind: "Gasriese", rows: [["Durchmesser", "139.820 km"], ["Masse", "318 Erdmassen"], ["Umlauf", "11,9 Jahre"], ["Tag", "9 h 56 min"], ["Monde", "97 (Stand 2025)"], ["Temperatur", "−110 °C an den Wolken"]], note: "Größter Planet; der Große Rote Fleck ist ein Sturm, größer als die Erde." },
  saturn: { kind: "Gasriese", rows: [["Durchmesser", "116.460 km"], ["Masse", "95 Erdmassen"], ["Umlauf", "29,5 Jahre"], ["Tag", "10 h 33 min"], ["Monde", "274 (Stand 2025)"], ["Temperatur", "−140 °C"]], note: "Ringe aus Eis und Gestein, rund 280.000 km breit, aber oft nur zehn Meter dick." },
  uranus: { kind: "Eisriese", rows: [["Durchmesser", "50.724 km"], ["Masse", "14,5 Erdmassen"], ["Umlauf", "84 Jahre"], ["Tag", "17 h 14 min"], ["Monde", "29 (Stand 2025)"], ["Temperatur", "−195 °C"]], note: "Liegt auf der Seite: Achse um 98° geneigt." },
  neptun: { kind: "Eisriese", rows: [["Durchmesser", "49.244 km"], ["Masse", "17,1 Erdmassen"], ["Umlauf", "165 Jahre"], ["Tag", "16 h 6 min"], ["Monde", "16 (Stand 2025)"], ["Temperatur", "−200 °C"]], note: "Schnellste Winde im Sonnensystem, über 2.000 km/h." },
  pluto: { kind: "Zwergplanet", rows: [["Durchmesser", "2.377 km"], ["Masse", "0,0022 Erdmassen"], ["Umlauf", "248 Jahre"], ["Tag", "6,4 Tage"], ["Monde", "5"], ["Temperatur", "−230 °C"]], note: "Seit 2006 Zwergplanet; 2015 von New Horizons besucht." },
  jwst: { kind: "Weltraumteleskop", rows: [["Start", "25.12.2021"], ["Spiegel", "6,5 m"], ["Ort", "Lagrange-Punkt L2"], ["Abstand zur Erde", "rund 1,5 Mio. km"]], note: "Beobachtet im Infraroten die frühesten Galaxien und Atmosphären von Exoplaneten." },
};

export function BodyPanel({ id, onSel }: { id: string; onSel: (id: string) => void }) {
  if (id === "system") return <SystemPanel onSel={onSel} />;
  const f = FACTS[id];
  const b = BODIES.find((x) => x.id === id);
  const now = new Date();
  const e = helio(BODIES[2], now);
  const p = b ? helio(b, now) : null;
  const dEarth = p ? p.distanceTo(e) : id === "sonne" ? e.length() : null;
  const name = b?.name ?? (id === "sonne" ? "Sonne" : id === "jwst" ? "James-Webb-Teleskop" : id);
  return (
    <>
      <h2>{name}</h2>
      {f && <p className="dim">{f.kind}</p>}
      {dEarth != null && (
        <>
          <div className="hero">
            {fmt(dEarth, 2)} <small>AE von der Erde</small>
          </div>
          <p className="dim small">
            {fmt((dEarth * AU_KM) / 1e6, 1)} Mio. km · Licht braucht {fmt((dEarth * AU_KM) / 299_792.458 / 60, 1)} min
            {p && ` · ${fmt(p.length(), 2)} AE von der Sonne`}
          </p>
        </>
      )}
      {f && (
        <>
          <table>
            <tbody>
              {f.rows.map(([k, v]) => (
                <tr key={k}><td>{k}</td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
          <p>{f.note}</p>
        </>
      )}
      <p className="dim small">Position heute aus den Bahnelementen der NASA (JPL). Entfernungen und Größen im Bild gestaucht, Richtungen stimmen.</p>
      <div className="actions">
        <button onClick={() => onSel("system")}>Ganzes Sonnensystem</button>
      </div>
    </>
  );
}

function SystemPanel({ onSel }: { onSel: (id: string) => void }) {
  const now = new Date();
  const e = helio(BODIES[2], now);
  return (
    <>
      <h2>Sonnensystem</h2>
      <p className="dim small">Heutige Stellung der Planeten. Scrollen zoomt zurück zur Erde, ein Klick auf einen Körper fliegt hin.</p>
      <table className="click">
        <tbody>
          <tr onClick={() => onSel("sonne")}><td>Sonne</td><td className="dim">{fmt(e.length(), 2)} AE</td></tr>
          {BODIES.filter((b) => b.id !== "erde").map((b) => (
            <tr key={b.id} onClick={() => onSel(b.id)}>
              <td><span style={{ color: b.color }}>●</span> {b.name}</td>
              <td className="dim">{fmt(helio(b, now).distanceTo(e), 2)} AE</td>
            </tr>
          ))}
          <tr onClick={() => onSel("jwst")}><td>James-Webb-Teleskop</td><td className="dim">0,01 AE</td></tr>
        </tbody>
      </table>
      <p className="dim small">Entfernung von der Erde; 1 AE ≈ 150 Mio. km.</p>
    </>
  );
}

// ---------- Deutschland ----------

const pctDe = (x: number | null | undefined) => (x == null ? "–" : `${x.toFixed(1).replace(".", ",")} %`);

function PartyBars({ parties, max = 7 }: { parties: { name: string; pct2: number | null; pct1: number | null }[]; max?: number }) {
  return (
    <>
      {parties.slice(0, max).map((p) => (
        <div key={p.name} className="part">
          <div className="row">
            <span>{p.name}</span>
            <b>{pctDe(p.pct2)}</b>
          </div>
          <div className="bar">
            <i style={{ width: `${Math.min(100, (p.pct2 ?? 0) * 2.5)}%`, background: partyColor(p.name) }} />
          </div>
          {p.pct1 != null && <small className="dim">Erststimmen {pctDe(p.pct1)}</small>}
        </div>
      ))}
    </>
  );
}

function PowerBlock({ p }: { p: Power }) {
  const gw = (mw: number) => `${fmt(mw / 1000, 1)} GW`;
  const top = p.mix[0];
  return (
    <>
      <h3>Strom jetzt</h3>
      <p>
        {new Date(p.time).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr: Erzeugung {gw(p.generation)}, Verbrauch {p.load != null ? gw(p.load) : "–"}
        {p.import != null && Math.abs(p.import) > 500 ? `, ${p.import > 0 ? "Import" : "Export"} ${gw(Math.abs(p.import))}` : ""}. Erneuerbar {fmt(p.renewableShare, 0)} %, am meisten liefert{" "}
        {top?.name}. {p.price != null && <>Börsenpreis {fmt(p.price / 10, 1)} ct/kWh ({fmt(p.price, 0)} €/MWh).</>}
      </p>
      <div className="mixbar">
        {p.mix.map((m) => (
          <span key={m.name} style={{ flex: m.mw, background: m.color }} title={`${m.name}: ${gw(m.mw)}`} />
        ))}
      </div>
      <p className="dim small">
        {p.mix.map((m) => (
          <span key={m.name} style={{ marginRight: 8 }}>
            <span style={{ color: m.color }}>●</span> {m.name} {fmt((m.mw / p.generation) * 100, 0)} %
          </span>
        ))}
      </p>
      <Spark points={p.series.map((x) => x[2] / (x[1] || 1))} width={300} height={36} color="#7fd6ff" />
      <p className="dim small">Linie: Anteil von Wind und Sonne an der Last seit Mitternacht. Quelle: Energy-Charts des Fraunhofer ISE, Viertelstundenwerte; Preis Day-Ahead DE-LU.</p>
    </>
  );
}

function PegelBlock({ p, onSel }: { p: Pegel; onSel: (s: DeSel) => void }) {
  const low = p.items.filter((g) => g.state === "low");
  const high = p.items.filter((g) => g.state === "high");
  const kaub = p.items.find((g) => g.name === "Kaub");
  return (
    <>
      <h3>Pegel</h3>
      <p>
        {p.items.length} Pegel an Bundeswasserstraßen: {low.length} unter mittlerem Niedrigwasser, {high.length} über mittlerem Hochwasser.
        {kaub && <> Kaub am Rhein, Richtwert für die Binnenschifffahrt: {kaub.cm} cm{kaub.cm < 100 ? ", Frachter fahren nur teilbeladen" : ""}.</>}
      </p>
      {high.length > 0 && (
        <table className="click">
          <tbody>
            {high.slice(0, 6).map((g) => (
              <tr key={g.id} onClick={() => onSel({ type: "pegel", id: g.id })}>
                <td>
                  <span style={{ color: PEGEL_COLOR.high }}>●</span> {g.name}
                </td>
                <td className="dim">{g.water}</td>
                <td>{g.cm} cm</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="dim small">PEGELONLINE, alle 15 Minuten. Violett: niedrig, rot: hoch. Gut die Hälfte der Pegel hat keine Einordnung und erscheint grau.</p>
    </>
  );
}

export function GermanyPanel({
  base,
  works,
  power,
  pegel,
  netReady,
  layers,
  setLayers,
  mode,
  setMode,
  sel,
  onSel,
}: {
  base: GermanyBase | undefined;
  works: Baustellen | undefined;
  power?: Power;
  pegel?: Pegel;
  netReady: boolean;
  layers: DeLayers;
  setLayers: (l: DeLayers) => void;
  mode: DeMode;
  setMode: (m: DeMode) => void;
  sel: DeSel;
  onSel: (s: DeSel) => void;
}) {
  const res = useMemo(() => new Map(base?.results.wahlkreise.map((r) => [String(r.nr), r]) ?? []), [base]);
  if (!base) return <p className="dim">Deutschlanddaten laden …</p>;
  const controls = (
    <>
      <div className="tabs">
        <button className={mode === "bund" ? "on" : ""} onClick={() => setMode("bund")}>Bundestagswahl 2025</button>
        <button className={mode === "land" ? "on" : ""} onClick={() => setMode("land")}>Landesregierungen</button>
      </div>
      <div className="chips">
        {(
          [
            ["wahl", "Mehrheiten"],
            ["bahn", "Bahn"],
            ["autobahn", "Autobahn"],
            ["bundes", "Bundesstraßen"],
            ["baustellen", "Baustellen"],
            ["staedte", "Städte"],
            ["pegel", "Pegel"],
          ] as const
        ).map(([k, n]) => (
          <label key={k} className="chip">
            <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} /> {n}
          </label>
        ))}
      </div>
    </>
  );
  const back = (
    <button className="closebtn" onClick={() => onSel(null)}>
      ← Deutschland
    </button>
  );

  if (sel?.type === "wk") {
    const w = base.wahlkreise.find((x) => String(x.nr) === sel.id);
    const r = res.get(sel.id);
    const direct = r ? [...r.parties].sort((a, b) => (b.pct1 ?? 0) - (a.pct1 ?? 0))[0] : null;
    return (
      <>
        {back}
        <h2>{w?.name}</h2>
        <p className="dim">Wahlkreis {sel.id} · {w?.land} · Wahlbeteiligung {pctDe(r?.turnout)}</p>
        {r && (
          <>
            <p>
              Stärkste Kraft nach Zweitstimmen: <b style={{ color: partyColor(winner(r)?.name) }}>{winner(r)?.name}</b>. Meiste Erststimmen: {direct?.name} ({pctDe(direct?.pct1)}).
            </p>
            <PartyBars parties={r.parties} />
          </>
        )}
        <p className="dim small">Quelle: Die Bundeswahlleiterin, endgültiges Ergebnis der Bundestagswahl vom 23.02.2025. Seit 2025 gewinnt der Erststimmensieger den Wahlkreis nur, wenn das Zweitstimmenergebnis seiner Partei den Sitz deckt.</p>
      </>
    );
  }
  if (sel?.type === "city") {
    const c = base.cities.find((x) => x.name === sel.id);
    const rank = base.cities.findIndex((x) => x.name === sel.id) + 1;
    return (
      <>
        {back}
        <h2>{c?.name}</h2>
        <div className="hero">{c && fmt(c.pop, 0)} <small>Einwohner</small></div>
        <p className="dim">Platz {rank} der deutschen Städte in GeoNames</p>
        <p className="dim small">Quelle: GeoNames (cities15000). Einwohnerzahlen sind teils einige Jahre alt.</p>
      </>
    );
  }
  if (sel?.type === "pegel") {
    const g = pegel?.items.find((x) => x.id === sel.id);
    if (g)
      return (
        <>
          {back}
          <h2>{g.name}</h2>
          <p className="dim">Pegel an der {g.water}</p>
          <div className="hero">
            {fmt(g.cm, 0)} <small>cm</small>
          </div>
          <p>
            Wasserstand {PEGEL_DE[g.state] ? <b style={{ color: PEGEL_COLOR[g.state] }}>{PEGEL_DE[g.state]}</b> : "ohne Einordnung"}
            {g.state === "low" && ", unter dem mittleren Niedrigwasser"}
            {g.state === "high" && ", über dem mittleren Hochwasser"}.
            {g.ship === "high" && " Über dem höchsten Schifffahrtswasserstand: Schifffahrt eingeschränkt."}
          </p>
          {g.time && <p className="dim small">Messung {new Date(g.time).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}. Quelle: PEGELONLINE der Wasserstraßen- und Schifffahrtsverwaltung.</p>}
        </>
      );
  }
  if (sel?.type === "bau") {
    const b = works?.items.find((x) => x.id === sel.id);
    if (b)
      return (
        <>
          {back}
          <h2>{b.road} · {b.title}</h2>
          <p className="dim">Richtung {b.dir}</p>
          <table>
            <tbody>
              <tr><td>Art</td><td>{b.blocked ? "Sperrung" : b.short ? "Tagesbaustelle" : "Dauerbaustelle"}</td></tr>
              {b.start && <tr><td>Beginn</td><td>{new Date(b.start).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</td></tr>}
              {b.end && <tr><td>Ende</td><td>{b.end}</td></tr>}
              {b.length && <tr><td>Länge</td><td>{b.length}</td></tr>}
            </tbody>
          </table>
          {b.text && <p className="small">{b.text}</p>}
          <p className="dim small">Quelle: Autobahn GmbH des Bundes, alle 30 Minuten.</p>
        </>
      );
  }

  const bund = base.results.bund;
  const items = works?.items ?? [];
  const blocked = items.filter((b) => b.blocked).length;
  const byRoad = new Map<string, number>();
  items.forEach((b) => byRoad.set(b.road, (byRoad.get(b.road) ?? 0) + 1));
  const topRoads = [...byRoad.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const wins = new Map<string, number>();
  base.results.wahlkreise.forEach((r) => {
    const w = winner(r)?.name;
    if (w) wins.set(w, (wins.get(w) ?? 0) + 1);
  });
  const winList = [...wins.entries()].sort((a, b) => b[1] - a[1]);
  const govParties = new Map<string, number>();
  base.governments.forEach((g) => {
    const p = shortParty(g.party);
    if (p) govParties.set(p, (govParties.get(p) ?? 0) + 1);
  });
  const total = base.cities.reduce((s, c) => s + c.pop, 0);
  return (
    <>
      <h2>Deutschland</h2>
      {controls}
      <div className="summary">
        <p>
          Bei der Bundestagswahl 2025 lag {winner(bund ?? undefined)?.name} mit {pctDe(winner(bund ?? undefined)?.pct2)} vorn, Wahlbeteiligung {pctDe(bund?.turnout)}. Nach Zweitstimmen
          führt {winList.map(([p, n]) => `${p} in ${n}`).join(", ")} der 299 Wahlkreise. Die Landesregierungen führen{" "}
          {[...govParties.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} (${n})`).join(", ")}.{" "}
          {works && (
            <>
              Auf {works.roads} Autobahnen laufen gerade {fmt(items.length, 0)} Baustellen{blocked ? `, ${blocked} davon mit Sperrung` : ""}; am meisten auf {topRoads.map(([r, n]) => `${r} (${n})`).join(", ")}.
            </>
          )}{" "}
          Die {base.cities.length} Städte ab 20.000 Einwohnern zählen zusammen {fmt(total / 1e6, 1)} Mio. Menschen.
        </p>
      </div>
      {power && <PowerBlock p={power} />}
      {pegel && <PegelBlock p={pegel} onSel={onSel} />}
      {mode === "bund" && bund && (
        <>
          <h3>Zweitstimmen bundesweit</h3>
          <PartyBars parties={bund.parties} max={8} />
        </>
      )}
      {mode === "land" && (
        <>
          <h3>Landesregierungen</h3>
          <table>
            <tbody>
              {base.governments
                .slice()
                .sort((a, b) => a.land.localeCompare(b.land))
                .map((g) => {
                  const lr = base.results.laender.find((l) => sameLand(l.name, g.land));
                  return (
                    <tr key={g.ags}>
                      <td>{g.land}</td>
                      <td>
                        <span style={{ color: partyColor(shortParty(g.party)) }}>●</span> {g.head}
                      </td>
                      <td className="dim small">{shortParty(g.party)}{lr ? ` · BTW: ${winner(lr)?.name}` : ""}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          <p className="dim small">Regierungschefs und ihre Partei aus Wikidata, täglich. BTW: stärkste Partei im Land bei der Bundestagswahl 2025.</p>
        </>
      )}
      <h3>Größte Städte</h3>
      <table className="click">
        <tbody>
          {base.cities.slice(0, 10).map((c) => (
            <tr key={c.name} onClick={() => onSel({ type: "city", id: c.name })}>
              <td>{c.name}</td>
              <td className="dim">{fmt(c.pop / 1e6, 2)} Mio.</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dim small">
        Quellen: Bundeswahlleiterin (Wahlkreise und Ergebnisse 2025), BKG (Ländergrenzen VG2500, Bahn- und Straßennetz DLM250{netReady ? "" : ", lädt …"}), Autobahn GmbH
        (Baustellen), Wikidata (Landesregierungen), GeoNames (Städte). Säulen: Städte ab 50.000 Einwohnern, Höhe nach Einwohnerzahl.
        {base.errors.length > 0 && <span className="warn"> {base.errors.join(" · ")}</span>}
      </p>
    </>
  );
}
