import re

with open("src/components/integrations/tabs/ImageGenTab.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# Add UI for positive_prompt_prefix
ui_code = """
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Globaler Stil / Prefix (wird an jeden Prompt angehängt)
            </label>
            <textarea
              rows={2}
              value={localImgConfig.positive_prompt_prefix}
              onChange={(e) => setLocalImgConfig({ ...localImgConfig, positive_prompt_prefix: e.target.value })}
              placeholder="masterpiece, best quality..."
              className="w-full bg-app border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-hidden focus:border-accent-500 resize-none font-mono"
            />
          </div>
"""

text = text.replace(
    "          <div className=\"grid grid-cols-2 gap-3\">\n            <div>\n              <label className=\"block text-xs font-semibold text-slate-300 mb-1\">\n                {t('int.provider')}",
    ui_code + "\n          <div className=\"grid grid-cols-2 gap-3\">\n            <div>\n              <label className=\"block text-xs font-semibold text-slate-300 mb-1\">\n                {t('int.provider')}"
)

# And add clicking LoRA to append to positive_prompt_prefix instead! Or both!
# Actually, it's better to append to the focused input, but let's just add a button group.

with open("src/components/integrations/tabs/ImageGenTab.tsx", "w", encoding="utf-8") as f:
    f.write(text)
