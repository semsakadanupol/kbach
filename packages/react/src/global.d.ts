// Minimal ambient declaration so `require()` type-checks without pulling in all of @types/node.
// ThemeToggle.tsx uses require('react-native') in a try/catch for platform detection.
declare function require(id: string): any;

// Minimal process declaration for NODE_ENV checks without requiring @types/node.
// Metro (React Native), Vite, webpack, and Jest all define this.
declare const process: { env: { NODE_ENV?: string } };
