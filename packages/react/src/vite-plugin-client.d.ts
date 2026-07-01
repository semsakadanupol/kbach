// TypeScript declarations for the Kbach Vite plugin virtual module.
// Add this to your tsconfig "types" array or via a triple-slash reference:
//   /// <reference types="@kbach/react/vite/client" />

declare module 'virtual:kbach/styles.css' {
  const css: string;
  export default css;
}
