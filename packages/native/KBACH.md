# Kbach Native — Complete AI Reference (deprecated — moved)

React Native/Expo support has moved into `@kbach/react` itself. This file is retired in favor of the merged reference — see [`packages/react/KBACH.md`](../react/KBACH.md), which covers both web and React Native/Expo (its "Setup — React Native / Expo" section, plus the Native-only/Web-only Utilities sections).

Quick migration:

| Before | Now |
| --- | --- |
| `import { ThemeProvider } from '@kbach/native'` | `import { ThemeProvider } from '@kbach/react/native'` |
| `'@kbach/native/babel'` | `'@kbach/react/babel'` |
| `require('@kbach/native').initConfig(...)` | `require('@kbach/react').initConfig(...)` |
| Everything else | `import ... from '@kbach/react'`, unchanged |

`@kbach/native` still re-exports everything for backward compatibility — this file is just no longer where the reference content lives.
