# @kbach/react

Tailwind-like utility classes for React (web). Write classes as `className` strings — the custom JSX runtime resolves them at render time. A Vite plugin generates a static `kbach.css` file so styles ship as real CSS with zero runtime overhead in production.

```jsx
<div className="bg-white dark:bg-gray-10 p-4 rounded-xl shadow" />
<div className="bg-blue-7 hover:bg-blue-8 dark:bg-indigo-6 rounded-lg px-6 py-3" />
<div className="group">
  <span className="opacity-0 group-hover:opacity-100 transition" />
</div>
```

## Install

```
npm install @kbach/react
```

## Setup

### 1. Configure the JSX runtime

**tsconfig.json**

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@kbach/react"
  }
}
```

Or per-file (no config change needed):

```js
/** @jsxImportSource @kbach/react */
```

**Babel (non-Vite)**

```js
// babel.config.js
module.exports = {
  presets: [
    ['@babel/preset-react', { runtime: 'automatic', importSource: '@kbach/react' }],
  ],
};
```

### 2. Add the Vite plugin

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { kbach } from '@kbach/react/vite';

export default defineConfig({
  plugins: [
    react({ jsxImportSource: '@kbach/react' }),
    kbach(),
  ],
});
```

The plugin scans your source files and writes generated CSS between `/* kbach:start */` / `/* kbach:end */` markers inside any `kbach.css` file it finds in your project. On HMR only the changed file is rescanned — unchanged tokens reuse cached CSS.

### 3. Create and import kbach.css

Create `kbach.css` anywhere in your project (e.g. `src/kbach.css`):

```css
/* kbach:start */
/* kbach:end */
```

Import it in your app entry:

```ts
// main.tsx
import './kbach.css';
```

Importing `kbach.css` automatically disables runtime style injection — all styles come from the CSS file instead.

### 4. Wrap your app

```jsx
import { ThemeProvider } from '@kbach/react';

export default function Root() {
  return (
    <ThemeProvider defaultMode="system">
      <App />
    </ThemeProvider>
  );
}
```

## API

### className / kb prop

Works on any HTML element or React component once the JSX runtime is configured. `kb` is an alias for `className`.

```jsx
<div className="bg-white dark:bg-gray-10 p-4 rounded-xl" />
<p kb="text-gray-10 dark:text-white text-lg font-bold" />
<button className="bg-blue-7 hover:bg-blue-8 pressed:bg-blue-9 rounded-lg px-4 py-2" />
```

### styled(Component, classes)

Pre-style any component. Returns a new component that merges the base classes with any `kb` prop passed at use time.

```jsx
import { styled } from '@kbach/react';

const Card = styled('div', 'bg-white dark:bg-gray-9 rounded-2xl p-6 shadow');
const Button = styled(
  'button',
  'bg-blue-7 hover:bg-blue-8 dark:bg-indigo-6 rounded-xl px-6 py-3'
);

<Card kb="mt-4">
  <Button kb="w-full">Submit</Button>
</Card>
```

### cx(...classes)

Conditionally join class strings. Falsy values are ignored. The Vite plugin scans `cx()` calls when building the static CSS.

```jsx
import { cx } from '@kbach/react';

<div className={cx(
  'p-4 rounded-xl',
  isSelected && 'border-2 border-blue-6',
  isDisabled && 'opacity-50',
)} />
```

Pre-built style constants (also scanned by the Vite plugin):

```ts
// styles.ts
import { cx } from '@kbach/react';

export const container = cx('flex-1 bg-white dark:bg-gray-9 p-4');
export const heading   = cx('text-2xl font-bold text-gray-10 dark:text-white');
```

```jsx
import { container, heading } from './styles';

<div className={container}>
  <h1 className={heading}>Hello</h1>
</div>
```

### useStyles(classes, state?)

Resolve classes to a style object inside a component.

```jsx
import { useStyles } from '@kbach/react';

const style = useStyles('bg-blue-6 dark:bg-indigo-6 px-3 py-1 rounded-full');

// Multiple strings merged left-to-right
const style = useStyles(['bg-white p-4', 'dark:bg-gray-9 rounded-xl']);

// With interaction state
const [pressed, setPressed] = useState(false);
const style = useStyles('bg-blue-5 pressed:bg-blue-7 rounded-lg', { pressed });
```

### kb(classes)

Resolve classes outside a component (static contexts).

```js
import { kb } from '@kbach/react';

const cardStyle = kb('bg-white p-4 rounded-xl') as React.CSSProperties;
```

### useTheme()

```js
import { useTheme } from '@kbach/react';

const { mode, resolvedMode, isDark, setMode, toggle, config } = useTheme();
```

| Value | Type | Description |
|---|---|---|
| `mode` | `'light' \| 'dark' \| 'system'` | User-selected mode |
| `resolvedMode` | `'light' \| 'dark'` | Resolved after system lookup |
| `isDark` | `boolean` | Shorthand for `resolvedMode === 'dark'` |
| `setMode` | `fn` | Set mode explicitly |
| `toggle` | `fn` | Toggle between light and dark |
| `config` | `ResolvedConfig` | Full resolved config |

### useIsDark()

```js
import { useIsDark } from '@kbach/react';
const isDark = useIsDark();
```

### useColors()

Returns the active theme's color palette as a smart proxy.

```js
import { useColors } from '@kbach/react';

const colors = useColors();
colors.blue[6]              // '#3b82f6'
colors.blue['6/50']         // 'rgba(59,130,246,0.5)'
colors.white                // '#ffffff'
colors['white/20']          // 'rgba(255,255,255,0.2)'
colors.alpha('#ff6b35', 60) // 'rgba(255,107,53,0.6)'
```

