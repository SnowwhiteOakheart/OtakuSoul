---
paths:
  - "e2e/**"
  - "presets/locales/**"
  - "src/i18n/**"
---
# E2E-Tests & Mehrsprachigkeit
Lies bei Aufgaben in diesem Bereich [`docs/ai/app-ui-i18n.md`](../../docs/ai/app-ui-i18n.md) sowie [`e2e/README.md`](../../e2e/README.md).
- Neue UI-Schlüssel in alle drei mitgelieferten Locales (`de`, `en`, `ru`) aufnehmen und mit `npm run i18n:check` prüfen.
- Gezielte E2E-Läufe über `npm run e2e:filter -- <muster>` statt der kompletten Suite fahren (`OTAKUSOUL_E2E_VERBOSE=1` oder `--verbose` für Driver-Logs).
