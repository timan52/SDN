# SDN-Personalakten v0.11 – Formulare und Datenbankregeln

Dieses Paket ist ein **Update für eine bereits eingerichtete v0.10.1-Website**. Es ist keine Neuinstallation. Vorhandene Charaktere, freigegebene Portraits, Änderungstickets, Einsatzprotokolle und Aktennotizen bleiben erhalten. Bestehende alte Felder werden nicht aus der Datenbank gelöscht, nur nicht mehr im neuen Formular gezeigt.

## Was neu ist

**Personalakten:** SDN-ID weiterhin automatisch und zufällig in der Datenbank, Discord-Spieler über die verifizierte Besitzer-ID automatisch zugeordnet. Positionen: Superheld, Dispatcher, Teamleiter, Manager, Standortleitung, Techniker, Arzt. Geheime Identität Ja/Nein statt Blutgruppe. Geschlecht und Fähigkeitsklasse als Auswahl (männlich/weiblich/divers und E–S). Feldbezeichnungen geändert; zusätzliche allgemeine Stärken, allgemeine Schwächen, allgemeine Fähigkeiten, Likes und Dislikes. Entfernt: Zeitpunkt, ärztliche Vermerke, Personalnotizen; TOP SECRET ist ein einziges Freitextfeld, ausschließlich für die SL. Beziehungen erst bei bereits freigegebener Akte. Portrait-Hinweis mit Limit 1 MB, kein Ganzkörperbild und Verweis auf die Server-Bildrichtlinien; der Platz für das künftig gelieferte Musterbild ist reserviert. Formularabschluss: ANMERKUNG ZUM ANTRAG und ABSENDEN.

**Attribute:** 0,5 bis 10 in 0,5er-Schritten. Beim **Erstellen** höchstens 15 Punkte insgesamt und höchstens 6 je Attribut; bei **Änderungen** höchstens 27 Punkte insgesamt und höchstens 10 je Attribut. SL kann bei neuen Akten Werte leer lassen; sie erscheinen als „Keine Daten vorhanden“. Auf Datenbankebene werden die Regeln ebenfalls geprüft.

**Einsätze:** ABSCHLUSS / ERGEBNIS steht vor den Datumfeldern und steuert das Einsatzende. Einsatzbeginn ersetzt Einsatzdatum, Einsatzende nur bei abgeschlossenem Fall. Einsatzort bezeichnet den Discord-RP-Channel, zusätzlicher Nachrichtenlink „Link zum RP“. Alle freigegebenen Helden auswählbar, auch die anderer Spieler. Kein gesondertes Fallstatus-Feld; der Status wird aus dem Ergebnis abgeleitet. Schadensbericht erst bei Ja für betroffene zivile Infrastruktur. Anmerkung zum Antrag optional und Button ABSENDEN. Kompatibilität mit früheren Einsätzen bleibt durch das `date`-Feld erhalten.

## Installation – Reihenfolge einhalten

1. **Sichern:** Sichere oder committe deine derzeitigen lokalen Dateien. Für die Datenbank kannst du vor der Migration einen Datenexport über Supabase durchführen.
2. **SQL aktualisieren:** Öffne in Supabase den **SQL Editor**. Öffne die Datei `supabase/migrations/202610280003_form_rules.sql` in einem Texteditor und kopiere **deren vollständigen SQL-Inhalt** in einen neuen SQL-Editor-Eintrag. Klicke auf Run. **Nicht nur den Dateipfad hineinkopieren!** Voraussetzung: Die Migrationen aus v0.8 und v0.10 wurden bereits ausgeführt.
3. **GitHub:** Ersetze im Stammverzeichnis des Repositories `timan52/SDN` nur `index.html`, `app.js` und `styles.css` durch die drei Dateien dieses Updates. Nicht `config.js`, `backend.js`, `portrait-editor.js`, `.env`, Bilder oder die anderen Dateien ersetzen.
4. Committe die Dateien auf `main` und pushe sie. GitHub Pages sollte die Website unter `https://timan52.github.io/SDN/` aktualisieren.
5. Im Browser mit **Strg + Umschalt + R** aktualisieren und als SL sowie mit einem normalen Discord-Account prüfen.

## Wichtige Tests

1. **Spieler:** Beim Erstellen keine ID- oder Spieler-Eingabe; Position, Geheime Identität, Geschlecht auswählbar; Punktwerte in Halbschritten. 15,5 Gesamtpunkte beziehungsweise ein Attribut mit 6,5 werden abgelehnt.
2. **SL:** Neue Akte mit leeren freiwilligen Angaben und leeren Attributen anlegen; nach Freigabe erscheint „Keine Daten vorhanden“. TOP SECRET ist für die SL sichtbar und bearbeitbar, für normale Spieler nicht. Berechtigungen müssen auch bei direktem DB-Zugriff gesperrt sein.
3. **Beziehungen:** In der Erstellungsmaske keine Bekanntschaften; erst nach der Freigabe verfügbar.
4. **Einsatz:** Solange „Noch offen“ gewählt ist, ist Einsatzende deaktiviert. Bei abgeschlossenem Ergebnis wird es Pflicht. Ein Schadensbericht ist nur bei betroffener ziviler Infrastruktur freigeschaltet. Die optionalen Anmerkungen werden im eingereichten Bericht angezeigt.
5. Bestehende Akten und Einsätze weiterhin öffnen und in den Detailansichten anzeigen.

## Was bewusst noch aussteht

Das angekündigte Musterbild für den Portrait-Hinweis wurde noch nicht geliefert. Bis dahin steht dort ein beschrifteter Platzhalter. Nach Erhalt des Bildes lässt er sich ersetzen, ohne das Datenmodell erneut zu ändern.

**Hinweis:** Die Browseroberfläche wurde mit simulierten Spielersitzungen geprüft. Die tatsächliche SQL-Migration und die Rechteprüfung auf deinem Supabase-Projekt konnten hier nicht live getestet werden. Daher das Update nach Möglichkeit zuerst mit einem Testcharakter prüfen.
