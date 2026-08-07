# @kbach/native (deprecated — moved)

React Native/Expo support has moved into `@kbach/react` itself. This package's own reference doc is retired in favor of the merged one — see [kbach-react.md](https://github.com/semsakadanupol/kbach/blob/main/packages/react/kbach-react.md) (covers web and React Native/Expo in one place, including the "React Native / Expo" setup section).

Quick migration:

| Before | Now |
| --- | --- |
| `import { ThemeProvider } from '@kbach/native'` | `import { ThemeProvider } from '@kbach/react/native'` |
| `'@kbach/native/babel'` | `'@kbach/react/babel'` |
| `require('@kbach/native').initConfig(...)` | `require('@kbach/react').initConfig(...)` |
| Everything else | `import ... from '@kbach/react'`, unchanged |

`@kbach/native` still re-exports everything for backward compatibility — this file is just no longer where the reference content lives.
