# SDN v0.9 – Getrennte Übersichten und Detailansichten

Dieses Paket ist ein **Frontend-Update für die bestehende SDN v0.8** unter `https://github.com/timan52/SDN`.

## Enthaltene Dateien

- `index.html` – entfernt die alte Personalliste neben der Akte; zeigt keine doppelten Übersichtstitel; korrigiert das linke SDN-Logo
- `app.js` – eigene Ansichten für Heldenverzeichnis, Personalakte, Einsatzübersicht und Einsatzakte; Zurück-Navigation, Freigabe nur im Bericht
- `styles.css` – einzeln scrollbare Kachelbereiche, vollbreite Akten, unveränderte 4:5-Portraits, Desktop- und Mobile-Layout

Die Konfigurationsdatei `config.js`, die Authentifizierung in `backend.js`, `portrait-editor.js`, deine Supabase-Funktionen, Datenbank und bereits genehmigten Akten bleiben unverändert.

## Installation in dein bereits funktionierendes Projekt

1. Mache eine Sicherung deiner bisherigen `index.html`, `app.js` und `styles.css` (z. B. als Git-Commit oder Kopien auf dem PC).
2. Entpacke das ZIP. Kopiere die drei genannten Dateien in den **Stammordner** deines bestehenden Repositories, also dorthin, wo deine aktuelle `config.js` liegt. Ersetze die gleichnamigen Dateien.
3. **Nicht** `config.js`, `.env`, `backend.js` oder Dateien in `supabase/` durch etwas aus einem alten Paket ersetzen.
4. Committe und pushe die drei geänderten Dateien auf den Branch `main` (z. B. über GitHub Desktop).
5. Prüfe unter GitHub → Actions/Settings → Pages die erfolgreiche Bereitstellung.
6. Öffne `https://timan52.github.io/SDN/` und lade mit `Strg + Umschalt + R` neu.

**Kein neues SQL-Skript, kein Supabase-CLI-Befehl und kein erneutes Deployen von Edge Functions erforderlich.** Das Datenbankschema aus v0.8 bleibt bestehen.

## So soll die Navigation funktionieren

- Nach Anmeldung → **Personaldatenbank** mit der Unterzeile „Übersicht aller Personalakten des SDN“.
- Ein Heldenportrait anklicken → nur die **Personalakte**, ohne Kacheln, Seitenauswahl und große Übersichtsüberschrift. „← ALLE HELDEN“ öffnet wieder die Übersicht.
- Linke Navigation, erstes Symbol → Personaldatenbank. Zweites Symbol → **Einsatzprotokolle** mit „Übersicht aller dokumentierten Einsätze des SDN“.
- Einen Einsatz öffnen → nur die **Einsatzakte** mit „← ZUR EINSATZÜBERSICHT“. Die SL genehmigt oder lehnt den Bericht ausschließlich hier ab.
- Beim Öffnen eines verlinkten Einsatzes aus einer Personalakte wird ebenfalls direkt dessen Detailansicht angezeigt. Ein verlinkter Held im Einsatzbericht führt direkt zur Personalakte.
- Beide Kachelbereiche besitzen eine eigene Scrollfläche, während Suche, Filter und Erstellen-Button erreichbar bleiben.
- Das Logo oben links lautet **SDN**, nicht `S◆N`.

## Testhinweise

Die Frontend-Funktionen wurden mit einer simulierten Discord-/Supabase-Sitzung in Chromium auf Desktop und Mobilgerät geprüft. In einem zusätzlichen UI-Stresstest wurden 204 Heldendatensätze und 302 Einsätze gerendert und durchsucht. Die Berechtigungslogik und Datenbanktabellen wurden **nicht** geändert. Die tatsächliche Verbindung zu deinem laufenden Supabase-Projekt kann nur nach dem Deployment überprüft werden.

### Skalierung später

Bei weit über 1.000 Datensätzen **pro Supabase-Tabelle** sollte das derzeitige `backend.js` auf serverseitige Seitennavigation/Batch-Abfragen umgestellt werden, da Supabase-Abfragen standardmäßig eine Zeilenobergrenze haben können. Die neue scrollbare Oberfläche löst die Darstellung vieler Kacheln, nicht diese mögliche Backend-Grenze.
