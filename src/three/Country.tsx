// Jedes Land als eigene 3D-Karte, nach dem Muster der Deutschlandkarte: Provinzen als Kacheln
// in der Farbe der Partei ihres Regierungschefs, darüber Bahn, Fernstraßen und Städte.
import { useMemo } from "react";
import * as THREE from "three";
import type { Land, Leader } from "../api";
import { mix } from "../format";
import { Cities, Lines, Tile, centreOf, type Proj } from "./Germany";

export type LandLayers = { regionen: boolean; bahn: boolean; autobahn: boolean; strassen: boolean; staedte: boolean };
export type LandSel = { type: "region" | "city"; id: string } | null;

const TILE_H = 0.06;

export function landProj(f: Land["frame"]): Proj {
  return (lon, lat) => {
    const l = ((((lon - f.c + 540) % 360) + 360) % 360) - 180;
    return [l * f.kx * f.s, -(lat - f.lat0) * f.s];
  };
}

/** Parteifarbe aus Wikidata, sonst eine feste Farbe aus dem Namen. */
export function leaderColor(l: Leader | null | undefined) {
  if (!l?.party) return "#3a4656";
  if (l.color && /^#[0-9a-f]{6}$/i.test(l.color)) {
    // sehr dunkle Parteifarben (Marineblau, Schwarz) auf dem dunklen Grund anheben
    const c = new THREE.Color(l.color);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    if (hsl.l < 0.38) c.setHSL(hsl.h, Math.min(hsl.s, 0.8), 0.45);
    return `#${c.getHexString()}`;
  }
  let h = 0;
  for (const ch of l.party) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `#${new THREE.Color().setHSL((h % 360) / 360, 0.55, 0.55).getHexString()}`;
}

/** Städte so ausdünnen, dass höchstens etwa 150 Säulen stehen. */
export const cityCut = (cities: Land["cities"]) => (cities.length > 150 ? cities[149].pop : 15000);

export function CountryScene({ data, layers, sel, onSelect }: { data: Land | undefined; layers: LandLayers; sel: LandSel; onSelect: (s: LandSel) => void }) {
  const P = useMemo(() => (data ? landProj(data.frame) : null), [data]);
  const borders = useMemo(() => data?.regions.flatMap((r) => r.polys.flatMap((p) => p.map((ring) => ring.flat()))) ?? [], [data]);
  if (!data || !P) return null;
  return (
    <group onPointerMissed={() => onSelect(null)}>
      {data.regions.map((r) => {
        const color = layers.regionen ? mix("#121a25", leaderColor(r.head), r.head?.party ? 0.6 : 0.35) : "#1b2a3a";
        const [cx, cz] = centreOf(r.polys, P);
        return (
          <Tile
            key={r.id}
            P={P}
            polys={r.polys}
            color={color}
            delay={Math.hypot(cx, cz) * 0.08 + Math.random() * 0.25}
            selected={sel?.type === "region" && sel.id === r.id}
            label={`${r.name}${r.head?.party ? ` · ${r.head.party}` : ""}`}
            onClick={() => onSelect({ type: "region", id: r.id })}
          />
        );
      })}
      <Lines P={P} lines={borders} color="#e8f6ff" y={TILE_H + 0.003} opacity={0.3} />
      <Lines P={P} lines={data.outline} color="#e8f6ff" y={TILE_H + 0.004} opacity={0.8} />
      {layers.strassen && <Lines P={P} lines={data.road} color="#c9d6e6" y={TILE_H + 0.006} opacity={0.3} />}
      {layers.autobahn && <Lines P={P} lines={data.motorway} color="#f4f8ff" y={TILE_H + 0.008} opacity={0.9} />}
      {layers.bahn && <Lines P={P} lines={data.rail} color="#ffb347" y={TILE_H + 0.01} opacity={0.95} />}
      {layers.staedte && data.cities.length > 0 && (
        <Cities P={P} cities={data.cities} minPop={cityCut(data.cities)} maxPop={data.cities[0].pop} labels={12} sel={sel} onSelect={onSelect} />
      )}
    </group>
  );
}
