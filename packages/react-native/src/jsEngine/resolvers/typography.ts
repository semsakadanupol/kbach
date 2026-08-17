/**
 * Port of `resolvers/typography.rs` — only the four lookup tables native
 * actually consults (`font_weight`, `text_size`, `text_align`,
 * `line_height_size`). Everything else in typography.rs (named leading/
 * tracking keywords, letter-spacing scale, text-wrap, decoration/
 * underline-offset/indent/whitespace/break/align/list/hyphens) is
 * web/DOM-only and deliberately excluded — see resolveUtilityNative.ts's
 * doc comment.
 */

export function textSize(key: string): string | null {
  switch (key) {
    case 'xs': return '0.75rem';
    case 'sm': return '0.875rem';
    case 'base': return '1rem';
    case 'lg': return '1.125rem';
    case 'xl': return '1.25rem';
    case '2xl': return '1.5rem';
    case '3xl': return '1.875rem';
    case '4xl': return '2.25rem';
    default: return null;
  }
}

export function lineHeightSize(key: string): string | null {
  switch (key) {
    case '3': return '0.75rem';
    case '4': return '1rem';
    case '5': return '1.25rem';
    case '6': return '1.5rem';
    case '7': return '1.75rem';
    case '8': return '2rem';
    case '9': return '2.25rem';
    case '10': return '2.5rem';
    default: return null;
  }
}

export function textAlign(key: string): string | null {
  switch (key) {
    case 'left': return 'left';
    case 'center': return 'center';
    case 'right': return 'right';
    case 'justify': return 'justify';
    default: return null;
  }
}

export function fontWeight(key: string): string | null {
  switch (key) {
    case 'thin': return '100';
    case 'normal': return '400';
    case 'medium': return '500';
    case 'semibold': return '600';
    case 'bold': return '700';
    case 'extrabold': return '800';
    default: return null;
  }
}
