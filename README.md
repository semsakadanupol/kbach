# Kbach

Tailwind-like utility classes for React — web, React Native, and Expo. Write `className` strings once; a custom JSX runtime resolves them at render time on every platform.

```tsx
<View className="bg-white dark:bg-gray-10 p-4 rounded-xl" />
<View className="bg-blue-6 pressed:bg-blue-8 dark:bg-indigo-6 rounded-lg p-3" />
<View className="bg-[#6366f1] p-[14px] rounded-[20px]" />
```

## Setup

One package, `@kbach/ui`, covers web, React Native, and Expo:

```
npm install @kbach/ui
```

See [packages/ui/README.md](packages/ui/README.md) for full setup steps on every platform (Vite, Next.js, React Native/Expo), or run [`npm create kbach@latest`](packages/create-kbach/README.md) to wire it into an existing project automatically.

`@kbach/native` is deprecated and no longer maintained in this repo — it's frozen on npm at its last published version, which re-exports `@kbach/ui` for existing installs.

## More information

- [Full setup & API reference](packages/ui/README.md)
- [Complete utility/modifier/config reference](packages/ui/kbach-ui.md)
- [create-kbach](packages/create-kbach/README.md) — one command to add Kbach to an existing project
- [npm package](https://www.npmjs.com/package/@kbach/ui)
