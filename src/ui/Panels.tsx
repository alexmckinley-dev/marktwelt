import { ok, useApi, type Earning, type Hotspot, type HotspotDetail, type HotspotHeat, type Prediction, type Macro, type MarketDetail, type Sector, type SectorDetail, type Sentiment, type Stock, type World } from "../api";
import { big, changeColor, dateDe, fmt, moodColor, parseBig, pct, signed, weekdayDe } from "../format";
import { tilesFor } from "../three/StockChart";
import type { GlobeSel } from "../three/Globe";
import { Spark } from "./Spark";

const Chg = ({ v, d = 2 }: { v: number | null | undefined; d?: number }) => <span style={{ color: changeColor(v) }}>{pct(v, d, false)}</span>;

export function Loading({ error }: { error?: string }) {
  return <p className="dim">{error ? `Fehler: ${error}` : "lädt …"}</p>;
}

// ---------- Welt ----------

export function WorldPanel({
  world,
  heat,
  sel,
  onSel,
  detail,
  onDrill,
  predictions,
}: {
  world: World | undefined;
  heat: HotspotHeat[] | undefined;
  predictions: Prediction[] | undefined;
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
  if (sel?.type === "hotspot") {
    const h = world.hotspots.find((x) => x.id === sel.id)!;
    return <HotspotPanel key={h.id} h={h} predictions={predictions?.filter((p) => p.hotspots.includes(h.id))} />;
  }

  const ranked = world.markets.filter((m) => ok(m.quote)).sort((a, b) => (ok(b.quote) ? b.quote.changePct ?? 0 : 0) - (ok(a.quote) ? a.quote.changePct ?? 0 : 0));
  const heatMap = new Map(heat?.map((h) => [h.id, h]) ?? []);
  return (
    <>
      <h2>Weltlage</h2>
      <p className="dim small">
        Säulen: Märkte (Höhe = Tagesbewegung). Goldene Ringe: Notenbanken (Größe = Zins). Glut: geopolitische Brennpunkte (Nachrichtenlage 24 h), violetter Ring:
        Prognosemärkte dazu. Tore: Engpässe des Seehandels.
      </p>
      <h3>Märkte heute</h3>
      <table className="click">
        <tbody>
          {ranked.map((m) => (
            <tr key={m.id} onClick={() => onSel({ type: "market", id: m.id })}>
              <td>{m.name}</td>
              <td className="dim">{m.etf}</td>
              <td><Chg v={ok(m.quote) ? m.quote.changePct : null} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Notenbanken</h3>
      <table className="click">
        <tbody>
          {world.banks.map((b) => (
            <tr key={b.id} onClick={() => onSel({ type: "bank", id: b.id })}>
              <td>{b.short}</td>
              <td>{ok(b.data) ? `${fmt(b.data.rate, 2)} %` : "–"}</td>
              <td className="dim small">{ok(b.data) ? (b.data.stale ? "veraltet" : dateDe(b.data.asOf)) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const { data, error } = useApi<HotspotDetail>(`hotspot/${h.id}`);
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
      {!data && <Loading error={error} />}
      {data && <p className="dim small">{data.articles.length} Meldungen der letzten 24 Stunden (GDELT, englischsprachig)</p>}
      <ul className="news">
        {data?.articles.slice(0, 25).map((a) => (
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
      <p className="dim small">Gelb: 50-Tage-Linie · Violett: 200-Tage-Linie · hinten: Volumen. Ziehen dreht, Scrollen zoomt.</p>
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
