import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockResolveStyle = vi.fn(
  (_classString: string, _themeJson: string, _colorScheme: string, _pressed: boolean, _width: number) => '{"display":"flex"}',
);
const mockGetColorScheme = vi.fn(() => 'light' as 'light' | 'dark' | null);
const mockGet = vi.fn(() => ({ resolveStyle: mockResolveStyle }) as { resolveStyle: typeof mockResolveStyle } | null);
const mockAddChangeListener = vi.fn(() => ({ remove: vi.fn() }));
const mockDimensionsGet = vi.fn(() => ({ width: 375, height: 812 }));

vi.mock('react-native', () => ({
  TurboModuleRegistry: { get: mockGet },
  Appearance: { getColorScheme: mockGetColorScheme, addChangeListener: mockAddChangeListener },
  Dimensions: { get: mockDimensionsGet },
}));

describe('nativeBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetColorScheme.mockReturnValue('light');
    mockGet.mockReturnValue({ resolveStyle: mockResolveStyle });
    // resolveStyle now reads darkModeStore.ts's getGlobalDarkMode() instead
    // of Appearance.getColorScheme() directly (see nativeBridge.ts's own
    // doc comment on why) — that store reads the OS scheme ONCE at module
    // import time, not on every call, so each test needs a genuinely fresh
    // module instance to pick up a different mocked scheme.
    vi.resetModules();
  });

  it('gets the KbachModule TurboModule by name', async () => {
    const { resolveStyle } = await import('./nativeBridge');
    resolveStyle('flex');
    expect(mockGet).toHaveBeenCalledWith('KbachModule');
  });

  it('falls back to the pure-JS engine when the TurboModule is not registered (Expo Go)', async () => {
    mockGet.mockReturnValue(null);
    const { resolveStyle } = await import('./nativeBridge');
    expect(resolveStyle('flex items-center bg-blue-6')).toEqual({
      display: 'flex',
      alignItems: 'center',
      backgroundColor: expect.any(String),
    });
    // The native module was never called at all — this went through the JS engine.
    expect(mockResolveStyle).not.toHaveBeenCalled();
  });

  it('passes the current color scheme through as the third arg', async () => {
    mockGetColorScheme.mockReturnValue('dark');
    const { resolveStyle } = await import('./nativeBridge');
    resolveStyle('dark:bg-blue-8');
    expect(mockResolveStyle).toHaveBeenCalledWith('dark:bg-blue-8', expect.any(String), 'dark', false, expect.any(Number));
  });

  it('defaults a null color scheme (no system preference) to "light"', async () => {
    mockGetColorScheme.mockReturnValue(null);
    const { resolveStyle } = await import('./nativeBridge');
    resolveStyle('flex');
    expect(mockResolveStyle).toHaveBeenCalledWith('flex', expect.any(String), 'light', false, expect.any(Number));
  });

  it('passes the pressed argument through as the fourth arg', async () => {
    const { resolveStyle } = await import('./nativeBridge');
    resolveStyle('active:bg-blue-8', true);
    expect(mockResolveStyle).toHaveBeenCalledWith('active:bg-blue-8', expect.any(String), 'light', true, expect.any(Number));
  });

  it('passes Dimensions.get("window").width through as the fifth arg', async () => {
    mockDimensionsGet.mockReturnValue({ width: 800, height: 1280 });
    const { resolveStyle } = await import('./nativeBridge');
    resolveStyle('sm:flex');
    expect(mockResolveStyle).toHaveBeenCalledWith('sm:flex', expect.any(String), 'light', false, 800);
  });

  it('parses the JSON string returned by the native module', async () => {
    mockResolveStyle.mockReturnValue('{"display":"flex","backgroundColor":"#2563eb"}');
    const { resolveStyle } = await import('./nativeBridge');
    expect(resolveStyle('flex bg-blue-6')).toEqual({ display: 'flex', backgroundColor: '#2563eb' });
  });

  it('reflects an explicit setGlobalThemeMode override, not just the raw OS scheme', async () => {
    // The OS itself still reports light, but an explicit override should win.
    mockGetColorScheme.mockReturnValue('light');
    const { resolveStyle } = await import('./nativeBridge');
    const { setGlobalThemeMode } = await import('./darkModeStore');
    setGlobalThemeMode('dark');
    resolveStyle('dark:bg-blue-8');
    expect(mockResolveStyle).toHaveBeenCalledWith('dark:bg-blue-8', expect.any(String), 'dark', false, expect.any(Number));
  });

  describe('__kbachWarnings (native/JNI path)', () => {
    it('strips the __kbachWarnings key out of the returned style object', async () => {
      mockResolveStyle.mockReturnValue('{"width":"50%","__kbachWarnings":["some warning"]}');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { resolveStyle } = await import('./nativeBridge');
      expect(resolveStyle('w-1/2 w-[calc(50%-8px)]')).toEqual({ width: '50%' });
      warnSpy.mockRestore();
    });

    it('console.warns each embedded warning, including the className that produced it', async () => {
      mockResolveStyle.mockReturnValue('{"__kbachWarnings":["Kbach: bad value"]}');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { resolveStyle } = await import('./nativeBridge');
      resolveStyle('w-[calc(50%-8px)]');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]![0]).toContain('Kbach: bad value');
      expect(warnSpy.mock.calls[0]![0]).toContain('w-[calc(50%-8px)]');
      warnSpy.mockRestore();
    });

    it('does not warn at all when there are no warnings', async () => {
      mockResolveStyle.mockReturnValue('{"display":"flex"}');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { resolveStyle } = await import('./nativeBridge');
      resolveStyle('flex');
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('prints the exact same warning only once, even across many resolveStyle calls', async () => {
      mockResolveStyle.mockReturnValue('{"__kbachWarnings":["Kbach: bad value"]}');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { resolveStyle } = await import('./nativeBridge');
      resolveStyle('w-[calc(50%-8px)]');
      resolveStyle('w-[calc(50%-8px)]');
      resolveStyle('w-[calc(50%-8px)]');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it('still warns for a DIFFERENT className even after another one was already de-duped', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { resolveStyle } = await import('./nativeBridge');

      mockResolveStyle.mockReturnValue('{"__kbachWarnings":["Kbach: bad value"]}');
      resolveStyle('w-[calc(50%-8px)]');

      mockResolveStyle.mockReturnValue('{"__kbachWarnings":["Kbach: another bad value"]}');
      resolveStyle('h-[calc(50%-8px)]');

      expect(warnSpy).toHaveBeenCalledTimes(2);
      warnSpy.mockRestore();
    });
  });

  describe('warnings from the jsEngine fallback path (Expo Go)', () => {
    it('console.warns when the JS engine drops an unresolvable arbitrary value', async () => {
      mockGet.mockReturnValue(null);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { resolveStyle } = await import('./nativeBridge');
      const style = resolveStyle('w-[calc(50%-8px)]');
      expect(style.width).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]![0]).toContain('calc(50%-8px)');
      warnSpy.mockRestore();
    });
  });
});
