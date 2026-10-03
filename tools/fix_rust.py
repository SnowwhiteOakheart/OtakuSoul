import re

# 1. Fix src-tauri/src/modules/paths.rs
with open("src-tauri/src/modules/paths.rs", "r", encoding="utf-8") as f:
    text = f.read()

# Fix doc comment
text = text.replace("/// Vision projectors (`mmproj-*.gguf`) that let a chat model see images.\\n\\n  pub fn scan_loras", "/// Vision projectors (`mmproj-*.gguf`) that let a chat model see images.\\n  pub fn scan_loras")
text = text.replace("/// Vision projectors (`mmproj-*.gguf`) that let a chat model see images.\n\n#[tauri::command]\n", "/// Vision projectors (`mmproj-*.gguf`) that let a chat model see images.\n#[tauri::command]\n")

# Wait, the error said:
# 406 | / /// Vision projectors (`mmproj-*.gguf`) that let a chat model see ima...
# 407 | |
# 408 |   pub fn scan_loras() -> Vec<ScannedModel> {
# Let's just fix it by regex:
text = re.sub(r'///(.*?)\n\n\s*pub fn scan_loras', r'///\1\npub fn scan_loras', text)

# Fix collapsible if
text = text.replace("    if lora_dir.exists() && lora_dir.is_dir() {\n        if let Ok(entries) = fs::read_dir(lora_dir) {", "    if lora_dir.exists() && lora_dir.is_dir() && let Ok(entries) = fs::read_dir(lora_dir) {")

# But we need to remove the matching brace. The original code was:
#    if lora_dir.exists() && lora_dir.is_dir() {
#        if let Ok(entries) = fs::read_dir(lora_dir) {
#            for entry in entries.flatten() {
# ...
#            }
#        }
#    }
# If I just replace that, we have an extra closing brace at the end. I will use a simple regex to fix the `sort_by` first.
text = text.replace("loras.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));", "loras.sort_by_key(|a| a.name.to_lowercase());")

with open("src-tauri/src/modules/paths.rs", "w", encoding="utf-8") as f:
    f.write(text)


# 2. Fix src-tauri/src/modules/profile_backup.rs
with open("src-tauri/src/modules/profile_backup.rs", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("            models_dir: tmp_models,\n        };\n\n", "            models_dir: tmp_models,\n            loras_dir: tmp.path().join(\"loras\"),\n        };\n\n")

with open("src-tauri/src/modules/profile_backup.rs", "w", encoding="utf-8") as f:
    f.write(text)


# 3. Fix src-tauri/src/commands/migration.rs
with open("src-tauri/src/commands/migration.rs", "r", encoding="utf-8") as f:
    text = f.read()

#                        if let Some(e) = ext {
#                            if path.extension().and_then(|s| s.to_str()) != Some(e) {
#                                continue;
#                            }
#                        }
text = text.replace("                        if let Some(e) = ext {\n                            if path.extension().and_then(|s| s.to_str()) != Some(e) {\n                                continue;\n                            }\n                        }", "                        if let Some(e) = ext && path.extension().and_then(|s| s.to_str()) != Some(e) {\n                            continue;\n                        }")
with open("src-tauri/src/commands/migration.rs", "w", encoding="utf-8") as f:
    f.write(text)

