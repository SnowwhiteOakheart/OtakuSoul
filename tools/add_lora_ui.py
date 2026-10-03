import re

with open("src/components/integrations/tabs/ImageGenTab.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# Add ScannedModel to imports
text = text.replace(
    "import type { ImageGenConfig, LocalImageStatus } from '../../../types';",
    "import type { ImageGenConfig, LocalImageStatus, ScannedModel } from '../../../types';"
)

# Add state
state_code = """  const [loras, setLoras] = useState<ScannedModel[]>([]);

  useEffect(() => {
    api.scanLoras().then(setLoras).catch(() => {});
  }, []);
"""
text = text.replace(
    "  const [localStatus, setLocalStatus] = useState<LocalImageStatus | null>(null);",
    "  const [localStatus, setLocalStatus] = useState<LocalImageStatus | null>(null);\n" + state_code
)

# Add UI
ui_code = """          {loras.length > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                LoRAs (Klicken zum Einfügen)
              </label>
              <div className="flex flex-wrap gap-2">
                {loras.map((lora) => (
                  <button
                    key={lora.path}
                    onClick={() => setTestPrompt(prev => prev ? `${prev}, <lora:${lora.name}:1.0>` : `<lora:${lora.name}:1.0>`)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs transition"
                  >
                    {lora.name}
                  </button>
                ))}
              </div>
            </div>
          )}
"""
text = text.replace(
    "          <button\n            onClick={handleGenerateImage}",
    ui_code + "\n          <button\n            onClick={handleGenerateImage}"
)

with open("src/components/integrations/tabs/ImageGenTab.tsx", "w", encoding="utf-8") as f:
    f.write(text)
