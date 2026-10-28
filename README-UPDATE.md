# SDN v0.10 – Einheitliche Kacheln & Aktennotizen

Update **für die bestehende online laufende Version v0.9** unter `https://timan52.github.io/SDN/`. Keine Neuinstallation, keine vorhandenen Akten oder Tickets löschen.

## Änderungen

- Einsatzkacheln sind vollständig anklickbar, wie Charakterkacheln. Der separate Button „Einsatzakte öffnen“ entfällt. Auch die verlinkten Einsatzkacheln innerhalb eines Charakters bleiben anklickbar.
- Einheitliche **Freigabe**-Badges unten in beiden Kacheltypen: Die SL sieht `FREIGEGEBEN`, `OFFEN` (oder `ABGELEHNT` bei abgelehnten Berichten). Spieler sehen **nur `OFFEN`** für eigene noch ausstehende Charakteranträge, Änderungen oder Einsatzberichte. Bei genehmigten Einträgen erscheint für Spieler kein Badge. Der große Fallstempel `FALL OFFEN` / `ABGESCHLOSSEN` ist eine *andere Information* und bleibt bei allen sichtbar.
- Auch in der Einsatzdetailansicht wird nun ein Freigabestempel wie bei Charakterakten dargestellt.
- Neuer Reiter **09 AKTENNOTIZ** neben dem vorhandenen Reiter „Personalnotizen“. Von SL und HR können dort Notizen angeheftet werden. Ein Eintrag besteht aus Text und am Ende aus **Verfassercharakter + serverseitigem Zeitstempel**. Der Verfasser muss ein **eigener, bereits freigegebener Charakter** sein. Einträge sind append-only: kein nachträgliches Bearbeiten oder Löschen in der Oberfläche.
- HR darf Aktennotizen erstellen, aber nicht allein deshalb Tickets oder Einsatzberichte freigeben. SL kann beides.

## Installation – Reihenfolge wichtig

### 1. Datenbankmigration in Supabase ausführen

1. Supabase Dashboard → dein Projekt → **SQL Editor → New query**.
2. Datei `supabase/migrations/202610280002_file_notes.sql` mit einem Texteditor öffnen und **ihren vollständigen SQL-INHALT** hineinkopieren. Nicht den Dateipfad einfügen.
3. **Run** anklicken. Erwartet: `Success. No rows returned`.
4. Unter **Table Editor** sollte `sdn_file_notes` neu vorhanden sein. In `sdn_access` kommt die Spalte `is_hr` hinzu.

Die Migration legt nur neue Funktionen und die Notiztabelle an und erweitert die bestehende Zugriffstabelle. Bestehende Akten, Tickets und Einsatzberichte bleiben erhalten.

### 2. HR-Rolle in Discord anlegen/auswählen (optional, wenn vorerst nur SL schreibt)

1. In deinem Discord-RP-Server **Servereinstellungen → Rollen** die Rolle `HR` auswählen oder erstellen.
2. In Discord **Benutzereinstellungen → Erweitert → Entwicklermodus** aktivieren (falls noch nicht aktiv).
3. Über das Rollen-Kontextmenü **Rollen-ID kopieren**.
4. Unter Supabase → **Edge Functions → Secrets** einen neuen Secret-Eintrag anlegen:
   - Name: `DISCORD_HR_ROLE_ID`
   - Value: **die kopierte numerische Discord-Rollen-ID**, nicht der Rollenname.
5. **Save**.

Wenn es noch keine HR-Rolle gibt, kannst du dieses Secret vorerst weglassen; SL darf weiterhin Notizen schreiben. **Keine** Bot-Tokens oder Secret-Keys in GitHub-Dateien oder `config.js` eintragen.

### 3. Discord-Prüffunktion aktualisieren

1. Ersetze in deinem lokalen bestehenden Repository **nur** `supabase/functions/verify-discord/index.ts` durch die Datei aus dem ZIP (Pfad identisch).
2. Öffne PowerShell im Stammordner deines lokalen GitHub-Repositories (dort, wo `supabase` liegt).
3. Ausführen:

```powershell
npx.cmd supabase functions deploy verify-discord
```

**Keine** weiteren Secrets offenlegen oder `publish-portrait` neu deployen. Die verifizierte Rolle wird beim nächsten Login/Neuladen im `sdn_access.is_hr` gespeichert.

### 4. Website aktualisieren

Im **Stammverzeichnis** des bestehenden GitHub-Repositories die vier Dateien aus dem ZIP ersetzen:

- `index.html`
- `app.js`
- `backend.js`
- `styles.css`

**Nicht ersetzen:** `config.js`, `portrait-editor.js`, `assets`, `portraits`, `.env` oder andere Supabase-Funktionen.

Commit und Push auf Branch `main`, anschließend GitHub Pages unter `https://timan52.github.io/SDN/` mit **Strg+Umschalt+R** neu laden.

### 5. Funktionstests

1. **SL-Account:** In der Heldenübersicht stehen Freigabebadges unten an den Kacheln. Im Einsatzarchiv ebenfalls. Klicke auf eine beliebige Stelle innerhalb einer Einsatzkachel: Es öffnet sich nur die Detailakte.
2. **SL-Account:** Eine Personalakte öffnen → `09 AKTENNOTIZ` → einen **eigenen freigegebenen Charakter** wählen, Text eingeben, `AKTENNOTIZ ANHÄNGEN` klicken. Nach Neuladen muss der Eintrag mit Text, Charakternamen und Datum erhalten bleiben.
3. **HR-Account (ohne SL-Rolle):** nach erneuter Discord-Prüfung ebenfalls Aktennotizen hinzufügen, aber keine Freigaben durchführen.
4. **Normaler Spieleraccount:** vorhandene Aktennotizen lesen, aber **keinen Editor** sehen. Bei genehmigten Kacheln erscheint kein `FREIGEGEBEN`-Badge. Eigene ausstehende Anträge zeigen `OFFEN`. Beim Einsatzfall bleibt der Fallstempel für alle sichtbar.
5. **Ohne Servermitgliedschaft:** darf weiterhin keine Akten sehen.

## Sicherheit und Einschränkungen

- Der Notiztext und sein Verfasser werden durch eine *serverseitige* PostgreSQL-Funktion eingetragen. Es reicht nicht, im Browser eine SL-/HR-Schaltfläche einzublenden.
- Diese Notizen sind innerhalb des Discord-RPs für berechtigte Leser einer Personalakte sichtbar. Der Reiter ist **kein** geheimer SL-Chat.
- Die bestehende frei bearbeitbare Rubrik `Personalnotizen` bleibt getrennt und unterliegt weiter dem normalen Ticketsystem.
- Das UI wurde lokal mit simulierten SL-, HR- und Spieler-Sitzungen getestet. SQL-Migration und Discord-Secret können erst nach Installation in deinem eigenen Projekt live getestet werden.
