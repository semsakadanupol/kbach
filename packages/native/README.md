# @kbach/native (deprecated)

**@kbach/native's React Native/Expo support has moved into `@kbach/react` itself.** This package now only re-exports `@kbach/react` for backward compatibility — existing installs keep working with zero code changes, but new projects should install `@kbach/react` directly.

```
npm install @kbach/react
```

## What changed

| Before | Now |
| --- | --- |
| `import { ThemeProvider } from '@kbach/native'` | `import { ThemeProvider } from '@kbach/react/native'` |
| `'@kbach/native/babel'` (babel.config.js preset) | `'@kbach/react/babel'` |
| `require('@kbach/native').initConfig(...)` | `require('@kbach/react').initConfig(...)` |
| Everything else from `@kbach/react` | Unchanged — import from `@kbach/react` directly |

`@kbach/react` now works across React web, React Native, and Expo (Expo Go, Expo web, and native builds) from a single install — see its README for full setup instructions, including the React Native/Expo section.

## Why keep this package published at all?

So a `babel.config.js` or import statement that already references `@kbach/native` doesn't break. It will keep re-exporting `@kbach/react`'s full surface indefinitely, but won't receive new features — make the switch when convenient.
