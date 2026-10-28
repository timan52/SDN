# SDN v0.8 – Heldenverzeichnis und Einsatzarchiv

Dies ist ein **Update für die bestehende, bereits eingerichtete v0.7/v0.7.2-Website** in `timan52/SDN`. Es ersetzt NICHT dein Projekt oder deine Datenbank.

**Enthaltene geänderte Dateien**

```text
index.html
app.js
backend.js
styles.css
supabase/functions/verify-discord/index.ts
supabase/migrations/202610280001_directories.sql
```

**Bewusst nicht enthalten:** `config.js`, `.env`, irgendwelche Tokens oder Passwörter. Die bestehende `portrait-editor.js`, andere Edge Functions, dein SQL-Initialschema, Logos, Bilder und alle bereits gespeicherten Daten bleiben unverändert.

## A. Vorhandene Daten bewahren

- Mach nach Möglichkeit vorher eine lokale Sicherung deiner Charakter- und Einsatzdaten aus Supabase.
- Das v0.8-Skript ist eine **additive Migration für deine bereits verwendete Datenbank**, nicht das alte v0.7-Erstinstallationsskript. Es löscht keine vorhandenen Charaktere, Berichte oder Tickets.
- Bereits vorhandene SDN-IDs bleiben **unverändert**. Nur **neu angelegte** Helden bekommen eine kryptografisch zufällig erzeugte ID (z. B. `SDN-6D3B87F09C`). Die ID ist serverseitig geschützt und kann nicht durch ein Formular geändert werden.

## B. SQL-Upgrade zuerst in Supabase ausführen

1. Öffne https://supabase.com/dashboard und wähle dein bestehendes SDN-Projekt.
2. Öffne **SQL Editor → New query**.
3. Öffne `supabase/migrations/202610280001_directories.sql` aus diesem Update-Paket.
4. Kopiere den gesamten Text in den SQL Editor und klicke **Run**.
5. Kontrolliere unter **Table Editor**, dass die zusätzliche Tabelle `sdn_discord_profiles` existiert. Bestehende Tabellen bleiben unverändert.

Das Skript aktiviert Row Level Security auf der neuen Profil-Tabelle. Nur verifizierte Servermitglieder können nach Discord-Namen suchen; Änderungen an dieser Tabelle werden nur von der serverseitigen Discord-Prüfung geschrieben.

## C. Dateien in das bestehende GitHub-Repository übernehmen

1. Öffne deinen lokalen Repository-Ordner in Windows, z. B. `C:\Users\tim_m\Documents\GitHub\SDN\SDN` (prüfe, dass dort die aktuelle `index.html` liegt).
2. Kopiere **genau die vier Dateien** `index.html`, `app.js`, `backend.js` und `styles.css` aus diesem Paket in den Stamm deines Repository-Ordners; ersetze die gleichnamigen vorhandenen Dateien.
3. Ersetze `supabase/functions/verify-discord/index.ts` durch die Datei aus dem Paket.
4. Lege das neue SQL-Skript zusätzlich unter `supabase/migrations/` im Repository ab, damit das Upgrade dokumentiert ist. **Dieses Skript nicht noch einmal mit `db push` automatisch erneut ausführen**, wenn du es bereits im SQL Editor angewendet hast.
5. **Behalte die vorhandene `config.js` unverändert**. Lade niemals `.env`, Bot-Token oder andere Secrets auf GitHub hoch.
6. Commit und Push auf `main` mit GitHub Desktop oder deiner bisherigen Methode.

Die CSS-Datei aus dem Paket enthält den 4:5-Portraitfix aus v0.7.2.

## D. Aktualisierte Discord-Prüffunktion veröffentlichen

Öffne PowerShell **im Stammordner deines bestehenden SDN-Projekts** (wo `supabase/` liegt) und führe aus:

```powershell
npx.cmd supabase functions deploy verify-discord
```

