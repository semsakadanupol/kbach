/**
 * Kbach automatic className sandbox (React Native) — proves the Rust core
 * engine (packages/core-engine) resolves className strings automatically,
 * via a Babel-injected JSX pragma (@kbach/react-native/babel-plugin) +
 * @kbach/react-native's jsx-runtime, with zero manual style props anywhere
 * in this file. Layout + color + spacing/border-radius/font-size + numeric
 * line-height + font-weight/text-transform + dark: + active: (Pressable
 * only), base styles only, still deferred for every other modifier.
 *
 * @format
 */

import { Pressable, Text, View, useColorScheme } from 'react-native';

function App() {
  // Called purely for its reactive side effect: React Native's own
  // useColorScheme() subscribes to system theme changes and re-renders
  // this component when they happen, which is what makes dark: below
  // update live — see nativeBridge.ts's resolveStyle() docs.
  useColorScheme();

  return (
    <View className="flex items-center justify-center bg-blue-6 dark:bg-blue-8 p-6">
      <View className="flex-row items-center bg-blue-8 p-4 rounded-lg">
        <Text className="text-gray-1 text-lg leading-8 font-bold uppercase">
          Kbach — automatic className, React Native
        </Text>
      </View>
      <Pressable className="mt-4 px-4 py-2 rounded-lg bg-blue-6 active:bg-blue-8">
        <Text className="text-gray-1 font-bold">Press me (active:)</Text>
      </Pressable>
    </View>
  );
}

export default App;
