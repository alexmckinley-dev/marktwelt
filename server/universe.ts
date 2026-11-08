// Feste Landkarte des Tools: welche Märkte, Notenbanken, Brennpunkte und Sektoren es zeigt.
// Kursdaten kommen live; hier stehen nur Namen, Orte und Symbole.

export type Market = {
  id: string;
  name: string;
  region: "Amerika" | "Europa" | "Asien-Pazifik" | "Schwellenländer";
  etf: string; // US-gelistetes Länder-ETF, Kurse in USD
  index: string; // Name des Leitindex, den das ETF abbildet
  lat: number;
  lon: number;
};

export const MARKETS: Market[] = [
  { id: "us", name: "USA", region: "Amerika", etf: "SPY", index: "S&P 500", lat: 40.7, lon: -74.0 },
  { id: "us-tech", name: "USA Tech", region: "Amerika", etf: "QQQ", index: "Nasdaq 100", lat: 37.4, lon: -122.1 },
  { id: "ca", name: "Kanada", region: "Amerika", etf: "EWC", index: "MSCI Kanada", lat: 43.65, lon: -79.38 },
  { id: "mx", name: "Mexiko", region: "Schwellenländer", etf: "EWW", index: "MSCI Mexiko", lat: 19.43, lon: -99.13 },
  { id: "br", name: "Brasilien", region: "Schwellenländer", etf: "EWZ", index: "MSCI Brasilien", lat: -23.55, lon: -46.63 },
  { id: "ar", name: "Argentinien", region: "Schwellenländer", etf: "ARGT", index: "MSCI Argentinien", lat: -34.6, lon: -58.38 },
  { id: "uk", name: "Großbritannien", region: "Europa", etf: "EWU", index: "MSCI UK", lat: 51.51, lon: -0.09 },
  { id: "de", name: "Deutschland", region: "Europa", etf: "EWG", index: "MSCI Deutschland", lat: 50.11, lon: 8.68 },
  { id: "fr", name: "Frankreich", region: "Europa", etf: "EWQ", index: "MSCI Frankreich", lat: 48.86, lon: 2.35 },
  { id: "ch", name: "Schweiz", region: "Europa", etf: "EWL", index: "MSCI Schweiz", lat: 47.37, lon: 8.54 },
  { id: "it", name: "Italien", region: "Europa", etf: "EWI", index: "MSCI Italien", lat: 45.46, lon: 9.19 },
  { id: "es", name: "Spanien", region: "Europa", etf: "EWP", index: "MSCI Spanien", lat: 40.42, lon: -3.7 },
  { id: "nl", name: "Niederlande", region: "Europa", etf: "EWN", index: "MSCI Niederlande", lat: 52.37, lon: 4.9 },
  { id: "se", name: "Schweden", region: "Europa", etf: "EWD", index: "MSCI Schweden", lat: 59.33, lon: 18.07 },
  { id: "pl", name: "Polen", region: "Schwellenländer", etf: "EPOL", index: "MSCI Polen", lat: 52.23, lon: 21.01 },
  { id: "tr", name: "Türkei", region: "Schwellenländer", etf: "TUR", index: "MSCI Türkei", lat: 41.01, lon: 28.98 },
  { id: "sa", name: "Saudi-Arabien", region: "Schwellenländer", etf: "KSA", index: "MSCI Saudi-Arabien", lat: 24.71, lon: 46.68 },
  { id: "il", name: "Israel", region: "Schwellenländer", etf: "EIS", index: "MSCI Israel", lat: 32.09, lon: 34.78 },
  { id: "za", name: "Südafrika", region: "Schwellenländer", etf: "EZA", index: "MSCI Südafrika", lat: -26.2, lon: 28.05 },
  { id: "in", name: "Indien", region: "Schwellenländer", etf: "INDA", index: "MSCI Indien", lat: 19.08, lon: 72.88 },
  { id: "cn", name: "China", region: "Schwellenländer", etf: "MCHI", index: "MSCI China", lat: 31.23, lon: 121.47 },
  { id: "hk", name: "Hongkong", region: "Asien-Pazifik", etf: "EWH", index: "MSCI Hongkong", lat: 22.28, lon: 114.16 },
  { id: "tw", name: "Taiwan", region: "Schwellenländer", etf: "EWT", index: "MSCI Taiwan", lat: 25.03, lon: 121.56 },
  { id: "kr", name: "Südkorea", region: "Schwellenländer", etf: "EWY", index: "MSCI Südkorea", lat: 37.57, lon: 126.98 },
  { id: "jp", name: "Japan", region: "Asien-Pazifik", etf: "EWJ", index: "MSCI Japan", lat: 35.68, lon: 139.69 },
  { id: "sg", name: "Singapur", region: "Asien-Pazifik", etf: "EWS", index: "MSCI Singapur", lat: 1.29, lon: 103.85 },
  { id: "id", name: "Indonesien", region: "Schwellenländer", etf: "EIDO", index: "MSCI Indonesien", lat: -6.2, lon: 106.85 },
  { id: "au", name: "Australien", region: "Asien-Pazifik", etf: "EWA", index: "MSCI Australien", lat: -33.87, lon: 151.21 },
];

