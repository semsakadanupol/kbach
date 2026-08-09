// Minimal process declaration for NODE_ENV checks without requiring @types/node.
// Metro (React Native), Vite, webpack, and Jest all define this.
declare const process: { env: { NODE_ENV?: string } };
