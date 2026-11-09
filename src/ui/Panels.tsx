import { ok, useApi, type CountryDetail, type CountryOverview, type Launches, type LaunchSite, type NewsItem, type TopicNews, type Events, type Extended, type GeoEvent, type Earning, type Hotspot, type HotspotDetail, type HotspotHeat, type Prediction, type Macro, type MarketDetail, type Sector, type SectorDetail, type Sentiment, type Stock, type World } from "../api";
import { big, changeColor, dateDe, fmt, moodColor, parseBig, pct, signed, weekdayDe } from "../format";
import { EXT, tilesFor } from "../three/StockChart";
import { ALERT_DE, CONFLICT_RGB, EVENT_KIND, POSITIVE_RGB, inCountry, type GlobeSel } from "../three/Globe";
import { Spark } from "./Spark";

const Chg = ({ v, d = 2 }: { v: number | null | undefined; d?: number }) => <span style={{ color: changeColor(v) }}>{pct(v, d, false)}</span>;

export function Loading({ error }: { error?: string }) {
  return <p className="dim">{error ? `Fehler: ${error}` : "lädt …"}</p>;
}

// ---------- Rund um die Uhr ----------

const SESSION_DE = { regular: "Börse offen", pre: "Vorbörse", post: "Nachbörse", closed: "Börse geschlossen" } as const;

/** Stundenkurve der letzten drei Tage; Zeiten außerhalb der US-Handelszeit liegen blau hinterlegt. */
function SessionSpark({ hours, refClose, width = 320, height = 74 }: { hours: Extended["hours"]; refClose: number; width?: number; height?: number }) {
  if (hours.length < 2) return null;
  const ys = hours.map((h) => h.c);
  const lo = Math.min(...ys, refClose);
  const hi = Math.max(...ys, refClose);
  const X = (i: number) => (i / (hours.length - 1)) * width;
  const Y = (v: number) => height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6);
  const runs: [number, number][] = [];
  hours.forEach((h, i) => {
    if (!h.off) return;
    const r = runs.at(-1);
    if (r && r[1] === i - 1) r[1] = i;
    else runs.push([i, i]);
  });
  const step = width / (hours.length - 1);
  const d = ys.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} className="spark" role="img" aria-label="Kursverlauf der letzten drei Tage, stündlich">
      {runs.map(([a, b]) => (
        <rect key={a} x={Math.max(0, X(a) - step / 2)} y={0} width={Math.min(width, X(b) - X(a) + step)} height={height} fill={EXT} opacity={0.14} />
      ))}
      <line x1={0} x2={width} y1={Y(refClose)} y2={Y(refClose)} stroke="var(--dim)" strokeDasharray="3 3" strokeWidth={1} />
      <path d={d} fill="none" stroke="var(--text)" strokeWidth={1.5} />
    </svg>
  );
}

