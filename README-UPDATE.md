# SDN v0.17 – Einsatzlevel, Positionsfarben und bereinigte Akten

Dieses Paket ist ein **Update für die bereits laufende SDN v0.16**. Es enthält die aktualisierten Dateien `index.html`, `app.js`, `styles.css` und die additive Datenbankmigration `supabase/migrations/202610280008_report_levels.sql`.

## Was sich ändert

- Einsatzberichte haben das neue Pflichtfeld **Einsatzlevel** mit Auswahl **E, D, C, B, A, S**. Das Level wird auf Einsatzkacheln und in der vollständigen Einsatzakte angezeigt, auch auf den Einsatzkacheln innerhalb einer Personalakte.
- In bestehenden Einsätzen kann das Level über **DATEN BEARBEITEN** nachgetragen und als Änderungsticket zur Freigabe eingereicht werden. Die OPS-ID bleibt erhalten.
- Bestehende Berichte ohne Level werden nicht gelöscht oder automatisch eingestuft. Bis zur nächsten Bearbeitung steht in der Detailakte **Nicht eingestuft**; die Kachel zeigt noch kein Level.
- **Aktiv / Inaktiv** steht in den Heldenkacheln jetzt unmittelbar neben der **Position**.
- In der geöffneten Personalakte erscheint die Position in der Akzentfarbe ihrer Rolle (Superheld rot, Dispatcher orange, Arzt indigo, Techniker blau, Manager grün, Teamleiter gelb, Standortleitung violett).
- Einsatzkacheln zeigen **TEAM:** vor der Liste der beteiligten Helden.
- Fünf rein erklärende Texte in Persönlichkeit, Krankenakte, Beziehungen, Einsätzen und am Ende von Einsatzberichten wurden entfernt. Gespeicherte Inhalte bleiben unverändert.

## Installation – bitte in dieser Reihenfolge

1. **Sicherung anfertigen:** Exportiere insbesondere `sdn_reports` (Datenbank / Table Editor) und notiere den letzten funktionierenden GitHub-Commit. An den bisherigen Datensätzen wird mit dem Update nichts gelöscht.
2. **SQL ausführen:** Supabase Dashboard → **SQL Editor** → neues Query öffnen. Öffne die Datei `supabase/migrations/202610280008_report_levels.sql` lokal mit einem Texteditor. **Kopiere ihren gesamten Inhalt** in den SQL Editor und klicke auf **Run**. **Nicht nur den Dateipfad einfügen.** Voraussetzung ist, dass die Migration aus v0.16 (`202610280007_report_edits.sql`) bereits ausgeführt wurde.
3. **Website-Dateien ersetzen:** Im GitHub-Repository `timan52/SDN` im Stammverzeichnis die bisherigen Dateien `index.html`, `app.js` und `styles.css` durch die neuen aus diesem Paket ersetzen. Alle drei gehören zusammen.
4. Änderungen auf `main` committen/pushen. Anschließend unter **GitHub → Actions** die erfolgreiche GitHub-Pages-Veröffentlichung prüfen.
5. `https://timan52.github.io/SDN/` mit **Strg + Umschalt + R** neu laden.

**Nicht ersetzen:** `config.js`, `backend.js`, `portrait-editor.js`, Discord-Edge-Functions, persönliche Secrets oder vorhandene Bilder. Das Update erfordert keine neuen geheimen Zugangsdaten.

## Prüfung mit Testeinträgen

1. Personalübersicht öffnen: Bei einer aktiven/inaktiven Person muss der Status direkt **neben der Positionskennzeichnung** stehen.
2. Personalakte öffnen: Die Position oberhalb des Portraits erscheint in ihrer Rollenfarbe. In Persönlichkeit, Historie, Beziehungen und Einsätzen sind die genannten Erklärungssätze verschwunden.
3. Einsatzübersicht öffnen: Auf jeder neu eingestuften Kachel steht z. B. **LEVEL B** und davor, wo die Teilnehmer angezeigt werden, **TEAM:**.
4. **Einsatzprotokoll erstellen:** Das Leveldropdown bietet ausschließlich E–S. Ohne Level darf die Eingabe nicht abgesendet werden. Mit Level sollte ein neues Protokoll als Antrag eingereicht werden.
5. **Bestehenden Einsatz bearbeiten:** Einen alten Bericht öffnen → **DATEN BEARBEITEN** → Level auswählen → **ABSENDEN** → mit SL-Account den Änderungsantrag genehmigen. Danach muss das Level auf der Fallkachel und in der Detailakte zu sehen sein.
6. Einen alten Einsatz ohne Level prüfen: Er muss weiter lesbar sein und darf nicht verschwinden.

## Datenbank- und Sicherheitsverhalten

Die SQL-Migration ergänzt eine Einschränkung auf die zulässigen Level E–S, verpflichtet Neuanlagen zu einem Level und erlaubt das Feld in den bereits vorhandenen Bericht-Änderungstickets. Sie verändert keine bestehenden Berichte und keine Zugriffsrollen. Der bestehende serverseitige Freigabeablauf bleibt erhalten.

Die JavaScript-Syntax wurde geprüft und die UI-Funktionen wurden mit simulierten Supabase-Daten in Chromium getestet. Die Migration konnte nicht gegen dein live laufendes Supabase-Projekt ausgeführt werden. Deshalb bitte zuerst mit einem Testeinsatz prüfen.
