import re

with open("src-tauri/src/modules/paths.rs", "r", encoding="utf-8") as f:
    text = f.read()

new_func = """
pub fn scan_loras() -> Vec<ScannedModel> {
    let paths = resolve_app_paths();
    let mut loras = Vec::new();
    let lora_dir = PathBuf::from(&paths.loras_dir);
    if lora_dir.exists() && lora_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(lora_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                    if ext == "safetensors" || ext == "gguf" || ext == "pt" || ext == "bin" {
                        let name = path.file_stem().and_then(|n| n.to_str()).unwrap_or("").to_string();
                        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        loras.push(ScannedModel {
                            name,
                            path: path.to_string_lossy().to_string(),
                            size_mb: size / (1024 * 1024),
                            runtime: "sd-server".to_string(),
                            recommended_context: 0,
                            compatibility_note: String::new(),
                        });
                    }
                }
            }
        }
    }
    loras.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    loras
}
"""

text = text.replace("pub fn scan_vision_projectors() -> Vec<ScannedModel> {", new_func + "\npub fn scan_vision_projectors() -> Vec<ScannedModel> {")

with open("src-tauri/src/modules/paths.rs", "w", encoding="utf-8") as f:
    f.write(text)
