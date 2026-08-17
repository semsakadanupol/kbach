/** Port of `resolvers/spacing.rs`'s `resolve` (named_size, fraction_percent, resolve_size). */
import { decl, resolveLength, resolveNegatableLength, type Declaration } from '../shared';
import type { ParsedClass } from '../parser';
import type { ThemeConfig } from '../../theme';

/** Named container-scale sizes (Tailwind's `max-w-*` scale, applied to w/h/min-w/max-w/min-h/max-h alike). */
function namedSize(key: string): string | null {
  switch (key) {
    case 'sm': return '24rem';
    case 'md': return '28rem';
    case 'lg': return '32rem';
    case 'xl': return '36rem';
    case '2xl': return '42rem';
    case '3xl': return '48rem';
    case '4xl': return '56rem';
    case '5xl': return '64rem';
    case '6xl': return '72rem';
    case '7xl': return '80rem';
    case '8xl': return '88rem';
    case '9xl': return '96rem';
    default: return null;
  }
}

/** `w-1/2`/`h-2/3`-style fractions -> a percentage. */
function fractionPercent(value: string): string | null {
  const slashIdx = value.indexOf('/');
  if (slashIdx === -1) return null;
  const numStr = value.slice(0, slashIdx);
  const denStr = value.slice(slashIdx + 1);
  const num = Number(numStr);
  const den = Number(denStr);
  if (!Number.isFinite(num) || !Number.isFinite(den) || numStr.trim() === '' || denStr.trim() === '') return null;
  if (den === 0) return null;
  const pct = (num / den) * 100;
  const formatted = pct.toFixed(6);
  const trimmed = formatted.replace(/0+$/, '').replace(/\.$/, '');
  return `${trimmed}%`;
}

/** CSS's own sizing keywords — distinct from the theme's spacing-scale numbers/named container sizes. */
function cssSizeKeyword(key: string): string | null {
  switch (key) {
    case 'min': return 'min-content';
    case 'max': return 'max-content';
    case 'fit': return 'fit-content';
    default: return null;
  }
}

function resolveSize(theme: ThemeConfig, parsed: ParsedClass): string | null {
  if (!parsed.isArbitrary && parsed.value !== null) {
    const named = namedSize(parsed.value);
    if (named !== null) return named;
    const kw = cssSizeKeyword(parsed.value);
    if (kw !== null) return kw;
    const fraction = fractionPercent(parsed.value);
    if (fraction !== null) return fraction;
  }
  return resolveLength(theme, parsed);
}

export function resolve(parsed: ParsedClass, theme: ThemeConfig): Declaration[] | null {
  const length = () => resolveLength(theme, parsed);
  const size = () => resolveSize(theme, parsed);
  // Margin (unlike padding) supports real Tailwind's negative-value
  // convention ("-mt-4") — see resolveNegatableLength's own doc comment.
  const negatableLength = () => resolveNegatableLength(theme, parsed);

  switch (parsed.utility) {
    case 'p': {
      const v = length();
      return v === null ? null : [decl('padding', v)];
    }
    case 'px': {
      const v = length();
      return v === null ? null : [decl('padding-left', v), decl('padding-right', v)];
    }
    case 'py': {
      const v = length();
      return v === null ? null : [decl('padding-top', v), decl('padding-bottom', v)];
    }
    case 'pt': {
      const v = length();
      return v === null ? null : [decl('padding-top', v)];
    }
    case 'pr': {
      const v = length();
      return v === null ? null : [decl('padding-right', v)];
    }
    case 'pb': {
      const v = length();
      return v === null ? null : [decl('padding-bottom', v)];
    }
    case 'pl': {
      const v = length();
      return v === null ? null : [decl('padding-left', v)];
    }
    case 'm': {
      const v = negatableLength();
      return v === null ? null : [decl('margin', v)];
    }
    case 'mx': {
      const v = negatableLength();
      return v === null ? null : [decl('margin-left', v), decl('margin-right', v)];
    }
    case 'my': {
      const v = negatableLength();
      return v === null ? null : [decl('margin-top', v), decl('margin-bottom', v)];
    }
    case 'mt': {
      const v = negatableLength();
      return v === null ? null : [decl('margin-top', v)];
    }
    case 'mr': {
      const v = negatableLength();
      return v === null ? null : [decl('margin-right', v)];
    }
    case 'mb': {
      const v = negatableLength();
      return v === null ? null : [decl('margin-bottom', v)];
    }
    case 'ml': {
      const v = negatableLength();
      return v === null ? null : [decl('margin-left', v)];
    }
    case 'gap': {
      const v = length();
      return v === null ? null : [decl('gap', v)];
    }
    case 'gap-x': {
      const v = length();
      return v === null ? null : [decl('column-gap', v)];
    }
    case 'gap-y': {
      const v = length();
      return v === null ? null : [decl('row-gap', v)];
    }
    case 'w': {
      const v = size();
      return v === null ? null : [decl('width', v)];
    }
    case 'h': {
      const v = size();
      return v === null ? null : [decl('height', v)];
    }
    case 'min-w': {
      const v = size();
      return v === null ? null : [decl('min-width', v)];
    }
    case 'max-w': {
      const v = size();
      return v === null ? null : [decl('max-width', v)];
    }
    case 'min-h': {
      const v = size();
      return v === null ? null : [decl('min-height', v)];
    }
    case 'max-h': {
      const v = size();
      return v === null ? null : [decl('max-height', v)];
    }
    case 'size': {
      const v = size();
      return v === null ? null : [decl('width', v), decl('height', v)];
    }
    case 'basis': {
      const v = size();
      return v === null ? null : [decl('flex-basis', v)];
    }
    default:
      return null;
  }
}
