// Ambient fallback so tsc/tsup can type-check without a real react-native install.
// When react-native is installed (consumer projects), the real types take precedence.
declare module 'react-native' {
  export function useColorScheme(): 'light' | 'dark' | 'unspecified' | null | undefined;
  export function useWindowDimensions(): { width: number; height: number; scale: number; fontScale: number };
}
