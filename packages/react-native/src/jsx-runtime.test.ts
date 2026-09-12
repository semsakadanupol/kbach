import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, useSyncExternalStore } from 'react';
import TestRenderer from 'react-test-renderer';

// A STATIC top-level `import './darkModeStore'` here would force it (and
// the 'react-native' it imports) to evaluate before this file's own
// `const MockPressable` below has run — the mocked 'react-native' factory
// closes over MockPressable, so that ordering throws a
// "Cannot access 'MockPressable' before initialization" TDZ error. Every
// real import in this file is deferred (dynamic `import()`, populating
// these) for exactly that reason — darkModeStore.ts is no exception.
let getGlobalDarkMode: () => boolean;
let toggleGlobalDarkMode: () => void;

// Reads the CURRENT dark-mode state at call time (mirroring how the real
// nativeBridge.ts's resolveStyle reads getGlobalDarkMode() internally,
// rather than being told the mode via a parameter) — needed so the dark:
// reactivity tests below can actually observe a value changing across a
// re-render, not just a call count.
const mockResolveStyle = vi.fn((classString: string, pressed?: boolean) => ({
  resolved: classString,
  pressed: pressed ?? false,
  dark: getGlobalDarkMode(),
}));

vi.mock('./nativeBridge', () => ({
  resolveStyle: mockResolveStyle,
}));

// jsx-runtime.tsx imports Pressable from 'react-native' by reference (to
// compare `type === Pressable`) — mocked here as a distinct marker so tests
// can pass the same reference as `type`, same as nativeBridge.test.ts mocks
// Appearance/NativeModules for the same "don't load the real RN package in
// a plain Node/vitest environment" reason. Appearance is ALSO needed now —
// jsxRuntimeCore.ts imports darkModeStore.ts (for ReactiveElement's dark-
// mode reactivity, see its own doc comment), whose module-level code calls
// Appearance.addChangeListener at import time.
const MockPressable = () => null;
// Mirrors RN's real useWindowDimensions() shape closely enough for the
// sm:/md:/... reactivity tests below: a subscribable snapshot (not a plain
// static return), so a width change can notify jsxRuntimeCore's own
// subscription the same way a real device rotation/resize would, without
// requiring an external tree re-render to observe it.
let mockWidth = 375;
let mockDimensionsSnapshot = { width: mockWidth, height: 812 };
const widthListeners = new Set<() => void>();
function setMockWidth(width: number): void {
  mockWidth = width;
  mockDimensionsSnapshot = { width, height: 812 };
  widthListeners.forEach((listener) => listener());
}
// Silent counterpart for beforeEach — mirrors darkModeStore's own
// _resetForTests() shape: resets state WITHOUT notifying subscribers, since
// notifying here would spuriously re-render any renderer a prior test left
// mounted (this file never unmounts between tests, same as it never did for
// darkModeStore's subscribers), inflating this test's own call counts.
function resetMockWidthForTests(): void {
  mockWidth = 375;
  mockDimensionsSnapshot = { width: mockWidth, height: 812 };
}
vi.mock('react-native', () => ({
  Pressable: MockPressable,
  Appearance: {
    getColorScheme: () => 'light',
    addChangeListener: () => ({ remove: vi.fn() }),
  },
  useWindowDimensions: () =>
    useSyncExternalStore(
      (cb: () => void) => {
        widthListeners.add(cb);
        return () => widthListeners.delete(cb);
      },
      () => mockDimensionsSnapshot,
    ),
}));