export type CentralBank = {
  id: string;
  name: string;
  short: string;
  lat: number;
  lon: number;
  source:
    | { kind: "fred"; series: string; label: string }
    | { kind: "ecb"; key: string; label: string }
    | { kind: "bis"; country: string; label: string };
};

// Fed und EZB kommen direkt von der Quelle. Die übrigen Leitzinsen liefert die BIS
// (Bank für Internationalen Zahlungsausgleich) als Tagesreihe, keylos.
export const CENTRAL_BANKS: CentralBank[] = [
  { id: "fed", name: "Federal Reserve", short: "Fed", lat: 38.89, lon: -77.04, source: { kind: "fred", series: "DFEDTARU", label: "Leitzins, Obergrenze" } },
  { id: "ezb", name: "Europäische Zentralbank", short: "EZB", lat: 50.11, lon: 8.7, source: { kind: "ecb", key: "FM/B.U2.EUR.4F.KR.DFR.LEV", label: "Einlagesatz" } },
  { id: "boe", name: "Bank of England", short: "BoE", lat: 51.51, lon: -0.09, source: { kind: "bis", country: "GB", label: "Leitzins (BIS)" } },
  { id: "boj", name: "Bank of Japan", short: "BoJ", lat: 35.69, lon: 139.77, source: { kind: "bis", country: "JP", label: "Leitzins (BIS)" } },
  { id: "boc", name: "Bank of Canada", short: "BoC", lat: 45.42, lon: -75.7, source: { kind: "bis", country: "CA", label: "Leitzins (BIS)" } },
  { id: "rba", name: "Reserve Bank of Australia", short: "RBA", lat: -33.87, lon: 151.21, source: { kind: "bis", country: "AU", label: "Leitzins (BIS)" } },
  { id: "rbi", name: "Reserve Bank of India", short: "RBI", lat: 18.93, lon: 72.83, source: { kind: "bis", country: "IN", label: "Leitzins (BIS)" } },
  { id: "bcb", name: "Banco Central do Brasil", short: "BCB", lat: -15.79, lon: -47.88, source: { kind: "bis", country: "BR", label: "Leitzins (BIS)" } },
  { id: "snb", name: "Schweizerische Nationalbank", short: "SNB", lat: 46.95, lon: 7.44, source: { kind: "bis", country: "CH", label: "Leitzins (BIS)" } },
  { id: "pboc", name: "People's Bank of China", short: "PBoC", lat: 39.9, lon: 116.4, source: { kind: "bis", country: "CN", label: "Leitzins (BIS)" } },
];

export type Hotspot = {
  id: string;
  name: string;
  kind: "brennpunkt" | "engpass";
  lat: number;
  lon: number;
  query: string; // GDELT-Suche, Nachrichten der letzten 24 Stunden, englischsprachig
  match: RegExp; // ordnet Prognosemärkte (Polymarket) über den Titel zu
  note?: string;
  assets?: { symbol: string; name: string }[];
};

