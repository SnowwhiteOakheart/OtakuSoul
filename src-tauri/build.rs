fn main() {
    // macOS: the prebuilt ONNX Runtime (CoreML provider, `ort`) checks the system version with
    // `@available`, which needs `__isPlatformVersionAtLeast` from clang's builtins. Rust links
    // with `-nodefaultlibs`, so the builtins are left out ("Undefined symbols … arm64"); this
    // makes clang link them anyway.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg=-fapple-link-rtlib");
    }
    tauri_build::build()
}
