/**
 * Jest has no real native binary, so `TurboModuleRegistry.getEnforcing('KbachModule')`
 * (packages/react-native/src/nativeBridge.ts) throws an Invariant Violation
 * out of the box — there's nothing wired up to answer it, unlike a real
 * device/emulator where Android autolinking + the JNI bridge
 * (packages/react-native/android) actually registers it. Metro/Gradle
 * builds are unaffected; this only patches the Jest environment.
 *
 * Every other TurboModule name still goes through the real
 * TurboModuleRegistry, so core RN modules (already mocked by
 * @react-native/jest-preset) keep working exactly as before.
 */
jest.mock('react-native/Libraries/TurboModule/TurboModuleRegistry', () => {
  const actual = jest.requireActual('react-native/Libraries/TurboModule/TurboModuleRegistry');
  return {
    ...actual,
    getEnforcing: (name) => {
      if (name === 'KbachModule') {
        return {
          generateCss: jest.fn(() => ''),
          resolveStyle: jest.fn(() => '{}'),
        };
      }
      return actual.getEnforcing(name);
    },
  };
});