export const HOTSPOTS: Hotspot[] = [
  { id: "ukraine", name: "Russland–Ukraine", kind: "brennpunkt", lat: 49.0, lon: 32.0, query: '(Ukraine OR Russia) (war OR offensive OR ceasefire OR sanctions)', match: /ukrain|russia|putin|zelensk|donbas|crimea|kyiv/i },
  { id: "nahost", name: "Nahost", kind: "brennpunkt", lat: 31.5, lon: 35.0, query: '(Israel OR Gaza OR Iran OR Lebanon) (strike OR war OR ceasefire)', match: /israel|gaza|iran|leban|hezbollah|netanyahu|hamas|syria|khamenei/i },
  { id: "taiwan", name: "Taiwanstraße", kind: "brennpunkt", lat: 24.0, lon: 120.0, query: '(Taiwan OR "South China Sea") (China OR military OR drills)', match: /taiwan|south china sea/i },
  { id: "handel", name: "Handelsstreit USA–China", kind: "brennpunkt", lat: 35.0, lon: -100.0, query: '(tariffs OR "export controls" OR "trade war") (China OR "United States")', match: /tariff|trade deal|trade war|export control/i },
  { id: "korea", name: "Koreanische Halbinsel", kind: "brennpunkt", lat: 39.0, lon: 126.0, query: '("North Korea" OR Pyongyang) (missile OR nuclear)', match: /korea|kim jong/i },
  { id: "eu-politik", name: "EU-Politik", kind: "brennpunkt", lat: 50.85, lon: 4.35, query: '("European Union" OR Brussels OR "European Commission") (budget OR election OR crisis)', match: /\beu\b|european|eurozone|france|germany|macron|merz/i },
  { id: "opec", name: "Öl und OPEC", kind: "brennpunkt", lat: 24.5, lon: 54.4, query: '(OPEC OR "oil price" OR "crude oil") (supply OR output OR cut)', match: /opec|oil price|crude|brent|\bwti\b/i },
  { id: "lateinamerika", name: "Lateinamerika", kind: "brennpunkt", lat: -15.0, lon: -60.0, query: '(Argentina OR Brazil OR Venezuela OR Mexico) (election OR default OR protest OR crisis)', match: /venezuela|maduro|brazil|lula|argentin|milei|mexico|colombia|cuba/i },
  { id: "sahel", name: "Afrika und Sahel", kind: "brennpunkt", lat: 14.0, lon: 2.0, query: '(Sahel OR Sudan OR Congo OR Nigeria) (coup OR conflict OR crisis)', match: /sudan|sahel|\bmali\b|burkina|congo|nigeria|ethiopia|somalia/i },

  // Engpässe des Seehandels. Idee aus World Monitor, Daten hier nur aus GDELT und Polymarket.
  { id: "hormus", name: "Straße von Hormus", kind: "engpass", lat: 26.57, lon: 56.25, query: '("Strait of Hormuz" OR Hormuz) (tanker OR shipping OR navy OR blockade OR oil)', match: /hormuz|blockade|kharg/i, note: "Ausgang des Persischen Golfs, wichtigster Engpass für Öl und Flüssiggas.", assets: [{ symbol: "USO", name: "Öl (WTI)" }] },
  { id: "bab-al-mandab", name: "Bab al-Mandab", kind: "engpass", lat: 12.6, lon: 43.4, query: '("Bab el-Mandeb" OR "Red Sea" OR Houthi) (ship OR shipping OR attack OR vessel)', match: /houthi|red sea|mandeb|yemen/i, note: "Südeingang des Roten Meers, Seeweg zwischen Asien und dem Suezkanal.", assets: [{ symbol: "USO", name: "Öl (WTI)" }] },
  { id: "suez", name: "Suezkanal", kind: "engpass", lat: 30.45, lon: 32.35, query: '("Suez Canal") (shipping OR transit OR traffic OR vessels)', match: /suez|egypt/i, note: "Kürzester Seeweg zwischen Asien und Europa. Die Ausweichroute führt um das Kap der Guten Hoffnung." },
  { id: "malakka", name: "Straße von Malakka", kind: "engpass", lat: 2.5, lon: 101.0, query: '("Strait of Malacca" OR "Malacca Strait" OR "Singapore Strait") (shipping OR tanker OR piracy OR vessel)', match: /malacca|singapore strait/i, note: "Hauptweg zwischen Indischem Ozean und Pazifik, vor allem für Öl nach China, Japan und Korea.", assets: [{ symbol: "USO", name: "Öl (WTI)" }] },
  { id: "panama", name: "Panamakanal", kind: "engpass", lat: 9.08, lon: -79.68, query: '("Panama Canal") (drought OR transit OR shipping OR traffic)', match: /panama/i, note: "Verbindet Atlantik und Pazifik. Der Wasserstand begrenzt die Zahl der Durchfahrten." },
  { id: "bosporus", name: "Bosporus", kind: "engpass", lat: 41.25, lon: 29.1, query: '(Bosphorus OR "Turkish Straits" OR Dardanelles) (tanker OR shipping OR vessel OR transit)', match: /bosphorus|turkish strait|black sea/i, note: "Einziger Ausgang des Schwarzen Meers, Weg für Getreide und Öl aus Russland und der Ukraine.", assets: [{ symbol: "WEAT", name: "Weizen" }, { symbol: "USO", name: "Öl (WTI)" }] },
];

