import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  ok,
  useApi,
  type Earning,
  type HotspotHeat,
  type Macro,
  type MarketDetail,
  type Prediction,
  type Events,
  type CountryOverview,
  type Launches,
  type Sector,
  type SectorDetail,
  type Sentiment,
  type Stock,
  type World,
  type Satellites,
  type GermanyBase,
  type GermanyNet,
  type Baustellen,
  type Land,
  type Traffic,
  type Flights,
  type SpaceWeather,
  type Cables,
  type Sky,
  type EventHistory,
  type Power,
  type Pegel,
} from "./api";
import { CalendarScene } from "./three/Calendar";
import { SkyLayer } from "./three/Sky";
import { GridLayer } from "./three/Grid";
import { CameraRig, PanelOffset, SmoothZoom, Starfield, latLon } from "./three/common";
import { geoCentroid } from "d3-geo";
import { Globe, R, countryFeature, type GlobeSel, type Layers } from "./three/Globe";
import { CountryScene, type LandLayers, type LandSel, landProj } from "./three/Country";
import { GermanyScene, centreOf, type DeLayers, type DeMode, type DeSel } from "./three/Germany";
import { SectorsScene, sectorFocus } from "./three/Sectors";
import { BODIES, Jwst, SatelliteLayer, SolarSystem, bodyScenePos, rSat, type SatState } from "./three/Space";
import { CandleChart, MetricCube } from "./three/StockChart";
import { CalendarPanel, LAGE_VIEWS, LagePanel, MacroStrip, SectorsPanel, StockPanel, WorldPanel } from "./ui/Panels";
import { BodyPanel, GermanyPanel, SatControl, SatPanel } from "./ui/SpacePanels";
import { LandPanel } from "./ui/LandPanel";
import { LiveCtx } from "./ui/LivePanels";
import { AuroraLayer, CableLayer, FlightLayer, TimelapseLayer } from "./three/Live";

type View =
  | { k: "welt" }
  | { k: "sektoren" }
  | { k: "termine" }
  | { k: "lage" }
  | { k: "deutschland" }
  | { k: "land"; iso3: string }
  | { k: "markt"; id: string }
  | { k: "aktie"; symbol: string };

const TABS: { k: View["k"]; name: string }[] = [
  { k: "welt", name: "Welt" },
  { k: "sektoren", name: "Sektoren" },
  { k: "termine", name: "Termine" },
];
const viewName = (k: View["k"]) => (k === "lage" ? "Lagekarte" : k === "deutschland" ? "Deutschland" : TABS.find((t) => t.k === k)?.name ?? k);

