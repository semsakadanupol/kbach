import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
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
  let warnSpy: MockInstance;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('warns for an unresolvable class not defined anywhere in the project', () => {
    warnIfUnknownClass('bg-blu-6', 'App.tsx', '<div className="bg-blu-6">', false, new Set(), new Set());
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toContain('bg-blu-6');
  });

  it('includes the exact line:column of the token when found in the source', () => {
    const code = 'line one\nline two\n  <div className="bg-blu-6" />';
    warnIfUnknownClass('bg-blu-6', 'App.tsx', code, false, new Set(), new Set());
    const message = warnSpy.mock.calls[0]![0] as string;
    expect(message).toContain('App.tsx:3:19');
  });

  it('falls back to the bare file path when the token is not found in the source', () => {
    warnIfUnknownClass('bg-blu-6', 'App.tsx', 'no matching token here', false, new Set(), new Set());
    const message = warnSpy.mock.calls[0]![0] as string;
    expect(message).toContain('App.tsx');
    expect(message).not.toMatch(/App\.tsx:\d/);
  });

  it('does not warn when the class is resolvable by Kbach', () => {
    warnIfUnknownClass('bg-blue-6', 'App.tsx', '', true, new Set(), new Set());
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when the class is defined in the project\'s own stylesheets', () => {
    warnIfUnknownClass('custom-card', 'App.tsx', '', false, new Set(['custom-card']), new Set());
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn for the group/peer ancestor-state marker classes, which produce no CSS by design', () => {
    warnIfUnknownClass('group', 'App.tsx', '', false, new Set(), new Set());
    warnIfUnknownClass('peer', 'App.tsx', '', false, new Set(), new Set());
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn for a NAMED group/peer marker class (group/sidebar, peer/field)', () => {
    warnIfUnknownClass('group/sidebar', 'App.tsx', '', false, new Set(), new Set());
    warnIfUnknownClass('peer/field', 'App.tsx', '', false, new Set(), new Set());
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('still warns for a genuine typo that merely starts with group/peer', () => {
    warnIfUnknownClass('groupp/sidebar', 'App.tsx', '', false, new Set(), new Set());
    warnIfUnknownClass('group/', 'App.tsx', '', false, new Set(), new Set());
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('strips a named group modifier prefix (group-hover/sidebar:) before checking the base utility', () => {
    warnIfUnknownClass('group-hover/sidebar:custom-card', 'App.tsx', '', false, new Set(['custom-card']), new Set());
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('strips modifier prefixes before checking against project CSS classes', () => {
    warnIfUnknownClass('hover:dark:custom-card', 'App.tsx', '', false, new Set(['custom-card']), new Set());
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('only warns once per unique token', () => {
    const warned = new Set<string>();
    warnIfUnknownClass('bg-blu-6', 'App.tsx', '', false, new Set(), warned);
    warnIfUnknownClass('bg-blu-6', 'Other.tsx', '', false, new Set(), warned);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
