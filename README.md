# Tischtennis Auslosung

Eine installierbare, offlinefähige PWA für faire Einzel- und Doppel-Auslosungen im Tischtennisverein. Die App arbeitet ohne Konto, Tracking oder Server: Mitglieder, Anwesenheit und Trainingsverlauf bleiben ausschließlich in der lokalen IndexedDB des jeweiligen Geräts.

## Funktionen

- 21 Stammmitglieder beim allerersten Start; danach vollständig frei bearbeitbar
- Sofort gespeicherte Anwesenheit, Suche sowie Sammelaktionen
- Faire Einzel-Auslosung mit rotierenden Gegnern und Pausen
- Doppel-Auslosung mit maximal vielen Doppeln, zusätzlichen Einzeln und fairen Pausen
- Vorschau, erneutes Auslosen und verbindliche Bestätigung jeder Runde
- Archivierte Trainings mit vollständigem Rundenverlauf
- JSON-Sicherung und validierte Wiederherstellung
- Installierbare PWA mit Service Worker und Offline-Unterstützung
- Dynamischer QR-Code zur aktuell geöffneten App-Adresse

## Technik und Projektstruktur

- React, TypeScript und Vite
- Dexie.js/IndexedDB für die lokale, versionierte Datenbank
- `vite-plugin-pwa`/Workbox für Manifest, Service Worker und Offline-Cache
- Vitest und `fake-indexeddb` für die automatisierten Tests

Wichtige Dateien:

- `src/App.tsx` – Oberfläche und alle Benutzerabläufe
- `src/db.ts` – Datenbank, einmalige Initialisierung sowie Import/Export
- `src/draw.ts` – testbare faire Auslosungslogik
- `src/styles.css` – mobile-first Gestaltung
- `src/*.test.ts` – Datenbank- und Auslosungstests
- `vite.config.ts` – Build-, Test- und PWA-Konfiguration

## Lokal starten

Voraussetzung ist Node.js 20 oder neuer.

```bash
npm install
npm run dev
```

Vite zeigt anschließend eine lokale Adresse an. Für einen Test auf dem Smartphone müssen Computer und Smartphone im selben WLAN sein. Starte dann bei Bedarf mit:

```bash
npm run dev -- --host
```

Öffne die angezeigte Netzwerkadresse auf dem Smartphone. Die lokale Entwicklung über eine reine HTTP-Netzwerkadresse kann PWA-Funktionen einschränken; für den vollständigen Installations- und Offline-Test empfiehlt sich die veröffentlichte HTTPS-Adresse.

## Tests und Produktions-Build

```bash
npm test
npm run typecheck
npm run build
npm run preview
```

Der fertige statische Build liegt in `dist/`. Die Tests prüfen unter anderem Teilnehmerzahlen von 1 bis 21, die Sonderfälle mit 6, 7, 10 und 14 Spielern, eindeutige Rundenzuordnungen, faire Pausen-/Einzelrotation, Datenpersistenz, einmalige Initialisierung und JSON-Import/-Export.

## Kostenlos auf Cloudflare Pages veröffentlichen

### Variante A: Über ein Git-Repository

1. Dieses Projekt in ein GitHub- oder GitLab-Repository hochladen.
2. Im Cloudflare-Dashboard **Workers & Pages → Create → Pages → Connect to Git** öffnen.
3. Das Repository auswählen.
4. Als Framework-Preset **Vite** wählen.
5. Build-Befehl: `npm run build`
6. Ausgabeordner: `dist`
7. Speichern und die erste Bereitstellung abwarten.

Jeder weitere Push löst automatisch einen neuen Build aus. Die lokale IndexedDB der Nutzer wird durch App-Updates nicht zurückgesetzt.

### Variante B: Direkter Upload

1. Lokal `npm install` und `npm run build` ausführen.
2. Im Cloudflare-Dashboard ein Pages-Projekt mit direktem Upload anlegen.
3. Den Inhalt des Ordners `dist` hochladen.

Für regelmäßige Updates ist die Git-Variante einfacher.

## Installation auf dem Smartphone

- **iPhone/iPad:** Die veröffentlichte HTTPS-Adresse in Safari öffnen, auf **Teilen** tippen und **Zum Home-Bildschirm** wählen.
- **Android:** Die Adresse in Chrome öffnen und im Browser-Menü **App installieren** bzw. **Zum Startbildschirm hinzufügen** wählen.

Nach dem ersten vollständigen Laden funktioniert die App auch offline. Jedes Gerät besitzt eine eigene Datenbank. Für den Wechsel auf ein anderes Smartphone zuerst unter **Einstellungen → JSON exportieren** sichern und die Datei auf dem Zielgerät importieren.

## Mit Vereinsmitgliedern teilen

Nach der Veröffentlichung kann die Cloudflare-Adresse direkt versendet werden. Unter **Einstellungen** zeigt die App automatisch einen QR-Code für ihre aktuelle Adresse; dieser kann ausgedruckt und im Vereinsheim aufgehängt werden. Für eine dauerhafte Nutzung sollte später in Cloudflare optional eine eigene Domain verbunden werden, damit der QR-Code unverändert bleibt.

## Datenschutz und Einschränkungen

Es werden keine Daten übertragen. Wer Browserdaten oder App-Daten löscht, löscht damit auch die lokale Vereinsdatenbank. Regelmäßige JSON-Sicherungen sind deshalb empfehlenswert. Eine Synchronisierung zwischen mehreren Smartphones ist in dieser ersten Version bewusst nicht enthalten.
