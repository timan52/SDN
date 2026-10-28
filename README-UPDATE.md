# SDN v0.15 – Kacheln & Kundenbewertung

Dieses Update wird **auf eine laufende v0.14** aufgesetzt. Es ersetzt nur drei Dateien im Wurzelverzeichnis des öffentlichen GitHub-Repositories.

1. Die bisherigen Dateien (`index.html`, `app.js`, `styles.css`) vorab sichern bzw. auf den letzten Commit zurückgreifen können.
2. Die drei Dateien aus diesem Paket in `timan52/SDN` im Root-Verzeichnis ersetzen.
3. Auf `main` committen/pushen und bei **Actions / Pages** prüfen, ob die Veröffentlichung erfolgreich war.
4. `https://timan52.github.io/SDN/` mit Strg+Umschalt+R neu laden.

Keine zusätzliche SQL-Migration und kein Edge-Function-Deployment erforderlich. `backend.js`, `config.js`, `portrait-editor.js`, bestehende Charaktere und Berichte bleiben unverändert.

## Änderungen
- Heldenkacheln und Einsatzkacheln zeigen keine SDN-/OPS-ID mehr; Suche nach ID funktioniert weiter.
- Identität: überflüssiger Hilfetext über Aussehensangaben/Fremdwahrnehmung entfernt.
- Im Charakterreiter „Einsätze“ sind die Einsatzkacheln wie in der Einsatzübersicht dunkel, mit identischen Abständen, Stempeln, Hover und Freigabeanzeige. Ein Klick auf die gesamte Karte öffnet den Einsatz.
- Im Einsatzformular ist der Bereich „Kundenbewertung“ jetzt **direkt unter Abschluss/Ergebnis immer sichtbar**. Bei „Noch offen“ sind Sterne und Kommentar deaktiviert. Bei einem Abschluss kann man 1–5 Sterne auswählen und den optionalen Kundenkommentar eingeben.
- In der Einsatz-Detailansicht steht bei abgeschlossenen Fällen auch dann „Keine Kundensterne vergeben“ und „Keine Daten vorhanden“, wenn bisher keine Bewertung vorliegt. Die Kachel zeigt Sterne nur bei vorhandener Bewertung.

## Prüfen
1. Einsatzformular öffnen: Zwischen „Noch offen“ und einem Abschluss umschalten. Sterne/Kommentar werden aktiv und wieder inaktiv.
2. Abgeschlossenen Testbericht mit 4 Sternen und Kommentar einreichen, durch die SL freigeben. Bewertung muss auf Einsatzkachel und im Detail sichtbar sein.
3. Die Akte eines beteiligten Helden öffnen, „Einsätze“ wählen: gleiche Einsatzkachel, klickbar, ohne OPS-ID.
4. Bestehende Akte ohne Bewertung öffnen: keine automatische Übernahme einer Bewertung. **Ältere Berichte werden hier nicht nachträglich bearbeitet.** Dafür müsste ein eigener Änderungsablauf gebaut werden.
5. Auf Mobilgerät prüfen, dass die Kacheln einspaltig und ohne horizontalen Überlauf erscheinen.

**Hinweis:** Dieses Paket verändert nicht die Daten älterer Berichte. Bereits freigegebene Einsätze ohne Kundenbewertung erhalten nicht automatisch eine solche Bewertung. Die Eingabe ist nach wie vor nur bei *neu erstellten* abgeschlossenen Einsätzen möglich; für eine nachträgliche Bewertung brauchen wir eine gesonderte Berichtsbearbeitung.
