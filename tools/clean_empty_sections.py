import re

with open("ROADMAP.md", "r", encoding="utf-8") as f:
    text = f.read()

# Replace multiple --- with a single one
text = re.sub(r'(---\n\s*)+', '---\n\n', text)
text = re.sub(r'\n{3,}', '\n\n', text)

with open("ROADMAP.md", "w", encoding="utf-8") as f:
    f.write(text)