const toHash = (v: View) => (v.k === "aktie" ? `#/aktie/${v.symbol}` : v.k === "markt" ? `#/markt/${v.id}` : v.k === "land" ? `#/land/${v.iso3}` : `#/${v.k}`);
function fromHash(): View {
  const [, k, arg] = location.hash.split("/");
  if (k === "aktie" && arg) return { k, symbol: decodeURIComponent(arg).toUpperCase() };
  if (k === "markt" && arg) return { k, id: arg };
  if (k === "land" && /^[A-Za-z]{3}$/.test(arg ?? "")) return arg.toUpperCase() === "DEU" ? { k: "deutschland" } : { k, iso3: arg.toUpperCase() };
  if (k === "sektoren" || k === "termine" || k === "lage" || k === "deutschland") return { k };
  return { k: "welt" };
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export default function App() {
  const [stack, setStack] = useState<View[]>(() => {
    const v = fromHash();
    return v.k === "welt" ? [v] : [{ k: "welt" }, v];
  });
  const view = stack.at(-1)!;
  const go = (v: View, push = true) => setStack((s) => (push ? [...s, v] : [v]));
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  useEffect(() => {
    if (location.hash !== toHash(view)) history.replaceState(null, "", toHash(view));
  }, [view]);
  useEffect(() => {
    const onHash = () => {
      const v = fromHash();
      setStack((s) => (toHash(s.at(-1)!) === toHash(v) ? s : v.k === "aktie" || v.k === "markt" || v.k === "deutschland" || v.k === "land" ? [...s, v] : v.k === "welt" ? [v] : [{ k: "welt" }, v]));
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  // Auswahl je Szene
  // Alte Direktlinks auf die Stimmungsseite öffnen den Stimmungsmond.
  const [globeSel, setGlobeSel] = useState<GlobeSel>(() => (location.hash.startsWith("#/stimmung") ? { type: "mood", id: "mood" } : null));
  const [layers, setLayers] = useState<Layers>({
    markets: true,
    banks: true,
    hotspots: true,
    chokepoints: true,
    events: true,
    countries: true,
    launches: true,
    mood: true,
    sats: true,
    flights: true,
    aurora: true,
    cables: true,
    sky: false,
    grid: true,
  });
  const [lapse, setLapse] = useState<number | null>(null);
  const [lapsePlaying, setLapsePlaying] = useState(false);
  const [satShow, setSatShow] = useState<Record<string, boolean>>({});
  const [satFocus, setSatFocus] = useState<string | null>(null);
  const satCtl = useMemo(() => ({ show: satShow, setShow: (id: string, v: boolean) => setSatShow((x) => ({ ...x, [id]: v })), focus: satFocus, setFocus: setSatFocus }), [satShow, satFocus]);
  const [lageLayers, setLageLayers] = useState<string[]>(["conflicts", "earthquakes", "weather"]);
  const [lageView, setLageView] = useState("welt");
  const [lageSrc, setLageSrc] = useState<"wm" | "cyber">("wm");
  const [worldTab, setWorldTab] = useState("lage");
  const [secExploded, setSecExploded] = useState(false);
  const [secSel, setSecSel] = useState<string | null>(null);
  const [cubeOpen, setCubeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [satState, setSatState] = useState<SatState | null>(null);
  const [exploding, setExploding] = useState(false);
  const [deLayers, setDeLayers] = useState<DeLayers>({ wahl: true, bahn: true, autobahn: true, bundes: false, baustellen: true, staedte: true, pegel: true });
  const [deMode, setDeMode] = useState<DeMode>("bund");
  const [deSel, setDeSel] = useState<DeSel>(null);
  const [landLayers, setLandLayers] = useState<LandLayers>({ regionen: true, bahn: true, autobahn: true, strassen: false, staedte: true });
  const [landSel, setLandSel] = useState<LandSel>(null);
  const [explodeTo, setExplodeTo] = useState<string | null>(null);
  const explodeTimer = useRef<number | undefined>(undefined);

  // Klick auf ein Land: Die Welt explodiert, danach setzt sich die Karte des Landes zusammen.
  // Deutschland hat eine eigene, genauere Karte (Wahlkreise, DLM250, Baustellen).
  const selectGlobe = (s: GlobeSel) => {
    if (s?.type === "country" && !exploding) {
      setGlobeSel(s);
      setExploding(true);
      setExplodeTo(s.id);
      clearTimeout(explodeTimer.current);
      explodeTimer.current = window.setTimeout(() => {
        setExploding(false);
        setExplodeTo(null);
        setGlobeSel(null);
        setDeSel(null);
        setLandSel(null);
        go(s.id === "DEU" ? { k: "deutschland" } : { k: "land", iso3: s.id });
      }, 1300);
      return;
    }
    if (s?.type !== "sat") setSatState(null);
    setGlobeSel(s);
  };

  // Daten
  const world = useApi<World>("world", 5 * 60_000);
  const heat = useApi<HotspotHeat[]>("hotspots", 30_000);
  const macro = useApi<Macro[]>("macro", 30 * 60_000);
  const evts = useApi<Events>(view.k === "welt" || view.k === "land" ? "events" : null, 15 * 60_000);
  const preds = useApi<Prediction[]>(view.k === "welt" ? "predictions" : null, 15 * 60_000);
  const mood = useApi<Sentiment>(view.k === "welt" ? "sentiment" : null, 15 * 60_000);
  const overview = useApi<CountryOverview>(view.k === "welt" || view.k === "land" ? "countries" : null, 30 * 60_000);
  const launches = useApi<Launches>(view.k === "welt" || view.k === "land" ? "launches" : null, 30 * 60_000);
  const sectors = useApi<Sector[]>(view.k === "sektoren" ? "sectors" : null, 5 * 60_000);
  const sectorDetail = useApi<SectorDetail>(view.k === "sektoren" && secSel ? `sector/${secSel}` : null);
  const cal = useApi<Earning[]>(view.k === "termine" ? "calendar?days=10" : null);
  const marketId = view.k === "markt" ? view.id : globeSel?.type === "market" ? globeSel.id : null;
  const market = useApi<MarketDetail>(marketId ? `market/${marketId}` : null);
  const stock = useApi<Stock>(view.k === "aktie" ? `stock/${encodeURIComponent(view.symbol)}` : null);
  const sats = useApi<Satellites>(view.k === "welt" ? "satellites" : null, 6 * 3600_000);
  const traffic = useApi<Traffic>(view.k === "welt" ? "engpaesse" : null, 6 * 3600_000);
  const flights = useApi<Flights>(view.k === "welt" && layers.flights ? "fluege" : null, 15 * 60_000);
  const weather = useApi<SpaceWeather>(view.k === "welt" ? "weltraumwetter" : null, 15 * 60_000);
  const sky = useApi<Sky>(view.k === "welt" ? "sterne" : null);
  const cables = useApi<Cables>(view.k === "welt" && layers.cables ? "kabel" : null);
  const evHistory = useApi<EventHistory>(lapse != null ? "ereignisse-30" : null, 60 * 60_000);
  const live = useMemo(
    () => ({ traffic: traffic.data, flights: flights.data, weather: weather.data, cables: cables.data, history: evHistory.data, lapse, setLapse, playing: lapsePlaying, setPlaying: setLapsePlaying }),
    [traffic.data, flights.data, weather.data, cables.data, evHistory.data, lapse, lapsePlaying],
  );
  // Zeitraffer: ein Tag je Sekunde, am Ende anhalten.
  useEffect(() => {
    if (!lapsePlaying || lapse == null) return;
    const end = evHistory.data ? new Date(evHistory.data.to).getTime() : Date.now();
    const id = window.setInterval(() => {
      setLapse((t) => {
        const n = (t ?? 0) + 86400_000 / 20;
        if (n >= end) {
          setLapsePlaying(false);
          return end;
        }
        return n;
      });
    }, 50);
    return () => clearInterval(id);
  }, [lapsePlaying, evHistory.data, lapse == null]);
  const deWanted = view.k === "deutschland" || explodeTo === "DEU";
  const landIso = view.k === "land" ? view.iso3 : explodeTo && explodeTo !== "DEU" ? explodeTo : null;
  const land = useApi<Land>(landIso ? `land/${landIso}` : null);
  // Ohne Autobahnen (Island, viele kleine Länder) sind die Fernstraßen das Netz, also gleich zeigen.
  useEffect(() => {
    if (land.data && land.data.motorway.length < 10) setLandLayers((l) => ({ ...l, strassen: true }));
  }, [land.data]);
  const deBase = useApi<GermanyBase>(deWanted ? "de/base" : null);
  const deNet = useApi<GermanyNet>(deWanted ? "de/netz" : null);
  const deWorks = useApi<Baustellen>(deWanted ? "de/baustellen" : null, 30 * 60_000);
  const dePower = useApi<Power>(view.k === "deutschland" ? "de/strom" : null, 15 * 60_000);
  const dePegel = useApi<Pegel>(deWanted ? "de/pegel" : null, 15 * 60_000);

  useEffect(() => setCubeOpen(false), [view]);

  // Kamera je Ansicht
  const cam = useMemo(() => {
    if (view.k === "welt") {
      if (globeSel && world.data) {
        if (globeSel.type === "body") {
          if (globeSel.id === "system") return { pos: V(0, 420, 620), target: bodyScenePos("sonne"), key: "sys" };
          const p = globeSel.id === "jwst" ? bodyScenePos("sonne").normalize().multiplyScalar(-rSat(1_500_000)) : bodyScenePos(globeSel.id);
          const size = globeSel.id === "sonne" ? 7 : globeSel.id === "jwst" ? 0.4 : BODIES.find((b) => b.id === globeSel.id)?.size ?? 1;
          const back = p.clone().normalize().multiplyScalar(-(size * 9 + 6));
          return { pos: p.clone().add(back).add(V(0, size * 2 + 1, 0)), target: p, key: `b-${globeSel.id}` };
        }
        // Blick von oben auf einen Pol, etwa für das Polarlichtoval
        if (globeSel.type === "view") return { pos: V(0, globeSel.id === "sued" ? -6.4 : 6.4, 0.9), target: V(0, 0, 0), key: `v-${globeSel.id}` };
        if (globeSel.type === "sat") {
          if (!satState) return { pos: V(0, 1.4, 6.6), target: V(0, 0, 0), key: "w" };
          const p = latLon(satState.lat, satState.lon, rSat(satState.alt));
          return { pos: p.clone().normalize().multiplyScalar(rSat(satState.alt) + 2.2).add(V(0, 0.5, 0)), target: p.clone().multiplyScalar(0.7), key: `s-${globeSel.id}` };
        }
        const item =
          globeSel.type === "mood"
            ? null
            : globeSel.type === "country"
              ? globeSel.lat != null && globeSel.lon != null
                ? { lat: globeSel.lat, lon: globeSel.lon }
                : centroidOf(overview.data?.list.find((c) => c.iso3 === globeSel.id)?.num)
              : globeSel.type === "launch"
                ? launches.data?.sites.find((x) => x.id === globeSel.id)
                : globeSel.type === "market"
            ? world.data.markets.find((m) => m.id === globeSel.id)
            : globeSel.type === "bank"
              ? world.data.banks.find((b) => b.id === globeSel.id)
              : globeSel.type === "event"
                ? evts.data?.events.find((e) => e.id === globeSel.id)
                : world.data.hotspots.find((h) => h.id === globeSel.id);
        if (item) {
          const p = latLon(item.lat, item.lon, R);
          return { pos: p.clone().normalize().multiplyScalar(4.4).add(V(0, 0.6, 0)), target: p.clone().multiplyScalar(0.55), key: `w-${globeSel.id}` };
        }
      }
      // Fokus auf eine Satellitengruppe: so weit zurück, dass die ganze Schale ins Bild passt.
      if (satFocus === "geo" || satFocus === "gps-ops" || satFocus === "galileo") return { pos: V(0, 5, 17), target: V(0, 0, 0), key: `f-${satFocus}` };
      if (satFocus) return { pos: V(0, 2.4, 8.4), target: V(0, 0, 0), key: `f-${satFocus}` };
      return { pos: V(0, 1.4, 6.6), target: V(0, 0, 0), key: "w" };
    }
    if (view.k === "sektoren") {
      const f = sectorFocus(sectors.data, secSel);
      if (f) return { pos: f.centre.clone().add(f.dir.clone().multiplyScalar(5)).add(V(0, 1, 0)), target: f.centre, key: `sec-${secSel}` };
      return secExploded ? { pos: V(0, 6, 11), target: V(0, 0, 0), key: "sec-open" } : { pos: V(0, 2.8, 7.5), target: V(0, 0, 0), key: "sec" };
    }
    if (view.k === "deutschland") {
      const w = deSel?.type === "wk" ? deBase.data?.wahlkreise.find((x) => String(x.nr) === deSel.id) : null;
      if (w) {
        const [x, z] = centreOf(w.polys);
        return { pos: V(x, 2.6, z + 2.4), target: V(x, 0, z), key: `de-${deSel!.id}` };
      }
      return { pos: V(0, 8.5, 6.5), target: V(0, 0, 0.2), key: "de" };
    }
    if (view.k === "land") {
      const d = land.data?.iso3 === view.iso3 ? land.data : null;
      const r = landSel?.type === "region" && d ? d.regions.find((x) => x.id === landSel.id) : null;
      if (r && d) {
        const [x, z] = centreOf(r.polys, landProj(d.frame));
        return { pos: V(x, 2.6, z + 2.4), target: V(x, 0, z), key: `land-${landSel!.id}` };
      }
      return { pos: V(0, 8.5, 6.5), target: V(0, 0, 0.2), key: `land-${view.iso3}` };
    }
    if (view.k === "lage") return { pos: V(0, 1.4, 6.6), target: V(0, 0, 0), key: "l" };
    if (view.k === "termine") return { pos: V(7.5, 2.5, 7.5), target: V(0, 0, 0), key: "t" };
    return cubeOpen ? { pos: V(4.6, 1.2, 7.5), target: V(4.6, 0.6, 0), key: "a-open" } : { pos: V(0.9, 1.4, 11.5), target: V(0.9, 0.2, 0), key: `a-${view.k}` };
    // satState zählt nur beim ersten Wert, sonst folgt die Kamera dem Satelliten ruckartig
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, globeSel, world.data, evts.data, launches.data, overview.data, !!satState, satFocus, deSel, deBase.data, landSel, land.data, secExploded, secSel, sectors.data, cubeOpen]);

  const openStock = (s: string) => go({ k: "aktie", symbol: s.toUpperCase() });
  const crumbs = stack.map((v) =>
    v.k === "aktie" ? v.symbol : v.k === "land" ? overview.data?.list.find((c) => c.iso3 === v.iso3)?.name ?? land.data?.name ?? v.iso3 : v.k === "markt" ? world.data?.markets.find((m) => m.id === v.id)?.name ?? v.id : viewName(v.k),
  );
  const chart = view.k === "aktie" ? stock.data : view.k === "markt" ? market.data : undefined;
  const spyQuote = world.data?.markets.find((m) => m.id === "us")?.quote;

  return (
    <div className="app">
      <header>
        <div className="brand" onClick={() => go({ k: "welt" }, false)}>
          <span className="logo" /> Marktwelt
        </div>
        <nav>
          {TABS.map((t) => (
            <button key={t.k} className={view.k === t.k || (t.k === "welt" && view.k === "lage") ? "on" : ""} onClick={() => go({ k: t.k } as View, false)}>
              {t.name}
            </button>
          ))}
        </nav>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (search.trim()) openStock(search.trim());
            setSearch("");
          }}
        >
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Aktie suchen: NVDA, SAP, ASML …" />
        </form>
      </header>

      <div className="crumbs">
        {stack.length > 1 && (
          <button className="back" onClick={back}>
            ← zurück
          </button>
        )}
        {crumbs.map((c, i) => (
          <span key={i} className={i === crumbs.length - 1 ? "cur" : ""} onClick={() => i < crumbs.length - 1 && setStack((s) => s.slice(0, i + 1))}>
            {c}
          </span>
        ))}
        {view.k === "welt" && (
          <span className="layers">
            {(
              [
                ["markets", "Märkte"],
                ["banks", "Notenbanken"],
                ["hotspots", "Brennpunkte"],
                ["chokepoints", "Engpässe"],
                ["events", "Erdbeben und Katastrophen"],
                ["countries", "Länder"],
                ["launches", "Raketenstarts"],
                ["mood", "Stimmungsmond"],
                ["sats", "Satelliten"],
                ["flights", "Flugzeuge"],
                ["aurora", "Polarlicht"],
                ["cables", "Seekabel"],
                ["sky", "Sternbilder"],
                ["grid", "Zeitzonen und Achse"],
              ] as const
            ).map(([k, n]) => (
              <label key={k}>
                <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} /> {n}
              </label>
            ))}
          </span>
        )}
      </div>

      <main>
        <Canvas
          camera={{ position: [0, 1.4, 6.6], fov: 45, near: 0.02, far: 6000 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
          frameloop={view.k === "lage" ? "never" : "always"}
        >
          <color attach="background" args={["#030812"]} />
          {view.k !== "welt" && <fog attach="fog" args={["#030812", 18, 60]} />}
          <ambientLight intensity={0.35} />
          <directionalLight position={[5, 6, 4]} intensity={1.4} />
          <pointLight position={[-6, -3, -5]} intensity={30} color="#2bd4e0" />
          {view.k === "welt" ? (sky.data ? <SkyLayer data={sky.data} constellations={layers.sky} /> : null) : <Starfield />}
          <PanelOffset />
          <OrbitControls makeDefault enablePan enableDamping dampingFactor={0.08} autoRotate={view.k === "welt" && !globeSel && !exploding} autoRotateSpeed={0.35} minDistance={view.k === "deutschland" || view.k === "land" ? 0.6 : 2.5} maxDistance={view.k === "welt" ? 1500 : 30} zoomSpeed={view.k === "welt" ? 1.6 : 1} />
          <SmoothZoom speed={view.k === "welt" ? 1.5 : 1} />
          <CameraRig position={cam.pos} target={cam.target} flyKey={cam.key} />

          {view.k === "welt" && (
            <Globe world={world.data} heat={heat.data} predictions={preds.data} events={lapse == null ? evts.data?.events : undefined}
              traffic={traffic.data?.items}
              overview={overview.data}
              launches={launches.data?.sites}
              mood={mood.data}
              explode={exploding}
              layers={layers} sel={globeSel} onSelect={selectGlobe} marketDetail={market.data} />
          )}
          {view.k === "welt" && !exploding && (
            <>
              {layers.flights && <FlightLayer data={flights.data} />}
              {layers.aurora && <AuroraLayer data={weather.data} />}
              {layers.cables && <CableLayer data={cables.data} />}
              {layers.grid && <GridLayer />}
              {lapse != null && evHistory.data && <TimelapseLayer events={evHistory.data.events} t={lapse} />}
              {layers.sats && <SatelliteLayer data={sats.data} sel={globeSel} onSelect={selectGlobe} onState={setSatState} show={satShow} focus={satFocus} />}
              <SolarSystem sel={globeSel} onSelect={selectGlobe} />
              <Jwst selected={globeSel?.type === "body" && globeSel.id === "jwst"} onClick={() => selectGlobe({ type: "body", id: "jwst" })} />
            </>
          )}
          {view.k === "deutschland" && (
            <GermanyScene base={deBase.data} net={deNet.data} works={deWorks.data?.items} pegel={dePegel.data?.items} layers={deLayers} mode={deMode} sel={deSel} onSelect={setDeSel} />
          )}
          {view.k === "land" && <CountryScene key={view.iso3} data={land.data?.iso3 === view.iso3 ? land.data : undefined} layers={landLayers} sel={landSel} onSelect={setLandSel} />}
          {view.k === "sektoren" && (
            <SectorsScene
              sectors={sectors.data}
              spy={ok(spyQuote) ? spyQuote : null}
              exploded={secExploded}
              setExploded={setSecExploded}
              selected={secSel}
              onSelect={setSecSel}
              detail={sectorDetail.data}
              onStock={openStock}
            />
          )}
          {view.k === "termine" && <CalendarScene items={cal.data} onOpen={openStock} />}
          {(view.k === "aktie" || view.k === "markt") && chart && (
            <group>
              <CandleChart bars={chart.extended ? [...chart.bars, ...chart.extended.bars] : chart.bars} sma50={chart.sma50} sma200={chart.sma200} />
              <MetricCube ind={chart.indicators} open={cubeOpen} setOpen={setCubeOpen} />
            </group>
          )}

          <EffectComposer>
            <Bloom luminanceThreshold={0.55} luminanceSmoothing={0.2} intensity={0.9} mipmapBlur />
          </EffectComposer>
        </Canvas>

        {view.k === "lage" && <LageMap layers={lageLayers} view={lageView} src={lageSrc} />}

        <LiveCtx.Provider value={live}>
        <SatControl.Provider value={satCtl}>
        <aside>
          {view.k === "lage" && (
            <LagePanel layers={lageLayers} setLayers={setLageLayers} view={lageView} setView={setLageView} src={lageSrc} setSrc={setLageSrc} />
          )}
          {view.k === "welt" && globeSel?.type === "sat" && (
            <>
              <button className="closebtn" onClick={() => selectGlobe(null)}>
                ← Weltlage
              </button>
              <SatPanel sat={sats.data?.named.find((n) => n.id === globeSel.id)} state={satState} data={sats.data} />
            </>
          )}
          {view.k === "welt" && globeSel?.type === "body" && (
            <>
              <button className="closebtn" onClick={() => selectGlobe(null)}>
                ← Weltlage
              </button>
              <BodyPanel id={globeSel.id} onSel={(id) => selectGlobe({ type: "body", id })} />
            </>
          )}
          {view.k === "deutschland" && (
            <GermanyPanel
              base={deBase.data}
              works={deWorks.data}
              power={dePower.data}
              pegel={dePegel.data}
              netReady={!!deNet.data}
              layers={deLayers}
              setLayers={setDeLayers}
              mode={deMode}
              setMode={setDeMode}
              sel={deSel}
              onSel={setDeSel}
            />
          )}
          {view.k === "welt" && globeSel?.type !== "sat" && globeSel?.type !== "body" && (
            <WorldPanel
              sats={sats.data}
              world={world.data}
              heat={heat.data}
              predictions={preds.data}
              events={evts.data}
              overview={overview.data}
              launches={launches.data}
              mood={mood.data}
              tab={worldTab}
              setTab={setWorldTab}
              onMap={() => go({ k: "lage" })}
              sel={globeSel}
              onSel={selectGlobe}
              detail={market.data}
              onDrill={(to, id) => go(to === "markt" ? { k: "markt", id } : { k: "sektoren" })}
            />
          )}
          {view.k === "sektoren" && (
            <SectorsPanel
              sectors={sectors.data}
              selected={secSel}
              onSel={(id) => {
                setSecExploded(true);
                setSecSel(id);
              }}
              detail={sectorDetail.data}
              onStock={openStock}
            />
          )}
          {view.k === "termine" && <CalendarPanel items={cal.data} error={cal.error} onStock={openStock} />}
          {view.k === "aktie" && <StockPanel data={stock.data} error={stock.error} />}
          {view.k === "markt" && (
            <StockPanel data={market.data} error={market.error} title={world.data?.markets.find((m) => m.id === view.id)?.name} />
          )}
          {view.k === "land" && (
            <LandPanel
              iso3={view.iso3}
              data={land.data?.iso3 === view.iso3 ? land.data : undefined}
              error={land.error}
              layers={landLayers}
              setLayers={setLandLayers}
              sel={landSel}
              onSel={setLandSel}
              world={world.data}
              overview={overview.data}
              events={evts.data}
              launches={launches.data}
              onGlobe={(s) => {
                setStack([{ k: "welt" }]);
                setGlobeSel(s);
              }}
            />
          )}
        </aside>
        </SatControl.Provider>
        </LiveCtx.Provider>
      </main>

      <footer>
        <MacroStrip data={macro.data} />
        <div className="src dim">Daten: Nasdaq (Kurse, verzögert), FRED, EZB, BIS, Cboe, GDELT, Polymarket, Hyperliquid, CME über Yahoo, USGS, GDACS, Weltbank, Wikipedia, Wikidata, Energy-Charts, PEGELONLINE, Natural Earth, GeoNames, CelesTrak, IMF PortWatch, OpenSky, NOAA SWPC, TeleGeography, Launch Library 2, Google News, Sternkatalog d3-celestial, Lagekarten von World Monitor und Radware · keine Anlageberatung</div>
      </footer>
    </div>
  );
}

/** Freie Einbett-Karte von World Monitor (Konflikte, Erdbeben, Unwetter; stündlich) oder die
 *  Live Threat Map von Radware (Cyberangriffe). Radware hat keine offene Schnittstelle, deshalb nur als Einbettung. */
function LageMap({ layers, view, src: which }: { layers: string[]; view: string; src: "wm" | "cyber" }) {
  if (which === "cyber") return <iframe className="lagemap" src="https://livethreatmap.radware.com/" title="Live Threat Map von Radware" referrerPolicy="no-referrer" />;
  const v = LAGE_VIEWS.find((x) => x.id === view) ?? LAGE_VIEWS[0];
  const src = `https://www.worldmonitor.app/embed?layers=${(layers.length ? layers : ["conflicts"]).join(",")}&center=${v.center}&zoom=${v.zoom}&theme=dark&variant=full`;
  return <iframe className="lagemap" key={src} src={src} title="Lagekarte von World Monitor" referrerPolicy="no-referrer" />;
}

/** Mittelpunkt eines Landes für den Kameraflug, wenn es aus der Liste statt vom Globus gewählt wurde. */
function centroidOf(num: string | null | undefined) {
  const f = countryFeature(num);
  if (!f) return null;
  const [lon, lat] = geoCentroid(f);
  return { lat, lon };
}
