/**
 * TurboModule spec for KbachModule — RN's Codegen convention requires this
 * exact `Native<Name>.ts` filename and a default-exported
 * `TurboModuleRegistry.getEnforcing<Spec>(...)`. Read by Codegen (see this
 * package's `codegenConfig`) to generate the native glue that
 * android/.../KbachModule.kt implements. Lives in this package (not the
 * consuming app) alongside the native Android code it describes — Android
 * autolinking only discovers native modules from npm dependencies with
 * their own `android/` folder, not from native code declared directly
 * inside an app, which is why this whole package exists (see Phase 13).
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
  resolveStyle(classString: string, themeJson: string, colorScheme: string, pressed: boolean): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('KbachModule');
