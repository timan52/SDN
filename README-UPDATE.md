# SDN v0.24 – Aktenbegriffe, Einsatzbilanz, Status und Geheimname

Dieses Update baut auf den produktiven v0.23-Dateien auf. Es ändert ausschließlich die Benutzeroberfläche und fügt keine neuen Datenfelder oder Datenbankfunktionen hinzu.

## Installation

1. Sichere die aktuellen Dateien `app.js` und `styles.css` in deinem GitHub-Repository `timan52/SDN` oder erstelle einen Wiederherstellungs-Commit.
2. Übernimm die beiden gleichnamigen Dateien aus diesem Paket in das Stammverzeichnis des Repositories. Andere zwischenzeitliche Änderungen bitte zusammenführen.
3. Committe auf `main`, warte auf die GitHub-Pages-Veröffentlichung und aktualisiere `https://timan52.github.io/SDN/` mit Strg + Umschalt + R.
4. **Keine SQL-Migration, keine Änderungen an Supabase, Discord, `config.js`, `backend.js` oder `index.html`.**

## Anpassungen

- Reiter `05 CHARAKTER` statt Psychologisches Gutachten. Die Datenfelder Persönlichkeit, Motivation, Verhalten, psychologische Einschätzung, Likes und Dislikes bleiben erhalten.
- Reiter `07 MEDIZINISCHE AKTE`; im Reiterabschnitt die Kennung `07 / ÄRZTLICHES GUTACHTEN` und Überschrift `Medizinische Akte`.
- Skillmatrix-Kennung `02 / ATTRIBUTSVERTEILUNG` statt `02 / PERSONALBEWERTUNG`.
- Im Fähigkeitenreiter sind `SPEZIALFÄHIGKEIT` und `ALLGEMEINES PROFIL` ohne vorangestellte Abschnittsnummern.
- Einsatzreiter: Bilanz aller **genehmigten, abgeschlossenen und mit dem Charakter verknüpften** Einsätze je Level E, D, C, B, A, S. Das umfasst zugewiesene Helden und Dispatcher. Nicht eingestufte Altfälle werden nicht in die einzelnen Level addiert. Level mit null abgeschlossenen Einsätzen zeigen ausdrücklich `0`.
- Einsatzkacheln in beiden Übersichten: Level und Fallstatus stehen nebeneinander. Der Status ist gerade, ohne Schräge und typografisch gleich groß wie das Level. Der große Stempel in der eigentlichen Einsatzdetailansicht bleibt unverändert.
- Bürgerlicher Name mit Geheimidentität: derselbe Hintergrund, dieselbe Zeilenhöhe und dieselbe Buttonposition für `ANZEIGEN` und `VERBERGEN`. Bei leerem Namen wird schlicht `Keine Daten vorhanden` angezeigt.

## Testen

1. Öffne eine Personalakte mit geheimer Identität: Verborgenen Namen anzeigen und wieder verbergen; die Zeile darf dabei nicht springen.
2. Öffne `Einsätze`: Sechs Level-Kacheln E–S mit Zählung, auch bei null.
3. Öffne das Einsatzarchiv und prüfe Level- und Status-Labels auf mehreren Kacheln und auch im Einsatzreiter eines Charakters.
4. Prüfe die umbenannten Register und Abschnittstitel. Die Formulare/Felder/gespeicherten Inhalte bleiben unverändert.
