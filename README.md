# Marktwelt

Globale Kapitalmärkte in 3D, von der Weltlage bis zur Einzelaktie. Jedes Element lässt sich drehen, anklicken und aufsprengen, um eine Ebene tiefer zu gehen.

## Ebenen

| Ansicht | Was man sieht | Ein Klick tiefer |
|---|---|---|
| **Welt** | Erde aus Lichtpunkten. Säulen: 28 Ländermärkte (Höhe = Tagesbewegung). Goldene Ringe: zehn Notenbanken (Größe = Zins). Glut: neun geopolitische Brennpunkte (Nachrichtenlage 24 h), violetter Ring: Prognosemärkte dazu. Tore: sechs Engpässe des Seehandels (Hormus, Bab al-Mandab, Suez, Malakka, Panama, Bosporus). | Markt: Performance-Säulen springen heraus, dann 3D-Chart. Notenbank: Zins, letzte Änderung, Verlauf. Brennpunkt und Engpass: Prognosemärkte, Schlagzeilen, bei Engpässen Öl oder Weizen. |
| **Stimmung** | Eigener Angst-und-Gier-Index als Tacho mit Kern | Kern sprengt sich in sechs Teilgrößen: VIX, Laufzeitstruktur VIX zu VIX3M, Hochzins-Spread, Momentum, sichere Häfen, Marktbreite |
| **Sektoren** | S&P 500 als Kugel aus elf Sektor-Schnitzen | Kern: Kugel zerfällt. Schnitz: größte Werte des Sektors als Kugeln (Größe = Börsenwert). Kugel: Einzelaktie. |
| **Termine** | Quartalszahlen der nächsten zwei Wochen als Spirale, ab 10 Mrd. USD Börsenwert | Kugel: Einzelaktie |
| **Lagekarte** | Freie Einbett-Karte von World Monitor: Konflikte, Erdbeben, Unwetter, stündlich | Ausschnitt und Ebenen im Panel |
| **Aktie** | 3D-Kerzenchart mit Volumen, 50- und 200-Tage-Linie, Kennzahlen-Würfel. Außerbörsliche Tage aus Perps oder Futures hängen blau hinterlegt hinten dran; das Panel zeigt den umgerechneten Kurs seit Schluss und eine Stundenkurve über drei Tage | Würfel: sechs Kacheln mit Trend, Performance, RSI, Volatilität, Abstand zum Hoch, Beta |

Unten läuft eine Makro-Leiste mit 15 Reihen (Zinsen, Kurve, Rohstoffe, Devisen, Indizes).

## Datenquellen

Alle ohne API-Schlüssel, mit Cache und Drossel im Server.

| Quelle | Wofür | Takt im Cache |
|---|---|---|
| Nasdaq (`api.nasdaq.com`) | Kurse, Historie und Stammdaten US-gelisteter Aktien und ETFs, Quartalszahlen-Kalender | 3 min Kurse, 30 min Historie |
| FRED (St. Louis Fed) | Makro-Reihen, Fed-Leitzins | 60 min |
| EZB Data Portal | Einlagesatz | 6 h |
| BIS (Bank für Internationalen Zahlungsausgleich) | Leitzinsen der übrigen acht Notenbanken, Tagesreihe | 6 h |
| Cboe | VIX und VIX3M für die Stimmung | 60 min |
| Polymarket (Gamma API) | Prognosemärkte zur Geopolitik, über Schlagworte den Brennpunkten zugeordnet | 15 min |
| GDELT | Nachrichten zu Brennpunkten und Engpässen; ein Abruf je 10 s, nach Sperre wachsender Rückzug bis 15 min | 60 min |
| Hyperliquid (`api.hyperliquid.xyz/info`, Börse `xyz` von trade.xyz) | Aktien-, Index- und Rohstoff-Perps rund um die Uhr (rund 120 Werte, z. B. NVDA, SP500, XYZ100, EWJ, GOLD, CL), Stundenkerzen | 1 min Kurse, 5 min Kerzen |
| Yahoo Chart (`query1.finance.yahoo.com/v8`) | CME-Futures ES, NQ, YM, RTY, GC, CL als zweiter Bezug, rund 10 min verzögert | 5 min |
| World Monitor (`/embed`) | Lagekarte als iframe, freie Stufe ohne Schlüssel | stündlich |

Ländermärkte erscheinen über US-gelistete Länder-ETFs (iShares MSCI …), also in USD. Kurse sind verzögert.

World Monitor (AGPL) liefert nur die Ideen und die eingebettete Karte. Code wird nicht übernommen, und die Daten seiner API werden nicht abgerufen: Die Gratisnutzung deckt keinen programmatischen Zugriff ab, dafür bräuchte es das Pro-Abo.

Nicht genutzt: Yahoo Finance (Rate-Limit), CNN Fear & Greed und Stooq (sperren automatische Abrufe).

## Start

```bash
npm install
npm run dev      # http://127.0.0.1:5190, API als Vite-Middleware
```

Produktiv:

```bash
npm run build
npm start        # http://127.0.0.1:8787, liefert dist/ und /api
```

## Aufbau

```
server/
  universe.ts   Märkte, Notenbanken, Brennpunkte, Sektoren, Makro-Reihen (feste Landkarte)
  sources.ts    Abruf je Quelle mit Cache und Drossel
  analytics.ts  Kennzahlen: SMA, RSI, Volatilität, Drawdown, Beta, Perzentile
  api.ts        Routen /api/world, /hotspots, /hotspot/:id, /macro, /sentiment, /sectors,
                /sector/:id, /market/:id, /stock/:symbol, /calendar, /predictions
  index.ts      Produktionsserver
src/
  three/        3D-Szenen: Globe, Sentiment, Sectors, Calendar, StockChart, common (Burst, Kamera)
  ui/           Seitenpanels, Makro-Leiste, Sparklines
  App.tsx       Navigation mit Brotkrumen und Hash-Routen (#/aktie/NVDA)
```

Keine Anlageberatung.
