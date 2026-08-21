/**
 * Port of `resolvers/typography.rs` — the lookup tables native actually
 * consults (`font_weight`, `text_size`, `text_align`, `line_height_size`,
 * `font_family_value`). Everything else in typography.rs (named leading/
 * tracking keywords, letter-spacing scale, text-wrap, decoration/
 * underline-offset/indent/whitespace/break/align/list/hyphens) is
 * web/DOM-only and deliberately excluded — see resolveUtilityNative.ts's
 * doc comment.
 */
import type { ThemeConfig } from '../../theme';

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
    case '5xl': return '3rem';
    case '6xl': return '3.75rem';
    case '7xl': return '4.5rem';
    case '8xl': return '6rem';
    case '9xl': return '8rem';
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
    // Logical alignment — same "no direction-tracking logic needed" reasoning
    // as layout.rs's start/end inset properties.
    case 'start': return 'start';
    case 'end': return 'end';
    default: return null;
  }
}

export function fontWeight(key: string): string | null {
  switch (key) {
    case 'thin': return '100';
    case 'extralight': return '200';
    case 'light': return '300';
    case 'normal': return '400';
    case 'medium': return '500';
    case 'semibold': return '600';
    case 'bold': return '700';
    case 'extrabold': return '800';
    case 'black': return '900';
    default: return null;
  }
}

/**
 * Port of `resolvers/typography.rs`'s `font_family_value` — `theme.fontFamily`
 * always wins when it has an entry for `key` (so a custom theme can both add
 * a new name and override one of the three defaults), falling back to real
 * Tailwind's own default stacks only when the theme doesn't define that name
 * at all.
 */
export function fontFamilyValue(theme: ThemeConfig, key: string): string | null {
  const fromTheme = theme.fontFamily?.[key];
  if (fromTheme !== undefined) return fromTheme;
  switch (key) {
    case 'sans':
      return 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';
    case 'serif':
      return 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
    case 'mono':
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    default:
      return null;
  }
}
