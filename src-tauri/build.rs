fn main() {
    // The licence public key is read with `option_env!`, which is resolved at
    // compile time. Cargo does not track arbitrary environment variables, so
    // without this line a rebuild after setting the key would silently keep the
    // old value — and the app would refuse every licence for no visible reason.
    println!("cargo:rerun-if-env-changed=UNCACHED_LICENSE_PUBLIC_KEY");
    tauri_build::build()
}
