# SDN v0.26 – Dispatcher-Rolle und automatische Einsatz-Notrufe

**Update für die bestehende v0.25-Website, keine Neuinstallation.** Dieses Paket enthält keine echte `config.js`, keine privaten Schlüssel und keine bereits gespeicherten Daten.

## Neue Funktionen

- Discord-Rolle **Dispatcher** zusätzlich zu `SDN-Zugang`, SL und optional HR.
- Die Webseite prüft diese Rolle über die bestehende serverseitige Discord-Mitgliedschaftskontrolle. Ein Dispatcher darf Einsätze erstellen sowie **die von seinem eigenen Discord-Account eingereichten** Einsatzberichte bearbeiten. Andere Spieler dürfen weiterhin eigene Charaktere bearbeiten, neue Charaktere beantragen und freigegebene Akten und Einsätze lesen. Nur SL darf Anträge genehmigen oder löschen.
- Ein neu erstellter offener Einsatz ist ein **Notruf**: Titel, Level, Ort, Kunde, Einsatzbeginn, Ausgangslage, Dispatcher. **Noch keine Helden oder kein Einsatzverlauf nötig**, bis die Teilnehmer feststehen.
- Ein Dispatcher **als Charakter** (Position `Dispatcher`, freigegeben) muss im Formular ausgewählt werden. Das ist getrennt von der **Discord-Rolle** des Erstellers.
- Erst nach **SL-Freigabe** wird automatisch im konfigurierten Discord-Einsatzforum ein Beitrag mit Name, Einsatzort, Auftraggeber, Ausgangslage und dem zugewiesenen Dispatcher erstellt.
- Spieler können dort freiwillig antworten. Der Dispatcher weist die teilnehmenden Helden danach über **Daten bearbeiten → Änderungsticket** dem Einsatz zu. Auch dieses Ticket muss die SL genehmigen.
- Bei einem **genehmigten Abschluss** (beim Erstellen oder durch späteres Änderungsticket) antwortet der Bot mit `❌ EINSATZ ABGESCHLOSSEN`, erwähnt den Dispatcher-Account und die Besitzer der eingetragenen Helden. Der Bot setzt außerdem eine **❌-Reaktion** auf den ursprünglichen Forenbeitrag.
- Der Thread-Link wird in der Einsatzdetailansicht gezeigt; er wird serverseitig gespeichert und lässt sich nicht über ein frei bearbeitbares Berichtsfeld manipulieren.
- Vorhandene Berichte werden **nicht automatisch** in Discord gepostet.

## Installation – bitte in dieser Reihenfolge

1. **Sicherung anlegen.** GitHub: vorherigen funktionierenden Commit notieren oder Branch anlegen. Supabase: Datenbankexport/Backup vor der Migration sichern. Nicht die alte Initialmigration erneut ausführen.
2. **Discord:** Servereinstellungen → Rollen → eine Rolle `Dispatcher` erstellen/auswählen. Discord-Entwicklermodus aktivieren und die **Rollen-ID** kopieren. Weisen Sie sie den erlaubten Dispatchern zu.
3. **Discord:** Einen neuen **Forumskanal** z. B. `sdn-notrufe` einrichten. Forum-ID kopieren (nicht eine Thread-ID). Forum für `SDN-Zugang` lesbar lassen; `Nachrichten in Threads senden` erlauben, damit Spieler ihre Teilnahme anbieten können. `Beiträge erstellen` für Spieler bei Bedarf deaktivieren.
4. **Discord-Bot im Einsatzforum:** `Kanal ansehen`, `Nachrichten senden` (neuen Forumspost erstellen), `Nachrichten in Threads senden`, `Nachrichtenverlauf lesen`, `Reaktionen hinzufügen`, optional `Links einbetten` erlauben. Der Bot kann weiterhin in der Mitgliedschaftsliste offline wirken; die Supabase-Funktion verwendet die Discord-REST-API.
5. **Supabase → Edge Functions → Secrets:** Folgende **neuen** Secrets hinzufügen:

   | Name | Wert |
   | --- | --- |
   | `DISCORD_DISPATCHER_ROLE_ID` | Rollen-ID von `Dispatcher` |
   | `DISCORD_OPERATION_FORUM_CHANNEL_ID` | ID des Einsatzforums |

   Bestehende Werte `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_GM_ROLE_ID`, `DISCORD_HR_ROLE_ID`, `DISCORD_ACCESS_ROLE_ID`, `SDN_ALLOWED_ORIGINS` und `DISCORD_FORUM_CHANNEL_ID` bleiben bestehen. **Nicht im GitHub-Repository speichern.**
6. **SQL-Migration:** Supabase → SQL Editor → **den Inhalt** der Datei `supabase/migrations/202610300001_dispatcher_operations_forum.sql` kopieren und einmalig ausführen. Das ergänzt die Dispatcher-Berechtigung, überprüft Berichtsanträge serverseitig und legt die Notruf-Warteschlange an. Es entfernt keine bisherigen Einsätze. **Diese Migration ist nicht für blindes Wiederholen gedacht.**
7. **Rollenprüffunktion aktualisieren:** Die mitgelieferte Datei `supabase/functions/verify-discord/index.ts` in deinem lokalen SDN-Projekt ersetzen. PowerShell im Projektordner:

   ```powershell
   npx.cmd supabase functions deploy verify-discord
   ```

