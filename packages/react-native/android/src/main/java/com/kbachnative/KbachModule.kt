package com.kbachnative

import com.facebook.react.bridge.ReactApplicationContext

/**
 * Bridges to the same Rust core engine every other Kbach platform uses
 * (packages/core-engine) — via JNI here instead of WASM. The native
 * `generateCss`/`resolveStyle` externs below (in the companion object) must
 * match `Java_com_kbachnative_KbachModule_generateCss`/`resolveStyle`'s
 * signatures exactly (packages/core-engine/src/jni_bridge.rs): STATIC
 * native methods (hence @JvmStatic in a companion object, not instance
 * methods — the Rust side takes JClass, not JObject, as its second
 * parameter).
 *
 * TurboModule since Phase 13 (was the legacy bridge's
 * `isBlockingSynchronousMethod` support directly on `ReactContextBaseJavaModule`
 * before) — extends the Codegen-generated `NativeKbachModuleSpec`
 * (packages/react-native/specs/NativeKbachModule.ts -> this package's own
 * codegenConfig in package.json, discovered via autolinking ->
 * android/build/generated/source/codegen/java/com/kbachnative/NativeKbachModuleSpec.java),
 * which already provides `getName()` and declares `generateCss`/`resolveStyle`
 * as abstract `@ReactMethod(isBlockingSynchronousMethod = true)` methods —
 * Codegen still routes a synchronously-returning TurboModule method through
 * that same Android bridge mechanism; the real gain here is JSI-backed
 * dispatch + build-time type checking against the JS spec, not the removal
 * of `isBlockingSynchronousMethod` as a concept.
 *
 * The companion's JNI externs are named `nativeGenerateCss`/`nativeResolveStyle`
 * — NOT the same names as the spec's `generateCss`/`resolveStyle` overrides.
 * Tried keeping identical names first (disambiguated via an explicit
 * `Companion.generateCss(...)` qualifier) since that would've meant zero
 * Rust changes, but that fails to compile: `@JvmStatic` duplicates each
 * companion function directly onto the outer class for Java-interop
 * purposes, which collides at the JVM bytecode level with the identically-
 * named, identically-shaped instance override ("platform declaration
 * clash"), regardless of how the Kotlin-source call site is qualified. The
 * rename requires matching `Java_com_kbachnative_KbachModule_nativeGenerateCss`/
 * `nativeResolveStyle` `#[no_mangle]` export names in
 * packages/core-engine/src/jni_bridge.rs — JNI's implicit symbol linking
 * binds by the extern's own method name, not by whatever calls it.
 *
 * Moved here from apps/native-sandbox/android/app in Phase 13 — Android
 * autolinking only discovers native modules from npm dependencies with
 * their own `android/` folder, never from native code declared directly
 * inside the app itself, so `KbachModule` had to become a real (locally
 * `file:`-linked) package to be found by `TurboModuleRegistry.getEnforcing`.
 * Originally that "real package" was a separate `@kbach/android` npm
 * package; later folded directly into `@kbach/react-native` (this
 * package's own `android/` folder, sibling to its `src/`) once it became
 * clear the same autolinking requirement is satisfied just as well by a
 * SINGLE npm package containing both JS and native code — the same layout
 * react-native-safe-area-context itself uses — so consumers only ever run
 * one `npm install @kbach/react-native`, not two.
 */
class KbachModule(reactContext: ReactApplicationContext) : NativeKbachModuleSpec(reactContext) {

    companion object {
        init {
            System.loadLibrary("kbach_core_engine")
        }

        @JvmStatic
        external fun nativeGenerateCss(classString: String, themeJson: String): String

        @JvmStatic
        external fun nativeResolveStyle(classString: String, themeJson: String, colorScheme: String, pressed: Boolean, width: Double): String
    }

    override fun generateCss(classString: String, themeJson: String): String {
        return nativeGenerateCss(classString, themeJson)
    }

    /**
     * `colorScheme` ("light"/"dark", from Appearance.getColorScheme() on the
     * JS side) gates whether `dark:` declarations are applied; `pressed`
     * (only ever true when the caller is RN's Pressable) gates `active:`;
     * `width` (the JS side's current `Dimensions.get('window').width`) gates
     * `sm:`/`md:`/`lg:`/`xl:`/`2xl:` against the theme's `screens` scale.
     */
    override fun resolveStyle(classString: String, themeJson: String, colorScheme: String, pressed: Boolean, width: Double): String {
        return nativeResolveStyle(classString, themeJson, colorScheme, pressed, width)
    }
}