### ThemeToggle

```jsx
<ThemeToggle />                                // button (default)
<ThemeToggle variant="switch" />              // toggle switch
<ThemeToggle variant="icon-button" />         // icon button
<ThemeToggle variant="button" includeSystem /> // three-way selector
```

## Modifiers

Chain modifiers in any order before the utility name:

```jsx
<div className="dark:sm:hover:p-4" />
<input className="focus:ring-2 focus:ring-blue-5 focus:outline-none" />
```

### Theme

| Modifier | Trigger |
|---|---|
| `dark:` | Dark mode |
| `light:` / `not-dark:` | Light mode |

### Interactive

| Modifier | Trigger |
|---|---|
| `hover:` | Mouse hover |
| `focus:` | Element focused |
| `pressed:` | Click / touch down |
| `active:` | Active state |
| `disabled:` | Disabled |
| `checked:` | Checkbox / radio checked |
| `visited:` | Visited link |
| `placeholder:` | Placeholder text |

Negated: `not-hover:`, `not-focus:`, `not-pressed:`, `not-active:`, `not-disabled:`, `not-checked:`

### Structural

`first:` `last:` `odd:` `even:` `only:` `focus-within:` `focus-visible:`

### Pseudo-elements

`before:` `after:` `selection:` `first-letter:` `first-line:` `marker:` `placeholder:`

```jsx
<div className="before:content-['*'] before:text-red-6 relative" />
<p className="selection:bg-blue-3" />
<input className="placeholder:text-gray-5" />
```

### Group / peer

```jsx
<div className="group">
  <span className="opacity-0 group-hover:opacity-100 transition" />
</div>
<input className="peer" />
<p className="peer-focus:text-blue-6" />
```

### Responsive

| Modifier | Min-width |
|---|---|
| `sm:` | 576 px |
| `md:` | 768 px |
| `lg:` | 1024 px |
| `xl:` | 1280 px |
| `2xl:` | 1536 px |

### Other

| Modifier | Effect |
|---|---|
| `print:hidden` | Visible only on screen |
| `landscape:` `portrait:` | Orientation |
| `motion-reduce:` `motion-safe:` | Reduced-motion preference |
| `contrast-more:` `contrast-less:` | Contrast preference |
| `rtl:` `ltr:` | Text direction |
| `!p-0` | `!important` on every declaration |

## Arbitrary values

```jsx
<div className="bg-[#6366f1]" />
<div className="p-[14px]" />
<div className="w-[calc(100%-2rem)]" />
<div className="bg-[rgba(99,102,241,0.15)]" />
<div className="text-[18px]" />
```

## Color system

12-shade scale — 1 lightest, 12 darkest. Use as `bg-blue-6`, `text-gray-10`, `border-red-4/50`.

Families: `slate gray zinc neutral stone red orange amber yellow lime green emerald teal cyan sky blue indigo violet purple fuchsia pink rose`  
Special: `transparent` `current` `black` `white`

Opacity modifier: `bg-blue-6/50` (50% alpha), `bg-blue-6/[0.15]` (arbitrary)

## CSS resets

Included automatically in `kbach.css` and in runtime injection:

- `*, *::before, *::after { box-sizing: border-box; border-width: 0; border-style: solid; border-color: currentColor }` — border utilities like `border-2 border-gray-4` work on any element without also needing `border-solid`
- `body { margin: 0; padding: 0 }`
- `h1–h6` — margin, font-size, font-weight cleared (inherit from parent)
- `p`, `ul`, `ol` — margin and list style cleared
- `a` — color and underline cleared (inherit from parent)
- `img`, `video`, `svg` — `display: block; max-width: 100%`
- `input`, `textarea`, `select`, `button`, `fieldset` — appearance, border, padding cleared
- `table` — `border-collapse: collapse`

## Configuration

```js
// kbach.config.js
module.exports = {
  darkMode: 'attribute', // 'attribute' | 'class' | 'media'

  theme: {
    // Replace a section entirely
    colors: { brand: { 1: '#eff6ff', 6: '#3b82f6', 10: '#1e3a5f' } },
  },

  extend: {
    // Add to defaults
    colors: { brand: { 6: '#6366f1' } },
    spacing: { 18: '72px' },
    screens: { '3xl': '1920px' },
    fontFamily: {
      sans:        'Inter, sans-serif',
      'sans-bold': 'Inter_700Bold, sans-serif',
    },
  },

  plugins: [
    ({ addUtility, addVariant, theme }) => {
      addUtility('border-brand', {
        borderColor: theme('colors.brand.6'),
        borderWidth: 2,
      });
      addVariant('hocus', ':hover, :focus');
    },
  ],
};
```

Setting `fontFamily.sans` to anything other than `'System'` auto-injects `body { font-family: … }`.

Color aliases:

```js
extend: {
  colors: {
    primary: 'blue-6',       // resolves to blue shade 6's hex
    brand: { 6: 'primary' }, // follows through to blue-6's hex
  },
},
```

Runtime update:

```js
import { updateConfig, clearCache } from '@kbach/react';
updateConfig({ extend: { colors: { brand: { 6: '#6366f1' } } } });
clearCache();
```

## Full reference

See [kbach-react.md](./kbach-react.md) for the complete utility reference, all modifier tables, and configuration options.

For React Native / Expo, see [`@kbach/native`](https://www.npmjs.com/package/@kbach/native).
