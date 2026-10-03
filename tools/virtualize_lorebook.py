import re

with open("src/components/lorebook/LorebookView.tsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("import React, { useState } from 'react';", "import React, { useState, useRef } from 'react';\nimport { useVirtualizer } from '@tanstack/react-virtual';")

# Find where filteredEntries ends
#   const filteredEntries = activeEntries.filter((entry) => {
# ...
#   });
marker = "  });"
# But wait, there are multiple "});". Let's match the exact snippet.
marker = """    if (triggerFilter !== 'all') return hasTrigger;
    return matchesSearch;
  });"""

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
text = text.replace(marker, marker + "\n" + hook_code)

# Replace the map block
regex = r'<div className="flex-1 overflow-y-auto p-5 space-y-3">\s*\{filteredEntries\.map\(\(entry, idx\) => \((.*?)\)\)\}\s*\{filteredEntries\.length === 0 && \('
def repl(m):
    inner = m.group(1)
    # the inner is:
    #              <EntryCard
    #                key={entry.name + idx}
    #                entry={entry}
    #                onToggle={() => handleToggleEntry(entry)}
    #                onEdit={() => setEditingEntry({ entry: { ...entry }, isNew: false })}
    #                onDelete={() => void handleDeleteEntry(entry.name)}
    #              />
    return f"""<div className="flex-1 overflow-y-auto p-5" ref={{parentRef}}>
            <div
              style={{{{ height: `${{virtualizer.getTotalSize()}}px`, width: '100%', position: 'relative' }}}}
            >
              {{virtualizer.getVirtualItems().map((virtualItem) => {{
                const entry = filteredEntries[virtualItem.index];
                return (
                  <div
                    key={{virtualItem.key}}
                    ref={{virtualizer.measureElement}}
                    data-index={{virtualItem.index}}
                    style={{{{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${{virtualItem.start}}px)`,
                      paddingBottom: '12px',
                    }}}}
                  >
{inner}
                  </div>
                );
              }})}}
            </div>

            {{filteredEntries.length === 0 && ("""

text = re.sub(regex, repl, text, flags=re.DOTALL)

with open("src/components/lorebook/LorebookView.tsx", "w", encoding="utf-8") as f:
    f.write(text)
