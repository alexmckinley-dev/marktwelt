# Marktwelt

Globale Kapitalmärkte in 3D, von der Weltlage bis zur Einzelaktie. Jedes Element lässt sich drehen, anklicken und aufsprengen, um eine Ebene tiefer zu gehen.

## Ebenen

| Ansicht | Was man sieht | Ein Klick tiefer |
|---|---|---|
| **Welt** | Erde aus Lichtpunkten. Säulen: 28 Ländermärkte (Höhe = Tagesbewegung). Goldene Ringe: zehn Notenbanken (Größe = Zins). Glut: zehn geopolitische Brennpunkte (Nachrichtenlage 24 h). | Markt: Performance-Säulen springen heraus, dann 3D-Chart. Notenbank: Zins, letzte Änderung, Verlauf. Brennpunkt: Schlagzeilen. |
| **Stimmung** | Eigener Angst-und-Gier-Index als Tacho mit Kern | Kern sprengt sich in fünf Teilgrößen: VIX, Hochzins-Spread, Momentum, sichere Häfen, Marktbreite |
| **Sektoren** | S&P 500 als Kugel aus elf Sektor-Schnitzen | Kern: Kugel zerfällt. Schnitz: größte Werte des Sektors als Kugeln (Größe = Börsenwert). Kugel: Einzelaktie. |
| **Termine** | Quartalszahlen der nächsten zwei Wochen als Spirale, ab 10 Mrd. USD Börsenwert | Kugel: Einzelaktie |
| **Aktie** | 3D-Kerzenchart mit Volumen, 50- und 200-Tage-Linie, Kennzahlen-Würfel | Würfel: sechs Kacheln mit Trend, Performance, RSI, Volatilität, Abstand zum Hoch, Beta |

Unten läuft eine Makro-Leiste mit 15 Reihen (Zinsen, Kurve, Rohstoffe, Devisen, Indizes).

## Datenquellen

Alle ohne API-Schlüssel, mit Cache und Drossel im Server.

| Quelle | Wofür | Takt im Cache |
|---|---|---|
| Nasdaq (`api.nasdaq.com`) | Kurse, Historie und Stammdaten US-gelisteter Aktien und ETFs, Quartalszahlen-Kalender | 3 min Kurse, 30 min Historie |
| FRED (St. Louis Fed) | Makro-Reihen, Fed-Leitzins, OECD-Tagesgeldsätze | 60 min |
| EZB Data Portal | Einlagesatz | 6 h |
| GDELT | Nachrichten zu Brennpunkten, höchstens eine Anfrage je 5,5 s | 60 min |

Ländermärkte erscheinen über US-gelistete Länder-ETFs (iShares MSCI …), also in USD. Kurse sind verzögert.
Für Notenbanken außer Fed und EZB gibt es keylos nur den monatlichen Tagesgeldsatz der OECD; das Panel nennt den Stand und markiert veraltete Werte.

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
                /sector/:id, /market/:id, /stock/:symbol, /calendar
  index.ts      Produktionsserver
src/
  three/        3D-Szenen: Globe, Sentiment, Sectors, Calendar, StockChart, common (Burst, Kamera)
  ui/           Seitenpanels, Makro-Leiste, Sparklines
  App.tsx       Navigation mit Brotkrumen und Hash-Routen (#/aktie/NVDA)
```

Keine Anlageberatung.