describe('jsx-runtime (react-native)', () => {
  // The reactivity suites below mount real TestRenderer trees whose
  // ReactiveElement instances subscribe to darkModeStore/widthListeners.
  // Left mounted, a later test's toggleGlobalDarkMode()/setMockWidth() call
  // would also notify (and re-render) these leftover trees, inflating THAT
  // test's own mockResolveStyle call count. Tracking and unmounting every
  // renderer after each test keeps the subscriber sets — and thus each
  // test's call counts — isolated.
  const mountedRenderers: TestRenderer.ReactTestRenderer[] = [];
  function mount(el: Parameters<typeof TestRenderer.create>[0]): TestRenderer.ReactTestRenderer {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(el);
    });
    mountedRenderers.push(renderer);
    return renderer;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const store = await import('./darkModeStore');
    getGlobalDarkMode = store.getGlobalDarkMode;
    toggleGlobalDarkMode = store.toggleGlobalDarkMode;
    store._resetForTests();
    resetMockWidthForTests();
    const dynamicTokens = await import('./dynamicTokens');
    dynamicTokens._resetForTests();
  });

  afterEach(() => {
    act(() => {
      mountedRenderers.forEach((renderer) => renderer.unmount());
    });
    mountedRenderers.length = 0;
  });

  it('resolves a plain-string className into the style prop, and puts className back on props too (for custom components)', async () => {
    const { jsx } = await import('./jsx-runtime');
    const el = jsx('View', { className: 'flex items-center' }, undefined);
    expect(mockResolveStyle).toHaveBeenCalledWith('flex items-center', false);
    expect((el as any).props.style).toEqual({ resolved: 'flex items-center', pressed: false, dark: false });
    // A real host primitive ignores this extra prop; a custom component
    // (which jsx()/jsxs() can't distinguish from a host one here) needs it
    // to actually receive `className` at all — see jsxRuntimeCore.ts's own
    // doc comment on this exact tradeoff.
    expect((el as any).props.className).toBe('flex items-center');
  });

  it('merges an explicit inline style prop AFTER the resolved style (explicit wins on overlap)', async () => {
    const { jsx } = await import('./jsx-runtime');
    const el = jsx('View', { className: 'bg-blue-6', style: { opacity: 0.5 } }, undefined);
    expect((el as any).props.style).toEqual([{ resolved: 'bg-blue-6', pressed: false, dark: false }, { opacity: 0.5 }]);
  });

  it('forwards unrelated props and children unchanged', async () => {
    const { jsx } = await import('./jsx-runtime');
    const el = jsx('Text', { className: 'text-gray-9', onPress: 'noop', children: 'hi' }, undefined);
    expect((el as any).props.onPress).toBe('noop');
    expect((el as any).props.children).toBe('hi');
  });

  it('passes through an element with no className prop at all, untouched', async () => {
    const { jsx } = await import('./jsx-runtime');
    const el = jsx('View', { testID: 'x' }, undefined);
    expect(mockResolveStyle).not.toHaveBeenCalled();
    expect((el as any).props.style).toBeUndefined();
    expect((el as any).props.testID).toBe('x');
  });

  it('does not resolve a non-string className — forwards untouched', async () => {
    const { jsx } = await import('./jsx-runtime');
    const classNameFn = (_: unknown) => 'active';
    const el = jsx('View', { className: classNameFn }, undefined);
    expect(mockResolveStyle).not.toHaveBeenCalled();
    expect((el as any).props.className).toBe(classNameFn);
  });

  it('gives a custom component (not a host primitive) a real className prop, not just a computed style', async () => {
    // This is the actual bug class this pattern fixes: `type` here is a
    // plain function, not "View" — jsx()/jsxs() can't tell that apart from
    // a host primitive, so BOTH the computed style AND the original
    // className need to reach it, since only the component's own code
    // decides which one it actually uses.
    const CustomWrapper = (_props: { className?: string }) => null;
    const { jsx } = await import('./jsx-runtime');
    const el = jsx(CustomWrapper, { className: 'flex-1 items-center' }, undefined);
    expect((el as any).props.className).toBe('flex-1 items-center');
    expect((el as any).props.style).toEqual({ resolved: 'flex-1 items-center', pressed: false, dark: false });
  });

  it('still puts className on props for a dark:-qualified class routed through ReactiveElement', async () => {
    const { jsx } = await import('./jsx-runtime');
    const el = mount(jsx('View', { className: 'dark:bg-neutral-11' }, undefined) as any);
    const view = el.root.findByType('View' as any);
    expect(view.props.className).toBe('dark:bg-neutral-11');
  });

  it('passes through null type and symbol type untouched', async () => {
    const { jsx } = await import('./jsx-runtime');
    expect(() => jsx(null, { className: 'flex' }, undefined)).not.toThrow();
    expect(() => jsx(Symbol('react.fragment'), { className: 'flex' }, undefined)).not.toThrow();
    expect(mockResolveStyle).not.toHaveBeenCalled();
  });

  it('resolves className via jsxs (static-children form) the same way as jsx', async () => {
    const { jsxs } = await import('./jsx-runtime');
    const el = jsxs('View', { className: 'flex-row', children: ['a', 'b'] }, undefined);
    expect(mockResolveStyle).toHaveBeenCalledWith('flex-row', false);
    expect((el as any).props.style).toEqual({ resolved: 'flex-row', pressed: false, dark: false });
  });

  it('gives Pressable a style FUNCTION instead of a static value', async () => {
    const { Pressable } = await import('react-native');
    const { jsx } = await import('./jsx-runtime');
    const el = jsx(Pressable, { className: 'bg-blue-6 active:bg-blue-8' }, undefined);
    expect(typeof (el as any).props.style).toBe('function');
    // Not called yet — resolution is deferred until Pressable invokes it with real press state.
    expect(mockResolveStyle).not.toHaveBeenCalled();
  });

  it("Pressable's style function resolves with the press state it's called with", async () => {
    const { Pressable } = await import('react-native');
    const { jsx } = await import('./jsx-runtime');
    const el = jsx(Pressable, { className: 'active:bg-blue-8' }, undefined);
    const styleFn = (el as any).props.style as (state: { pressed: boolean }) => unknown;

    expect(styleFn({ pressed: false })).toEqual({ resolved: 'active:bg-blue-8', pressed: false, dark: false });
    expect(mockResolveStyle).toHaveBeenLastCalledWith('active:bg-blue-8', false);

    expect(styleFn({ pressed: true })).toEqual({ resolved: 'active:bg-blue-8', pressed: true, dark: false });
    expect(mockResolveStyle).toHaveBeenLastCalledWith('active:bg-blue-8', true);
  });

  it("calls a function-valued userStyle on Pressable with the press state too", async () => {
    const { Pressable } = await import('react-native');
    const { jsx } = await import('./jsx-runtime');
    const userStyleFn = vi.fn((state: { pressed: boolean }) => ({ opacity: state.pressed ? 0.5 : 1 }));
    const el = jsx(Pressable, { className: 'bg-blue-6', style: userStyleFn }, undefined);
    const styleFn = (el as any).props.style as (state: { pressed: boolean }) => unknown;

    expect(styleFn({ pressed: true })).toEqual([{ resolved: 'bg-blue-6', pressed: true, dark: false }, { opacity: 0.5 }]);
    expect(userStyleFn).toHaveBeenCalledWith({ pressed: true });
  });

  // A `dark:`-bearing element is wrapped in its own self-subscribing
  // component (ReactiveElement, in jsxRuntimeCore.ts) specifically so it
  // recomputes on its own whenever the global dark-mode state changes —
  // with NO ancestor (no <ThemeProvider>, no useTheme() call anywhere)
  // needed in these trees at all. That self-sufficiency is exactly what
  // these tests exercise: unlike the tests above, they render through a
  // real TestRenderer instead of just inspecting jsx()'s synchronous
  // return value, since the fix now depends on an actual hook lifecycle
  // (useSyncExternalStore), not a value read once at JSX-creation time.
  describe('dark: reactivity (recomputes on its own, with no ancestor subscribed)', () => {
    it('resolves once on mount, reflecting the current dark state', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'bg-blue-6 dark:bg-blue-8' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);
      expect(mockResolveStyle).toHaveBeenCalledWith('bg-blue-6 dark:bg-blue-8', false);
    });

    it('re-resolves on its own when the store changes, picking up the new dark state', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'bg-blue-6 dark:bg-blue-8' }, undefined);

      const renderer = mount(el);
      expect(renderer.root.findByType('View' as any).props.style).toMatchObject({ dark: false });
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);

      act(() => {
        toggleGlobalDarkMode();
      });

      expect(mockResolveStyle).toHaveBeenCalledTimes(2);
      expect(renderer.root.findByType('View' as any).props.style).toMatchObject({ dark: true });
    });

    it('does not add any reactivity overhead for an element with no "dark:" class', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'flex bg-blue-6' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);

      act(() => {
        toggleGlobalDarkMode();
      });
      // Nothing subscribed this element to the store, so it never re-renders
      // — same as before this fix, and exactly why the fix is scoped to
      // dark:-bearing elements only.
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);
    });

    it('Pressable keeps its style-function shape even when wrapped for dark:', async () => {
      const { Pressable } = await import('react-native');
      const { jsx } = await import('./jsx-runtime');
      const el = jsx(Pressable, { className: 'bg-blue-6 dark:bg-blue-8 active:bg-blue-9' }, undefined);

      const renderer = mount(el);
      expect(typeof renderer.root.findByType(Pressable).props.style).toBe('function');
    });
  });

  describe('mode-aware color reactivity (a plain bg-<name> with no "dark:" text at all)', () => {
    // Regression: a theme color declared as `{ light, dark }` (kbach.config.js's
    // grouped `dark: {}` block) resolves correctly on first render via a
    // PLAIN class like `bg-surface` — no `dark:` modifier needed at all —
    // but nothing in that class string's own text says "this needs to react
    // to a theme toggle". Before this fix, such an element silently froze at
    // whichever color was active on mount, everywhere except wherever it
    // happened to be incidentally re-rendered for some unrelated reason
    // (confirmed via a real-device report: a theme toggle only visibly took
    // effect on whichever tab was open when it was pressed).
    beforeEach(async () => {
      const { setTheme } = await import('./theme');
      setTheme({
        colors: { surface: { light: '#f9fafb', dark: '#111827' } },
        spacing: {},
        screens: {},
        fontFamily: { sans: '', serif: '', mono: '' },
        darkMode: 'attribute',
        container: {},
      });
    });

    afterEach(async () => {
      const { setTheme, defaultTheme } = await import('./theme');
      setTheme(defaultTheme);
    });

    it('wraps a plain mode-aware-color class in ReactiveElement and re-resolves it on a theme toggle', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'bg-surface' }, undefined);

      const renderer = mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);

      act(() => {
        toggleGlobalDarkMode();
      });

      expect(mockResolveStyle).toHaveBeenCalledTimes(2);
      expect(renderer.root.findByType('View' as any).props.style).toMatchObject({ dark: true });
    });

    it('does not add reactivity overhead for a color naming an ordinary (non-mode-aware) theme entry', async () => {
      const { setTheme } = await import('./theme');
      setTheme({
        colors: { 'blue-6': '#2563eb' },
        spacing: {},
        screens: {},
        fontFamily: { sans: '', serif: '', mono: '' },
        darkMode: 'attribute',
        container: {},
      });
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'bg-blue-6' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);

      act(() => {
        toggleGlobalDarkMode();
      });
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);
    });
  });

  // Same shape as the dark: suite above, for the sibling bug flagged in
  // jsxRuntimeCore.ts's own doc comments: an already-mounted host component
  // doesn't repaint just because a live width parameter changed, so a
  // `sm:`/`md:`/... element needs the same self-subscribing wrapper dark:
  // elements get — here via RN's own `useWindowDimensions()` instead of
  // darkModeStore. These tests exist specifically to lock in that fix and
  // guard against it regressing the way dark: needed three separate hotfix
  // commits to get right.
  describe('responsive-breakpoint reactivity (recomputes on its own on a width change)', () => {
    it('resolves once on mount', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'flex sm:flex-row' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);
    });

    it('re-resolves on its own when the window width changes, with no ancestor re-rendering', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'flex sm:flex-row' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);

      act(() => {
        setMockWidth(900);
      });

      // Nothing re-rendered the tree from above — only the width store
      // notified — so a second call proves the element's own
      // useWindowDimensions() subscription is what triggered this, not an
      // external re-render.
      expect(mockResolveStyle).toHaveBeenCalledTimes(2);
    });

    it('re-resolves on its own for an ARBITRARY min-[...]/max-[...] breakpoint too, not just named ones', async () => {
      // Regression coverage: nativeModifierState already understood
      // min-[...]/max-[...] once resolved once, but BREAKPOINT_MODIFIER_RE
      // (the gate deciding whether to wrap in ReactiveElement at all) only
      // matched the five named breakpoints — an arbitrary one would resolve
      // correctly exactly once, then silently never react to a later width
      // change (rotation, split-screen, ...) at all.
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'flex min-[500px]:flex-row' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);

      act(() => {
        setMockWidth(900);
      });
      expect(mockResolveStyle).toHaveBeenCalledTimes(2);
    });

    it('does not add any reactivity overhead for an element with no responsive class', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'flex bg-blue-6' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);

      act(() => {
        setMockWidth(900);
      });
      // Nothing subscribed this element to the width store, so it never
      // re-renders — same reasoning as the dark: no-overhead test above.
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);
    });

    it('composes with dark: on the same element — either changing re-resolves it', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'bg-blue-6 dark:bg-blue-8 md:flex-row' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);

      act(() => {
        setMockWidth(900);
      });
      expect(mockResolveStyle).toHaveBeenCalledTimes(2);

      act(() => {
        toggleGlobalDarkMode();
      });
      expect(mockResolveStyle).toHaveBeenCalledTimes(3);
    });

    it('reacts to dark mode even when dark: is chained SECOND on the same token (e.g. "md:dark:bg-blue-8")', async () => {
      // Regression: the modifier-presence regexes used to only match a
      // modifier written FIRST in its chain (preceded by start-of-string
      // or a space) — "md:dark:bg-blue-8" has "dark:" preceded by "md:"
      // (a colon, not whitespace), which the old `(^|\s)dark:` pattern
      // silently failed to detect at all, meaning this exact element would
      // never have been wrapped in ReactiveElement and its color would
      // have frozen on a dark-mode toggle — chain ORDER triggering the
      // same class of bug the whole reactivity mechanism exists to prevent.
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'md:dark:bg-blue-8' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);

      act(() => {
        toggleGlobalDarkMode();
      });
      expect(mockResolveStyle).toHaveBeenCalledTimes(2);
    });
  });

  // Cross-platform dynamic style values — the native counterpart to a real
  // CSS custom property (which already works on Expo Web with zero code
  // here, see jsxRuntimeCoreWeb.ts). `var(--x)` in a className gets
  // substituted with the CURRENT registered value before resolveStyle ever
  // sees it — mockResolveStyle above echoes its `classString` arg back as
  // `resolved`, so asserting on `resolved` here proves the substitution
  // actually happened, not just that a re-render occurred.
  describe('dynamic tokens (var(--x) reactivity)', () => {
    it('substitutes a registered token value into the className before resolving', async () => {
      // A var(--x) reference routes through ReactiveElement (same as
      // dark:/breakpoints), so resolution only happens once actually
      // rendered — a bare jsx() call, unlike the plain-class tests earlier
      // in this file, would observe zero calls.
      const { setDynamicToken } = await import('./dynamicTokens');
      setDynamicToken('sidebar-width', '240px');
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'w-[var(--sidebar-width)]' }, undefined);
      const renderer = mount(el);
      expect(mockResolveStyle).toHaveBeenCalledWith('w-[240px]', false);
      expect(renderer.root.findByType('View' as any).props.style).toMatchObject({ resolved: 'w-[240px]' });
    });

    it('leaves an unregistered token reference untouched (falls through to the usual invalid-value handling)', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'w-[var(--never-set)]' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenCalledWith('w-[var(--never-set)]', false);
    });

    it('resolves once on mount', async () => {
      const { setDynamicToken } = await import('./dynamicTokens');
      setDynamicToken('sidebar-width', '240px');
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'w-[var(--sidebar-width)]' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);
    });

    it('re-resolves on its own when the token value changes, with no ancestor re-rendering', async () => {
      const { setDynamicToken } = await import('./dynamicTokens');
      setDynamicToken('sidebar-width', '240px');
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'w-[var(--sidebar-width)]' }, undefined);
      const renderer = mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);
      expect(renderer.root.findByType('View' as any).props.style).toMatchObject({ resolved: 'w-[240px]' });

      act(() => {
        setDynamicToken('sidebar-width', '320px');
      });

      // Nothing re-rendered the tree from above — only the token store
      // notified — so a second call with the NEW value proves the
      // element's own subscription is what triggered this.
      expect(mockResolveStyle).toHaveBeenCalledTimes(2);
      expect(renderer.root.findByType('View' as any).props.style).toMatchObject({ resolved: 'w-[320px]' });
    });

    it('does not add any reactivity overhead for an element with no var(--x) reference', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'flex bg-blue-6' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);

      const { setDynamicToken } = await import('./dynamicTokens');
      act(() => {
        setDynamicToken('sidebar-width', '240px');
      });
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);
    });

    it('still resolves the correct value when an UNRELATED token changes', async () => {
      // The store's own version counter bumps for ANY token change (see
      // dynamicTokens.ts's own doc comment on why), so the element's
      // useSyncExternalStore subscription fires and re-resolves even for a
      // token this className doesn't reference — but the resolved value
      // must stay correct regardless, since substituteDynamicTokens
      // re-reads each referenced token's CURRENT value fresh every time.
      const { setDynamicToken } = await import('./dynamicTokens');
      setDynamicToken('sidebar-width', '240px');
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'w-[var(--sidebar-width)]' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);

      act(() => {
        setDynamicToken('unrelated-token', 'anything');
      });
      expect(mockResolveStyle).toHaveBeenCalledTimes(2);
      expect(mockResolveStyle).toHaveBeenLastCalledWith('w-[240px]', false);
    });
  });

  // Percentage-relative calc() — w-[calc(100%_-_3rem)] and friends. Unlike
  // the other three reactive mechanisms, there's no external store here:
  // the "current value" is this element's own layout, learned by
  // simulating a real RN onLayout event through TestRenderer.
  describe('percentage-relative calc() (measure-then-snap via onLayout)', () => {
    it('strips the calc(...%...) token before calling resolveStyle, and renders 100% first', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'bg-blue-6 w-[calc(100%_-_3rem)]' }, undefined);
      const renderer = mount(el);
      expect(mockResolveStyle).toHaveBeenCalledWith('bg-blue-6', false);
      const style = renderer.root.findByType('View' as any).props.style;
      expect(style.width).toBe('100%');
    });

    it('computes the real absolute width once onLayout reports the measured size', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'w-[calc(100%_-_3rem)]' }, undefined);
      const renderer = mount(el);

      act(() => {
        renderer.root.findByType('View' as any).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 100 } } });
      });

      // 390 * 100/100 - 48 (3rem) = 342
      expect(renderer.root.findByType('View' as any).props.style.width).toBe(342);
    });

    it('resolves a nested-parens expression mixing division and subtraction (capability upgrade)', async () => {
      // Also exercises PERCENT_RELATIVE_CALC_HINT_RE's own fix — its old
      // `[^)]*`-based regex could never match past the inner ")" of
      // "(100%/2)", so a token shaped like this never even reached the
      // real parser before.
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'w-[calc((100%/2)-10px)]' }, undefined);
      const renderer = mount(el);

      act(() => {
        renderer.root.findByType('View' as any).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 100 } } });
      });

      // (390 / 2) - 10 = 185
      expect(renderer.root.findByType('View' as any).props.style.width).toBe(185);
    });

    it('re-measures on a genuine window-size change (e.g. rotation), gated by useWindowDimensions', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'w-[calc(100%_-_3rem)]' }, undefined);
      const renderer = mount(el);

      act(() => {
        renderer.root.findByType('View' as any).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 100 } } });
      });
      expect(renderer.root.findByType('View' as any).props.style.width).toBe(342);

      // A real rotation changes the window size FIRST (RN's own
      // useWindowDimensions), which is what resets measuredBasis and makes
      // the component re-probe at '100%' again — only then does the
      // resulting onLayout report the new parent size. Simulating "rotation"
      // via a second onLayout call ALONE (the old version of this test) was
      // actually exercising the compounding-shrink bug fixed above, not a
      // real rotation — see the regression test right below this one.
      act(() => {
        setMockWidth(900);
      });
      expect(renderer.root.findByType('View' as any).props.style.width).toBe('100%');

      act(() => {
        renderer.root.findByType('View' as any).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 800, height: 100 } } });
      });
      // 800 - 48 = 752
      expect(renderer.root.findByType('View' as any).props.style.width).toBe(752);
    });

    it('does NOT compound a self-caused onLayout (applying the computed width) into a shrinking loop', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'w-[calc(100%_-_3rem)]' }, undefined);
      const renderer = mount(el);

      act(() => {
        renderer.root.findByType('View' as any).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 100 } } });
      });
      expect(renderer.root.findByType('View' as any).props.style.width).toBe(342);

      // Applying width:342 is itself a real layout change from the '100%'
      // probe render, so real RN fires onLayout AGAIN reporting 342 — with
      // no window-size change in between. The buggy version of `measure`
      // treated this as a new basis and recomputed 342-48=294, which would
      // then itself trigger yet another onLayout reporting 294, and so on.
      act(() => {
        renderer.root.findByType('View' as any).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 342, height: 100 } } });
      });
      expect(renderer.root.findByType('View' as any).props.style.width).toBe(342);

      // Even a spurious onLayout with some OTHER value (not what we last
      // applied — e.g. a rounding-driven native measurement) must still be
      // ignored absent a real window-size change; only useWindowDimensions
      // changing is a legitimate trigger to re-measure.
      act(() => {
        renderer.root.findByType('View' as any).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 341, height: 100 } } });
      });
      expect(renderer.root.findByType('View' as any).props.style.width).toBe(342);
    });

    it('composes with a caller-provided onLayout handler instead of replacing it', async () => {
      const { jsx } = await import('./jsx-runtime');
      const userOnLayout = vi.fn();
      const el = jsx('View', { className: 'w-[calc(100%_-_3rem)]', onLayout: userOnLayout }, undefined);
      const renderer = mount(el);

      const event = { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 100 } } };
      act(() => {
        renderer.root.findByType('View' as any).props.onLayout(event);
      });

      expect(userOnLayout).toHaveBeenCalledWith(event);
      expect(renderer.root.findByType('View' as any).props.style.width).toBe(342);
    });

    it('does not add any reactivity overhead for an element with no percent-relative calc', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'w-[calc(16px+8px)]' }, undefined);
      mount(el);
      // A constant-only calc still resolves through the normal
      // resolveStyle path (unchanged from before this feature) — never
      // routes through ReactiveElement's layout machinery at all.
      expect(mockResolveStyle).toHaveBeenCalledWith('w-[calc(16px+8px)]', false);
    });
  });

  // Regression coverage for a real gap: min()/max()/clamp() with a
  // percentage argument (e.g. `min(50%,20rem)` — "half the parent, capped
  // at a fixed size", a genuinely common real-world use case) used to get
  // silently dropped with a warning, since only calc() got the
  // onLayout-measurement treatment. Same measure-then-snap mechanism as the
  // calc() block above, via layoutCalc.ts's parsePercentRelativeExpr.
  describe('percentage-relative min()/max()/clamp() (measure-then-snap via onLayout)', () => {
    it('strips the min(...%...) token before calling resolveStyle, and renders 100% first', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'bg-blue-6 w-[min(50%,20rem)]' }, undefined);
      const renderer = mount(el);
      expect(mockResolveStyle).toHaveBeenCalledWith('bg-blue-6', false);
      const style = renderer.root.findByType('View' as any).props.style;
      expect(style.width).toBe('100%');
    });

    it('computes min(percent, constant) once onLayout reports the measured size', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'w-[min(50%,20rem)]' }, undefined);
      const renderer = mount(el);

      act(() => {
        renderer.root.findByType('View' as any).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 1000, height: 100 } } });
      });
      // 50% of 1000 = 500, vs a fixed 320 (20rem) — min is 320.
      expect(renderer.root.findByType('View' as any).props.style.width).toBe(320);

      // A further onLayout with no real window-size change in between is
      // self-caused (applying 320 is itself a layout change from the '100%'
      // probe render) and must be ignored — see the calc() block's own
      // "does NOT compound" regression test above for why.
      act(() => {
        renderer.root.findByType('View' as any).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 100 } } });
      });
      expect(renderer.root.findByType('View' as any).props.style.width).toBe(320);

      // A genuine window-size change resets and re-probes, same as calc().
      act(() => {
        setMockWidth(900);
      });
      act(() => {
        renderer.root.findByType('View' as any).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 500, height: 100 } } });
      });
      // 50% of 500 = 250, below the 320 cap — min is 250.
      expect(renderer.root.findByType('View' as any).props.style.width).toBe(250);
    });

    it('computes clamp(min, preferred%, max) once onLayout reports the measured size', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'w-[clamp(16rem,50%,32rem)]' }, undefined);
      const renderer = mount(el);

      act(() => {
        renderer.root.findByType('View' as any).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 100 } } });
      });
      // 50% of 400 = 200, below the 256px (16rem) floor — clamps up to 256.
      expect(renderer.root.findByType('View' as any).props.style.width).toBe(256);
    });

    it('does not add any reactivity overhead for a min()/max() with no percentage argument', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'w-[min(10px,20px)]' }, undefined);
      mount(el);
      // No percentage operand — resolves through the normal resolveStyle
      // path (reduceConstantMath), never routes through ReactiveElement's
      // layout machinery at all.
      expect(mockResolveStyle).toHaveBeenCalledWith('w-[min(10px,20px)]', false);
    });
  });

  // hover:/focus:/disabled: — resolved entirely above resolveStyle (see
  // jsxRuntimeCore.ts's own doc comment on why), so these assert on the
  // exact className mockResolveStyle received, confirming the modifier was
  // stripped (state holds) or the whole token dropped (state doesn't).
  describe('hover:/focus:/disabled: state modifiers', () => {
    it('drops a hover: token until onHoverIn fires, and restores it on onHoverOut', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'flex hover:bg-red-6' }, undefined);
      const renderer = mount(el);
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex', false);

      act(() => {
        renderer.root.findByType('View' as any).props.onHoverIn({});
      });
      // The satisfied `hover:` becomes a `_kbon:` specificity marker rather
      // than being stripped to nothing — see substituteStateModifiers.
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex _kbon:bg-red-6', false);

      act(() => {
        renderer.root.findByType('View' as any).props.onHoverOut({});
      });
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex', false);
    });

    it('composes with a caller-provided onHoverIn/onHoverOut instead of replacing it', async () => {
      const { jsx } = await import('./jsx-runtime');
      const userOnHoverIn = vi.fn();
      const el = jsx('View', { className: 'hover:bg-red-6', onHoverIn: userOnHoverIn }, undefined);
      const renderer = mount(el);

      const event = { fake: true };
      act(() => {
        renderer.root.findByType('View' as any).props.onHoverIn(event);
      });
      expect(userOnHoverIn).toHaveBeenCalledWith(event);
      expect(mockResolveStyle).toHaveBeenLastCalledWith('_kbon:bg-red-6', false);
    });

    it('drops a focus: token until onFocus fires, and restores it on onBlur', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'flex focus:ring-2' }, undefined);
      const renderer = mount(el);
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex', false);

      act(() => {
        renderer.root.findByType('View' as any).props.onFocus({});
      });
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex _kbon:ring-2', false);

      act(() => {
        renderer.root.findByType('View' as any).props.onBlur({});
      });
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex', false);
    });

    it('requires BOTH states to hold for a chained hover:focus: token', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'hover:focus:bg-red-6' }, undefined);
      const renderer = mount(el);

      act(() => {
        renderer.root.findByType('View' as any).props.onHoverIn({});
      });
      // Hover alone isn't enough — focus hasn't fired yet.
      expect(mockResolveStyle).toHaveBeenLastCalledWith('', false);

      act(() => {
        renderer.root.findByType('View' as any).props.onFocus({});
      });
      // Two satisfied modifiers -> two `_kbon:` markers, so a chained
      // `hover:focus:` token still outweighs a single-modifier one.
      expect(mockResolveStyle).toHaveBeenLastCalledWith('_kbon:_kbon:bg-red-6', false);
    });

    it('a satisfied hover: variant wins over a plain class for the same property regardless of order', async () => {
      // substituteStateModifiers rewrites the satisfied `hover:` to a
      // `_kbon:` specificity marker (never reorders tokens), and
      // resolveStyle resolves the collision on "more modifiers wins" — so
      // the hover color wins once hovered whether it's written before OR
      // after the base class. (Before this, only base-then-variant order
      // worked, since it was pure last-token-wins.)
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'hover:bg-blue-6 bg-red-6' }, undefined);
      const renderer = mount(el);
      expect(mockResolveStyle).toHaveBeenLastCalledWith('bg-red-6', false);

      act(() => {
        renderer.root.findByType('View' as any).props.onHoverIn({});
      });
      expect(mockResolveStyle).toHaveBeenLastCalledWith('_kbon:bg-blue-6 bg-red-6', false);
    });

    it('does not wrap in ReactiveElement for disabled: alone, and reacts via ordinary prop flow', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'flex disabled:opacity-50', disabled: false }, undefined);
      const renderer = mount(el);
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex', false);

      act(() => {
        renderer.update(jsx('View', { className: 'flex disabled:opacity-50', disabled: true }, undefined) as any);
      });
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex _kbon:opacity-50', false);
    });

    it('does not add any reactivity overhead for an element using neither hover: nor focus:', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'flex bg-blue-6' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);
    });
  });

  // Same "reads straight off this element's own props, reacts via ordinary
  // prop flow, no ReactiveElement wrapping needed" mechanism disabled:
  // already uses above — data-[...]:/aria-[...]:/the static aria-*
  // shortcuts are the parameterized/named extension of that same idea.
  describe('data-[...]:/aria-[...]:/static aria-* shortcut modifiers', () => {
    it('resolves aria-[key=value]: against the matching aria-* prop', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'flex aria-[expanded=true]:opacity-100', 'aria-expanded': false }, undefined);
      const renderer = mount(el);
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex', false);

      act(() => {
        renderer.update(
          jsx('View', { className: 'flex aria-[expanded=true]:opacity-100', 'aria-expanded': true }, undefined) as any,
        );
      });
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex _kbon:opacity-100', false);
    });

    it('resolves data-[key=value]: against the matching data-* prop', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'flex data-[state=open]:opacity-100', 'data-state': 'closed' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex', false);
    });

    it('resolves a bare data-[key]:/aria-[key]: as a truthy-presence check', async () => {
      const { jsx } = await import('./jsx-runtime');
      const present = jsx('View', { className: 'flex data-[loading]:opacity-50', 'data-loading': true }, undefined);
      mount(present);
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex _kbon:opacity-50', false);

      const absent = jsx('View', { className: 'flex data-[loading]:opacity-50' }, undefined);
      mount(absent);
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex', false);
    });

    it('resolves the static aria-* shortcuts (aria-expanded, aria-selected, ...)', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'flex aria-selected:bg-blue-8', 'aria-selected': true }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex _kbon:bg-blue-8', false);
    });

    it('accepts the literal string "true" the same as a real boolean for a static aria-* shortcut', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'flex aria-checked:bg-blue-8', 'aria-checked': 'true' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex _kbon:bg-blue-8', false);
    });

    it('requires every modifier on a chained token to hold, same as hover:focus: already requires both', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx(
        'View',
        { className: 'flex disabled:aria-expanded:opacity-50', disabled: true, 'aria-expanded': false },
        undefined,
      );
      mount(el);
      expect(mockResolveStyle).toHaveBeenLastCalledWith('flex', false);
    });

    it('does not add any reactivity overhead for an element using none of these', async () => {
      const { jsx } = await import('./jsx-runtime');
      const el = jsx('View', { className: 'flex bg-blue-6' }, undefined);
      mount(el);
      expect(mockResolveStyle).toHaveBeenCalledTimes(1);
    });
  });
});
