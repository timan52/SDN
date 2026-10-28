# SDN v0.22 – Aktenkopf, Skillmatrix und einheitliche Kacheln

Dieses Paket ist ein **Frontend-Update** für die bestehende produktive SDN-Website auf Basis von **v0.21**. Es enthält **keine** Datenbankmigration, kein neues Backend und keine Zugangsschlüssel.

## Installation

1. **Backup:** Vorhandene `app.js` und `styles.css` des GitHub-Repositories `timan52/SDN` sichern oder den aktuellen Git-Commit als Rücksetzpunkt festhalten.
2. **Dateien ersetzen:** Im Stammverzeichnis des Repositories die bestehenden Dateien `app.js` und `styles.css` durch die beiden gleichnamigen Dateien aus diesem Paket ersetzen. Bitte **beide zusammen** übernehmen.
3. **Veröffentlichen:** Änderungen auf dem `main`-Branch committen und zu GitHub pushen. Die GitHub-Pages-Veröffentlichung abwarten.
4. **Kontrolle:** `https://timan52.github.io/SDN/` mit `Strg + Umschalt + R` neu laden und die Ansicht mit dem Discord-Account überprüfen.

**Nicht ändern:** `index.html`, `config.js`, `backend.js`, `portrait-editor.js`, Supabase, Edge Functions, SQL-Migrationen, Portraitdateien und Discord-Einstellungen.

## Umgesetzte Änderungen

- **Identität:** `Geschlecht` aus dem Aktenkopf entfernt. Der Wert wird stattdessen einmalig unter **Identität → Personendaten** angezeigt; das Formularfeld bleibt bestehen.
- **Skillmatrix:** Combat wird als Faust, Mobility als laufende Person, Charisma als Sprechblase angezeigt. Symbole für Vigor (Schild) und Intellect (Gehirn) bleiben erhalten. Textbezeichnungen und Werte der Balken bleiben unverändert.
- **Register:** In Aktenblättern werden Register bei wenig Platz automatisch auf mehrere Zeilen umgebrochen. Keine horizontale Register-Scrollleiste.
- **Heldenkacheln:** Profilbilder bleiben im Format **4:5**. Der Informationsbereich jeder Kachel hat unabhängig von der Textlänge dieselbe Höhe. Lange Heldennamen/Spielernamen werden bei Bedarf auf zwei Zeilen begrenzt.
- **Einsatzkacheln:** Alle Kacheln haben eine feste Höhe. Die Titel und andere zu lange Texte werden auf eine sinnvolle Zeilenanzahl begrenzt und nicht über benachbarte Kacheln ausgedehnt. Die vollständigen Angaben sind in der Detailansicht weiterhin vorhanden.
- **Reihenfolge in Einsatzkacheln:** Fallstempel, Einsatzname, Datum/Ort/Kundenname (ohne `KUNDE:`), Einsatzlevel, **DISPATCHER:** vor **TEAM:**, gegebenenfalls Kundensterne und SL-Freigabestatus. `DISPATCHER:` und `TEAM:` sind beide fett, die Namen haben dieselbe normale Schriftstärke.
- **Unverändert:** Reiterinhalt, Formulare, Speicherung, Freigaben, IDs, Rollen und Bilder.

## Testempfehlung

1. Eine Personalakte öffnen: Geschlecht nur unter Personendaten sichtbar, Kopf enthält weiterhin Discord-Spielername und ggf. Charakterkanal.
2. Skillmatrix öffnen: fünf Symbole und unveränderte Bezeichnungen in den Balken prüfen.
3. Browser verkleinern: Reiter umbrechen statt horizontal zu scrollen.
4. Mehrere Helden mit unterschiedlich langen Aliasnamen und mehrere Einsätze mit unterschiedlich langen Teamlisten anschauen: Kartenhöhen bleiben gleich.
5. Einsatz mit Dispatcher, Team und Kunde öffnen: Kundenname nach dem Ort unter dem Titel; Dispatcher steht vor Team.
6. Als normaler Spieler und als SL prüfen, dass Status und Freigaben weiterhin korrekt angezeigt werden.

## Hinweise

Die Vorschau wurde in einer isolierten Chromium-Testseite mit **simulierten** Helden und Einsätzen auf Desktop und Mobilgeräten geprüft. Es erfolgte **kein** Zugriff auf dein laufendes Supabase-Projekt. Bei langen Namen wird in der Kachel bewusst gekürzt; der vollständige Text bleibt in der Detailansicht und für Screenreader erhalten.
