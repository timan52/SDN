# SDN v0.10.1 – Einheitliche Kacheln & vereinfachte Kopfzeile

Dieses Update baut auf der **bereits installierten v0.10** auf. Bestehende Charaktere, Einsätze, Portraits, Tickets, Berechtigungen und Aktennotizen bleiben unverändert.

## Änderungen

- Die kleinen Pfeile rechts oben sind aus Helden- und Einsatzkacheln entfernt. Die ganze Kachel bleibt anklickbar.
- Einsatzkacheln erhalten denselben weichen Rahmen, Hintergrund und 3-Pixel-Hoverhub wie Heldenkacheln; der Fallstatus-Stempel bleibt erhalten.
- Die Zähler `ALLE BERICHTE`, `OFFENE FÄLLE` und `ABGESCHLOSSEN` sind aus der Einsatzübersicht entfernt. Die Fallstatus-Filter bleiben weiterhin verfügbar.
- Der dekorative Stempel `SDN PERSONNEL RECORDS` im Seitenkopf entfällt.
- Die zusätzliche orange Sicherheitsinformationsleiste `GESCHÜTZTES ARCHIV` entfällt. **Die Authentifizierung, serverseitige Discord-Mitgliedschaftsprüfung und Datenbankrechte bleiben unverändert.**
- Rechts oben steht nun nach erfolgreicher Anmeldung der im Server verifizierte Discord-Anzeigename (inklusive Server-Spitzname, sofern vorhanden), sonst wird dieser Bereich ausgeblendet. Der Name wird als reiner Text eingefügt.

## Installation (nur Website-Dateien)

1. Die bestehenden Dateien im lokalen GitHub-Repository sichern oder committen.
2. Im **Stammverzeichnis** des GitHub-Repositories `timan52/SDN` diese vier Dateien durch die Versionen aus dem ZIP ersetzen:
   - `index.html`
   - `app.js`
   - `backend.js`
   - `styles.css`
3. Alle anderen Dateien **unverändert** lassen, insbesondere `config.js`, `portrait-editor.js`, `portraits/`, `supabase/` und `.env`.
4. Änderungen auf `main` committen und pushen.
5. Unter https://timan52.github.io/SDN/ die Seite mit **Strg + Umschalt + R** aktualisieren.

**Kein neues SQL-Skript und kein Edge-Function-Deploy erforderlich.** Die Quelle des Discord-Anzeigenamens ist die bereits in v0.8 eingerichtete Tabelle `sdn_discord_profiles`, die durch `verify-discord` aktualisiert wird.

## Überprüfung

1. In der Heldenübersicht eine Kachel mit der Maus überfahren: sie hebt sich leicht an. Kein Pfeil oben rechts.
2. In der Einsatzübersicht eine Kachel überfahren: derselbe Effekt. Der gesamte Kachelbereich öffnet das Einsatzprotokoll. Keine drei Zähler oberhalb der Filter.
3. Oben sind die Informationsleiste und der dekorative Stempel verschwunden.
4. Nach Discord-Login wird oben rechts dein verifizierter Discord-Anzeigename gezeigt, sofern verfügbar; sonst bleibt dieser Bereich leer. **Auf schmalen Bildschirmen wird der Name aus Platzgründen ausgeblendet.**
5. Kontrollieren, dass Suche, Filter, Zurück-Pfeile, Freigaben und Aktennotizen weiterhin funktionieren.

Diese Änderung betrifft ausschließlich die Benutzeroberfläche und die Anzeige bereits verifizierter Nutzerinformationen. Noch keine Live-Tests mit den Konten des RP-Servers durchgeführt.
