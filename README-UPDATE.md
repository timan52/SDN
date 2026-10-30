# SDN v0.25 – Discord-Rollenfreigabe und Charakterforum

Dieses Paket ist ein **Update für die funktionierende SDN-v0.24-Website**. Es enthält keine `config.js`, keinen Bot-Token und keine anderen Zugangsdaten. Bestehende Charaktere, Berichte, Tickets und Portraits bleiben erhalten.

## Was neu ist

1. Login + Datenzugriff nur nach manueller Vergabe einer Discord-Rolle durch die SL. Die SL- und optional HR-Rolle haben weiterhin Zugang. Die bestehende Supabase-RLS schützt die Akten auch vor direkten Datenbankaufrufen ohne frische Rollenfreigabe.
2. Sobald ein **neuer Charakter** über sein Ticket genehmigt wurde, veröffentlicht die Serverfunktion das bereits genehmigte Portrait in GitHub und erstellt danach einen **Discord-Forenbeitrag**. Titel: Alias und SDN-ID; Anfangsnachricht: Spieler-Ping, Portrait und direkter Link zur Akte.
3. Der Discord-Forenlink erscheint automatisch oben in der Personalakte als „Charakterkanal“. Die Angabe kann nicht länger über das Formular gefälscht oder manuell verändert werden.
4. Fehlgeschlagene Forenveröffentlichungen bleiben in einer Warteschlange gespeichert. Bei SL-Anmeldung wird eine begrenzte Anzahl erneut versucht. Außerdem hat die SL in der Personalakte einen Button „FORENBEITRAG ERSTELLEN / ERNEUT VERSUCHEN“.
5. Die URL `https://timan52.github.io/SDN/?character=<UUID>` öffnet nach Anmeldung direkt die Personalakte. Der Link wird beim Discord-Login für den Rücksprung zwischengespeichert.

## Wichtig: Discord-Forenberechtigungen

Forenbeiträge sind **öffentliche Threads im Forum**, keine eigenen Discord-Kanäle mit individuellen Berechtigungen. Sie erben die Berechtigungen des Forums.

- Der Bot benötigt im Charakterforum **Kanal ansehen**, **Nachrichten senden** (damit er neue Forenbeiträge eröffnen kann) und **Links einbetten**.
- Spieler mit `SDN-Zugang` benötigen **Kanal ansehen**, **Nachrichten in Threads senden** und **Dateien anhängen**. So können sie in ihren Charakterbeiträgen Texte und Bilder posten.
- Um zu verhindern, dass Spieler selbst Forenbeiträge eröffnen, kann **Nachrichten senden** für die Spielerrolle im Forum deaktiviert werden. **Nachrichten in Threads senden** muss dagegen aktiviert bleiben.
- Andere Spieler mit derselben Berechtigung dürfen technisch auch in fremden Forenbeiträgen antworten. Discord bietet **keine nativen Rollenberechtigungen pro öffentlichem Forenbeitrag**. Wenn ausschließlich der jeweilige Charakterbesitzer schreiben darf, braucht es eine andere Struktur oder zusätzliche Bot-Moderation.

## Einrichtung in der richtigen Reihenfolge

### 1. Discord-Rolle anlegen

Discord-Server → **Servereinstellungen → Rollen → Rolle erstellen**. Beispielname: `SDN-Zugang`.

Gewährt wird diese Rolle künftig **manuell durch die Spielleitung nach einem genehmigten Charakterkonzept im Discord-Ticket**. Die Ticketbearbeitung selbst bleibt unverändert. In Discord unter Benutzereinstellungen → Erweitert → Entwicklermodus die Rolle-ID kopieren.

### 2. Ein Forum anlegen

Discord-Server → Kanal erstellen → **Forum** (Beispiel: `charakterakten`). Forum-ID über Rechtsklick/Entwicklermodus kopieren. Stelle die Berechtigungen wie oben beschrieben ein. Den Bot zu dieser Forumsberechtigung hinzufügen.

### 3. Supabase-Secrets hinterlegen

Supabase Dashboard → **Edge Functions → Secrets**:

| Secret | Wert |
|---|---|
| `DISCORD_ACCESS_ROLE_ID` | Discord-Rollen-ID von `SDN-Zugang` |
| `DISCORD_FORUM_CHANNEL_ID` | Numerische ID des **Forums**, nicht eines Forenbeitrags |
| `SDN_SITE_URL` | `https://timan52.github.io/SDN/` |

Bereits vorhandene Werte `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_GM_ROLE_ID`, optional `DISCORD_HR_ROLE_ID` und `SDN_ALLOWED_ORIGINS` bleiben bestehen. **Keine Secrets in GitHub hochladen.**

### 4. Die aktualisierte Rollenprüfung deployen

Im lokalen GitHub-SDN-Projekt die Datei `supabase/functions/verify-discord/index.ts` ersetzen und in PowerShell ausführen:

```powershell
npx.cmd supabase functions deploy verify-discord
```

Die **neue** Prüfung akzeptiert nur Accounts mit `SDN-Zugang`, SL oder optional HR. Bis ein Spieler die Rolle erhält, bleibt sein Datenzugriff gesperrt. Die Anmeldung bei Discord kann trotzdem funktionieren.

