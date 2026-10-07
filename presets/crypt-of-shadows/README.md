# Die Gruft der vergessenen Schatten – 5e-Starter-Abenteuer (Soul Stage)

Ein kurzes, vollständig spielbares Abenteuer für Soul Stage mit den 5e-kompatiblen Regeln (SRD 5.1): vier klassische
Helden, drei Akte, drei Karten. Alle Texte sind auf Deutsch geschrieben; Karten und Szenen tragen englische und
russische Übersetzungen in `extensions.otakusoul_i18n`.

## Helden

| Datei | Held | Klasse (`extensions.otakusoul_5e`) |
|---|---|---|
| `thorin.json` | Thorin Eisenbart, Zwerg | Kämpfer |
| `lyra.json` | Lyra Sternenhain, Hochelfe | Magierin |
| `finn.json` | Finn Flinkfuß, Halbling | Schurke |
| `althea.json` | Althea Sonnwind, Mensch | Klerikerin |

Die Porträts sind verkleinerte Fassungen von `public/stage/heroes/`, die Spielbrett-Tokens liegen in
`public/stage/tokens/hero_*.svg`. Andere Apps ignorieren die Erweiterungen und sehen normale V2-Karten.

## Akte

| Szene | Karte | Ziele (die Engine hakt sie ab) |
|---|---|---|
| `akt1_waldstrasse` – Überfall auf der Waldstraße | `forest_road` | Hinterhalt der Banditen überstehen, der Straße nach Westen zur Gruft folgen |
| `akt2_gruft` – Die Hallen der Gruft | `crypt_hall` | Goblins in der Grabhalle besiegen, Treppe in die Tiefe finden |
| `akt3_heiligtum` – Das Herz der Schatten | `shadow_sanctum` | Den Totenbeschwörer besiegen |

Die Akte sind gewöhnliche Szenen (`SceneDefinition` mit `rules.ruleset = "5e"`, `map_id`, `goals`, `next_scene`).
Sind alle Ziele erreicht, führt „Weiter mit dem nächsten Akt“ die Gruppe samt Klassen und Inventar in den nächsten Akt.
Die App kopiert die Akte beim Start in den Szenenordner „Die Gruft der vergessenen Schatten“. Gestartet wird über
**Stage → 5e-Abenteuer** (Lobby mit Regelwerk-Filter und Abenteuer-Banner).

## Namensnennung

This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and
available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative
Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

Der Totenbeschwörer ist eine Anpassung des SRD-„Cult Fanatic“ (gleiche Verteidigung und Trefferpunkte; seine Zauber
sind als nekrotischer Fernangriff umgesetzt). Geschichte, Figuren, Orte und Karten sind eigene Inhalte von OtakuSoul.