export function ExtendedBlock({ ext }: { ext: Extended | null | undefined }) {
  if (!ext) return null;
  const off = ext.session !== "regular";
  const main = ext.sources[0];
  return (
    <div className={off ? "ext-box on" : "ext-box"}>
      <h3>
        Rund um die Uhr · <span className={off ? "ext" : "dim"}>{SESSION_DE[ext.session]}</span>
      </h3>
      {off && (
        <div className="hero ext">
          {fmt(main.implied)} <Chg v={main.changePct} />
          <small className="dim"> seit Schluss</small>
        </div>
      )}
      <p className="dim small">
        Bezug: Schluss {fmt(ext.ref.close)} am {dateDe(ext.ref.d)}. Umgerechnet über die Veränderung des Instruments seit diesem Schluss.
      </p>
      <table>
        <thead>
          <tr><th>Instrument</th><th>Kurs</th><th>seit Schluss</th></tr>
        </thead>
        <tbody>
          {ext.sources.map((s) => (
            <tr key={s.instrument}>
              <td>
                <a className="plain" href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
                <br />
                <small className="dim">
                  {s.kind === "perp" ? "24/7" : "fast 24/5, ca. 10 min verzögert"}
                  {s.volume24h ? ` · Umsatz 24 h ${big(s.volume24h)} $` : ""}
                </small>
              </td>
              <td>{fmt(s.price, s.price > 1000 ? 0 : 2)}</td>
              <td><Chg v={s.changePct} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <SessionSpark hours={ext.hours} refClose={ext.ref.close} />
      <p className="dim small">
        Stündlich, drei Tage, umgerechnet auf den Kurs des Wertpapiers. <span className="ext">Blau</span>: außerhalb der US-Handelszeit (9:30–16 Uhr New York, ohne Feiertage). Gestrichelt: letzter Schluss. Perps auf Hyperliquid bilden ihren Preis außerbörslich nur aus Angebot und Nachfrage; bei wenig Umsatz kann er stärker abweichen.
      </p>
    </div>
  );
}

// ---------- Welt ----------

export function WorldPanel(props: Parameters<typeof WorldPanelInner>[0]) {
  if (!props.sel) return <WorldPanelInner {...props} />;
  return (
    <>
      <button className="closebtn" onClick={() => props.onSel(null)}>
        ← Weltlage
      </button>
      <WorldPanelInner {...props} />
    </>
  );
}

function WorldPanelInner({
  world,
  heat,
  sel,
  onSel,
  detail,
  onDrill,
  predictions,
  events,
  onMap,
  overview,
  launches,
  mood,
  tab,
  setTab,
  onMood,
}: {
  world: World | undefined;
  heat: HotspotHeat[] | undefined;
  predictions: Prediction[] | undefined;
  events: Events | undefined;
  overview: CountryOverview | undefined;
  launches: Launches | undefined;
  mood: Sentiment | undefined;
  tab: string;
  setTab: (t: string) => void;
  onMood: () => void;
  onMap: () => void;
  sel: GlobeSel;
  onSel: (s: GlobeSel) => void;
  detail: MarketDetail | undefined;
  onDrill: (to: "markt" | "sektoren", id: string) => void;
}) {
  if (!world) return <Loading />;
  if (sel?.type === "market") {
    const m = world.markets.find((x) => x.id === sel.id)!;
    const q = ok(m.quote) ? m.quote : null;
    const d = detail?.market.id === m.id ? detail : undefined;
    return (
      <>
        <h2>{m.name}</h2>
        <p className="dim">
          {m.index} über {m.etf} (USD) · {m.region}
        </p>
        <div className="hero">
          {fmt(q?.price)} <Chg v={q?.changePct} />
        </div>
        <p className="dim small">Stand {q?.time ?? "–"}</p>
        {d ? (
          <>
            <ExtendedBlock ext={d.extended} />
            <Spark points={d.bars.map((b) => b.c)} width={300} height={70} />
            <table>
              <tbody>
                <tr><td>1 Monat</td><td><Chg v={(d.indicators.perf.m1 ?? NaN) * 100} /></td></tr>
                <tr><td>3 Monate</td><td><Chg v={(d.indicators.perf.m3 ?? NaN) * 100} /></td></tr>
                <tr><td>Laufendes Jahr</td><td><Chg v={(d.indicators.perf.ytd ?? NaN) * 100} /></td></tr>
                <tr><td>1 Jahr</td><td><Chg v={(d.indicators.perf.y1 ?? NaN) * 100} /></td></tr>
                <tr><td>Trend</td><td>{d.indicators.trend}</td></tr>
                <tr><td>Volatilität 30 T.</td><td>{pct(d.indicators.vol30, 0)}</td></tr>
                {m.etf !== "SPY" && <tr><td>Beta zu den USA</td><td>{fmt(d.indicators.beta)}</td></tr>}
              </tbody>
            </table>
          </>
        ) : (
          <Loading />
        )}
        <div className="actions">
          <button onClick={() => onDrill("markt", m.id)}>3D-Chart öffnen</button>
          {m.id === "us" && <button onClick={() => onDrill("sektoren", "")}>Sektoren aufklappen</button>}
        </div>
      </>
    );
  }
  if (sel?.type === "bank") {
    const b = world.banks.find((x) => x.id === sel.id)!;
    const d = ok(b.data) ? b.data : null;
    return (
      <>
        <h2>{b.name}</h2>
        {d ? (
          <>
            <div className="hero">{fmt(d.rate, 2)} %</div>
            <p className="dim">
              {d.label} · Stand {dateDe(d.asOf)}
            </p>
            {d.stale && <p className="warn">Älter als vier Monate: Die keylose Quelle wird nicht mehr fortgeschrieben.</p>}
            {d.lastChange && (
              <p>
                Letzte Änderung am {dateDe(d.lastChange.date)}: {fmt(d.lastChange.from, 2)} % auf {fmt(d.lastChange.to, 2)} % (
                {signed((d.lastChange.to - d.lastChange.from) * 100, 0)} Bp.)
              </p>
            )}
            <Spark points={d.history} width={300} height={70} color="#f5c451" />
            <p className="dim small">Verlauf der letzten fünf Jahre</p>
          </>
        ) : (
          <Loading error="keine Daten" />
        )}
      </>
    );
  }
  if (sel?.type === "event") {
    const ev = events?.events.find((x) => x.id === sel.id);
    if (ev) return <EventPanel ev={ev} />;
  }
  if (sel?.type === "hotspot") {
    const h = world.hotspots.find((x) => x.id === sel.id)!;
    return <HotspotPanel key={h.id} h={h} predictions={predictions?.filter((p) => p.hotspots.includes(h.id))} />;
  }
  if (sel?.type === "country")
    return <CountryPanel key={sel.id} iso3={sel.id} world={world} overview={overview} events={events} launches={launches} onSel={onSel} />;
  if (sel?.type === "launch") {
    const site = launches?.sites.find((x) => x.id === sel.id);
    if (site) return <LaunchPanel site={site} />;
  }
  if (sel?.type === "mood") return <MoodPanel data={mood} onOpen={onMood} />;

  const TABS_W: [string, string][] = [
    ["lage", "Lage"],
    ["maerkte", "Märkte"],
    ["notenbanken", "Notenbanken"],
    ["ereignisse", "Ereignisse"],
    ["raumfahrt", "Raumfahrt"],
  ];
  const tabs = (
    <div className="tabs">
      {TABS_W.map(([k, n]) => (
        <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
          {n}
        </button>
      ))}
    </div>
  );
  if (tab === "maerkte") return <>{tabs}<MarketsTab world={world} mood={mood} onSel={onSel} /></>;
  if (tab === "notenbanken") return <>{tabs}<BanksTab world={world} onSel={onSel} /></>;
  if (tab === "ereignisse") return <>{tabs}{events ? <EventsTab data={events} onSel={(id) => onSel({ type: "event", id })} /> : <Loading />}</>;
  if (tab === "raumfahrt") return <>{tabs}{launches ? <SpaceTab data={launches} onSel={(id) => onSel({ type: "launch", id })} /> : <Loading />}</>;

  const heatMap = new Map(heat?.map((h) => [h.id, h]) ?? []);
  return (
    <>
      {tabs}
      <h2>Weltlage</h2>
      <LageSummary world={world} events={events} overview={overview} launches={launches} mood={mood} onMood={() => onSel({ type: "mood", id: "mood" })} />
      <p className="dim small">
        Rot schraffiert: Länder mit aktivem Konflikt (dichter = mehr Tote). Grün: Länder mit positiven Meldungen der letzten 14 Tage. Säulen: Märkte, goldene Ringe:
        Notenbanken, Glut: Brennpunkte, Tore: Engpässe, flache Ringe: Erdbeben und Katastrophen, Raketen: Startbasen. Der Mond ist das Stimmungsbarometer. Ein Klick auf
        ein Land zeigt Kennzahlen und Nachrichten.
      </p>
      <div className="actions">
        <button onClick={onMap}>Lagekarte mit Konflikten öffnen</button>
      </div>
      {overview && <ConflictList overview={overview} onSel={(iso3) => onSel({ type: "country", id: iso3 })} />}
      {(["brennpunkt", "engpass"] as const).map((kind) => (
        <div key={kind}>
          <h3>{kind === "brennpunkt" ? "Brennpunkte" : "Engpässe"}</h3>
          <table className="click">
            <tbody>
              {world.hotspots
                .filter((h) => h.kind === kind)
                .sort((a, b) => (heatMap.get(b.id)?.count ?? -1) - (heatMap.get(a.id)?.count ?? -1))
                .map((h) => (
                  <tr key={h.id} onClick={() => onSel({ type: "hotspot", id: h.id })}>
                    <td>{h.name}</td>
                    <td className="dim">{heatMap.get(h.id)?.count ?? "…"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
      {predictions && predictions.length > 0 && (
        <>
          <h3>Prognosemärkte</h3>
          <Predictions items={predictions.slice(0, 8)} />
        </>
      )}
    </>
  );
}

// ---------- Themen der Seitenleiste ----------

const ago = (iso: string | null) => {
  if (!iso) return "";
  const m = (Date.now() - Date.parse(iso)) / 60_000;
  if (m < 60) return `vor ${Math.max(1, Math.round(m))} Min.`;
  if (m < 48 * 60) return `vor ${Math.round(m / 60)} Std.`;
  return `vor ${Math.round(m / 1440)} Tagen`;
};
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} und ${xs.at(-1)}`);
const dtDe = (iso: string) => new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function NewsList({ items, note }: { items: NewsItem[] | undefined; note?: string | null }) {
  if (!items) return <p className="dim">{note ?? "lädt …"}</p>;
  if (!items.length) return <p className="dim">Keine Meldungen gefunden.</p>;
  return (
    <ul className="news">
      {items.map((a) => (
        <li key={a.url}>
          <a href={a.url} target="_blank" rel="noreferrer">
            {a.title}
          </a>
          <small className="dim">
            {a.source} · {ago(a.time)}
          </small>
        </li>
      ))}
    </ul>
  );
}

function TopicNewsBlock({ topic }: { topic: string }) {
  const { data, error } = useApi<TopicNews>(`news/${topic}`, 15 * 60_000);
  return (
    <>
      <h3>Aktuelle Nachrichten</h3>
      <NewsList items={data?.items.slice(0, 12)} note={error} />
      <p className="dim small">Quelle: Google News, deutschsprachige Ausgabe.</p>
    </>
  );
}

const marketChg = (m: World["markets"][number]) => (ok(m.quote) ? m.quote.changePct : null);

function LageSummary({
  world,
  events,
  overview,
  launches,
  mood,
  onMood,
}: {
  world: World;
  events?: Events;
  overview?: CountryOverview;
  launches?: Launches;
  mood?: Sentiment;
  onMood: () => void;
}) {
  const ms = world.markets.filter((m) => marketChg(m) != null);
  const up = ms.filter((m) => marketChg(m)! > 0).length;
  const wars = overview ? Object.entries(overview.conflict).filter(([, c]) => c.tier === 1).length : 0;
  const nameOf = (iso3: string) => overview?.list.find((c) => c.iso3 === iso3)?.name ?? iso3;
  const pos = overview ? Object.entries(overview.positive).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => nameOf(k)) : [];
  const red = events?.events.filter((e) => e.alert === "red") ?? [];
  const next = launches?.sites.flatMap((s) => s.launches.map((l) => ({ l, s }))).filter((x) => Date.parse(x.l.net) > Date.now()).sort((a, b) => a.l.net.localeCompare(b.l.net))[0];
  return (
    <div className="summary">
      <p>
        {ms.length > 0 && <>{up} von {ms.length} Märkten im Plus. </>}
        {mood?.score != null && (
          <>
            <a className="plain" onClick={onMood} style={{ cursor: "pointer", color: moodColor(mood.score) }}>
              Stimmung {mood.score} ({mood.label})
            </a>
            .{" "}
          </>
        )}
        {overview && <>In {wars} Ländern herrscht Krieg, {Object.keys(overview.conflict).length - wars} weitere haben kleinere Konflikte oder sind Nebenschauplatz. </>}
        {pos.length > 0 && <>Gute Nachrichten vor allem aus {list(pos)}. </>}
        {red.length > 0 && <>Warnstufe Rot: {list(red.map((e) => e.name))}. </>}
        {next && (
          <>
            Nächster Raketenstart: {next.l.name}, {whenLaunch(next.l)}.
          </>
        )}
      </p>
    </div>
  );
}

function ConflictList({ overview, onSel }: { overview: CountryOverview; onSel: (iso3: string) => void }) {
  const nameOf = (iso3: string) => overview.list.find((c) => c.iso3 === iso3)?.name ?? iso3;
  const wars = Object.entries(overview.conflict).sort((a, b) => a[1].tier - b[1].tier || nameOf(a[0]).localeCompare(nameOf(b[0])));
  const pos = Object.entries(overview.positive).sort((a, b) => b[1] - a[1]);
  const TIER = ["", "Krieg", "Konflikt", "Nebenschauplatz/klein"];
  return (
    <>
      <h3>Konfliktländer</h3>
      <div className="chips">
        {wars.map(([k, c]) => (
          <button key={k} className="chip" style={{ borderColor: `rgba(${CONFLICT_RGB},${[0, 0.9, 0.6, 0.35][c.tier]})` }} title={`${TIER[c.tier]}: ${c.names.join("; ")}`} onClick={() => onSel(k)}>
            {nameOf(k)}
          </button>
        ))}
      </div>
      {pos.length > 0 && (
        <>
          <h3>Positive Meldungen</h3>
          <div className="chips">
            {pos.map(([k, n]) => (
              <button key={k} className="chip" style={{ borderColor: `rgba(${POSITIVE_RGB},0.8)` }} onClick={() => onSel(k)}>
                {nameOf(k)} <span className="dim">{n}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <p className="dim small">
        Konflikte: Wikipedia-Liste laufender bewaffneter Konflikte (Kriege ab 10.000, Konflikte ab 1.000 und ab 100 Toten im Jahr). Positiv: Feeds von Good News Network,
        Positive News, Reasons to be Cheerful und Good Good Good, Länder aus Titel und Anriss erkannt.
        {overview.errors.length > 0 && <span className="warn"> {overview.errors.join(" · ")}</span>}
      </p>
    </>
  );
}

function MarketsTab({ world, mood, onSel }: { world: World; mood?: Sentiment; onSel: (s: GlobeSel) => void }) {
  const ranked = world.markets.filter((m) => marketChg(m) != null).sort((a, b) => marketChg(b)! - marketChg(a)!);
  const up = ranked.filter((m) => marketChg(m)! > 0).length;
  const avg = ranked.length ? ranked.reduce((a, m) => a + marketChg(m)!, 0) / ranked.length : null;
  const regions = [...new Set(ranked.map((m) => m.region))].map((r) => {
    const xs = ranked.filter((m) => m.region === r);
    return { r, v: xs.reduce((a, m) => a + marketChg(m)!, 0) / xs.length };
  });
  const best = ranked[0];
  const worst = ranked.at(-1);
  return (
    <>
      <h2>Märkte</h2>
      {best && worst && (
        <div className="summary">
          <p>
            {up} von {ranked.length} Ländermärkten im Plus, im Schnitt <Chg v={avg} />. Vorne {best.name} (<Chg v={marketChg(best)} />), hinten {worst.name} (
            <Chg v={marketChg(worst)} />).{" "}
            {regions.map((x, i) => (
              <span key={x.r}>
                {i ? ", " : "Regionen: "}
                {x.r} <Chg v={x.v} />
              </span>
            ))}
            .{mood?.score != null && <> Stimmung {mood.score} ({mood.label}).</>}
          </p>
        </div>
      )}
      <table className="click">
        <tbody>
          {ranked.map((m) => (
            <tr key={m.id} onClick={() => onSel({ type: "market", id: m.id })}>
              <td>{m.name}</td>
              <td className="dim">{m.etf}</td>
              <td><Chg v={marketChg(m)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dim small">Tagesveränderung der US-gelisteten Länder-ETFs in USD.</p>
      <TopicNewsBlock topic="maerkte" />
    </>
  );
}

function BanksTab({ world, onSel }: { world: World; onSel: (s: GlobeSel) => void }) {
  const bs = world.banks.filter((b) => ok(b.data)).map((b) => ({ b, d: ok(b.data) ? b.data : null! }));
  const byRate = [...bs].sort((a, b) => b.d.rate - a.d.rate);
  const changes = bs.filter((x) => x.d.lastChange?.date).sort((a, b) => b.d.lastChange!.date!.localeCompare(a.d.lastChange!.date!));
  const recent = changes.filter((x) => (Date.now() - Date.parse(x.d.lastChange!.date!)) / 86400_000 < 90);
  const r = (id: string) => bs.find((x) => x.b.id === id);
  const verb = (x: (typeof bs)[number]) => (x.d.lastChange!.to < x.d.lastChange!.from ? "gesenkt" : "erhöht");
  return (
    <>
      <h2>Notenbanken</h2>
      {bs.length > 0 && (
        <div className="summary">
          <p>
            {r("fed") && <>Fed {fmt(r("fed")!.d.rate, 2)} %, </>}
            {r("ezb") && <>EZB {fmt(r("ezb")!.d.rate, 2)} %. </>}
            Am höchsten liegt der Leitzins bei der {byRate[0].b.short} ({fmt(byRate[0].d.rate, 2)} %), am niedrigsten bei der {byRate.at(-1)!.b.short} (
            {fmt(byRate.at(-1)!.d.rate, 2)} %).{" "}
            {recent.length ? (
              <>
                In den letzten drei Monaten haben {recent.length} Notenbanken ihren Zins geändert:{" "}
                {list(recent.map((x) => `${x.b.short} ${verb(x)} am ${dateDe(x.d.lastChange!.date)} um ${Math.abs(Math.round((x.d.lastChange!.to - x.d.lastChange!.from) * 100))} Bp.`))}
              </>
            ) : (
              <>In den letzten drei Monaten hat keine der zehn Notenbanken ihren Zins geändert.</>
            )}
          </p>
        </div>
      )}
      <table className="click">
        <tbody>
          {world.banks.map((b) => (
            <tr key={b.id} onClick={() => onSel({ type: "bank", id: b.id })}>
              <td>{b.short}</td>
              <td>{ok(b.data) ? `${fmt(b.data.rate, 2)} %` : "–"}</td>
              <td className="dim small">
                {ok(b.data) && b.data.lastChange ? `zuletzt ${signed((b.data.lastChange.to - b.data.lastChange.from) * 100, 0)} Bp. am ${dateDe(b.data.lastChange.date)}` : ""}
                {ok(b.data) && b.data.stale ? " · veraltet" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <TopicNewsBlock topic="notenbanken" />
    </>
  );
}

function EventsTab({ data, onSel }: { data: Events; onSel: (id: string) => void }) {
  const quakes = data.events.filter((e) => e.kind === "beben");
  const other = data.events.filter((e) => e.kind !== "beben");
  const top = [...quakes].sort((a, b) => (b.mag ?? 0) - (a.mag ?? 0))[0];
  const kinds = Object.entries(EVENT_KIND)
    .filter(([k]) => k !== "beben")
    .map(([k, v]) => [v.name, other.filter((e) => e.kind === k).length] as const)
    .filter(([, n]) => n > 0);
  const severe = other.filter((e) => e.alert === "red" || e.alert === "orange");
  return (
    <>
      <h2>Erdbeben und Katastrophen</h2>
      <div className="summary">
        <p>
          {quakes.length} Erdbeben ab Magnitude 4,5 in sieben Tagen{top && <>, das stärkste mit M {fmt(top.mag, 1)}: {top.name.replace(/^M [\d.]+ · /, "")}</>}.{" "}
          {other.length} laufende Katastrophen ({kinds.map(([n, c]) => `${c} × ${n}`).join(", ")})
          {severe.length ? <>, davon mit Warnstufe Orange oder Rot: {list(severe.map((e) => e.name))}.</> : <>, keine mit Warnstufe Orange oder Rot.</>}
        </p>
      </div>
      <EventList data={data} onSel={onSel} />
      <TopicNewsBlock topic="ereignisse" />
    </>
  );
}

function SpaceTab({ data, onSel }: { data: Launches; onSel: (id: string) => void }) {
  const all = data.sites
    .flatMap((s) => s.launches.map((l) => ({ l, s })))
    .sort((a, b) => a.l.net.localeCompare(b.l.net));
  const future = all.filter((x) => Date.parse(x.l.net) > Date.now() - 3600_000);
  const week = future.filter((x) => Date.parse(x.l.net) < Date.now() + 7 * 86400_000);
  const busiest = [...data.sites].sort((a, b) => b.launches.length - a.launches.length)[0];
  const providers = new Map<string, number>();
  future.forEach((x) => x.l.provider && providers.set(x.l.provider, (providers.get(x.l.provider) ?? 0) + 1));
  const topProv = [...providers.entries()].sort((a, b) => b[1] - a[1])[0];
  return (
    <>
      <h2>Raketenstarts</h2>
      <div className="summary">
        <p>
          {future.length} Starts angekündigt{future.length > 0 && <> bis {dateDe(future.at(-1)!.l.net)}</>}, davon {week.length} in den nächsten sieben Tagen.{" "}
          {busiest && <>Am meisten los ist in {busiest.name.split(",")[0]} ({busiest.launches.length}). </>}
          {topProv && <>Häufigster Betreiber: {topProv[0]} ({topProv[1]}).</>}
        </p>
      </div>
      <table className="click">
        <tbody>
          {future.slice(0, 25).map(({ l, s }) => (
            <tr key={l.id} onClick={() => onSel(s.id)}>
              <td>
                {l.name}
                <br />
                <small className="dim">{s.name.split(",")[0]}</small>
              </td>
              <td className="dim small" style={{ whiteSpace: "nowrap" }}>
                {whenLaunch(l)}
                <br />
                {STATUS_DE[l.status] ?? l.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dim small">Quelle: Launch Library 2 von The Space Devs, alle 30 Minuten. Zeiten in deiner Zeitzone; steht nur Tag oder Monat, ist der Termin noch nicht fest.</p>
      <TopicNewsBlock topic="raumfahrt" />
    </>
  );
}

/** Startzeit so genau, wie sie feststeht: Monat, Tag oder Uhrzeit. */
function whenLaunch(l: { net: string; precision: string | null }) {
  const d = new Date(l.net);
  const p = l.precision ?? "Minute";
  if (["Month", "Quarter", "Year", "Fiscal Year", "Half"].some((x) => p.startsWith(x))) return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  if (p === "Day" || p.startsWith("Week")) return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  return `${p === "Hour" ? "ca. " : ""}${dtDe(l.net)}`;
}

const STATUS_DE: Record<string, string> = { Go: "freigegeben", TBD: "geplant", TBC: "zu bestätigen", Hold: "angehalten", "In Flight": "im Flug", Success: "erfolgreich", Failure: "gescheitert", "Partial Failure": "teilweise gescheitert" };

function LaunchPanel({ site }: { site: LaunchSite }) {
  return (
    <>
      <h2>{site.name.split(",")[0]}</h2>
      <p className="dim">{site.name}</p>
      <p>{site.launches.length} angekündigte Starts</p>
      {site.launches.map((l) => (
        <div key={l.id} className="part">
          <div className="row">
            <a className="plain" href={l.url} target="_blank" rel="noreferrer">
              <b>{l.name}</b>
            </a>
          </div>
          <small className="dim">
            {whenLaunch(l)} · {STATUS_DE[l.status] ?? l.statusName}
          </small>
          <br />
          <small>
            {[l.rocket, l.provider, l.missionType, l.orbit].filter(Boolean).join(" · ")}
          </small>
          {l.mission && <p className="dim small">{l.mission.slice(0, 220)}{l.mission.length > 220 ? " …" : ""}</p>}
        </div>
      ))}
      <p className="dim small">Quelle: Launch Library 2 (The Space Devs). Link führt zu Space Launch Schedule.</p>
    </>
  );
}

function MoodPanel({ data, onOpen }: { data: Sentiment | undefined; onOpen: () => void }) {
  if (!data) return <Loading />;
  return (
    <>
      <h2>Stimmungsbarometer</h2>
      <div className="hero" style={{ color: moodColor(data.score) }}>
        {data.score ?? "–"} <small>{data.label}</small>
      </div>
      <p className="dim small">Eigener Angst-und-Gier-Index, 0 = extreme Angst, 100 = extreme Gier. Stand {dateDe(data.asOf)}.</p>
      {data.parts.map((p) => (
        <div key={p.id} className="part">
          <div className="row">
            <span>{p.name}</span>
            <b style={{ color: moodColor(p.score) }}>{p.score}</b>
          </div>
          <div className="bar">
            <i style={{ width: `${p.score}%`, background: moodColor(p.score) }} />
          </div>
          <small className="dim">{p.value}</small>
        </div>
      ))}
      <div className="actions">
        <button onClick={onOpen}>Stimmung in 3D aufklappen</button>
      </div>
    </>
  );
}

// ---------- Land ----------

const MARKET_ISO2: Record<string, string> = { us: "US", "us-tech": "US", uk: "GB" };
const EURO = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];
const BANK_ISO2: Record<string, string[]> = { fed: ["US"], ezb: EURO, boe: ["GB"], boj: ["JP"], boc: ["CA"], rba: ["AU"], rbi: ["IN"], bcb: ["BR"], snb: ["CH"], pboc: ["CN"] };
const REGION_DE: Record<string, string> = {
  "East Asia & Pacific": "Ostasien und Pazifik",
  "Europe & Central Asia": "Europa und Zentralasien",
  "Latin America & Caribbean": "Lateinamerika und Karibik",
  "Middle East & North Africa": "Naher Osten und Nordafrika",
  "Middle East, North Africa, Afghanistan & Pakistan": "Naher Osten, Nordafrika, Afghanistan und Pakistan",
  "North America": "Nordamerika",
  "South Asia": "Südasien",
  "Sub-Saharan Africa": "Afrika südlich der Sahara",
};
const INCOME_DE: Record<string, string> = { "High income": "hohes Einkommen", "Upper middle income": "oberes mittleres Einkommen", "Lower middle income": "unteres mittleres Einkommen", "Low income": "niedriges Einkommen" };

function statValue(s: CountryDetail["stats"][number]) {
  if (s.value == null) return "–";
  if (s.id === "SP.POP.TOTL") return s.value >= 1e6 ? `${fmt(s.value / 1e6, 1)} Mio.` : fmt(s.value, 0);
  if (s.unit === "USD") return s.value >= 1e9 ? `${big(s.value)} $` : `${fmt(s.value, 0)} $`;
  if (s.unit === "km²") return `${fmt(s.value, 0)} km²`;
  if (s.unit === "Jahre") return `${fmt(s.value, 1)} Jahre`;
  return `${fmt(s.value, 1)} ${s.unit}`;
}

function CountryPanel({
  iso3,
  world,
  overview,
  events,
  launches,
  onSel,
}: {
  iso3: string;
  world: World;
  overview?: CountryOverview;
  events?: Events;
  launches?: Launches;
  onSel: (s: GlobeSel) => void;
}) {
  const { data, error } = useApi<CountryDetail>(`country/${iso3}`);
  const meta = overview?.list.find((c) => c.iso3 === iso3);
  const iso2 = meta?.iso2 ?? data?.iso2 ?? "";
  const conf = overview?.conflict[iso3];
  const markets = world.markets.filter((m) => (MARKET_ISO2[m.id] ?? m.id.toUpperCase()) === iso2);
  const banks = world.banks.filter((b) => BANK_ISO2[b.id]?.includes(iso2));
  const evs = events?.events.filter((e) => inCountry(meta?.num, e.lat, e.lon)) ?? [];
  const sites = launches?.sites.filter((s) => s.country === iso3) ?? [];
  return (
    <>
      <h2>{meta?.name ?? data?.name ?? iso3}</h2>
      <p className="dim">
        {[data?.capital && `Hauptstadt ${data.capital}`, data?.region && (REGION_DE[data.region] ?? data.region), data?.income && (INCOME_DE[data.income] ?? data.income)].filter(Boolean).join(" · ")}
      </p>
      <div className="chips">
        {conf && (
          <span className="chip" style={{ borderColor: `rgba(${CONFLICT_RGB},0.9)` }}>
            {conf.tier === 1 ? "Krieg" : conf.tier === 2 ? "bewaffneter Konflikt" : "Konfliktgebiet"}
          </span>
        )}
        {overview?.positive[iso3] ? (
          <span className="chip" style={{ borderColor: `rgba(${POSITIVE_RGB},0.8)` }}>
            {overview.positive[iso3]} positive Meldung{overview.positive[iso3] > 1 ? "en" : ""}
          </span>
        ) : null}
      </div>
      {!data ? (
        <Loading error={error} />
      ) : (
        <>
          <table>
            <tbody>
              {data.stats.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{statValue(s)}</td>
                  <td className="dim small">{s.year ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="dim small">Quelle: Weltbank, jeweils jüngster Jahreswert.</p>
        </>
      )}
      {(markets.length > 0 || banks.length > 0) && (
        <>
          <h3>Markt und Notenbank</h3>
          <table className="click">
            <tbody>
              {markets.map((m) => (
                <tr key={m.id} onClick={() => onSel({ type: "market", id: m.id })}>
                  <td>{m.index}</td>
                  <td className="dim">{m.etf}</td>
                  <td><Chg v={marketChg(m)} /></td>
                </tr>
              ))}
              {banks.map((b) => (
                <tr key={b.id} onClick={() => onSel({ type: "bank", id: b.id })}>
                  <td>{b.name}</td>
                  <td className="dim">{b.short}</td>
                  <td>{ok(b.data) ? `${fmt(b.data.rate, 2)} %` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {data && data.conflicts.length > 0 && (
        <>
          <h3>Konflikte</h3>
          <ul className="news">
            {data.conflicts.map((c) => (
              <li key={c.name}>
                <span>{c.name}</span>
                <small className="dim">
                  {c.tier === 1 ? "Krieg, über 10.000 Tote im Jahr" : c.tier === 2 ? "1.000 bis 9.999 Tote im Jahr" : "100 bis 999 Tote im Jahr"}
                  {c.countries[0] !== iso3 && " · hier Nebenschauplatz"}
                </small>
              </li>
            ))}
          </ul>
        </>
      )}
      {evs.length > 0 && (
        <>
          <h3>Ereignisse</h3>
          <table className="click">
            <tbody>
              {evs.slice(0, 8).map((e) => (
                <tr key={e.id} onClick={() => onSel({ type: "event", id: e.id })}>
                  <td>
                    <span style={{ color: EVENT_KIND[e.kind].color }}>●</span> {e.name}
                  </td>
                  <td className="dim">{e.mag != null ? `M ${fmt(e.mag, 1)}` : e.alert ? ALERT_DE[e.alert] : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {sites.length > 0 && (
        <>
          <h3>Startbasen</h3>
          <table className="click">
            <tbody>
              {sites.map((s) => (
                <tr key={s.id} onClick={() => onSel({ type: "launch", id: s.id })}>
                  <td>{s.name.split(",")[0]}</td>
                  <td className="dim">{s.launches.length} Starts</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {data && data.positive.length > 0 && (
        <>
          <h3>Positive Meldungen</h3>
          <NewsList items={data.positive.slice(0, 6)} />
        </>
      )}
      <h3>Nachrichten</h3>
      <NewsList items={data?.news} note={data?.newsError ?? error} />
      {data && <p className="dim small">Quelle: Google News, deutschsprachige Ausgabe, letzte drei Tage.</p>}
    </>
  );
}

// ---------- Naturereignisse ----------

const sevOf = (e: GeoEvent) => (e.mag != null ? (e.mag - 4.5) / 3 : e.alert === "red" ? 1 : e.alert === "orange" ? 0.6 : 0.25);

function EventList({ data, onSel }: { data: Events; onSel: (id: string) => void }) {
  const quakes = data.events.filter((e) => e.kind === "beben").sort((a, b) => (b.mag ?? 0) - (a.mag ?? 0)).slice(0, 6);
  const other = data.events.filter((e) => e.kind !== "beben").sort((a, b) => sevOf(b) - sevOf(a) || b.time.localeCompare(a.time)).slice(0, 8);
  const row = (e: GeoEvent) => (
    <tr key={e.id} onClick={() => onSel(e.id)}>
      <td>
        <span style={{ color: EVENT_KIND[e.kind].color }}>●</span> {e.kind === "beben" ? e.name.replace(/^M [\d.]+ · /, "") : e.name}
      </td>
      <td className="dim">{e.mag != null ? `M ${fmt(e.mag, 1)}` : e.alert ? ALERT_DE[e.alert] : ""}</td>
    </tr>
  );
  return (
    <>
      <h3>Erdbeben, 7 Tage</h3>
      <table className="click"><tbody>{quakes.map(row)}</tbody></table>
      <h3>Naturkatastrophen</h3>
      <table className="click"><tbody>{other.map(row)}</tbody></table>
      <p className="dim small">
        Quellen: USGS (ab Magnitude 4,5) und GDACS (Stürme, Fluten, Vulkane, Dürren, Waldbrände ab Orange; laufende Ereignisse).
        {data.errors.length > 0 && <span className="warn"> {data.errors.join(" · ")}</span>}
      </p>
    </>
  );
}

function EventPanel({ ev }: { ev: GeoEvent }) {
  const k = EVENT_KIND[ev.kind];
  return (
    <>
      <h2>{ev.name}</h2>
      <p style={{ color: k.color }}>{k.name}</p>
      <table>
        <tbody>
          {ev.mag != null && <tr><td>Magnitude</td><td>{fmt(ev.mag, 1)}</td></tr>}
          {ev.alert && <tr><td>Warnstufe</td><td>{ALERT_DE[ev.alert]}</td></tr>}
          <tr><td>{ev.kind === "beben" ? "Zeit" : "Letzte Meldung"}</td><td>{new Date(ev.time).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</td></tr>
          <tr><td>Ort</td><td>{fmt(ev.lat, 2)}°, {fmt(ev.lon, 2)}°</td></tr>
        </tbody>
      </table>
      <p className="dim small">
        Warnstufen von GDACS schätzen die humanitären Folgen (Grün, Orange, Rot), bei Erdbeben die PAGER-Stufe der USGS.{" "}
        <a className="plain" href={ev.url} target="_blank" rel="noreferrer">
          Bericht der Quelle
        </a>
      </p>
    </>
  );
}

function Predictions({ items }: { items: Prediction[] }) {
  return (
    <>
      {items.map((p) => (
        <div key={p.id} className="part">
          <div className="row">
            <a className="plain" href={p.url} target="_blank" rel="noreferrer">
              {p.title}
              {p.pick && <span className="dim"> · {p.pick}</span>}
            </a>
            <b style={{ color: "#b58cff", marginLeft: 8 }}>{fmt(p.prob * 100, 0)} %</b>
          </div>
          <div className="bar">
            <i style={{ width: `${p.prob * 100}%`, background: "#b58cff" }} />
          </div>
          <small className="dim">
            7 Tage {p.change7d == null || Math.round(p.change7d * 100) === 0 ? "±0 Pkt." : `${signed(Math.round(p.change7d * 100), 0)} Pkt.`} · Umsatz {big(p.volume)} $
            {p.endDate && ` · bis ${dateDe(p.endDate)}`}
          </small>
        </div>
      ))}
      <p className="dim small">Quelle: Polymarket. Preise sind Wetten, keine Prognosen von Fachleuten.</p>
    </>
  );
}

function HotspotPanel({ h, predictions }: { h: Hotspot; predictions: Prediction[] | undefined }) {
  const { data, error } = useApi<HotspotDetail>(`hotspot/${h.id}`, 60_000);
  return (
    <>
      <h2>{h.name}</h2>
      {h.kind === "engpass" && <p className="dim">Engpass des Seehandels</p>}
      {h.note && <p>{h.note}</p>}
      {data && data.assets.length > 0 && (
        <table>
          <tbody>
            {data.assets.map((a) => (
              <tr key={a.symbol}>
                <td>{a.name}</td>
                <td className="dim">{a.symbol}</td>
                <td>{ok(a.quote) ? <>{fmt(a.quote.price)} <Chg v={a.quote.changePct} /></> : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {predictions && predictions.length > 0 && (
        <>
          <h3>Prognosemärkte</h3>
          <Predictions items={predictions} />
        </>
      )}
      <h3>Nachrichten</h3>
      {!data?.articles && <p className="dim">{data?.newsNote ?? error ?? "lädt …"}</p>}
      {data?.articles && <p className="dim small">{data.articles.length} Meldungen der letzten 24 Stunden (GDELT, englischsprachig)</p>}
      <ul className="news">
        {data?.articles?.slice(0, 25).map((a) => (
          <li key={a.url}>
            <a href={a.url} target="_blank" rel="noreferrer">
              {a.title}
            </a>
            <small className="dim">
              {a.domain} · {a.country}
            </small>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------- Stimmung ----------

export function SentimentPanel({ data, error, selected }: { data: Sentiment | undefined; error?: string; selected: string | null }) {
  if (!data) return <Loading error={error} />;
  return (
    <>
      <h2>Stimmungsbarometer</h2>
      <div className="hero" style={{ color: moodColor(data.score) }}>
        {data.score ?? "–"} <small>{data.label}</small>
      </div>
      <p className="dim small">
        Eigener Index aus {data.parts.length} Marktgrößen, jede als Rang im Jahresvergleich (0 = größte Angst des Jahres, 100 = größte Gier). Kern anklicken, um ihn aufzuspalten.
      </p>
      {data.parts.map((p) => (
        <div key={p.id} className={`part ${selected === p.id ? "sel" : ""}`}>
          <div className="row">
            <span>{p.name}</span>
            <b style={{ color: moodColor(p.score) }}>{p.score}</b>
          </div>
          <div className="bar">
            <i style={{ width: `${p.score}%`, background: moodColor(p.score) }} />
          </div>
          <small className="dim">
            {p.value} · {p.explain}
          </small>
        </div>
      ))}
      <h3>VIX, 12 Monate</h3>
      <Spark points={data.vixHistory} width={300} height={60} color="#ff6a3d" />
      <p className="dim small">Stand {dateDe(data.asOf)}</p>
    </>
  );
}

// ---------- Sektoren ----------

export function SectorsPanel({
  sectors,
  selected,
  onSel,
  detail,
  onStock,
}: {
  sectors: Sector[] | undefined;
  selected: string | null;
  onSel: (id: string) => void;
  detail: SectorDetail | undefined;
  onStock: (s: string) => void;
}) {
  if (!sectors) return <Loading />;
  const s = sectors.find((x) => x.id === selected);
  if (s) {
    const d = detail?.id === s.id ? detail : undefined;
    return (
      <>
        <h2>{s.name}</h2>
        <p className="dim">
          {s.etf} <Chg v={ok(s.quote) ? s.quote.changePct : null} />
        </p>
        {d ? (
          <table className="click">
            <thead>
              <tr><th>Wert</th><th>Kurs</th><th>Heute</th><th>Börsenwert</th></tr>
            </thead>
            <tbody>
              {d.members.map((m) => (
                <tr key={m.symbol} onClick={() => onStock(m.symbol)}>
                  <td><b>{m.symbol}</b></td>
                  <td>{ok(m.quote) ? fmt(m.quote.price) : "–"}</td>
                  <td><Chg v={ok(m.quote) ? m.quote.changePct : null} /></td>
                  <td className="dim">{big(parseBig(m.marketCap))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Loading />
        )}
        <p className="dim small">Kugel = Unternehmen, Größe = Börsenwert. Anklicken öffnet die Einzelaktie.</p>
      </>
    );
  }
  const ranked = [...sectors].sort((a, b) => (ok(b.quote) ? b.quote.changePct ?? 0 : 0) - (ok(a.quote) ? a.quote.changePct ?? 0 : 0));
  return (
    <>
      <h2>Sektoren im S&amp;P 500</h2>
      <p className="dim small">Kern anklicken: Die Kugel zerfällt in elf Sektoren. Sektor anklicken: Er gibt seine größten Werte frei.</p>
      <table className="click">
        <tbody>
          {ranked.map((x) => (
            <tr key={x.id} onClick={() => onSel(x.id)}>
              <td>{x.name}</td>
              <td className="dim">{x.etf}</td>
              <td><Chg v={ok(x.quote) ? x.quote.changePct : null} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ---------- Termine ----------

export function CalendarPanel({ items, error, onStock }: { items: Earning[] | undefined; error?: string; onStock: (s: string) => void }) {
  if (!items) return <Loading error={error} />;
  const days = [...new Set(items.map((e) => e.date))];
  return (
    <>
      <h2>Quartalszahlen</h2>
      <p className="dim small">Nächste zwei Wochen, Unternehmen ab 10 Mrd. USD Börsenwert. Blau: vor Börsenstart, Violett: nach Börsenschluss.</p>
      {days.map((d) => (
        <div key={d}>
          <h3>{weekdayDe(d)}</h3>
          <table className="click">
            <tbody>
              {items
                .filter((e) => e.date === d)
                .slice(0, 12)
                .map((e) => (
                  <tr key={e.symbol} onClick={() => onStock(e.symbol)}>
                    <td><b>{e.symbol}</b></td>
                    <td className="dim small">{e.name.length > 22 ? `${e.name.slice(0, 21)}…` : e.name}</td>
                    <td className="small">{e.time}</td>
                    <td className="dim small">{big(e.marketCap)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

// ---------- Einzelwert ----------

const SUMMARY_DE: [string, string][] = [
  ["Sector", "Sektor"],
  ["Industry", "Branche"],
  ["MarketCap", "Börsenwert"],
  ["PERatio", "KGV"],
  ["ForwardPE1Yr", "KGV erwartet"],
  ["EarningsPerShare", "Gewinn je Aktie"],
  ["Yield", "Dividendenrendite"],
  ["AnnualizedDividend", "Dividende p. a."],
  ["ExDividendDate", "Ex-Tag"],
  ["OneYrTarget", "Kursziel 1 J."],
  ["FiftTwoWeekHighLow", "52 Wochen Hoch/Tief"],
  ["AverageVolume", "Ø Volumen"],
  ["Exchange", "Börse"],
];

export function StockPanel({ data, error, title }: { data: Stock | MarketDetail | undefined; error?: string; title?: string }) {
  if (!data) return <Loading error={error} />;
  const q = data.quote;
  const summary = "summary" in data ? data.summary : {};
  return (
    <>
      <h2>{title ?? q.symbol}</h2>
      <p className="dim">{q.name}</p>
      <div className="hero">
        {fmt(q.price)} <Chg v={q.changePct} />
      </div>
      <p className="dim small">
        {q.time ?? ""} · {q.marketStatus ?? ""}
      </p>
      <ExtendedBlock ext={data.extended} />
      <div className="tiles">
        {tilesFor(data.indicators).map((t) => (
          <div key={t.id} className={`tile ${t.tone}`}>
            <small>{t.title}</small>
            <b>{t.value}</b>
            <small className="dim">{t.note}</small>
          </div>
        ))}
      </div>
      {Object.keys(summary).length > 0 && (
        <table>
          <tbody>
            {SUMMARY_DE.filter(([k]) => summary[k] && summary[k] !== "N/A").map(([k, de]) => (
              <tr key={k}>
                <td className="dim">{de}</td>
                <td>{k === "MarketCap" ? big(parseBig(summary[k])) : summary[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="dim small">
        Gelb: 50-Tage-Linie · Violett: 200-Tage-Linie · hinten: Volumen{data.extended?.bars.length ? " · blau hinterlegt: außerbörslich" : ""}. Ziehen dreht, Scrollen zoomt.
      </p>
    </>
  );
}

// ---------- Makro-Leiste ----------

export function MacroStrip({ data }: { data: Macro[] | undefined }) {
  if (!data) return <div className="strip dim">Makrodaten laden …</div>;
  return (
    <div className="strip">
      {data
        .filter((m) => !m.error)
        .map((m) => (
          <div key={m.id} className="chip" title={`${m.name} · Stand ${dateDe(m.asOf)} · FRED ${m.id}`}>
            <span className="dim">{m.name}</span>
            <b>{fmt(m.value, m.value > 1000 ? 0 : 2)}</b>
            <span style={{ color: changeColor(m.change == null ? null : (m.change / Math.abs(m.value - m.change || 1)) * 100 * (m.group === "Stimmung" ? -1 : 1)) }}>
              {signed(m.change, m.value > 1000 ? 0 : 2)}
            </span>
            <Spark points={m.history} width={64} height={20} />
          </div>
        ))}
    </div>
  );
}

// ---------- Lagekarte (World Monitor) ----------

export const LAGE_LAYERS = [
  ["conflicts", "Konflikte"],
  ["earthquakes", "Erdbeben"],
  ["weather", "Unwetter"],
] as const;
export const LAGE_VIEWS = [
  { id: "welt", name: "Welt", center: "20,0", zoom: 1 },
  { id: "europa", name: "Europa", center: "50,15", zoom: 3 },
  { id: "nahost", name: "Nahost", center: "29,45", zoom: 4 },
  { id: "ostasien", name: "Ostasien", center: "30,120", zoom: 3 },
  { id: "amerika", name: "Amerika", center: "15,-80", zoom: 2 },
] as const;

export function LagePanel({
  layers,
  setLayers,
  view,
  setView,
}: {
  layers: string[];
  setLayers: (l: string[]) => void;
  view: string;
  setView: (v: string) => void;
}) {
  return (
    <>
      <h2>Lagekarte</h2>
      <p className="dim small">
        Live-Karte von World Monitor, eingebettet über den freien Zugang. Aktualisiert sich stündlich. Klick auf ein Ereignis zeigt Details.
      </p>
      <h3>Ausschnitt</h3>
      <div className="actions">
        {LAGE_VIEWS.map((v) => (
          <button key={v.id} className={v.id === view ? "on" : ""} onClick={() => setView(v.id)}>
            {v.name}
          </button>
        ))}
      </div>
      <h3>Ebenen</h3>
      {LAGE_LAYERS.map(([k, n]) => (
        <label key={k} className="check">
          <input
            type="checkbox"
            checked={layers.includes(k)}
            onChange={(e) => setLayers(e.target.checked ? [...layers, k] : layers.filter((x) => x !== k))}
          />{" "}
          {n}
        </label>
      ))}
      <p className="dim small">
        Weitere Ebenen (Proteste, Kabel, Militär) gibt es nur mit kostenpflichtigem Schlüssel. Quelle und Nutzung:{" "}
        <a className="plain" href="https://www.worldmonitor.app" target="_blank" rel="noreferrer">
          worldmonitor.app
        </a>
        .
      </p>
    </>
  );
}
