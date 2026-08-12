import { describe, it, expect } from 'vitest';
import { prettifyCSS } from './prettify';

describe('prettifyCSS', () => {
  it('reformats a compact single-line rule into multi-line indented CSS', () => {
    const out = prettifyCSS('.flex { display: flex }');
    expect(out).toBe('.flex {\n  display: flex;\n}');
  });

  it('reformats multiple declarations onto their own lines', () => {
    const out = prettifyCSS('.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }');
    expect(out).toBe(
      '.truncate {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}',
    );
  });

  it('indents nested @media blocks one level deeper', () => {
    const out = prettifyCSS('@media (min-width: 640px) { .sm\\:flex { display: flex } }');
    expect(out).toBe('@media (min-width: 640px) {\n  .sm\\:flex {\n    display: flex;\n  }\n}');
  });

  it('handles multiple top-level rules', () => {
    const out = prettifyCSS('.a { color: red } .b { color: blue }');
    expect(out).toBe('.a {\n  color: red;\n}\n.b {\n  color: blue;\n}');
  });
});
