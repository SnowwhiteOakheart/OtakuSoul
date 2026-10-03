import re

with open("src/components/characters/CharacterLibraryView.tsx", "r", encoding="utf-8") as f:
    text = f.read()

hook_code = """  const { t, currentLanguage } = useTranslation();
  const { ref: parentRef, cols } = useGridCols({ 640: 2, 768: 3, 1024: 4, 1280: 5 }, 1);
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(filteredCharacters.length / cols),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 380, // rough height of a card + gap
    overscan: 2,
  });
"""
text = text.replace("  const { t, currentLanguage } = useTranslation();", hook_code)

with open("src/components/characters/CharacterLibraryView.tsx", "w", encoding="utf-8") as f:
    f.write(text)
