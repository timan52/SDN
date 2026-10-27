# SDN-Personalakten v0.7 – Startanleitung (Windows / kostenlos)

**Inoffizielles Dispatch-Fanprojekt.** Neues Onlinepaket auf Basis des bestehenden SDN-Designs. Geplant für ~30–100 Charaktere.

## Was enthalten ist

- Discord-Login, *serverseitige* Mitgliedschafts-/Spielleitungsrollenprüfung und Supabase-Datenbank mit Row Level Security.
- Digitale Akte: Identität, Attribute (Radar-Chart), Fähigkeiten, Persönlichkeit, Historie/Krankenakte, Bekanntschaften, Einsätze, Personalnotizen, TOP SECRET.
- Beliebig viele Änderungstickets; Attribute/Fähigkeiten besonders markiert; Konfliktprüfung, Genehmigung und Ablehnung. Eingereichte Portraits erscheinen als **private Vorschau im Ticket** nur für Antragsteller/Spielleitung.
- Standardisierte Einsatzberichte mit Nummern und Freigaben.
- **Pro Charakter ein offizielles Portrait**: Bild auswählen, verschieben, zoomen, festen 4:5-Ausschnitt definieren. Original wird lokal zu WebP (höchstens 1 MB) optimiert; private Original-/Vorschaudatei in Supabase Storage. Nach Genehmigung veröffentlicht eine geschützte Edge Function genau das zugeschnittene Portrait als WebP in `/portraits/` auf GitHub Pages. Das vorige Portrait bleibt bis zur erfolgreichen Veröffentlichung aktiv.
- Individueller Discord-Kanal als Link in der Akte (manuell hinterlegen; automatische Kanalerstellung ist noch nicht implementiert).
- **Keine Bildergalerie mehr auf der Website**: Kostüm-, Zivil- und weitere Referenzen gehören in den Discord-Charakterkanal.
- `portrait-demo.html` testet den Bildausschnitt ohne Login und speichert nichts.

## VORHER WICHTIG

- Diese Version ist ein **ausführbares Projektgrundgerüst**, keine bereits eingerichtete Live-Instanz. Die externe Kombination Discord/Supabase/GitHub kann ohne deine eigenen Konten/Schlüssel nicht Ende-zu-Ende getestet werden.
- **Für ein neues Supabase-Projekt.** Die SQL-Datei ist eine vollständige Ersteinrichtung, **kein Upgrade-Skript für eine schon produktiv verwendete v0.6-Datenbank**. Nicht über bestehende Datenbanken laufen lassen.
- Keine echten RP-Daten vor erfolgreichen Rechte-/Freigabetests eingeben.
- **GitHub-Repository ist öffentlich**, genauso der Quellcode und die **genehmigten Portraits**. Alle anderen Daten verbleiben in Supabase und sind durch RLS geschützt. Keine vertraulichen Keys, Tokens oder geheime RP-Akten ins GitHub-Repo legen.
- GitHub-PAT kann ablaufen. In diesem Fall funktionieren Tickets, aber Portraits werden bis zur Token-Erneuerung nicht veröffentlicht; die alte Bildversion bleibt aktiv.
- Ein GitHub-Upload startet eine Pages-Veröffentlichung. Die Bild-URL kann kurz nach der Freigabe noch 404 zurückgeben, bis GitHub Pages neu gebaut wurde.

## 1 – Konten/IDs bereithalten

