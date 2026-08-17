/**
 * Kbach automatic className sandbox (React Native) — proves the Rust core
 * engine (packages/core-engine) resolves className strings automatically,
 * via a Babel-injected JSX pragma (@kbach/react-native/babel-plugin) +
 * @kbach/react-native's jsx-runtime, with zero manual style props anywhere
 * in this file. Layout + color + spacing/border-radius/font-size + numeric
 * line-height + font-weight/text-transform + dark: + active: (Pressable
 * only) + sm:/md:/lg:/xl:/2xl:, base styles only, still deferred for every
 * other modifier.
 *
 * @format
 */

import { Pressable, Text, View, useColorScheme, useWindowDimensions } from 'react-native';

function App() {
  // Called purely for its reactive side effect: React Native's own
  // useColorScheme() subscribes to system theme changes and re-renders
  // this component when they happen, which is what makes dark: below
  // update live — see nativeBridge.ts's resolveStyle() docs. Same role for
  // useWindowDimensions() and sm: below — resolveStyle() reads the current
  // width fresh on every call, but nothing re-renders on rotation/resize
  // without a live subscription to it somewhere in the tree.
  useColorScheme();
  const { width } = useWindowDimensions();

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
      <View className="mt-4 p-4 rounded-lg bg-gray-3 sm:bg-blue-6">
        <Text className="text-gray-9 sm:text-gray-1 font-bold">
          sm:bg-blue-6 sm:text-gray-1 ({Math.round(width)}px wide)
        </Text>
      </View>
    </View>
  );
}

export default App;
