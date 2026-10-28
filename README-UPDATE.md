# SDN v0.23 – Navigation, Filter und Fähigkeiten

Dieses Paket ist ein Oberflächenupdate auf Basis der Produktivdateien aus v0.21 plus den v0.22-Anpassungen. **Kein neues SQL und keine Edge Functions erforderlich.**

## Installation

1. Vor der Änderung die aktuellen `index.html`, `app.js` und `styles.css` aus deinem Repository sichern (oder einen Git-Commit/Branch als Wiederherstellungspunkt anlegen).
2. Die drei gleichnamigen Dateien aus diesem ZIP in das Stammverzeichnis deines GitHub-Repositories `timan52/SDN` übernehmen. Wenn du zwischenzeitlich eigene Änderungen an diesen Dateien vorgenommen hast, diese Änderungen bitte zusammenführen statt blind überschreiben.
3. `config.js`, `backend.js`, `portrait-editor.js`, `supabase/`, Secrets, GitHub-Bilder und die Datenbank nicht verändern.
4. Änderungen auf `main` committen / pushen, GitHub Pages veröffentlichen lassen, anschließend `https://timan52.github.io/SDN/` mit `Strg + Umschalt + R` neu laden.

## Was sich geändert hat

- **Nur eine Scrollleiste:** Das Haupt-Dokument wächst jetzt mit den Kacheln. Die bisherigen eigenen Scrollcontainer für Helden und Einsätze sind entfernt. Nach dem Zurück-Pfeil wird die vorherige Position auf der Seite wiederhergestellt.
- **Heldenübersicht:** Ein sichtbares Menü **FILTER** statt der zwei nebeneinanderliegenden Bereiche Anzeige / Position. Innerhalb des Menüs bleiben beide Auswahlen kombinierbar. Die Texte heißen nun **Alle Charaktere** und **Meine Charaktere**.
- **Einsatzarchiv:** Ein sichtbares Menü **FILTER** statt Anzeige / Fallstatus. Innerhalb des Menüs können beide weiterhin kombiniert werden.
- **Fähigkeiten:** Ausschließlich **01 / SPEZIALFÄHIGKEIT** und **02 / ALLGEMEINES PROFIL** als Bereichsüberschriften, ohne die redundanten Titel. Unter der Spezialfähigkeit heißt das Feld jetzt **NACHTEIL/EINSCHRÄNKUNG/SCHWÄCHE**.
- **Aktenkopf:** Der Link **↗ CHARAKTERKANAL** steht in der Kopfinformationszeile ganz rechts, soweit er für den Charakter hinterlegt ist.

## Prüfung

- JavaScript-Syntax (`node --check`) erfolgreich.
- Lokaler Browser-Smoke-Test mit simulierten Serverdaten: Filter (auch in Kombination), Übersichtsnavigation und die beiden Fähigkeitenüberschriften funktionieren ohne Skriptfehler.
- Separater Chromium-CSS-Test mit 50 Einsatzkacheln: Der Kachelcontainer hat `overflow-y: visible`, keine eigene Scrollhöhe, und nur das Browserdokument wird länger.
- Responsive Test mit schmalem Viewport (390 px): kein horizontales Überlaufen.

**Nicht live geprüft:** GitHub Pages, dein Discord-Account und dein Supabase-Projekt. Bitte nach Installation mit deinen realen Daten kurz testen.