export type Sector = { id: string; name: string; etf: string; members: string[] };

// Sektoren des S&P 500 über die SPDR-Sektor-ETFs; die Mitglieder sind die größten Werte je Sektor.
export const SECTORS: Sector[] = [
  { id: "tech", name: "Technologie", etf: "XLK", members: ["AAPL", "MSFT", "NVDA", "AVGO", "ORCL", "CRM", "AMD", "ADBE"] },
  { id: "comm", name: "Kommunikation", etf: "XLC", members: ["META", "GOOGL", "NFLX", "TMUS", "DIS", "VZ", "T"] },
  { id: "disc", name: "Zyklischer Konsum", etf: "XLY", members: ["AMZN", "TSLA", "HD", "MCD", "BKNG", "LOW", "NKE"] },
  { id: "fin", name: "Finanzen", etf: "XLF", members: ["BRK.B", "JPM", "V", "MA", "BAC", "WFC", "GS"] },
  { id: "health", name: "Gesundheit", etf: "XLV", members: ["LLY", "UNH", "JNJ", "ABBV", "MRK", "TMO", "ISRG"] },
  { id: "ind", name: "Industrie", etf: "XLI", members: ["GE", "CAT", "RTX", "UBER", "HON", "UNP", "BA"] },
  { id: "staples", name: "Basiskonsum", etf: "XLP", members: ["COST", "WMT", "PG", "KO", "PEP", "PM"] },
  { id: "energy", name: "Energie", etf: "XLE", members: ["XOM", "CVX", "COP", "EOG", "SLB", "PSX"] },
  { id: "util", name: "Versorger", etf: "XLU", members: ["NEE", "SO", "DUK", "CEG", "AEP"] },
  { id: "realestate", name: "Immobilien", etf: "XLRE", members: ["PLD", "AMT", "EQIX", "WELL", "SPG"] },
  { id: "materials", name: "Grundstoffe", etf: "XLB", members: ["LIN", "SHW", "APD", "ECL", "FCX", "NEM"] },
];

// Makro-Reihen von FRED (keylos als CSV).
export const MACRO_SERIES = [
  { id: "VIXCLS", name: "VIX", unit: "Punkte", group: "Stimmung" },
  { id: "BAMLH0A0HYM2", name: "Hochzins-Spread USA", unit: "%", group: "Stimmung" },
  { id: "DGS10", name: "US-Rendite 10 J.", unit: "%", group: "Zinsen" },
  { id: "DGS2", name: "US-Rendite 2 J.", unit: "%", group: "Zinsen" },
  { id: "T10Y2Y", name: "Zinskurve 10J–2J", unit: "%-Pkt.", group: "Zinsen" },
  { id: "DFII10", name: "US-Realzins 10 J.", unit: "%", group: "Zinsen" },
  { id: "DCOILBRENTEU", name: "Brent", unit: "USD", group: "Rohstoffe" },
  { id: "DHHNGSP", name: "Erdgas Henry Hub", unit: "USD", group: "Rohstoffe" },
  { id: "DEXUSEU", name: "EUR/USD", unit: "USD", group: "Devisen" },
  { id: "DEXJPUS", name: "USD/JPY", unit: "JPY", group: "Devisen" },
  { id: "DEXCHUS", name: "USD/CNY", unit: "CNY", group: "Devisen" },
  { id: "DTWEXBGS", name: "Dollar-Index (breit)", unit: "Index", group: "Devisen" },
  { id: "SP500", name: "S&P 500", unit: "Punkte", group: "Indizes" },
  { id: "NASDAQCOM", name: "Nasdaq Composite", unit: "Punkte", group: "Indizes" },
  { id: "NIKKEI225", name: "Nikkei 225", unit: "Punkte", group: "Indizes" },
] as const;
