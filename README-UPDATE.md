# SDN v0.27 – Notruf-Erstellung und Dispatcher-Fix

**Update für die bereits installierte v0.26.** Kein neues Projekt erstellen und keine alten SQL-Migrationen erneut ausführen.

## Was sich ändert

### Beim Erstellen eines Einsatzes

Sichtbar und auszufüllen:

- Einsatzbezeichnung
- Einsatzlevel E–S
- Kunde
- Einsatzort
- Ausgangslage
- **Dispatcher** (aus genehmigten Charakteren mit Position `Dispatcher`)
- Anmerkung zum Antrag (freiwillig)

Automatisch festgelegt und nicht veränderbar:

- Abschluss/Ergebnis = **Offen**
- Einsatzbeginn = aktuelles Datum in der Zeitzone **Europe/Berlin**, vom **Server** festgelegt
- Einsatzende = leer

**Erst nach Freigabe des neuen Einsatzes** können bei einem Änderungsantrag Link zum RP, beteiligte Helden, Einsatzverlauf, zivile Infrastruktur, Schadensbericht, Zusatzvermerke, Kundenbewertung und Abschluss ergänzt werden.

### Beim späteren Bearbeiten

- Ergebnis-Auswahl nur **Offen** / **Abgeschlossen**. Keine Kategorien mehr für Erfolg/Teilerfolg/Fehlschlag.
- Bei erstmaligem Wechsel zu **Abgeschlossen** setzt der Server das aktuelle Datum als Einsatzende (Datum des Änderungsantrags). Das Enddatum ist nicht manuell editierbar.
- Für den Abschluss bleiben Einsatzverlauf und mindestens ein beteiligter Held erforderlich. Die SL muss den Änderungsantrag genehmigen, bevor der Fall offiziell geschlossen wird und der Bot die Discord-Abschlussmeldung senden darf.
- Eine abgeschlossene Akte kann über dieses Formular nicht wieder geöffnet werden (der vorhandene ❌-Forumstatus würde sonst widersprechen).
- Historische abgeschlossene Berichte mit alten Erfolgsstatus bleiben lesbar und werden als **Abgeschlossen** dargestellt.

### Dispatcher-Übertragung

v0.26 meldete bei einer realen Erstellung `Ein Dispatcher muss ausgewählt werden`, obwohl im Formular einer ausgewählt war. Der konkrete Weg, an dem die Dispatcher-ID im Live-Projekt fehlte, lässt sich ohne Datenbank-Logs nicht abschließend nachweisen. v0.27 baut den neuen Notruf **serverseitig aus einer expliziten Feldliste** auf, übernimmt `dispatcherId` ausdrücklich und prüft die übermittelte UUID zusätzlich im Browser-Backend und in der Datenbank. Falls die Übermittlung weiterhin scheitert, gibt es differenzierte Fehlermeldungen (fehlt / ungültiges Format / keine genehmigte Dispatcher-Position).

## Installation

1. **Sicherung:** GitHub-Commit der funktionierenden v0.26 notieren, bestehende Datenbank sichern.
2. **Supabase → SQL Editor:** **Dateiinhalt** von `supabase/migrations/202610300002_notruf_creation.sql` komplett einfügen und **einmal ausführen**. Vorher muss die v0.26-Migration `202610300001_dispatcher_operations_forum.sql` erfolgreich ausgeführt worden sein.
3. **GitHub:** Im Repository `timan52/SDN` die drei Dateien `index.html`, `app.js` und `backend.js` durch dieses Update ersetzen; auf `main` committen und pushen. **Nicht** `config.js`, `styles.css`, `portrait-editor.js`, Portraitdateien oder Secret-Dateien ersetzen.
4. Die Website unter `https://timan52.github.io/SDN/` mit `Strg+Umschalt+R` neu laden.
5. Ersten Test als Dispatcher mit seiner Discord-Rolle bzw. als SL machen. Beim Erstellen eines neuen Notrufs einen **freigegebenen Charakter mit Position Dispatcher** auswählen und absenden. Der Status ist `PENDING`; noch kein Discord-Beitrag.
6. Als SL genehmigen. Jetzt sollte die bestehende v0.26-Forenfunktion den Notruf veröffentlichen. Anschließend als ursprünglicher Ersteller über **Daten bearbeiten** ein Ticket mit RP-Link/Teilnehmern/Verlauf stellen und von der SL genehmigen lassen.
7. Schließlich **Abgeschlossen** auswählen, einen Verlauf und mindestens einen Helden zuordnen, Änderungsantrag stellen und genehmigen lassen. Der Bot soll danach die bekannte ❌-Abschlussmeldung erzeugen.

Für dieses Update müssen **keine Edge Functions neu veröffentlicht** werden. Die vorher eingerichteten Funktionen `verify-discord` und `sync-operation-forum` bleiben unverändert.

## Wenn weiter ein Dispatcher-Fehler erscheint

- Browser mit `Strg+Umschalt+R` neu laden und prüfen, dass `app.js` und `backend.js` tatsächlich aus v0.27 stammen.
- Sicherstellen, dass das SQL-Update im **gleichen Supabase-Projekt** ausgeführt wurde, das die Webseite in `config.js` verwendet.
- Der ausgewählte Charakter muss **freigegeben** sein und seine Position muss **Dispatcher** heißen. Die Discord-Rolle `Dispatcher` des anmeldenden Nutzers ist ein anderes Berechtigungsmerkmal.
- Den genauen Fehlertext nach dem Versuch aus der Website kopieren. Die SQL-Migration liefert jetzt unterscheidbare Meldungen.
- **Keine Tokens** und keine `service_role`-Schlüssel zur Fehleranalyse veröffentlichen.

## Tests und Grenzen

JavaScript-Syntax und Browserabläufe wurden mit simulierten Discord-/Supabase-Antworten geprüft: Formular im Erstellen-Modus, Auswahl eines Dispatcher-Charakters, übersandtes Payload, spätere Bearbeitung, Abschlussdatum und Beteiligte. Die neue SQL-Migration wurde **nicht** gegen dein echtes Supabase-Projekt und den dortigen Datenbestand ausgeführt. Deshalb zunächst mit Testeinsätzen prüfen.
