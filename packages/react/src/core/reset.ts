export const BASE_RESET = [
  // border-style: solid means border-N utilities show a visible border without an extra border-solid class.
  // border-width: 0 keeps all elements borderless by default.
  '*, *::before, *::after { box-sizing: border-box; border-width: 0; border-style: solid; border-color: currentColor; }',
  'body { margin: 0; padding: 0; }',
  'h1, h2, h3, h4, h5, h6 { margin: 0; font-size: inherit; font-weight: inherit; }',
  'p { margin: 0; }',
  'a { color: inherit; text-decoration: none; }',
  'ul, ol { margin: 0; padding: 0; list-style: none; }',
  'img, video, svg { display: block; max-width: 100%; }',
  // appearance: none is deliberately NOT applied to checkbox/radio/select below —
  // stripping it hides their native checkmark/arrow with nothing rendered in its
  // place, leaving an invisible checkbox or an arrow-less <select> that looks like
  // plain text. Text-like inputs, textarea, and button don't have that problem
  // (their native chrome is just a skin around content utilities can fully
  // restyle), so they keep the blank-canvas treatment.
  "input:not([type='checkbox']):not([type='radio']), textarea { appearance: none; -webkit-appearance: none; background: transparent; padding: 0; margin: 0; font: inherit; color: inherit; line-height: inherit; }",
  // Native checkbox/radio/range still get typography + spacing normalized, and
  // accent-color re-themes their native indicator to the current text color
  // instead of the browser/OS default blue, so they stay on-brand without
  // needing to be rebuilt from scratch.
  "input[type='checkbox'], input[type='radio'], input[type='range'] { margin: 0; font: inherit; accent-color: currentColor; }",
  // select keeps its native chrome (border/background/arrow are all part of the
  // same OS-drawn widget that appearance: none would blank out) — only typography
  // and spacing are normalized so it still matches surrounding text.
  'select { margin: 0; font: inherit; color: inherit; line-height: inherit; }',
  'button { appearance: none; -webkit-appearance: none; background: transparent; padding: 0; margin: 0; font: inherit; color: inherit; cursor: pointer; line-height: inherit; text-align: inherit; }',
  "button, [role='button'] { cursor: pointer; }",
  ':disabled { cursor: default; }',
  'textarea { resize: vertical; }',
  // Firefox renders placeholders at ~54% opacity by default; every other browser uses 1 —
  // normalize to 1 so placeholder color is consistent and fully controlled by the placeholder: modifier.
  '::placeholder { opacity: 1; }',
  "input[type='number']::-webkit-inner-spin-button, input[type='number']::-webkit-outer-spin-button { margin: 0; }",
  "input[type='search']::-webkit-search-decoration, input[type='search']::-webkit-search-cancel-button { -webkit-appearance: none; }",
  'fieldset { padding: 0; margin: 0; }',
  'table { border-collapse: collapse; border-spacing: 0; }',
].join('\n');
