with open("src/test/setup.ts", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("window.ResizeObserver = ResizeObserver;", "if (typeof window !== 'undefined') window.ResizeObserver = ResizeObserver;")

with open("src/test/setup.ts", "w", encoding="utf-8") as f:
    f.write(text)
