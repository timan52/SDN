# SDN v0.16 – Einsatzprotokolle bearbeiten und löschen

Dieses Paket ist ein **Update für die bestehende v0.15**. Es löscht keine vorhandenen Charaktere oder Berichte. Die Datenbankänderung muss vor dem Upload der neuen Website-Dateien ausgeführt werden.

## Vorbereitung

1. Im Supabase-Dashboard nach Möglichkeit eine Sicherung/Export deiner vorhandenen Tabellen erstellen (insbesondere `sdn_reports`).
2. Den aktuellen GitHub-Commit als Rücksprungpunkt notieren. **Keine** `.env`-Dateien, Discord-Bot-Tokens oder GitHub-Tokens zu GitHub hinzufügen.
3. Vergewissern, dass die Datenbankmigrationen bis einschließlich `202610280006_dispatchers.sql` aus v0.14 installiert sind.

## Installation

1. **Supabase → SQL Editor** öffnen. Die Datei `supabase/migrations/202610280007_report_edits.sql` im Texteditor öffnen, **ihren gesamten Inhalt** in den SQL Editor kopieren und einmal ausführen. Nicht den bloßen Dateipfad eingeben. Erwartet: `Success. No rows returned`.
2. Im Repository `timan52/SDN` im Stammverzeichnis diese **vier Dateien zusammen** ersetzen: `index.html`, `app.js`, `backend.js`, `styles.css`.
3. Auf `main` committen/pushen. Bei **GitHub → Actions** bzw. **Settings → Pages** prüfen, dass die Veröffentlichung erfolgreich war.
4. Die Seite `https://timan52.github.io/SDN/` mit **Strg+Umschalt+R** neu laden. Die bestehende `config.js`, Discord-Edge-Functions, Portrait-Dateien und übrigen Dateien bleiben unverändert.

## Neuer Ablauf

- Beim Öffnen eines Einsatzprotokolls stehen **DATEN BEARBEITEN** und (nur für SL) **EINSATZPROTOKOLL LÖSCHEN** in derselben Aktionsleiste **oberhalb des Dokuments** wie bei der Personalakte.
- Der Ersteller des Einsatzprotokolls oder ein SL-Mitglied kann das vorhandene Protokoll in der bekannten Formularmaske bearbeiten. Die bestehenden Felder werden vorausgefüllt, auch der Abschlussstatus und eine mögliche Kundenbewertung.
- Mit **ABSENDEN** wird ein **Änderungsantrag** erzeugt; der bisher freigegebene Bericht bleibt unverändert. Die optionalen „ANMERKUNG ZUM ANTRAG“-Texte werden mitgespeichert.
- In der Detailansicht unter **ÄNDERUNGSANTRÄGE** sieht der Einreicher seine Anträge; die Spielleitung sieht alle und kann sie genehmigen oder ablehnen. Die Entscheidung ist im Unterschied zum gewöhnlichen Fall-Abschluss ausschließlich SL-berechtigt.
- Auch mehrere parallele Änderungen werden unterstützt. Werden dieselben Felder nach Antragstellung geändert, blockiert die Datenbank eine überholte Freigabe mit einer **Konfliktmeldung**. Nicht überlappende Feldänderungen können unabhängig genehmigt werden.
- Ein genehmigter Änderungsantrag aktualisiert **denselben Einsatzbericht**, ohne eine neue OPS-ID zu vergeben. Änderungen an Beteiligten oder Dispatcher passen dadurch auch die Verknüpfungen in den Charakterakten automatisch an.
- **Löschen** bleibt eine SL-exklusive, serverseitig geschützte Funktion mit Sicherheitsabfrage. Beim Löschen verschwinden die Verknüpfungen zu den Charakterakten; offene Änderungsanträge für diesen Bericht werden über `ON DELETE CASCADE` ebenfalls entfernt.
- Neue Einsatzberichte können unverändert erstellt und durch die SL genehmigt werden. Bei zunächst noch nicht freigegebenen Berichten muss die ursprüngliche Freigabe erfolgen, bevor ein separater Änderungsantrag genehmigt werden kann.

## Prüfen – am besten mit Testdaten

1. Bereits genehmigten Testeinsatz öffnen: beide Aktionen oben sehen (Spieler sieht nur „DATEN BEARBEITEN“, wenn er der Einreicher ist; SL sieht auch Löschen).
2. Einsatz durch Spieler bearbeiten, beispielsweise Kundensterne oder Abschluss ändern, und **ABSENDEN** klicken. Die ursprünglichen Werte dürfen noch nicht verändert sein.
3. Mit SL-Account den Änderungsantrag unter dem Einsatz ansehen, Vorher-nachher vergleichen und genehmigen. Die neuen Werte müssen anschließend in der Akte und auf der Kachel erscheinen.
4. Zwei Tickets mit Änderungen an demselben Feld einreichen. Eines genehmigen. Beim zweiten muss die Konfliktprüfung die Freigabe verhindern.
5. Ein Ticket ablehnen und prüfen, dass die Akte unverändert bleibt.
6. SL-Löschbutton nur mit **Testeinsatz** überprüfen. Die Referenz muss in der Charakterakte verschwinden.
7. Das Neuanlegen eines Einsatzes weiterhin testen (die beiden Dialogwege verwenden dasselbe Formular).

## Sicherheit

Die Migration ergänzt `sdn_report_edits` mit Row Level Security. Es gibt **keine** direkten INSERT-, UPDATE- oder DELETE-Rechte für den Browser. `sdn_submit_report_edit` prüft Discord-Mitgliedschaft, Berichtseigentümer/SL, erlaubte Felder, Referenzen und Berichtsregeln. `sdn_review_report_edit` prüft SL-Berechtigung und mögliche Versionskonflikte serverseitig. Bereits vorhandene Löschregeln bleiben bestehen.

## Was nicht automatisch getestet wurde

Ein vollständiger Test gegen deine **live laufende** Supabase-Datenbank und deinen echten Discord-Account ist hier nicht möglich. Die JS-Syntax wurde geprüft, die Servermigration nicht in deinem Projekt ausgeführt. Die Browser-Testumgebung hat lokale Seitenaufrufe gesperrt. Deshalb bitte zunächst einen Testbericht und ein Testticket verwenden.
