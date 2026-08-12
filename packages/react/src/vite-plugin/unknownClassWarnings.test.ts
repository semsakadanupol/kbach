import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanCssFileInto, warnIfUnknownClass } from './unknownClassWarnings';

describe('scanCssFileInto', () => {
  it('extracts literal class selector names from CSS text', () => {
    const into = new Set<string>();
    scanCssFileInto('.custom-card { padding: 4px } .another-one { color: red }', into);
    expect(into).toEqual(new Set(['custom-card', 'another-one']));
  });

  it('picks up class names inside nested/media-wrapped selectors too', () => {
    const into = new Set<string>();
    scanCssFileInto('@media (min-width: 640px) { .card:hover { color: blue } }', into);
    expect(into.has('card')).toBe(true);
  });
});

describe('warnIfUnknownClass', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('warns for an unresolvable class not defined anywhere in the project', () => {
    warnIfUnknownClass('bg-blu-6', 'App.tsx', false, new Set(), new Set());
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toContain('bg-blu-6');
  });

  it('does not warn when the class is resolvable by Kbach', () => {
    warnIfUnknownClass('bg-blue-6', 'App.tsx', true, new Set(), new Set());
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when the class is defined in the project\'s own stylesheets', () => {
    warnIfUnknownClass('custom-card', 'App.tsx', false, new Set(['custom-card']), new Set());
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('strips modifier prefixes before checking against project CSS classes', () => {
    warnIfUnknownClass('hover:dark:custom-card', 'App.tsx', false, new Set(['custom-card']), new Set());
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('only warns once per unique token', () => {
    const warned = new Set<string>();
    warnIfUnknownClass('bg-blu-6', 'App.tsx', false, new Set(), warned);
    warnIfUnknownClass('bg-blu-6', 'Other.tsx', false, new Set(), warned);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
