# SDN-Personalakten v0.13 – Löschen und Aktivitätsstatus

Dieses Update baut auf **v0.12** auf. Es ersetzt **keine** Discord- oder Supabase-Anmeldung und löscht bei der Installation **keine** bestehenden Akten.

## Neu

### SL: Charaktere und Einsätze endgültig löschen

- Die Löschbuttons stehen **ausschließlich in der jeweiligen Detailansicht** und sind nur in der SL-Ansicht sichtbar.
- Eine Browser-Sicherheitsabfrage erklärt die Folgen; bei **Abbrechen** wird nichts gelöscht.
- **Charakter löschen:** Alle gespeicherten Einsätze werden geprüft und die Charakter-ID aus ihren Teilnehmerlisten entfernt. Andere Charaktere verlieren ihre Bekanntschaftsverknüpfungen zu dieser Akte. Offene Beziehungs-Tickets, die auf die gelöschte Akte verweisen, werden abgelehnt. Private TOP-SECRET-Daten, Änderungsanträge und Aktennotizen **der gelöschten Akte** werden per Datenbank-Fremdschlüssel mitgelöscht. Andere Aktennotizen, bei denen der gelöschte Charakter *Verfasser* war, bleiben als historische Textnotizen mit damaligem Namen und Datum bestehen, verlieren aber ihre Verfasser-Verknüpfung.
- **Einsatz löschen:** Das Einsatzprotokoll verschwindet aus dem Archiv. Alle zugehörigen Verweise verschwinden automatisch aus den Personalakten, weil die Einsätze dort aus den tatsächlich existierenden, freigegebenen Protokollen berechnet werden.
- Die gelöschte ID wird nicht neu vergeben. Es bleibt nur ein schmaler Löschvermerk im allgemeinen Auditlog, **ohne** den gelöschten Inhalt.
- **Wichtig:** Veröffentlichte Portraitdateien auf GitHub Pages und nicht mehr benötigte private Bildvorlagen werden mit diesem Datenbankupdate **noch nicht automatisch aus GitHub/Storage gelöscht**. Sie sind nach dem Löschen nicht mehr in der Website verlinkt; gegebenenfalls später separat aufräumen. Weitere Medien auf Discord bleiben ebenfalls unberührt.

### Aktiv/Inaktiv nach der Freigabe

- Der Charakter erhält erst **nach** seiner Freigabe einen optionalen Status-Tag `AKTIV` oder `INAKTIV`.
- Der Tag erscheint auf der Heldenkachel und in der Personalakte.
- Der **Spieler** kann für eigene freigegebene Charaktere einen Statuswechsel **als normales Änderungsticket** mit optionalem Kommentar beantragen. Erst nach der SL-Genehmigung wird der Tag geändert.
- Die **SL** kann den Status bei freigegebenen Akten unmittelbar setzen (ohne Ticket); diese Aktion wird protokolliert.
- Bestehende Akten ohne Tag bleiben ohne Kennzeichnung, bis jemand einen Status festlegt.
- HR hat keine Lösch- oder direkten Statusrechte.

## Installation – unbedingt in dieser Reihenfolge

1. **Backup:** Sicherung der Tabellen `sdn_characters`, `sdn_reports`, `sdn_tickets` und `sdn_file_notes` (z. B. Exporte über Supabase). Das Löschen ist später **unwiderruflich**. Für GitHub vorher einen Commit/Branch als Sicherung erstellen.
2. **Supabase → SQL Editor:** Datei `supabase/migrations/202610280005_deletion_activity.sql` aus diesem Paket in einem Texteditor öffnen; den **kompletten SQL-Inhalt** in den SQL Editor kopieren (nicht den Dateipfad) und einmal mit **Run** ausführen. Eine Erfolgsmeldung `Success. No rows returned` ist erwartbar.
3. **GitHub:** In `timan52/SDN` die **vier** Dateien `index.html`, `app.js`, `backend.js` und `styles.css` durch die aktualisierten Dateien aus diesem Paket ersetzen und auf `main` pushen.
4. **Nicht ersetzen:** `config.js`, `portrait-editor.js`, `.env`, Supabase-Secrets, Discord-Funktionen, vorhandene Portraits und die bereits angewendeten v0.7–v0.12-Migrationen.
5. Die Website `https://timan52.github.io/SDN/` mit `Strg + Umschalt + R` neu laden.

**Keine neuen Edge Functions nötig:** Die Website verwendet drei neue, abgesicherte PostgreSQL-Funktionen (RPCs). Das SQL-Skript aktiviert diese und erteilt nur angemeldeten Nutzern das Recht, sie aufzurufen. **Die Funktionen selbst** prüfen zusätzlich die serverseitig bestätigte Discord-Spielleitungsrolle. Der Browser kann diese Sicherheitsprüfung nicht umgehen.

## Empfohlene Tests vor dem ersten echten Löschen

1. **SL:** Freigegebenen Testcharakter öffnen. Der Button `AKTE LÖSCHEN` und `AKTIVITÄT SETZEN` müssen erscheinen. Zum Löschen zunächst **Abbrechen** wählen; die Akte muss erhalten bleiben.
2. **Spieler:** Eigenen freigegebenen Testcharakter öffnen. `AKTIVITÄT SETZEN` ist sichtbar, `AKTE LÖSCHEN` nicht. Als `Inaktiv` beantragen; die Akte bleibt bis zur Genehmigung unverändert.
3. **SL:** Aktivitätsticket genehmigen. Anschließend sollte der Tag `INAKTIV` auf der Kachel und in der Akte erscheinen.
4. **SL:** Den Status ohne Ticket wieder auf `AKTIV` setzen.
5. **SL:** Testeinsatz mit einem Testcharakter erstellen/freigeben. Den Charakter löschen, **nachdem** du den Report und eine Bekanntschaft mit einem weiteren Testcharakter geprüft hast. Das Protokoll soll bleiben, aber ohne gelöschten Teilnehmer; die Bekanntschaft soll entfernt sein.
6. **SL:** Danach einen **eigenen Testeinsatz** löschen. Der Einsatz soll aus Archiv und den beteiligten Charakterakten verschwinden.
7. **Spieler ohne SL-Rolle:** Ein direkter Aufruf der Lösch-RPC sollte durch Supabase mit einer Berechtigungsfehlermeldung abgelehnt werden. Der fehlende Button allein ist kein ausreichender Test.

## Technische Hinweise

- Das Lösch-SQL führt die Verknüpfungsbereinigung und eigentliche Löschung in **einer Datenbanktransaktion** aus. Tritt ein SQL-Fehler auf, wird die ganze Aktion zurückgerollt.
- `sdn_file_notes.author_character_id` wird zu einer nullable Foreign-Key-Spalte mit `ON DELETE SET NULL`, damit fremde Aktennotizen mit historischem Verfassernamen erhalten bleiben.
- Spielerstatus nutzt das vorhandene Ticketformat (`kind: field`, `key: activityStatus`). Der SQL-Trigger verhindert unzulässige Statuswerte und einen Tag vor der Freigabe.
- Die vier JavaScript-/HTML-Dateien wurden auf Syntax geprüft; die neue UI wurde mit simulierten SL- und Spieler-Sitzungen in Chromium getestet. Die SQL-Migration kann **ohne Zugriff auf dein echtes Supabase-Projekt nicht live geprüft werden**.
