import re

with open("src/components/characters/CharacterLibraryView.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# Add imports
text = text.replace("import { useState, useMemo", "import { useState, useMemo, useRef")
text = text.replace("import { CharacterEditorModal }", "import { useVirtualizer } from '@tanstack/react-virtual';\nimport { useGridCols } from '../../hooks/useGridCols';\nimport { CharacterEditorModal }")

# Replace scrolling container with ref and useVirtualizer
# Search for:
#       {/* Character Cards Grid */}
#       <div className="flex-1 overflow-y-auto p-6">
# ...
#           <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
#             {filteredCharacters.map((char) => {

container_start = text.find('      {/* Character Cards Grid */}')
if container_start != -1:
    print("Found container start")

# We need to inject the hook at the beginning of the component:
#   const { t } = useTranslation();
hook_code = """  const { t } = useTranslation();
  const { ref: parentRef, cols } = useGridCols({ 640: 2, 768: 3, 1024: 4, 1280: 5 }, 1);
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(filteredCharacters.length / cols),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 380, // rough height of a card + gap
    overscan: 2,
  });
"""
text = text.replace("  const { t } = useTranslation();", hook_code)

# Now rewrite the grid rendering:
grid_regex = r'<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">\s*\{filteredCharacters\.map\(\(char\) => \{(.*?)\}\)\}\s*</div>'

def repl_grid(match):
    inner_render = match.group(1)
    
    return f"""<div
            style={{ height: `${{rowVirtualizer.getTotalSize()}}px`, width: '100%', position: 'relative' }}
          >
            {{rowVirtualizer.getVirtualItems().map((virtualRow) => {{
              const startIndex = virtualRow.index * cols;
              const rowItems = filteredCharacters.slice(startIndex, startIndex + cols);

              return (
                <div
                  key={{virtualRow.index}}
                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${{virtualRow.start}}px)`,
                    paddingBottom: '20px', // gap substitute since grid parent doesn't handle vertical gap between virtual rows
                  }}
                >
                  {{rowItems.map((char) => {{
{inner_render}
                  }})}}
                </div>
              );
            }})}}
          </div>"""

text = re.sub(grid_regex, repl_grid, text, flags=re.DOTALL)

# Add ref to the parent div
text = text.replace('<div className="flex-1 overflow-y-auto p-6">', '<div className="flex-1 overflow-y-auto p-6" ref={parentRef}>')

with open("src/components/characters/CharacterLibraryView.tsx", "w", encoding="utf-8") as f:
    f.write(text)
