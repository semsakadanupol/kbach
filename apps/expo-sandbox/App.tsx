/**
 * Kbach automatic className verification for Expo — proves the same
 * @kbach/react-native import works unmodified across Expo's native
 * dev-client build (Android, via the Kotlin/JNI TurboModule) and Expo Web
 * (via @kbach/core-engine's WASM build, see src/nativeBridge.web.ts) with
 * zero manual style props and zero Platform.OS branching anywhere in this
 * file — Metro's "browser" export condition picks the right implementation
 * at bundle time, and the web one initializes itself eagerly, so there's
 * no app-level init step to await either.
 *
 * @format
 */
import { Platform, Pressable, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  // Reactive side effects only — see nativeBridge.ts/nativeBridge.web.ts's
  // own doc comments on why dark:/responsive need something in the tree
  // subscribing to force a re-render on change.
  useColorScheme();
  useWindowDimensions();

  return (
    <View className="flex-1 items-center justify-center bg-blue-6 dark:bg-blue-8 p-6">
      <View className="flex-row items-center bg-blue-8 p-4 rounded-lg sm:bg-purple-6">
        <Text className="text-gray-1 text-lg leading-8 font-bold uppercase">
          Kbach — Expo, automatic className
        </Text>
      </View>
      <Pressable className="mt-4 px-4 py-2 rounded-lg bg-blue-6 active:bg-blue-8 hover:bg-blue-7 focus:bg-blue-7">
        <Text className="text-gray-1 font-bold">Press me (active:, hover: on web)</Text>
      </Pressable>
      <Text className="mt-4 text-gray-1">
        Platform: {Platform.OS} — resize the window to see sm: kick in above 640px.
        {Platform.OS === 'web' ? ' hover:/focus: work here (real CSS) — try mousing over the button.' : ''}
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}
