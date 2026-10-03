with open("src/hooks/useGridCols.ts", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("matchedCols = breakpoints[bp];", "matchedCols = breakpoints[bp] ?? defaultCols;")

with open("src/hooks/useGridCols.ts", "w", encoding="utf-8") as f:
    f.write(text)

with open("src/components/characters/CharacterLibraryView.tsx", "r", encoding="utf-8") as f:
    text = f.read()

hook_code = """  const { ref: parentRef, cols } = useGridCols({ 640: 2, 768: 3, 1024: 4, 1280: 5 }, 1);
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(filteredCharacters.length / cols),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 380, // rough height of a card + gap
    overscan: 2,
  });
"""

text = text.replace(hook_code, "")

# We will inject the hook code AFTER filteredCharacters is defined.
# Look for the end of filteredCharacters declaration
marker = "  }, [availableCharacters, searchQuery, triggerFilter, selectedTag]);"
text = text.replace(marker, marker + "\\n\\n" + hook_code)

with open("src/components/characters/CharacterLibraryView.tsx", "w", encoding="utf-8") as f:
    f.write(text)
