fn main() -> std::io::Result<()> {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let icon = "../src-tauri/icons/icon.ico";
        println!("cargo:rerun-if-changed={icon}");
        tauri_winres::WindowsResource::new().set_icon(icon).compile()?;
    }
    Ok(())
}
