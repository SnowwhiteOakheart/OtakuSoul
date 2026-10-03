with open("src/test/setup.ts", "r", encoding="utf-8") as f:
    text = f.read()
text = text.replace("useVirtualizer: (config: any) => ({", "// oxlint-disable-next-line typescript/no-explicit-any\n  useVirtualizer: (config: any) => ({")
with open("src/test/setup.ts", "w", encoding="utf-8") as f:
    f.write(text)

with open("src/test/stageView.test.tsx", "r", encoding="utf-8") as f:
    text = f.read()
text = text.replace("import userEvent from '@testing-library/user-event';\n", "")
with open("src/test/stageView.test.tsx", "w", encoding="utf-8") as f:
    f.write(text)

with open("src/test/characterEditor.test.tsx", "r", encoding="utf-8") as f:
    text = f.read()
text = text.replace("import { render, screen, within } from '@testing-library/react';", "import { render, screen } from '@testing-library/react';")
with open("src/test/characterEditor.test.tsx", "w", encoding="utf-8") as f:
    f.write(text)
