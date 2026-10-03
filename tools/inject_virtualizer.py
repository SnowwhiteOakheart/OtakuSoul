import re

with open("src/components/lorebook/LorebookView.tsx", "r", encoding="utf-8") as f:
    text = f.read()

marker = "    return matchesSearch && matchesFilter;\\n  });"

hook_code = """
  const parentRef = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // rough height of an entry card
    overscan: 5,
  });
"""
text = text.replace("    return matchesSearch && matchesFilter;\n  });", "    return matchesSearch && matchesFilter;\n  });\n" + hook_code)

with open("src/components/lorebook/LorebookView.tsx", "w", encoding="utf-8") as f:
    f.write(text)
