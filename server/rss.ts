// RSS-Feeds lesen: Google News (Suche, deutsch) und frei verfügbare Feeds positiver Nachrichten.
import { cached, getText } from "./lib.ts";

const MIN = 60_000;

export type NewsItem = { title: string; url: string; source: string; time: string | null; text?: string };

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, n) => ENT[n] ?? m);
const strip = (s: string) => decode(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (item: string, t: string) => item.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "";

export function parseRss(xml: string, fallbackSource = ""): NewsItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const pub = tag(it, "pubDate");
    return {
      title: strip(tag(it, "title")),
      url: decode(tag(it, "link")).trim(),
      source: strip(tag(it, "source")) || fallbackSource,
      time: pub ? new Date(pub).toISOString() : null,
      text: strip(tag(it, "description")).slice(0, 400),
    };
  });
}

/** Google-News-Suche, deutschsprachige Ausgabe. Der Quellname steht am Ende des Titels. */
export function gnews(query: string, max = 20): Promise<NewsItem[]> {
  return cached(`gn:${query}`, 15 * MIN, async () => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=de&gl=DE&ceid=DE:de`;
    const items = parseRss(await getText(url));
    return items.slice(0, max).map((i) => ({
      title: i.source && i.title.endsWith(` - ${i.source}`) ? i.title.slice(0, -i.source.length - 3) : i.title,
      url: i.url,
      source: i.source,
      time: i.time,
    }));
  });
}

export const TOPICS: Record<string, { name: string; query: string }> = {
  ereignisse: { name: "Erdbeben und Katastrophen", query: "Erdbeben OR Unwetter OR Überschwemmung OR Wirbelsturm OR Vulkanausbruch OR Waldbrand when:2d" },
  maerkte: { name: "Märkte", query: 'Börse OR Aktienmärkte OR DAX OR "Wall Street" OR Anleihen when:1d' },
  notenbanken: { name: "Notenbanken", query: 'Notenbank OR Leitzins OR EZB OR "Federal Reserve" OR Zinsentscheid when:3d' },
  raumfahrt: { name: "Raumfahrt", query: "Raketenstart OR Raumfahrt OR SpaceX OR ESA when:3d" },
};

// Redaktionen, die nur positive Nachrichten bringen (englisch, frei per RSS).
const POSITIVE_FEEDS = [
  { url: "https://www.goodnewsnetwork.org/feed/", name: "Good News Network" },
  { url: "https://www.positive.news/feed/", name: "Positive News" },
  { url: "https://reasonstobecheerful.world/feed/", name: "Reasons to be Cheerful" },
  { url: "https://www.goodgoodgood.co/articles/rss.xml", name: "Good Good Good" },
];

export function positiveFeeds(): Promise<{ items: NewsItem[]; errors: string[] }> {
  return cached("pos:feeds", 60 * MIN, async () => {
    const res = await Promise.allSettled(POSITIVE_FEEDS.map(async (f) => parseRss(await getText(f.url, 15000), f.name).map((i) => ({ ...i, source: f.name }))));
    const errors: string[] = [];
    const items: NewsItem[] = [];
    res.forEach((r, i) => (r.status === "fulfilled" ? items.push(...r.value) : errors.push(`${POSITIVE_FEEDS[i].name}: ${(r.reason as Error).message.slice(0, 40)}`)));
    // nur die letzten 14 Tage
    const cut = Date.now() - 14 * 86400_000;
    return { items: items.filter((i) => !i.time || Date.parse(i.time) > cut), errors };
  });
}