Wenn der Ordner noch nicht mit dem richtigen Supabase-Projekt verbunden ist, siehe deine bisherige `supabase link`-Einrichtung. Die bereits eingerichteten Secrets (Discord-Bot-Token, Server-ID, SL-Rollen-ID) bleiben unverändert. `publish-portrait` muss für dieses Upgrade **nicht** erneut veröffentlicht werden.

### Warum eine neue Discord-Funktion?

Die Suche nach einem *Discord-Namen* funktioniert nicht zuverlässig über das manuell ausfüllbare Aktenfeld „Spieler“. Die aktualisierte Funktion speichert deshalb nach **erfolgreicher Servermitgliedschaftsprüfung** den Discord-Anzeigenamen und den Discord-Benutzernamen in der neuen, nur für Mitglieder lesbaren Tabelle.

**Bestehende Spieler-Namen erscheinen nach deren nächster Anmeldung/erneuten Mitgliedschaftsprüfung**. Sie werden nicht rückwirkend aus privaten Discord-Daten erraten.

## E. Neue Oberfläche prüfen

Öffne `https://timan52.github.io/SDN/` und drücke `Strg + Umschalt + R`.

1. **Heldenübersicht ist die Startseite** nach erfolgreichem Discord-Login.
2. Als Spieler: „Alle Helden“, „Meine Helden“, Suche nach Alias, Charaktername, SDN-ID und verifiziertem Discord-Namen; sortiere nach „Neueste/Älteste“.
3. Als SL: zusätzliche Filter „Offene Änderungen“ und „Neue Heldenanträge“.
4. Klicke auf eine Heldenkarte, um ihre Akte zu öffnen. „← ALLE HELDEN“ führt zurück.
5. „+ NEUEN HELDEN ERSTELLEN“ zeigt **kein editierbares SDN-ID-Feld**. Die Datenbank generiert bei Einreichung eine zufällige und anschließend unveränderliche ID.
6. Einsatzarchiv: „Alle/Meine Einsätze“, als SL „Offene Berichtsfreigaben“, zusätzlich Fallstatus und Sortierung. Suche nach Einsatzname, Held, Discord-Namen, Organisation oder Schurken.
7. Neues Einsatzprotokoll: Trage optional Organisation/Schurken ein und wähle unabhängig vom Freigabestatus **Fall offen/abgeschlossen**. Der große Stempel zeigt den Fallstatus.
8. Die Heldenzuordnung bleibt wie bisher: In genehmigten Berichten verlinkte Teilnehmer erscheinen automatisch im jeweiligen Reiter „Einsätze“ der Personalakte.

**Wichtig:** Der Stempel `FALL OFFEN`/`ABGESCHLOSSEN` meint den **Fallstatus**. `FREIGEGEBEN`/`ZUR FREIGABE` meint unabhängig davon den **Prüfstatus des Protokolls**. Alte Berichte ohne Fallstatus nutzen zur Anzeige das bisherige Feld „Ergebnis“ (`open` → offen, sonst abgeschlossen).

## F. Nach der Veröffentlichung

Empfohlener erster Test: Mit deinem SL-Account eine neue Testakte anlegen (ohne manuell vergebene ID), Antrag genehmigen und prüfen, ob die neue zufällige SDN-ID in der Übersicht und der Akte erscheint. Anschließend mit einem **normalen Discord-Mitglied** prüfen, dass die beiden SL-Filter nicht vorhanden sind und unveröffentlichte Akten anderer Mitglieder nicht sichtbar sind.

### Hinweise und Grenzen

- Die Änderungen sind lokal mit einer simulierten, angemeldeten Spieler- und SL-Sitzung gegen die Browseroberfläche getestet worden. Die Echtdatenbank-/Discord-/GitHub-Integration muss nach dem Deployment mit deinem Projekt geprüft werden.
- Die Datenbank enthält weiterhin keine automatische Verwaltung von Discord-Charakterkanälen; diese können wie bisher manuell in die Akten eingetragen werden.
- Das Update verändert bestehende Ticketinhalte und Portraits nicht.
