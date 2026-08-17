/**
 * TurboModule spec for KbachModule — RN's Codegen convention requires this
 * exact `Native<Name>.ts` filename and a default-exported
 * `TurboModuleRegistry.getEnforcing<Spec>(...)`. Read by Codegen (see this
 * package's own `codegenConfig` in package.json) to generate the native
 * glue that ../android/src/main/java/com/kbachnative/KbachModule.kt
 * implements. Lives in this same package (not the consuming app) alongside
 * the native Android code it describes — Android autolinking only
 * discovers native modules from npm dependencies with their own `android/`
 * folder, not from native code declared directly inside an app, which is
 * why `@kbach/react-native` ships its own `android/` + `specs/` at all
 * (see Phase 13) rather than relying on the consuming app to provide one.
 *
 * Method names have no `Sync` suffix (unlike the pre-Phase-13 bridge's
 * `generateCssSync`/`resolveStyleSync`) — every TurboModule call is
 * synchronous by nature via JSI, so the suffix's whole point (flagging
 * "this one blocks, unlike normal bridge methods") no longer applies.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  generateCss(classString: string, themeJson: string): string;
  // `width`: a plain `number` (not the `Int32`/`Float` CodegenTypes
  // aliases) is Codegen's own default float-numeric mapping — it already
  // compiles to Kotlin's `Double` on the native side, matching
  // KbachModule.kt's `width: Double` parameter with no extra type alias.
  resolveStyle(classString: string, themeJson: string, colorScheme: string, pressed: boolean, width: number): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('KbachModule');
