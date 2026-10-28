# SDN v0.21 – Aktenblatt für die produktive Website

Dieses Paket aktualisiert deine **bestehende** Website (`timan52/SDN`, letzter Stand v0.17). Es ist **kein Offline-Demo-Projekt**. Die Verbindung zu Discord und Supabase bleibt bestehen; bereits vorhandene Charaktere, Einsatzberichte, Tickets, Aktennotizen und freigegebene Portraits werden nicht gelöscht.

## Vor der Installation

1. Erstelle einen Sicherungspunkt deines GitHub-Repositories (Commit oder Backup der drei Dateien `index.html`, `app.js`, `styles.css`).
2. Exportiere zur Sicherheit die betroffenen Supabase-Daten (`sdn_characters`, `sdn_tickets`, `sdn_character_secrets`) über Table Editor bzw. dein vorhandenes Backup-Verfahren.
3. Vergewissere dich, dass die früheren SQL-Migrationen bis **v0.17** installiert sind. Dieses Paket setzt darauf auf.

## Installation – in dieser Reihenfolge

**1. Supabase → SQL Editor**

- Öffne `supabase/migrations/202610280009_aktenblatt_fields.sql` lokal in einem Texteditor.
- Kopiere den **vollständigen SQL-Inhalt** (nicht den Dateinamen) in eine neue SQL-Abfrage im Supabase Dashboard.
- Klicke auf **Run**. Erwartet: `Success. No rows returned`.
- Die Migration erweitert lediglich `public.sdn_field_path` um die neuen Felder, die in Änderungsanträgen zulässig sind. Die Feldinhalte werden weiterhin im vorhandenen `sdn_characters.data`-JSONB gespeichert. Es werden keine Daten gelöscht, keine Tabellen neu angelegt und keine öffentlichen Rechte auf TOP SECRET vergeben.

**2. GitHub**

Im Stammverzeichnis von `timan52/SDN` genau diese Dateien aus dem ZIP **ersetzen**:

- `index.html`
- `app.js`
- `styles.css`

**Nicht ersetzen:** `config.js`, `backend.js`, `portrait-editor.js`, `assets/`, `portraits/`, `.env` oder die bereits deployten Edge Functions. Nicht die gesamte ZIP mit der SQL-Datei als Website hochladen: Website-Dateien und Migration sind getrennte Schritte.

**3. Veröffentlichung**

Änderung auf `main` committen/pushen. GitHub Pages abwarten, dann `https://timan52.github.io/SDN/` mit **Strg+Umschalt+R** laden. Die neue Aktenoptik erscheint nach Anmeldung beim Öffnen einer Personalakte.

## Was eingebaut ist

- Das **helle Aktenblatt-Design** für die echte Personalakte, eingebettet in das bekannte dunkle SDN-Terminal. Übersicht, Einsatzarchiv, Login, Anträge und vorhandene SL-Rechte bleiben bestehen.
- **11 Register:** Identität, Skillmatrix, Fähigkeiten, Ausrüstung, Psychologisches Gutachten, Historie, Krankenakte, Beziehungen, Einsätze, Aktennotiz, TOP SECRET (nur SL).
- **Ausrüstung:** exakt zwei Unterpunkte mit gleicher Typografie wie alle anderen Dokumentenbereiche: **Ausstattung** und **Superheldenkostüm**. Keine weitere Überschrift „Ausrüstung“ innerhalb der Unterpunkte, kein „Optional“-Hinweis.
- **Rasse:** Mensch/Andere; bei Andere die Angaben Bezeichnung, Herkunft, Besonderheiten. Für alte Akten ohne Werte wird „Keine Daten vorhanden“ angezeigt.
- **Skillmatrix-Anmerkungen:** eigenes Freitextfeld; die fünf echten Attribute Combat, Vigor, Mobility, Charisma und Intellect bleiben bestehen. Im Radar erscheinen Symbole, bei den Balken Namen und Werte.
- **Fähigkeiten:** Spezialfähigkeit (Name, Klasse, Ursprung, Beschreibung, Schwächen und Moves) und allgemeine Eigenschaften (Stärken, Schwächen, Fähigkeiten) getrennt.
- **Krankenakte** als eigener Reiter, ohne Verlust der bisherigen Werte aus der `history`-Struktur.
- **Psychologisches Gutachten** statt Persönlichkeit, ohne Wegfall der vorhandenen Felder.
- **Bürgerlicher Name:** bei `Geheime Identität = Ja` in der Anzeige hinter einem Spoiler. Beim Formular bleibt der Wert normal editierbar.
- Discord-Spielername und Charakterkanal erscheinen im Aktenkopf; die SDN-ID steht nur dort und in den bekannten Dokumentmetadaten.
- Die bestehenden Änderungsanträge funktionieren für die neuen Felder wie für alle bisherigen: Spieler ändern nicht direkt die genehmigte Akte; die SL muss das Ticket freigeben.

## Prüfliste nach der Installation

1. Öffne einen bereits bestehenden freigegebenen Charakter und prüfe alle elf Register. Alte Akten ohne neue Felder dürfen **keinen Fehler** erzeugen.
2. Prüfe im Reiter Ausrüstung, dass **Ausstattung** und **Superheldenkostüm** beide gleich groß und lesbar gesetzt sind.
3. Bearbeite bei einem **Testcharakter** die Ausstattung, füge einen Kostümtext hinzu und hinterlasse eine Anmerkung zum Antrag. Sende das Ticket ab. Vor der Genehmigung muss die alte Akte unverändert sein; danach müssen die beiden Texte erscheinen.
4. Trage bei einem Testcharakter `Rasse = Andere`, `Bezeichnung`, `Herkunft`, `Besonderheiten` ein und prüfe die bedingte Anzeige; bei `Rasse = Mensch` sollen diese Unterfelder entfallen.
5. Trage eine Anmerkung zur Skillmatrix ein; prüfe die Anzeige nach SL-Freigabe.
6. Teste einen geheimen bürgerlichen Namen (Spoiler), geheime TOP-SECRET-Inhalte mit einem **normalen Spieleraccount** (nicht sichtbar), HR-Aktennotizen und bestehende Einsatzverknüpfungen.
7. Prüfe die mobile Darstellung, Portraits und Discord-Login.

### Wichtige Hinweise

- Neue Felder sind ausschließlich Ergänzungen zur bisherigen Datenstruktur. **Keine Datenbank-Reset-Skripte ausführen.**
- Die geänderten CSS-Regeln betreffen primär Personalakten; Einsatzberichte behalten ihr vorhandenes Layout.
- Alte Akten werden **nicht mit erfundenen Angaben gefüllt**. Die Designvorschau zeigt ausschließlich lokale Testwerte. Online werden die tatsächlichen Angaben der Spieler angezeigt.
- Die JavaScript-Datei und die UI wurden in einer isolierten Chromium-Umgebung mit simulierten Daten auf Desktop und Smartphone geprüft. Die SQL-Migration konnte nicht auf deinem realen Supabase-Projekt ausgeführt werden; den Live-Freigabeprozess bitte zunächst mit einem Testcharakter prüfen.
- Dieses Paket enthält **keine** Zugangsschlüssel oder echten Discord-Accountdaten.
