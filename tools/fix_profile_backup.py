with open("src-tauri/src/modules/profile_backup.rs", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("            bundled_bin_dir: String::new(),\\n        };", "            bundled_bin_dir: String::new(),\\n            loras_dir: dir(\"loras\"),\\n        };")
text = text.replace("            bundled_bin_dir: String::new(),\n        };", "            bundled_bin_dir: String::new(),\n            loras_dir: dir(\"loras\"),\n        };")

with open("src-tauri/src/modules/profile_backup.rs", "w", encoding="utf-8") as f:
    f.write(text)
