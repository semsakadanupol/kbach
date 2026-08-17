package com.kbachnative

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

/**
 * `BaseReactPackage` (not plain `ReactPackage`) since Phase 13's TurboModule
 * migration — a plain `ReactPackage`'s `createNativeModules()`-provided
 * modules stay visible to the legacy `NativeModules` interop but are never
 * consulted by `TurboModuleRegistry`'s resolution path, which only walks
 * packages that can answer `getModule(name, ...)` directly. Modeled on
 * react-native-safe-area-context's own `SafeAreaContextPackage.kt` (a real,
 * New-Architecture-compatible package already in this project's
 * dependencies) rather than reflection over a `@ReactModule` annotation —
 * KbachModule doesn't have one, and there's only ever this one module, so
 * building its `ReactModuleInfo` directly is simpler than adding an
 * annotation just to read it back via reflection.
 *
 * Auto-discovered via Android autolinking, not manually registered in
 * apps/native-sandbox's MainApplication.kt — same as SafeAreaContextPackage
 * already was, and the entire reason this module became a real npm package
 * with its own `android/` folder (this one — `@kbach/react-native` itself,
 * see KbachModule.kt's own doc comment) in Phase 13 rather than living
 * inside the app.
 */
class KbachPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == NativeKbachModuleSpec.NAME) KbachModule(reactContext) else null
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                NativeKbachModuleSpec.NAME to
                    ReactModuleInfo(
                        NativeKbachModuleSpec.NAME,
                        KbachModule::class.java.name,
                        false, // canOverrideExistingModule
                        false, // needsEagerInit
                        false, // isCxxModule
                        true, // isTurboModule
                    )
            )
        }
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
