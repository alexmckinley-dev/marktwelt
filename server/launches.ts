// Raketenstarts: Launch Library 2 von The Space Devs (keylos, höchstens 15 Abrufe je Stunde).
import { cached, getJson } from "./lib.ts";

const MIN = 60_000;

type LL2Launch = {
  id: string;
  name: string;
  net: string;
  net_precision?: { name: string } | null;
  window_start: string;
  status: { abbrev: string; name: string };
  launch_service_provider: { name: string; abbrev?: string } | null;
  rocket: { configuration: { name: string; full_name?: string } } | null;
  mission: { name: string; description: string | null; type: string | null; orbit: { name: string; abbrev: string } | null } | null;
  pad: {
    id: number;
    name: string;
    latitude: string | number;
    longitude: string | number;
    location: { id: number; name: string };
    country?: { alpha_3_code: string } | null;
  };
  webcast_live: boolean;
  slug: string;
};

export type Launch = {
  id: string;
  name: string;
  net: string;
  precision: string | null;
  status: string;
  statusName: string;
  provider: string | null;
  rocket: string | null;
  mission: string | null;
  missionType: string | null;
  orbit: string | null;
  pad: string;
  url: string;
};

export type LaunchSite = { id: string; name: string; country: string | null; lat: number; lon: number; launches: Launch[] };

export function launches(): Promise<{ sites: LaunchSite[]; total: number; asOf: string }> {
  return cached("ll2:upcoming", 30 * MIN, async () => {
    const d = await getJson<{ results: LL2Launch[] }>("https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=60&mode=normal", 25000);
    const sites = new Map<string, LaunchSite>();
    for (const l of d.results) {
      const loc = l.pad.location;
      const key = String(loc.id);
      const site =
        sites.get(key) ??
        ({ id: key, name: loc.name, country: l.pad.country?.alpha_3_code ?? null, lat: +l.pad.latitude, lon: +l.pad.longitude, launches: [] } as LaunchSite);
      site.launches.push({
        id: l.id,
        name: l.name,
        net: l.net,
        precision: l.net_precision?.name ?? null,
        status: l.status.abbrev,
        statusName: l.status.name,
        provider: l.launch_service_provider?.name ?? null,
        rocket: l.rocket?.configuration.full_name || l.rocket?.configuration.name || null,
        mission: l.mission?.description ?? null,
        missionType: l.mission?.type ?? null,
        orbit: l.mission?.orbit?.name ?? null,
        pad: l.pad.name,
        url: `https://www.spacelaunchschedule.com/launch/${l.slug}/`,
      });
      sites.set(key, site);
    }
    return { sites: [...sites.values()].filter((s) => Number.isFinite(s.lat)), total: d.results.length, asOf: new Date().toISOString() };
  });
}
