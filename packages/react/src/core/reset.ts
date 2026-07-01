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
  'input, textarea, select { appearance: none; -webkit-appearance: none; background: transparent; padding: 0; margin: 0; font: inherit; color: inherit; line-height: inherit; }',
  'button { appearance: none; -webkit-appearance: none; background: transparent; padding: 0; margin: 0; font: inherit; color: inherit; cursor: pointer; line-height: inherit; text-align: inherit; }',
  'fieldset { padding: 0; margin: 0; }',
  'table { border-collapse: collapse; border-spacing: 0; }',
].join('\n');