Erforderlich sind jeweils kostenlose Konten bei [GitHub](https://github.com), [Supabase](https://supabase.com) und [Discord Developer Portal](https://discord.com/developers/applications). Dazu brauchst du Administrationsrechte auf dem Discord-RP-Server.

Schreibe dir in einer **privaten** Notiz auf:

- GitHub-Benutzername (`GITHUB_USER`)
- Repository-Name (im Beispiel `sdn-personalakten`)
- Discord-Server-ID (`DISCORD_GUILD_ID`)
- Discord-Rollen-ID der Spielleitung (`DISCORD_GM_ROLE_ID`)
- Supabase Project Reference (`PROJECT_REF`)

**Niemals Token oder Client Secrets im Chat oder in einem öffentlichen Repository teilen.**

## 2 – Öffentliches GitHub-Repository und Pages anlegen

1. Auf github.com anmelden → oben rechts **+ → New repository**.
2. Name: `sdn-personalakten`; Visibility: **Public**; Repository erstellen.
3. Noch keine Daten hochladen. Deine Pages-URL wird in diesem Beispiel `https://GITHUB_USER.github.io/sdn-personalakten/` sein.
4. GitHub-Repository → **Settings → Pages** → *Build and deployment* → **Deploy from a branch** → Branch `main` → **/(root)** → Save (spätestens nach dem Hochladen der Website-Dateien).
5. Die freigegebenen Portraits werden durch die Serverfunktion automatisch als `portraits/<CHAR_UUID>-<TICKET_UUID>.webp` ins Repo geschrieben.

## 3 – Supabase-Projekt erstellen und Datenbank einrichten

1. Supabase Dashboard → **New project** → Free-Organisation auswählen → Projekt anlegen, Datenbankpasswort **sicher verwahren**.
2. Project URL und den **Publishable key** kopieren (unter *Project Settings* / *API Keys* bzw. *Connect*; Dashboardbezeichnungen können variieren).
3. Supabase → **SQL Editor** → *New query* → die Datei `supabase/migrations/202610270001_initial.sql` komplett einfügen → **Run**. **Nur auf einem leeren Projekt**.
4. Danach unter **Table Editor** prüfen: Tabellen `sdn_access`, `sdn_characters`, `sdn_character_secrets`, `sdn_tickets`, `sdn_reports`, `sdn_audit`. Unter **Storage** sollte `sdn-images` als **Private** erscheinen.
5. **Niemals** Service-Role-/Secret-Key in `config.js` oder GitHub kopieren.

## 4 – Discord-Anwendung, Bot und Rolle

1. [Discord Developer Portal](https://discord.com/developers/applications) → *New Application* → z. B. `SDN Personnel Archive`.
2. Unter **OAuth2** die **Client ID** und das **Client Secret** finden.
3. Unter **Bot** den Bot aktivieren/erstellen, den **Bot Token** geheim halten. Den Bot über **Installation / OAuth2** auf dem eigenen Server installieren (Scopes `bot` und nur erforderliche Berechtigungen). Bot muss dort Mitglied sein; für die reine Member-Abfrage sind keine Administratorrechte nötig.
4. Im Discord-Client unter *Erweitert* den **Entwicklermodus** aktivieren. Rechtsklick auf Server → *ID kopieren*. Rechtsklick auf Spielleitungsrolle → *ID kopieren*.
5. Die **SL-Rolle** den Personen zuweisen, die Tickets und Einsatzberichte genehmigen dürfen.

## 5 – Discord-Login in Supabase aktivieren

1. Supabase → **Authentication → Sign In / Providers → Discord**.
2. Discord-Provider aktivieren und Client ID / Client Secret der Discord-App eintragen.
3. Die **Supabase Callback URL** aus dem Provider-Bereich kopieren, normalerweise `https://PROJECT_REF.supabase.co/auth/v1/callback`.
4. Discord Developer Portal → deine Application → **OAuth2 → Redirects** → genau diese Callback URL hinzufügen → speichern. **Nicht** die GitHub-Pages-URL an dieser Stelle als Discord Callback eintragen.
5. Supabase → **Authentication → URL Configuration** → Site URL `https://GITHUB_USER.github.io/sdn-personalakten/` setzen und unter Redirect URLs sowohl diese URL als auch `http://localhost:8000/` zulassen.

## 6 – GitHub-Zugang für den freigegebenen Portrait-Upload

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens** → neuen Token erstellen.
2. *Repository access*: **Only select repositories** → `sdn-personalakten`.
3. *Repository permissions*: **Contents → Read and write** (Metadata Read ist standardmäßig vorhanden). Keine Account- oder Administratorrechte vergeben.
4. Ablaufdatum wählen und einen privaten Hinweis zur Erneuerung setzen.
5. Token einmalig kopieren, **nur als Edge-Function-Secret** speichern. Niemals in `config.js`, JS, GitHub-Dateien oder Discord-Chat posten.

## 7 – Supabase CLI unter Windows installieren

Du benötigst Node.js (ab Version 20). Eine Möglichkeit ist die Supabase CLI als lokale Entwickler-Abhängigkeit. **PowerShell im entpackten Projektordner** öffnen (dort, wo `index.html` und `supabase/` liegen):

```powershell
npm install --save-dev supabase
npx supabase login
npx supabase link --project-ref PROJECT_REF
```

Das `npx`-Verfahren braucht **keinen** selbst betriebenen Docker-Server, solange du nur die Cloud Functions deployst. Die SQL-Migration hast du in Schritt 3 bereits per SQL Editor ausgeführt.

## 8 – Vertrauliche Secrets eintragen und Funktionen veröffentlichen

1. Die Datei `.env.example` **kopieren** und als `.env` im Projektordner speichern. Die Datei `.env` niemals auf GitHub hochladen.
2. Trage dort exakt die echten Werte ein (kein `https://` vor den IDs, kein `/REPO/` nach `SDN_ALLOWED_ORIGINS`). Beispiel:

```ini
DISCORD_BOT_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
DISCORD_GUILD_ID=123456789012345678
DISCORD_GM_ROLE_ID=123456789012345679
SDN_ALLOWED_ORIGINS=https://GITHUB_USER.github.io,http://localhost:8000
GH_TOKEN=github_pat_xxxxxxxxx
GH_OWNER=GITHUB_USER
GH_REPO=sdn-personalakten
GH_BRANCH=main
```

3. Die Secrets und die beiden Functions mit PowerShell veröffentlichen:

```powershell
npx supabase secrets set --env-file .env
npx supabase functions deploy verify-discord
npx supabase functions deploy publish-portrait
```

4. In Supabase unter *Edge Functions* prüfen, dass `verify-discord` und `publish-portrait` erscheinen. Die Bot-/GitHub-Schlüssel bleiben ausschließlich auf dem Server.

## 9 – Website konfigurieren und veröffentlichen

1. Die Datei `config.example.js` kopieren und nach `config.js` umbenennen (oder die vorhandene gesperrte `config.js` ersetzen).
2. Nur diese beiden **öffentlichen** Werte eintragen:

```javascript
window.SDN_CONFIG = {
  supabaseUrl: 'https://PROJECT_REF.supabase.co',
  supabasePublishableKey: 'sb_publishable_...',
};
```

3. Im öffentlichen Repository **nur die Website-Dateien** in die Wurzel hochladen:

```text
index.html
styles.css
app.js
backend.js
portrait-editor.js
config.js
.nojekyll
assets/sdn-logo.webp
```

Der Ordner `portraits/` entsteht mit dem ersten freigegebenen Bild automatisch. **Nicht hochladen:** `.env`, `supabase/`, alte ZIP-Archive mit echten Akten, private Bilder oder später `portrait-demo.html` (Testdatei).

4. Repository → **Settings → Pages**, Branch `main`, Ordner `/ (root)`, speichern. Sobald die Website erscheint, `https://GITHUB_USER.github.io/sdn-personalakten/` öffnen.
5. Die Website wird ohne Anmeldung gesperrt angezeigt. Dort auf **MIT DISCORD ANMELDEN** klicken.

## 10 – Test mit zwei Discord-Accounts

A. Normales Servermitglied (ohne SL-Rolle):

1. Mit Discord anmelden. Ohne Servermitgliedschaft muss der Zugriff verweigert werden.
2. **Neuen Charakter anlegen**: Name, Alias und die nötigen Angaben eingeben; im Abschnitt `10 / PORTRAIT` Bild auswählen und zuschneiden.
3. Auf **ÄNDERUNGEN ABSENDEN** klicken → Ticket `CHG-0001` entsteht. Die Akte bleibt `DRAFT`, Portrait wird **nicht** auf GitHub veröffentlicht.

B. Account **mit SL-Rolle**:

4. Auf der Seite anmelden; Ticket im Änderungen-Reiter öffnen; das Portrait freigeben. Das Ticket wird genehmigt, die Edge Function stellt die zugeschnittene WebP-Datei auf GitHub Pages bereit.
5. Das genehmigte Portrait erscheint in der Akte und in der Charakterübersicht, nachdem GitHub Pages die neue Datei veröffentlicht hat.
6. Falls Veröffentlichung fehlschlägt: oben in der Personalakte **VERÖFFENTLICHUNG ERNEUT VERSUCHEN** klicken. Der alte Bildstand bleibt bis dahin sichtbar.
7. Spieler ändert nur den Ausschnitt über **AUSSCHNITT BEARBEITEN** → neuer Antrag → SL genehmigt → überall derselbe neue Ausschnitt.
8. Zwei unabhängige Änderungstickets für denselben Charakter erstellen; beide separat genehmigen. Danach einander widersprechende Änderungen am gleichen Feld probieren: Die zweite Freigabe muss wegen Konflikt abgelehnt werden.
9. Einen Einsatzbericht einreichen und freigeben; er muss anschließend in der Charakterakte verlinkt sein.
10. Einen Discord-Charakterkanal **manuell** erstellen, Kanal-Link kopieren und in der Akte bei `Discord-Charakterkanal (URL)` per Ticket eintragen. Der Link wird nach Freigabe auf der Personalakte angezeigt.

C. Test ohne Mitgliedschaft:

11. Mit anderem Discord-Account, der **nicht auf dem RP-Server** ist, anmelden. Er darf keine Akten, Tickets und Originalbilder abrufen. Dieser Test ist vor öffentlicher Nutzung entscheidend.

## 11 – Betrieb, Sicherheit und Datenschutz

- Kosten: GitHub Free + Supabase Free, sofern du in den kostenlosen Tarifgrenzen bleibst. Kostenlose Dienste können Limits/Leistungsbedingungen ändern.
- Pro Charakter 1 **aktives** offizielles Portrait. Alte genehmigte Bildrevisionen bleiben aus Revisionsgründen im GitHub-Verlauf; wenn du sie wirklich löschen möchtest, ist später eine gezielte Bereinigungsroutine nötig.
- Die **öffentlich abrufbaren** WebP-Portraits sind durch keine Discord-Sperre geschützt. Alles andere kommt ausschließlich aus Supabase mit RLS.
- Die private Original-WebP-Datei und die Croppreview liegen (jeweils ≤1 MB) in Supabase Storage und sind nur für Eigentümer und Spielleitung lesbar.
- GitHub Pages baut nach einem neuen Commit neu. Beim ersten Abruf einer genehmigten Datei kann die Verzögerung sichtbar sein; neuer Bildpfad sorgt dafür, dass Browser nicht fälschlich eine ältere Datei zwischenspeichern.
- Für den Schutz gespeicherter Daten regelmäßig **eigene Backups** (z. B. SQL-Export und private Originalbilder) anlegen; der kostenlose Supabase-Tarif enthält keine automatischen Datenbank-Backups.
- Nach Entfernen eines Nutzers vom Discord-Server läuft die letzte bestätigte Mitgliedschaft bis zu fünf Minuten; die Seite prüft alle zwei Minuten. Offen gehaltene bereits angezeigte Inhalte lassen sich nicht rückwirkend löschen.
- Rolle und Bots regelmäßig prüfen, Keys restriktiv halten, Secrets nur in Edge Functions. Ein altes, nicht mehr benötigtes GitHub-PAT widerrufen.
- **Keine Gewähr für Produktivbetrieb vor realen Integrations-/Sicherheitstests.** Browser- und SQL-Dateien wurden lokal vorbereitet; ein Test gegen echte Dienstkonten erfordert deine Konfiguration.

## Troubleshooting

| Problem | Prüfen |
|---|---|
| `SYSTEM NICHT KONFIGURIERT` | `config.js`: Project URL und Publishable Key eingetragen? |
| Discord OAuth lehnt Redirect ab | Discord Redirect = **Supabase Callback URL**; Pages URL = **Supabase Site/Redirect** |
| `ACCESS DENIED` | Bot im richtigen Server? Server-ID, Rollen-ID und Mitgliedschaft korrekt? |
| SQL Editor Fehler | Nur auf neuem, leerem Supabase-Projekt ausführen; komplette SQL-Datei ohne ausgelassene Zeilen |
| Ticket genehmigt, Bild fehlt | GH_TOKEN `Contents: Write`, GH_OWNER, GH_REPO, Pages aktiviert, ggf. `VERÖFFENTLICHUNG ERNEUT VERSUCHEN` |
| Album-/Galeriebilder gesucht | Absichtlich entfernt: weitere Charakterbilder gehören in den Discord-Channel |
| Kostenlose Supabase-Instanz pausiert | Supabase Dashboard öffnen und Projekt reaktivieren |

Referenzen: [Supabase Discord OAuth](https://supabase.com/docs/guides/auth/social-sign-in/auth-discord), [Supabase Edge Functions](https://supabase.com/docs/guides/functions/deploy), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [GitHub Contents API](https://docs.github.com/en/rest/repos/contents).
