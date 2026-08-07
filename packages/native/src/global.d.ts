// Minimal process declaration for the NODE_ENV check in index.ts, without
// requiring @types/node — mirrors packages/react/src/global.d.ts. Metro
// (React Native), Vite, webpack, and Jest all define this.
declare const process: { env: { NODE_ENV?: string } };
