//! JNI bridge for Android — the native counterpart to lib.rs's wasm_bindgen
//! export. Thin by design: marshals JNI strings in/out and calls
//! `resolve_class_string` (lib.rs) — the exact same function the WASM
//! export calls, so there is zero duplicated CSS-resolution logic between
//! the web and native entry points, only the FFI marshaling differs.
//!
//! Only compiled in for Android targets — see Cargo.toml's
//! `[target.'cfg(target_os = "android")'.dependencies]` jni entry.
//!
//! Package name is fixed as `com.kbachnative` (no underscores — JNI's
//! name-mangling escapes "_" in identifiers as "_1", which is easy to get
//! wrong by hand; picking a package name without one sidesteps that
//! entirely). `apps/native-sandbox`'s Android project is set up to use
//! this same package name so the two stay in sync.
//!
//! Since Phase 13's TurboModule migration, `KbachModule.kt`'s JNI companion
//! externs are named `nativeGenerateCss`/`nativeResolveStyle` (not
//! `generateCss`/`resolveStyle`) — Codegen's generated spec class already
//! declares instance methods named `generateCss`/`resolveStyle` that
//! `KbachModule` must override, and `@JvmStatic` duplicates each companion
//! function onto the outer class for Java interop, which collides at the
//! JVM bytecode level with an identically-named, identically-shaped
//! instance override. JNI's implicit symbol linking binds by the extern's
//! own name, so these `#[no_mangle]` export names must match that rename.

use crate::resolve_class_string;
use crate::resolve_style::resolve_style_json;
use jni::objects::{JClass, JString};
use jni::sys::{jboolean, jdouble, jstring};
use jni::JNIEnv;

/// Shared by both JNI exports below — marshals the two JNI string
/// arguments to Rust `String`s (malformed/non-UTF8 treated as empty rather
/// than panicking across the FFI boundary), calls `resolve`, and marshals
/// the result back to a `jstring`.
fn marshal(
    env: &mut JNIEnv,
    class_string: JString,
    theme_json: JString,
    resolve: impl FnOnce(&str, &str) -> String,
) -> jstring {
    let class_string: String = env.get_string(&class_string).map(|s| s.into()).unwrap_or_default();
    let theme_json: String = env.get_string(&theme_json).map(|s| s.into()).unwrap_or_default();

    let result = resolve(&class_string, &theme_json);

    match env.new_string(result) {
        Ok(s) => s.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kbachnative_KbachModule_nativeGenerateCss(
    mut env: JNIEnv,
    _class: JClass,
    class_string: JString,
    theme_json: JString,
) -> jstring {
    marshal(&mut env, class_string, theme_json, resolve_class_string)
}

/// Same marshaling pattern as `marshal`, three more JNI args in (a string, a
/// raw boolean, and a raw double — no string marshaling needed for either)
/// — kept separate rather than widening `marshal` itself, since
/// `generateCss` above needs to keep its existing 2-arg signature unchanged.
fn marshal3(
    env: &mut JNIEnv,
    class_string: JString,
    theme_json: JString,
    color_scheme: JString,
    pressed: jboolean,
    width: jdouble,
    resolve: impl FnOnce(&str, &str, &str, bool, f64) -> String,
) -> jstring {
    let class_string: String = env.get_string(&class_string).map(|s| s.into()).unwrap_or_default();
    let theme_json: String = env.get_string(&theme_json).map(|s| s.into()).unwrap_or_default();
    let color_scheme: String = env.get_string(&color_scheme).map(|s| s.into()).unwrap_or_default();

    let result = resolve(&class_string, &theme_json, &color_scheme, pressed != 0, width);

    match env.new_string(result) {
        Ok(s) => s.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Native counterpart to `generateCss` — returns a JSON style OBJECT
/// (`{ "display": "flex", "backgroundColor": "#2563eb" }`) instead of CSS
/// rule text, for direct use as a React Native `style` prop. See
/// resolve_style.rs for the resolution logic behind it, including how
/// `color_scheme` (the caller's current `Appearance.getColorScheme()`
/// reading) gates the `dark:` modifier, `pressed` (only ever true when the
/// caller is RN's `Pressable`) gates `active:`, and `width` (the caller's
/// current `Dimensions.get('window').width`) gates `sm:`/`md:`/`lg:`/`xl:`/
/// `2xl:` against the theme's `screens` scale.
#[no_mangle]
pub extern "system" fn Java_com_kbachnative_KbachModule_nativeResolveStyle(
    mut env: JNIEnv,
    _class: JClass,
    class_string: JString,
    theme_json: JString,
    color_scheme: JString,
    pressed: jboolean,
    width: jdouble,
) -> jstring {
    marshal3(&mut env, class_string, theme_json, color_scheme, pressed, width, resolve_style_json)
}
