with open("src/services/api.ts", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    "scanModels: async (): Promise<ScannedModel[]> => {\n    return await invoke<ScannedModel[]>('scan_models');\n  },",
    "scanModels: async (): Promise<ScannedModel[]> => {\n    return await invoke<ScannedModel[]>('scan_models');\n  },\n\n  scanLoras: async (): Promise<ScannedModel[]> => {\n    return await invoke<ScannedModel[]>('scan_loras');\n  },"
)

with open("src/services/api.ts", "w", encoding="utf-8") as f:
    f.write(text)
