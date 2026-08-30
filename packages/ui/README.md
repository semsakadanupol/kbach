# @kbach/ui

A tiny, dependency-free class-name composer — the same public API and
behavior as the widely-used [`clsx`](https://www.npmjs.com/package/clsx)
package, reimplemented from scratch so using it adds zero runtime
dependencies to your project.

> Beta — API may still change before 1.0.0.

## Install

```sh
npm install @kbach/ui
```

## Usage

```ts
import { clsx } from '@kbach/ui';

clsx('px-4 py-2', isActive && 'bg-blue-6', { 'opacity-50': disabled });
// "px-4 py-2 bg-blue-6" — when isActive is true and disabled is false
```

Also available as the default export, matching how `clsx` itself is
conventionally imported:

```ts
import clsx from '@kbach/ui';
```

Accepts, in any combination and to any nesting depth:

- **Strings** (`'px-4'`) — kept as-is.
- **Falsy values** (`false`, `null`, `undefined`, `0`, `''`, `NaN`) — dropped
  entirely, so `isActive && 'bg-blue-6'` reads naturally.
- **Objects** (`{ 'opacity-50': disabled }`) — a key is kept only when its
  value is truthy.
- **Arrays** (`['px-4', condition && 'py-2']`) — flattened recursively.

```ts
clsx('base', ['px-4', { 'bg-blue-6': true }], { 'opacity-50': false });
// "base px-4 bg-blue-6"
```

## Do you need this with Kbach?

Not really — a Kbach `className` is just a plain string, so plain
JavaScript already composes it fine (`"bg-" + color + '-6'`,
`[base, active && 'opacity-100'].join(' ')`; see
[`@kbach/react`](https://www.npmjs.com/package/@kbach/react)'s own README).
This package exists purely as an ergonomic convenience for anyone who'd
rather write conditional classes declaratively, and for porting code that
already uses `clsx`/`classnames` without adding a second dependency.

`@kbach/react`'s static build-time scanner already recognizes `clsx(...)`
call sites (alongside `cn`/`classnames`/`cx`/`kb`) and extracts every string
literal inside them on its own — using this function needs no extra plugin
configuration to keep working with the static CSS build.

## License

MIT
