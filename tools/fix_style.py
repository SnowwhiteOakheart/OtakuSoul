with open("src/components/characters/CharacterLibraryView.tsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("style={{{", "style={{")
text = text.replace("position: 'relative' }}", "position: 'relative' }")

with open("src/components/characters/CharacterLibraryView.tsx", "w", encoding="utf-8") as f:
    f.write(text)
