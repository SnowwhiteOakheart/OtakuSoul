import re

with open("src/components/lorebook/LorebookView.tsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("const entry = filteredEntries[virtualItem.index];\n                return (", "const entry = filteredEntries[virtualItem.index];\n                if (!entry) return null;\n                return (")
text = text.replace("key={entry.name + idx}", "key={entry.name + virtualItem.index}")

with open("src/components/lorebook/LorebookView.tsx", "w", encoding="utf-8") as f:
    f.write(text)
