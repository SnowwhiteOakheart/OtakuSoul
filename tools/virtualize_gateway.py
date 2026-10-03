import re

with open("src/components/hub/tabs/GatewayCharactersTab.tsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("import { useEffect } from 'react';", "import { useEffect } from 'react';\nimport { useVirtualizer } from '@tanstack/react-virtual';\nimport { useGridCols } from '../../../hooks/useGridCols';")

hook_code = """
  const { ref: gridRef, cols } = useGridCols({ 640: 3, 768: 4, 1024: 5, 1280: 6 }, 2);
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: Math.ceil(visible.length / cols),
    getScrollElement: () => document.getElementById('hub-tabpanel'),
    estimateSize: () => 360,
    overscan: 2,
  });
"""

text = text.replace("  const visible = list.items.filter((c) => matchesQuery(query, c.name, c.author));", "  const visible = list.items.filter((c) => matchesQuery(query, c.name, c.author));\n" + hook_code)

regex = r'<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">\s*\{visible\.map\(\(char\) => \((.*?)\)\)\}\s*</div>'
def repl(m):
    inner = m.group(1)
    return f"""<div ref={{gridRef}} style={{{{ height: `${{virtualizer.getTotalSize()}}px`, width: '100%', position: 'relative' }}}}>
        {{virtualizer.getVirtualItems().map((virtualRow) => {{
          const startIndex = virtualRow.index * cols;
          const rowItems = visible.slice(startIndex, startIndex + cols);

          return (
            <div
              key={{virtualRow.index}}
              ref={{virtualizer.measureElement}}
              data-index={{virtualRow.index}}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
              style={{{{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${{virtualRow.start}}px)`,
                paddingBottom: '16px',
              }}}}
            >
              {{rowItems.map((char) => (
{inner}
              ))}}
            </div>
          );
        }})}}
      </div>"""

text = re.sub(regex, repl, text, flags=re.DOTALL)

with open("src/components/hub/tabs/GatewayCharactersTab.tsx", "w", encoding="utf-8") as f:
    f.write(text)