8. **Neue Forum-Funktion deployen:** Ordner `supabase/functions/sync-operation-forum` aus dem Update in dein lokales Projekt kopieren:

   ```powershell
   npx.cmd supabase functions deploy sync-operation-forum
   ```

9. **Website:** `index.html`, `app.js`, `backend.js` aus dem ZIP in deinem Repository `timan52/SDN` ersetzen, committen und auf `main` pushen. **Nicht** `config.js`, `styles.css`, die Portrait-Dateien oder die übrigen Supabase-Funktionen ersetzen. Website mit `Strg+Umschalt+R` aktualisieren. Durch neuen Discord-Login/Neuladen wird die Dispatcher-Rolle erkannt.

## Funktionstest mit zwei Rollen

**A. Nutzer ohne Dispatcher-Rolle:** Kann Personalakten beantragen, sieht freigegebene Einsätze, aber keinen Button `Einsatzprotokoll erstellen`. Direkte RPC-Aufrufe sollen ebenfalls abgewiesen werden.

**B. Nutzer mit Dispatcher-Rolle:** Sieht den Erstellen-Button. Kann einen offenen Einsatz ohne Helden und ohne Verlauf, jedoch mit **Titel, Kunde, Einsatzort, Einsatzlevel, Startdatum, Ausgangslage und Dispatcher-Charakter** absenden. Das neue Protokoll bleibt `PENDING`; es darf noch kein neuer Discord-Post erscheinen.

**C. SL:** Öffnet die Einsatzdetailansicht, genehmigt den Bericht. Danach sollte ein Forumspost mit `🚨 OPS-...` erscheinen. Die genehmigte Akte enthält `↗ NOTRUF IM DISCORD-FORUM`. Das bestehende Charakterforum aus v0.25 bleibt unabhängig.

**D. Dispatcher:** Öffnet sein eigenes Protokoll, ergänzt nach Forum-Rückmeldungen die Helden und sendet ein Änderungsticket. Erst nach SL-Genehmigung ist die neue Team-Zuweisung offiziell.

**E. Abschluss:** Dispatcher ergänzt Einsatzverlauf, Einsatzende und Abschluss/Ergebnis; im abgeschlossenen Protokoll muss mindestens ein Held stehen. SL genehmigt das Änderungsticket. Im gleichen Forumspost erscheint die Abschlussnachricht, die Beteiligten werden gepingt und der Bot setzt ❌ auf die Startnachricht.

**F. Rechte:** Ein fremder Dispatcher kann die Einsatzakte lesen, aber keinen Änderungsantrag dafür stellen. Nur SL sieht und verwendet Freigabe- und Löschaktionen.

## Wenn Discord nichts veröffentlicht

1. Prüfen: Handelt es sich um einen **genehmigten** Bericht? Ein Entwurf oder ein offenes Freigabeticket wird nicht veröffentlicht.
2. Als SL die Einsatzakte öffnen und **DISCORD-NOTRUF SYNCHRONISIEREN** klicken. Nicht mehrfach auf den Button klicken, wenn Discord gerade einen Beitrag erstellen könnte.
3. Supabase → Edge Functions → `sync-operation-forum` → Logs/Invocations prüfen.
4. Im SQL Editor lässt sich der Auftragsstatus prüfen:

   ```sql
   select r.report_no, r.status, j.state, j.attempts, j.last_error,
          j.thread_id, j.close_revision, j.notified_revision
   from public.sdn_reports r
   left join public.sdn_operation_forum_jobs j on j.report_id=r.id
   order by r.created_at desc limit 20;
   ```

**Wichtige Einschränkungen:**

- Die Freigabe wird in Supabase sofort gespeichert. Die Discord-Synchronisierung wird beim SL-Genehmigungsklick ausgeführt und bei der nächsten SL-Anmeldung erneut versucht. **Es ist kein dauerhaft laufender Bot oder zeitgesteuerter Worker installiert.** Eine durchgehend automatische Verarbeitung auch ohne SL-Login würde später einen Cron/Webhook erfordern.
- Wie bei der Charakterforum-Funktion v0.25 kann ein seltener Ausfall **nach erfolgreichem Discord-Post und vor dem Speichern der Discord-ID** beim Retry zu einem doppelten Beitrag führen. In diesem Fall vor einem erneuten Versuch das Forum kontrollieren.
- Das erneute Öffnen eines bereits abgeschlossenen Einsatzes entfernt eine früher gesetzte ❌-Reaktion **nicht**. Falls Wiederöffnungen im RP benötigt werden, sollten wir den Ablauf später ausdrücklich modellieren.
- Verknüpfte ehemalige Forenposts werden beim Löschen eines Einsatzes **nicht** automatisch auf Discord gelöscht.
- Der bestehende, zuvor gemeldete Fehler der **Charakterforum-Synchronisierung** aus v0.25 wird durch diese neue Einsatzfunktion nicht automatisch behoben. Beide Edge Functions sind getrennt.
- Die neue Backend- und SQL-Version wurde **nicht gegen deine laufende Datenbank und deinen Discord-Server getestet**. Nach dem Installieren erst mit einem Testeinsatz prüfen.
