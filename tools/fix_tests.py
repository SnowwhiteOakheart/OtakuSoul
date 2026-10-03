import re

with open("src/test/characterTranslations.test.tsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("import React from 'react';\n", "")
text = text.replace("fireEvent.change(descField, {", "fireEvent.change(descField!, {")

with open("src/test/characterTranslations.test.tsx", "w", encoding="utf-8") as f:
    f.write(text)

with open("src/test/generalSettings.test.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# Replace useAppStore.setState(..., true) with useAppStore.setState(...) which is a shallow merge, or provide full state.
# Let's remove the `true` argument to use shallow merge.
text = text.replace("useAppStore.setState({ appLanguage: 'de', scannedVrms: [], scannedLive2ds: [] }, true);", "useAppStore.setState({ appLanguage: 'de', scannedVrms: [], scannedLive2ds: [] });")

with open("src/test/generalSettings.test.tsx", "w", encoding="utf-8") as f:
    f.write(text)

