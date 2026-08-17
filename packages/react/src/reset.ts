// Shared between <KbachReset /> (renders it as a real DOM id during SSR/CSR)
// and the runtime injector (kb.ts skips re-injecting BASE_RESET when it
// finds this id already in the document, so the two setups don't double it up).
export const RESET_STYLE_ID = 'kbach-reset';

interface ResetRule {
  css: string;
  // Tag names (lowercase, intrinsic JSX elements) this rule exists for.
  // Omitted entirely means universal — always included regardless of what
  // the project uses (box-sizing, body margin: every page has a body,
  // and every element benefits from a predictable box model).
  tags?: string[];
}

// Ordered list form (rather than one joined string) so buildResetCSS() can
// filter it per-project without re-parsing anything — BASE_RESET below is
// just this list's css joined unconditionally, kept as the always-available
// fallback for callers with no source-scan information (the runtime
// injector in kb.ts, <KbachReset/>, and any static build that doesn't pass
// usedTags to buildResetCSS).
const RESET_RULES: ResetRule[] = [
  // border-style: solid means border-N utilities show a visible border without an extra border-solid class.
  // border-width: 0 keeps all elements borderless by default.
  { css: '*, *::before, *::after { box-sizing: border-box; border-width: 0; border-style: solid; border-color: currentColor; }' },
  { css: 'body { margin: 0; padding: 0; }' },
  { css: 'h1, h2, h3, h4, h5, h6 { margin: 0; font-size: inherit; font-weight: inherit; }', tags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] },
  { css: 'p { margin: 0; }', tags: ['p'] },
  { css: 'a { color: inherit; text-decoration: none; }', tags: ['a'] },
  { css: 'ul, ol { margin: 0; padding: 0; list-style: none; }', tags: ['ul', 'ol'] },
  // svg here only covers a literal <svg> tag in JSX — an icon imported as
  // a component (e.g. `<ArrowIcon />`) never appears as the text "svg" in
  // source, so this rule won't be pulled in by that usage alone. Same
  // caveat applies to every tag-gated rule below: detection is a literal
  // source-text scan (see vite-plugin/scan.ts's scanUsedTags), not a real
  // DOM/type check.
  { css: 'img, video, svg { display: block; max-width: 100%; }', tags: ['img', 'video', 'svg'] },
  // appearance: none is deliberately NOT applied to checkbox/radio/select below —
  // stripping it hides their native checkmark/arrow with nothing rendered in its
  // place, leaving an invisible checkbox or an arrow-less <select> that looks like
  // plain text. Text-like inputs, textarea, and button don't have that problem
  // (their native chrome is just a skin around content utilities can fully
  // restyle), so they keep the blank-canvas treatment.
  // :where() wraps the :not() exclusions so they contribute ZERO specificity
  // (unlike a bare `input:not([type='checkbox']):not([type='radio'])`, whose
  // two :not([attr]) clauses each add a class-level specificity point — (0,2,1)
  // total, MORE than any single utility class (0,1,0)). Without :where(), this
  // reset's `color: inherit` always won the cascade over a text-* color
  // utility applied directly to a <input>/<textarea> regardless of source
  // order, since author rules only override on a tie or higher specificity —
  // confirmed on a real app: a TextInput's own text color utility resolved
  // and injected correctly, class and all, but silently never painted.
  {
    css: "input:where(:not([type='checkbox']):not([type='radio'])), textarea { appearance: none; -webkit-appearance: none; background: transparent; padding: 0; margin: 0; font: inherit; color: inherit; line-height: inherit; }",
    tags: ['input', 'textarea'],
  },
  // Native checkbox/radio/range still get typography + spacing normalized, and
  // accent-color re-themes their native indicator to the current text color
  // instead of the browser/OS default blue, so they stay on-brand without
  // needing to be rebuilt from scratch. Wrapped in :where() for the exact
  // same reason as the input:not(...) exclusions above — a bare
  // `input[type='range']` attribute selector has specificity (0,1,1),
  // MORE than any single utility class (0,1,0), so an `accent-*` utility
  // (Phase 23) applied directly to a checkbox/radio/range would resolve and
  // inject correctly but silently never paint, losing the cascade to this
  // reset regardless of source order — confirmed by hand via
  // getComputedStyle on a real `accent-red-6` range input, which reported
  // `currentColor`'s inherited value instead. `:where()` zeroes this
  // selector's specificity contribution entirely, so any `accent-*`
  // utility trivially wins once applied.
  {
    css: ":where(input[type='checkbox'], input[type='radio'], input[type='range']) { margin: 0; font: inherit; accent-color: currentColor; }",
    tags: ['input'],
  },
  // select keeps its native chrome (border/background/arrow are all part of the
  // same OS-drawn widget that appearance: none would blank out) — only typography
  // and spacing are normalized so it still matches surrounding text.
  { css: 'select { margin: 0; font: inherit; color: inherit; line-height: inherit; }', tags: ['select'] },
  { css: 'button { appearance: none; -webkit-appearance: none; background: transparent; padding: 0; margin: 0; font: inherit; color: inherit; cursor: pointer; line-height: inherit; text-align: inherit; }', tags: ['button'] },
  // Also covers any element opted into the button role (`role="button"` on
  // a <div>/<span>) — but only when a literal <button> tag is ALSO
  // somewhere in the scanned source, since detection here is purely
  // tag-name-based; a project using role="button" exclusively, with no
  // real <button> anywhere, won't pull this rule in. Acceptable tradeoff
  // for this project's scope (rare pattern) — cheap enough that scanning
  // for it separately isn't worth the added complexity.
  { css: "button, [role='button'] { cursor: pointer; }", tags: ['button'] },
  { css: ':disabled { cursor: default; }', tags: ['button', 'input', 'select', 'textarea'] },
  { css: 'textarea { resize: vertical; }', tags: ['textarea'] },
  // Firefox renders placeholders at ~54% opacity by default; every other browser uses 1 —
  // normalize to 1 so placeholder color is consistent and fully controlled by the placeholder: modifier.
  { css: '::placeholder { opacity: 1; }', tags: ['input', 'textarea'] },
  { css: "input[type='number']::-webkit-inner-spin-button, input[type='number']::-webkit-outer-spin-button { margin: 0; }", tags: ['input'] },
  { css: "input[type='search']::-webkit-search-decoration, input[type='search']::-webkit-search-cancel-button { -webkit-appearance: none; }", tags: ['input'] },
  { css: 'fieldset { padding: 0; margin: 0; }', tags: ['fieldset'] },
  { css: 'table { border-collapse: collapse; border-spacing: 0; }', tags: ['table'] },
];

/** Every reset rule, unconditionally — the runtime injector (kb.ts) and <KbachReset/> use this as-is, since neither has source-scan information to prune against. */
export const BASE_RESET = RESET_RULES.map((r) => r.css).join('\n');

/**
 * Prunes RESET_RULES down to only the rules relevant to the HTML tags a
 * project actually uses, plus the universal ones (box-sizing, body
 * margin) that always apply. `usedTags` comes from a literal source-text
 * scan (vite-plugin/scan.ts's scanUsedTags) — pass `undefined` to get the
 * full, unpruned BASE_RESET (used when no scan info is available).
 */
export function buildResetCSS(usedTags: Set<string> | undefined): string {
  if (!usedTags) return BASE_RESET;
  return RESET_RULES.filter((r) => !r.tags || r.tags.some((t) => usedTags.has(t)))
    .map((r) => r.css)
    .join('\n');
}
