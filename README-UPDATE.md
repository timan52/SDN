# SDN v0.14 – Positionsfarben, Filter und Dispatcher

Dieses Update setzt **SDN v0.13** voraus. Es aktualisiert die Website und zwei PostgreSQL-Funktionen, nicht die Discord-Application und nicht die Supabase-Edge-Functions.

## Änderungen

1. **Heldenverzeichnis:** Position auf jeder Heldenkachel sichtbar. Farbcodierung: Superheld Rot, Dispatcher Orange, Teamleiter Gelb, Manager Grün, Standortleitung Violett, Techniker Blau, Arzt Indigo. Ein Positionsfilter und die zusätzliche Sortierung nach Position (A–Z/Z–A) sind verfügbar. Die bisherigen Filter und Datums-Sortierungen bleiben erhalten.
2. **Einsatzkacheln:** Die kurze **Ausgangslage** entfällt vollständig. Bei beteiligten Charakteren stehen nur die Namen ohne das Präfix „HELDEN:“. Ansonsten bleiben Fallstatus, Kunde, Einsatzdaten und etwaige Kundensterne sichtbar.
3. **Einsatzformular:** Unter „Beteiligte Helden“ gibt es eine **optionale, separate Dispatcher-Auswahl**. Dort sind ausschließlich freigegebene Charaktere mit der Position **Dispatcher** wählbar. Ein ausgewählter Dispatcher wird in der Einsatzdetailansicht namentlich verlinkt und sieht nach Freigabe den Bericht auch im eigenen Einsatzreiter.
4. **Löschen:** Wird eine Dispatcher-Personalakte gelöscht, entfernt die Datenbank diese Zuordnung auch aus allen bestehenden Berichten. Die Berichte selbst bleiben erhalten.

## Installation – in dieser Reihenfolge

### 1. Sicherheitskopie erstellen

Vor dem SQL-Update die Tabellen `sdn_reports` und `sdn_characters` aus Supabase exportieren und den letzten funktionsfähigen GitHub-Commit sichern.

### 2. SQL in Supabase ausführen

Unter **Supabase → SQL Editor** den gesamten INHALT der Datei

`supabase/migrations/202610280006_dispatchers.sql`

kopieren (nicht bloß den Dateipfad). Mit **Run** ausführen. Erwartete Meldung: `Success. No rows returned`.

Das Skript ersetzt die Funktionen `sdn_submit_report` und `sdn_delete_character`, ohne alte Berichte oder Personalakten zu löschen. Es ist für die bereits installierte Version v0.13 gedacht. **Ältere SQL-Migrationen danach nicht erneut ausführen**, da sie diese neuen Funktionen sonst überschreiben könnten.

### 3. Website auf GitHub aktualisieren

In `https://github.com/timan52/SDN` genau diese drei Dateien im Stammverzeichnis ersetzen:

- `index.html`
- `app.js`
- `styles.css`

Anschließend auf `main` committen und pushen. **Unverändert lassen**: `config.js`, `backend.js`, `portrait-editor.js`, `.env`, Supabase-Secrets, Discord- und GitHub-Token, Portraitdateien, bestehende Edge Functions.

### 4. Website aktualisieren

`https://timan52.github.io/SDN/` öffnen und `Strg + Umschalt + R` drücken. Links steht nun `v0.14`.

## Testfälle

1. **Heldenverzeichnis:** Positionen auswählen; es erscheinen nur entsprechende Charaktere. „Position (A–Z)“ und „Position (Z–A)“ sortieren die Kacheln um. Alle sieben Positionen haben eigene Akzentfarben. Portraitbilder bleiben im 4:5-Format.
2. **Einsatzübersicht:** Auf der Kachel stehen nur die beteiligten Heldennamen; die Ausgangslage fehlt. Die großen Statusstempel und optionalen Kundensterne bleiben erhalten.
3. **Neuer Einsatz:** Erstelle/freigebe zunächst einen Testcharakter mit Position `Dispatcher` (falls noch keiner existiert). Dieser muss im neuen Dropdown erscheinen, Charaktere mit anderen Positionen dürfen dort nicht erscheinen.
4. **Einsatz einreichen:** Testbericht mit einem Helden und einem Dispatcher einreichen. In der Detailansicht beide Zuordnungen kontrollieren. Der Bericht bleibt bis zur SL-Freigabe aus der verknüpften Akte ausgeblendet; danach soll er bei Held **und** Dispatcher auftauchen.
5. **SL-Löschtest:** Einen **eigenen Test-Dispatcher** löschen und überprüfen, dass der Einsatzbericht weiterhin existiert, aber keine Dispatcher-Zuordnung mehr zeigt. Nicht mit echten RP-Daten testen.
6. **Normale Spieler:** Positionsfilter, Kacheln und eigene Einsatzzuweisungen prüfen; Rechte auf Tickets, Freigaben und Löschungen dürfen sich nicht verändert haben.

## Technische Hinweise

- `dispatcherId` wird innerhalb des existierenden JSONB-Einsatzberichts gespeichert; dafür ist keine zusätzliche Tabellenspalte erforderlich.
- Die Datenbank prüft bei der Einreichung serverseitig, dass diese ID zu einer **freigegebenen** Personalakte mit Position `Dispatcher` gehört. Ein manipuliertes Browserformular kann die Einschränkung nicht umgehen.
- Bestehende Berichte ohne Dispatcher funktionieren unverändert.
- Die Position `Standortleitung` wird entsprechend dem existierenden Dropdown verwendet und violett dargestellt.
- JavaScript-Syntax und die Oberfläche wurden lokal mit simulierten Sitzungen getestet, auch auf einem schmalen Bildschirm. **Die SQL-Funktionen wurden nicht gegen deine echte Supabase-Datenbank ausgeführt.**
