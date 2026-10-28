# SDN-Personalakten v0.12 – Kunde und Kundenbewertung

Dieses Update setzt **v0.11** voraus und ergänzt ausschließlich die Einsatzprotokolle. Bereits gespeicherte Akten, Portraits, Tickets, Aktennotizen und Berichte bleiben erhalten.

## Änderungen

- Die beiden Formularfelder **Organisation** und **Gegner / Schurke** entfallen. Bereits gespeicherte ältere Werte bleiben technisch in früheren Berichten erhalten, werden aber in der neuen Oberfläche nicht mehr gezeigt. Neue Berichte speichern diese Felder nicht mehr.
- Direkt nach der Einsatzbezeichnung wird das Feld **Kunde** angezeigt. Es ist optional und kann auch bei offenen Einsätzen eingetragen werden.
- Das Feld heißt wieder **Einsatzort** – ohne Discord-Hinweis.
- Bei **ABSCHLUSS / ERGEBNIS = Noch offen** sind Kundensterne und Kundenkommentar nicht sichtbar und können nicht abgesendet werden.
- Wird **Erfolgreich abgeschlossen**, **Teilweise erfolgreich** oder **Fehlgeschlagen** gewählt, erscheint die Auswahl **Kundensterne** (1–5, optional) sowie **Kundenkommentar** (optional).
- Bei abgeschlossenen Fällen mit vergebener Bewertung werden die Sterne sowohl auf der Einsatzkachel als auch in der Detailakte angezeigt. Der Kommentar steht in der Detailakte. Offene Fälle zeigen keine Sterne.
- Die Einsatzarchivsuche berücksichtigt jetzt **Kunde** anstelle der entfernten Felder Organisation/Schurke.

> Hinweis: Das jetzige Einsatzformular erstellt neue Protokolle. Ein bereits eingereichter offener Fall kann in dieser Version weiterhin nicht nachträglich über einen eigenen Bearbeitungsantrag abgeschlossen werden. Diese spätere Aktualisierungsfunktion wäre ein separater Ausbauschritt.

## Installation – Reihenfolge

1. **Sicherung:** Committe bzw. sichere zuerst den aktuellen Website-Stand. Bei Bedarf exportiere die Tabelle `sdn_reports` über Supabase.
2. **Supabase SQL Editor:** Öffne aus diesem Paket `supabase/migrations/202610280004_customer_reviews.sql` in einem Texteditor. Kopiere den **vollständigen SQL-Inhalt** in Supabase → SQL Editor und führe ihn mit **Run** aus. Nicht den Dateipfad hineinkopieren. Die Migration ersetzt nur die bereits vorhandene RPC `sdn_submit_report` und erweitert deren Validierung. Das `report`-Feld ist bereits `jsonb`; eine Tabellenänderung ist nicht erforderlich.
3. **GitHub:** Ersetze im Stammverzeichnis deines Repositories `timan52/SDN` nur die drei Dateien `index.html`, `app.js` und `styles.css` durch die Dateien aus diesem Paket. Committe und pushe auf `main`.
4. **Website:** Öffne `https://timan52.github.io/SDN/` und aktualisiere die Seite mit `Strg + Umschalt + R`.
5. **Test:** Erstelle zwei Test-Einsatzprotokolle: eines mit „Noch offen“ (Kundenbewertung muss ausgeblendet bleiben) und eines mit „Erfolgreich abgeschlossen“ und 4 Sternen. Prüfe nach dem Einreichen und Freigeben die Kachel und die Detailakte. Bereits gespeicherte Berichte müssen weiter lesbar sein.

## Nicht ersetzen

`config.js`, `backend.js`, `portrait-editor.js`, Supabase-Secrets, Discord-Funktionen und Portraitdateien **bleiben unverändert**. Ebenso darf `.env` nicht auf GitHub hochgeladen werden.

## Technisches

- Neue JSON-Felder im Report: `customer` (maximal 130 Zeichen), `customerStars` (leer oder 1–5), `customerComment` (maximal 2.000 Zeichen).
- Für offene Fälle sind `customerStars` und `customerComment` leer. Das wird sowohl im Browser als auch in der SQL-Funktion geprüft.
- Die SQL-Migration lässt bestehende Daten und die bisherigen RPC-Berechtigungen unberührt.
- Die Änderungen wurden auf Syntax und die vorhandenen Feldreferenzen geprüft. Ein vollständiger Live-Test mit deinem Supabase-Projekt war hier nicht möglich.
