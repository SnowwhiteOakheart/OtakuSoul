import re

with open("ROADMAP.md", "r", encoding="utf-8") as f:
    lines = f.readlines()

roadmap_out = []
completed_out = []

current_block = []
is_completed = False

def process_block():
    global current_block, is_completed
    if not current_block:
        return
    if is_completed:
        completed_out.extend(current_block)
    else:
        roadmap_out.extend(current_block)
    current_block = []
    is_completed = False

for line in lines:
    match = re.match(r'^(\s*)(?:-|\d+\.)\s+\[([ xX])\]\s+(.*)', line)
    if match:
        process_block()
        is_completed = match.group(2).lower() == 'x'
        current_block.append(line)
    elif line.startswith('#') or line.strip() == '' or line.startswith('---'):
        process_block()
        roadmap_out.append(line)
    else:
        if current_block:
            current_block.append(line)
        else:
            roadmap_out.append(line)

process_block()

with open("ROADMAP.md", "w", encoding="utf-8") as f:
    f.writelines(roadmap_out)

with open("ROADMAP_ABGESCHLOSSEN.md", "a", encoding="utf-8") as f:
    f.writelines(completed_out)

