// React 19's `act()` (used directly from 'react' in ThemeProvider.test.tsx
// and useGlobalDarkMode.test.tsx, paired with `react-test-renderer` since
// this package has no DOM to render into) needs this flag set, or it
// prints "not configured to support act(...)" even though it still runs
// correctly. Testing Library sets this internally; since this package
// doesn't use it, it's set once here instead — same fix @kbach/react's
// own test-setup.ts applies for the same underlying reason.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
