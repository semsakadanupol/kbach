/**
 * Explicit override for React Native autolinking's Android package
 * detection, which otherwise guesses `<packageName>.<PackageClassName>`
 * from either AndroidManifest.xml's `package` attribute or (when absent,
 * our case) build.gradle's `namespace` — see cli-config-android's
 * getPackageName. That guess is wrong here on purpose: KbachModule.kt/
 * KbachPackage.kt declare `package com.kbachnative` (chosen to match the
 * JNI extern symbol names in packages/core-engine/src/jni_bridge.rs), but
 * this module's Gradle `namespace` has to be a DIFFERENT value
 * (com.kbachnative.nativemodule, see android/build.gradle's own comment)
 * since AGP requires unique namespaces per module and the consuming app
 * itself already claims "com.kbachnative" as its own. Without this
 * override, the generated PackageList.java imports the non-existent
 * `com.kbachnative.nativemodule.KbachPackage` and the app fails to
 * compile. (A `package="com.kbachnative"` attribute in AndroidManifest.xml
 * was tried first instead — simpler on paper — but AGP 9+ hard-errors on a
 * manifest package that doesn't match the namespace, so this explicit
 * config override is the only working fix.)
 */
module.exports = {
  dependency: {
    platforms: {
      android: {
        packageImportPath: 'import com.kbachnative.KbachPackage;',
        packageInstance: 'new KbachPackage()',
      },
    },
  },
};