### 5. Datenbankmigration ausführen

Supabase Dashboard → **SQL Editor**. **Den Inhalt** von `supabase/migrations/202610290001_discord_access_and_forum.sql` kopieren und ausführen – **nicht den Dateinamen**.

Die Migration legt die Warteschlange für Forenbeiträge an und sperrt direkte Änderungen des Links auf den Discord-Charakterkanal. Am Ende werden bisherige Rollenprüfungen ungültig gemacht, damit die neue Freigaberolle wirklich geprüft werden muss.

**Wichtig:** Diesen Schritt erst nach dem Deploy von `verify-discord` ausführen. Die übrigen früheren SDN-Migrationen müssen bereits vorhanden sein.

### 6. Neue Forenfunktion deployen

Ordner `supabase/functions/sync-character-forum/index.ts` aus dem ZIP ins lokale Projekt kopieren:

```powershell
npx.cmd supabase functions deploy sync-character-forum
```

Die Funktion verwendet den vorhandenen Bot-Token nur serverseitig; es wird kein dauerhafter Prozess auf deinem PC benötigt.

### 7. Website aktualisieren

Die Dateien `app.js` und `backend.js` aus dem ZIP in `timan52/SDN` ersetzen, auf `main` committen und pushen. `config.js`, `index.html`, `styles.css`, `portrait-editor.js`, Portraits und andere Daten **nicht** ersetzen.

Öffne die Website und aktualisiere mit `Strg + Umschalt + R`.

## Testplan

1. Discord-Nutzer **ohne** SDN-Zugangsrolle: OAuth-Login möglich, aber `ACCESS DENIED`; keine Akten in der Datenbank abrufbar.
2. SL-Account **ohne** Spielerrolle: Zugriff auf die Personalübersicht und SL-Funktionen weiterhin möglich.
3. Testnutzer **mit** Zugangsrolle: vollständiger Login, Erstellung eines neuen Charaktertickets möglich.
4. SL genehmigt neuen Charakter mit bereits hochgeladenem und zugeschnittenem Portrait.
5. Nach GitHub-Portraitveröffentlichung erzeugt die neue Edge Function im Forum einen Beitrag mit **Alias + SDN-ID**, **Spieler-Ping**, **Bild** und **Link** zur Personalakte. Ein Spieler kann dort Bilder hochladen.
6. Personalakte neu laden: oben erscheint der Link `↗ CHARAKTERKANAL`. Direktlink aus Discord führt nach Login zur richtigen Akte.
7. Wiederholte Freigabe / erneuter Funktionsaufruf darf nicht einfach einen zweiten Forenbeitrag erzeugen. Bei einem Fehler den neuen SL-Wiederholen-Button verwenden und die Logs unter **Edge Functions → sync-character-forum → Logs** prüfen.
8. Spielerrolle wieder entfernen: Der Zugriff sollte nach erneuter Prüfung verschwinden. Bestehende Prüfungen laufen nach maximal ca. **fünf Minuten** ab; der Browser prüft alle zwei Minuten nach.

## Bereits genehmigte Charaktere

Bestehende Akten werden beim Datenbank-Upgrade **nicht automatisch** als neue Forenbeiträge veröffentlicht. Das verhindert, dass Testcharaktere ungefragt als Beiträge erscheinen. Als SL kannst du eine bereits genehmigte Akte öffnen und dort `FORENBEITRAG ERSTELLEN / ERNEUT VERSUCHEN` wählen.

## Ausfallsicherheit und Grenzen

- Die Datenbank genehmigt die Personalakte unabhängig von Discord. Kann Discord gerade keinen Beitrag anlegen, bleibt ein Auftrag als `failed` gespeichert und kann wiederholt werden.
- Ein seltener Grenzfall bleibt: Discord erstellt den Beitrag erfolgreich, aber die anschließende Datenbankbestätigung scheitert. Bei einem späteren Wiederholungsversuch könnte dann ein zweiter Beitrag entstehen. Vor einem manuellen Retry in diesem Fall den Discord-Forumskanal prüfen. Für streng garantierte Einmaligkeit braucht es einen zusätzlichen Discord-Abgleich oder einen dedizierten Worker.
- Ohne laufenden Worker erfolgt ein automatischer Wiederholungsversuch bei SL-Besuch; es gibt in dieser Version keine zeitgesteuerten Hintergrundläufe.
- Ein Forenbeitrag erbt die Schreibrechte seines Forums. Nur-dieser-eine-Spieler-Schreibrechte pro öffentlichem Forenbeitrag sind nativ nicht möglich.
- Bilder werden in den Beiträgen als Embed auf das **öffentliche freigegebene GitHub-Portrait** verlinkt; weitere Bilder laden Spieler direkt in Discord hoch. Supabase speichert sie nicht zusätzlich.
- Neue Discord-Rollen werden ausschließlich von der SL vergeben. Der Bot vergibt die Website-Zugangsrolle nicht selbst.

## Unveränderte Bereiche

Alle bisherigen Aktenfelder, Ticketfreigaben, Einsatzprotokolle, Kacheln, Skillmatrix, Aktennotizen, Medizinische Akte, private TOP SECRET-Daten und Profile bleiben Bestandteil der Website. Dieses Paket enthält keine neue CSS-Datei.
