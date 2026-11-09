// Seitenleiste für die lebenden Ebenen: Verkehr (Schiffe, Flugzeuge, Kabel), Weltraumwetter
// und die Steuerung des Zeitraffers. Die Daten kommen über einen Kontext aus App.
import { createContext, useContext } from "react";
import type { Cables, EventHistory, Flights, SpaceWeather, Traffic, Transit } from "../api";
import { fmt } from "../format";
import type { GlobeSel } from "../three/Globe";
import { EVENT_KIND } from "../three/Globe";
import { Spark } from "./Spark";

export type LiveData = {
  traffic?: Traffic;
  flights?: Flights;
  weather?: SpaceWeather;
  cables?: Cables;
  history?: EventHistory;
  lapse: number | null;
  setLapse: (t: number | null) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
};
export const LiveCtx = createContext<LiveData | null>(null);
const useLive = () => useContext(LiveCtx);

const signedPct = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : ""}${fmt(v, 0)} %`);
const changeColor = (v: number | null | undefined) => (v == null ? undefined : v <= -25 ? "var(--down)" : v >= 15 ? "var(--up)" : undefined);
const dateDe = (s: string) => new Date(s).toLocaleDateString("de-DE", { day: "numeric", month: "short" });

/** Deutsche Namen der PortWatch-Meerengen, soweit gebräuchlich. */
const STRAIT_DE: Record<string, string> = {
  "Strait of Hormuz": "Straße von Hormus",
  "Bab el-Mandeb Strait": "Bab al-Mandab",
  "Suez Canal": "Suezkanal",
  "Malacca Strait": "Straße von Malakka",
  "Panama Canal": "Panamakanal",
  "Bosporus Strait": "Bosporus",
  "Cape of Good Hope": "Kap der Guten Hoffnung",
  "Dover Strait": "Straße von Dover",
  "Gibraltar Strait": "Straße von Gibraltar",
  "Taiwan Strait": "Taiwanstraße",
  "Korea Strait": "Koreastraße",
  "Oresund Strait": "Öresund",
  "Kerch Strait": "Straße von Kertsch",
  "Bering Strait": "Beringstraße",
  "Magellan Strait": "Magellanstraße",
  "Sunda Strait": "Sundastraße",
  "Lombok Strait": "Lombokstraße",
  "Luzon Strait": "Luzonstraße",
  "Tsugaru Strait": "Tsugarustraße",
  "Torres Strait": "Torresstraße",
  "Yucatan Channel": "Yucatánstraße",
  "Windward Passage": "Windward-Passage",
  "Mona Passage": "Mona-Passage",
  "Bohai Strait": "Bohai-Straße",
  "Ombai Strait": "Ombaistraße",
  "Makassar Strait": "Makassarstraße",
  "Mindoro Strait": "Mindorostraße",
  "Balabac Strait": "Balabacstraße",
};
export const straitName = (n: string) => STRAIT_DE[n] ?? n;

function TransitRow({ t, onClick }: { t: Transit; onClick?: () => void }) {
  return (
    <tr onClick={onClick}>
      <td>{straitName(t.name)}</td>
      <td>{fmt(t.avg7, 0)}</td>
      <td style={{ color: changeColor(t.change) }}>{signedPct(t.change)}</td>
      <td>
        <Spark points={t.series.slice(-60).map((x) => x[1])} width={70} height={18} color="#7fd6ff" />
      </td>
    </tr>
  );
}

/** Block im Panel eines Engpasses. */
export function TransitBlock({ id }: { id: string }) {
  const t = useLive()?.traffic?.items.find((x) => x.id === id);
  if (!t) return null;
  return (
    <>
      <h3>Schiffsverkehr</h3>
      <div className="hero">
        {fmt(t.avg7, 0)} <small>Durchfahrten am Tag</small>
      </div>
      <p>
        Schnitt der sieben Tage bis {dateDe(t.last)}, davon {fmt(t.tanker7, 0)} Tanker. Vor einem Jahr waren es {fmt(t.base, 0)} am Tag (
        <span style={{ color: changeColor(t.change) }}>{signedPct(t.change)}</span>).
      </p>
      <Spark points={t.series.map((x) => x[1])} width={300} height={60} color="#7fd6ff" />
      <p className="dim small">Quelle: IMF PortWatch (AIS-Satellitendaten), tägliche Durchfahrten der letzten 120 Tage. Die Werte kommen mit etwa einer Woche Verzug.</p>
    </>
  );
}

export function TrafficTab({ onSel }: { onSel: (s: GlobeSel) => void }) {
  const live = useLive();
  const tr = live?.traffic;
  const fl = live?.flights;
  const drops = tr?.items.filter((t) => (t.change ?? 0) <= -25) ?? [];
  return (
    <>
      <h2>Verkehr</h2>
      <div className="summary">
        <p>
          {tr ? (
            <>
              Durch die 28 großen Meerengen fuhren in der Woche bis {tr.asOf && dateDe(tr.asOf)} im Schnitt {fmt(tr.items.reduce((s, t) => s + t.avg7, 0), 0)} Schiffe am Tag.{" "}
              {drops.length ? (
                <>
                  Deutlich weniger als vor einem Jahr: {drops.map((t) => `${straitName(t.name)} (${signedPct(t.change)})`).join(", ")}.
                </>
              ) : (
                "Keine Meerenge liegt mehr als ein Viertel unter dem Vorjahr."
              )}
            </>
          ) : (
            "Schiffsdaten laden …"
          )}{" "}
          {fl && (
            <>
              In der Luft sind gerade {fmt(fl.flights.length, 0)} Flugzeuge mit Transponder-Empfang, die meisten registriert in {fl.top[0]?.[0]} ({fmt(fl.top[0]?.[1] ?? 0, 0)}).
            </>
          )}
        </p>
      </div>
      {tr && (
        <>
          <h3>Durchfahrten am Tag</h3>
          <table className="click">
            <thead>
              <tr>
                <th>Meerenge</th>
                <th>7 Tage</th>
                <th>zum Vorjahr</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tr.items.map((t) => (
                <TransitRow key={t.name} t={t} onClick={t.id ? () => onSel({ type: "hotspot", id: t.id! }) : undefined} />
              ))}
            </tbody>
          </table>
          <p className="dim small">IMF PortWatch. Die sechs Tore auf dem Globus färben sich nach dem Rückgang.</p>
        </>
      )}
      {fl && (
        <>
          <h3>Flugzeuge nach Herkunftsland</h3>
          <table>
            <tbody>
              {fl.top.map(([c, n]) => (
                <tr key={c}>
                  <td>{c}</td>
                  <td>{fmt(n, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="dim small">
            OpenSky Network, Stand {new Date(fl.time).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}, alle 15 Minuten. Dazwischen fliegen die Punkte nach Kurs und Tempo weiter.
            Über Ozeanen und Teilen Afrikas und Asiens fehlen Empfänger, dort bleibt es dunkel.
          </p>
        </>
      )}
      {live?.cables && (
        <>
          <h3>Unterseekabel</h3>
          <p>
            {fmt(live.cables.cables.length, 0)} Kabel in Betrieb oder im Bau tragen fast den ganzen Datenverkehr zwischen den Kontinenten. Die Ebene „Seekabel“ zeigt sie in ihren
            Kartenfarben.
          </p>
          <p className="dim small">TeleGeography Submarine Cable Map. Störungen meldet die Quelle nicht maschinenlesbar, deshalb fehlen sie.</p>
        </>
      )}
    </>
  );
}

const G_DE = ["keiner", "schwach", "mäßig", "stark", "schwer", "extrem"];

export function SpaceWeatherBlock({ onGlobe }: { onGlobe?: (s: GlobeSel) => void }) {
  const w = useLive()?.weather;
  if (!w) return null;
  const north = w.aurora.filter((a) => a[1] > 0 && a[2] >= 10);
  const southmost = north.length ? Math.min(...north.map((a) => a[1])) : null;
  return (
    <>
      <h3>Weltraumwetter</h3>
      <p>
        Kp-Index jetzt {w.kp != null ? fmt(w.kp, 1) : "–"}, in den nächsten 24 Stunden bis {w.kpMax24 != null ? fmt(w.kpMax24, 1) : "–"}. Geomagnetischer Sturm:{" "}
        {G_DE[w.scales?.G ?? 0]}
        {w.scales && (w.scales.S > 0 || w.scales.R > 0) ? `, Strahlung S${w.scales.S}, Funkausfall R${w.scales.R}` : ""}.{" "}
        {southmost != null && <>Polarlicht reicht im Norden bis etwa {fmt(southmost, 0)}° Breite{southmost <= 52 ? ", also bis nach Deutschland" : ""}.</>}
      </p>
      {onGlobe && (
        <div className="actions">
          <button onClick={() => onGlobe({ type: "view", id: "nord" })}>Polarlicht im Norden</button>
          <button onClick={() => onGlobe({ type: "view", id: "sued" })}>im Süden</button>
        </div>
      )}
      <Spark points={w.forecast.map((f) => f.kp)} width={300} height={40} color="#2ee68c" />
      <p className="dim small">NOAA SWPC: Kp alle drei Stunden, Vorhersage drei Tage, Polarlichtoval (OVATION) alle 30 Minuten. Ab Kp 5 beginnt ein Sturm, der Satelliten und Stromnetze stören kann.</p>
    </>
  );
}

export function LapseControls() {
  const live = useLive();
  if (!live) return null;
  const h = live.history;
  const from = h ? new Date(h.from).getTime() : 0;
  const to = h ? new Date(h.to).getTime() : 0;
  const t = live.lapse;
  const shown = h && t != null ? h.events.filter((e) => new Date(e.time).getTime() <= t) : [];
  const quakes = shown.filter((e) => e.kind === "beben");
  const big = quakes.reduce<(typeof quakes)[number] | null>((a, e) => (!a || (e.mag ?? 0) > (a.mag ?? 0) ? e : a), null);
  return (
    <div className="lapse">
      <h3>Zeitraffer 30 Tage</h3>
      {t == null ? (
        <button
          onClick={() => {
            live.setLapse(from || Date.now() - 30 * 86400_000);
            live.setPlaying(true);
          }}
        >
          ▶ Abspielen
        </button>
      ) : (
        <>
          <div className="actions">
            <button onClick={() => live.setPlaying(!live.playing)}>{live.playing ? "Pause" : "▶ Weiter"}</button>
            <button onClick={() => (live.setPlaying(false), live.setLapse(null))}>Beenden</button>
          </div>
          {h && (
            <input
              type="range"
              min={from}
              max={to}
              step={3600_000}
              value={t}
              onChange={(e) => {
                live.setPlaying(false);
                live.setLapse(Number(e.target.value));
              }}
              style={{ width: "100%" }}
            />
          )}
          <p>
            <b>{new Date(t).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long" })}</b>: bis hier {quakes.length} Erdbeben ab M 4,5
            {big && <> (stärkstes M {fmt(big.mag, 1)}, {big.name.replace(/^M [\d.]+ · /, "")})</>} und {shown.length - quakes.length} andere Ereignisse.
          </p>
          <p className="dim small">
            {Object.values(EVENT_KIND).map((k) => (
              <span key={k.name} style={{ marginRight: 8 }}>
                <span style={{ color: k.color }}>●</span> {k.name}
              </span>
            ))}
          </p>
        </>
      )}
      {!h && t != null && <p className="dim">lädt …</p>}
      <p className="dim small">Ein Tag je Sekunde. Neue Ereignisse leuchten groß auf und verblassen über eine Woche. Quellen: USGS, GDACS.</p>
    </div>
  );
}
