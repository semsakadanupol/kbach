import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockResolveStyle = vi.fn((_classString: string, _themeJson: string, _colorScheme: string, _pressed: boolean) => '{"display":"flex"}');
const mockGetColorScheme = vi.fn(() => 'light' as 'light' | 'dark' | null);
const mockGetEnforcing = vi.fn(() => ({ resolveStyle: mockResolveStyle }));

vi.mock('react-native', () => ({
  TurboModuleRegistry: { getEnforcing: mockGetEnforcing },
  Appearance: { getColorScheme: mockGetColorScheme },
}));

describe('nativeBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gets the KbachModule TurboModule by name', async () => {
    const { resolveStyle } = await import('./nativeBridge');
    resolveStyle('flex');
    expect(mockGetEnforcing).toHaveBeenCalledWith('KbachModule');
  });

  it('passes the current color scheme through as the third arg', async () => {
    mockGetColorScheme.mockReturnValue('dark');
    const { resolveStyle } = await import('./nativeBridge');
    resolveStyle('dark:bg-blue-8');
    expect(mockResolveStyle).toHaveBeenCalledWith('dark:bg-blue-8', expect.any(String), 'dark', false);
  });

  it('defaults a null color scheme (no system preference) to "light"', async () => {
    mockGetColorScheme.mockReturnValue(null);
    const { resolveStyle } = await import('./nativeBridge');
    resolveStyle('flex');
    expect(mockResolveStyle).toHaveBeenCalledWith('flex', expect.any(String), 'light', false);
  });

  it('passes the pressed argument through as the fourth arg', async () => {
    const { resolveStyle } = await import('./nativeBridge');
    resolveStyle('active:bg-blue-8', true);
    expect(mockResolveStyle).toHaveBeenCalledWith('active:bg-blue-8', expect.any(String), 'light', true);
  });

  it('parses the JSON string returned by the native module', async () => {
    mockResolveStyle.mockReturnValue('{"display":"flex","backgroundColor":"#2563eb"}');
    const { resolveStyle } = await import('./nativeBridge');
    expect(resolveStyle('flex bg-blue-6')).toEqual({ display: 'flex', backgroundColor: '#2563eb' });
  });
});
