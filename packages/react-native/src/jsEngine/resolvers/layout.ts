/** Port of `resolvers/layout.rs`'s `resolve` and `resolve_flex` (native uses `resolve_flex(parsed, web=false)`). */
import { decl, resolveNegatableLength, type Declaration } from '../shared';
import type { ParsedClass } from '../parser';
import type { ThemeConfig } from '../../theme';

/** Prefixes `value` with "-" when `negative` is set — `z`/`order` are unitless raw passthroughs (never spacing-scale-looked-up), so negating them is just string prefixing. */
function negateRaw(value: string, negative: boolean): string {
  return negative ? `-${value}` : value;
}

export function resolve(parsed: ParsedClass, theme: ThemeConfig): Declaration[] | null {
  switch (parsed.utility) {
    case 'flex':
      return parsed.value === null ? [decl('display', 'flex')] : null;
    case 'grid':
      return [decl('display', 'grid')];
    case 'block':
      return [decl('display', 'block')];
    case 'inline-block':
      return [decl('display', 'inline-block')];
    case 'inline':
      return [decl('display', 'inline')];
    case 'inline-flex':
      return [decl('display', 'inline-flex')];
    case 'inline-grid':
      return [decl('display', 'inline-grid')];
    case 'contents':
      return [decl('display', 'contents')];
    case 'flow-root':
      return [decl('display', 'flow-root')];
    case 'hidden':
      return [decl('display', 'none')];
    case '@container':
      return [decl('container-type', 'inline-size')];
    case 'items-center':
      return [decl('align-items', 'center')];
    case 'items-start':
      return [decl('align-items', 'flex-start')];
    case 'items-end':
      return [decl('align-items', 'flex-end')];
    case 'items-baseline':
      return [decl('align-items', 'baseline')];
    case 'items-stretch':
      return [decl('align-items', 'stretch')];
    case 'justify-center':
      return [decl('justify-content', 'center')];
    case 'justify-start':
      return [decl('justify-content', 'flex-start')];
    case 'justify-end':
      return [decl('justify-content', 'flex-end')];
    case 'justify-between':
      return [decl('justify-content', 'space-between')];
    case 'justify-around':
      return [decl('justify-content', 'space-around')];
    case 'justify-evenly':
      return [decl('justify-content', 'space-evenly')];
    case 'content-start':
      return [decl('align-content', 'flex-start')];
    case 'content-end':
      return [decl('align-content', 'flex-end')];
    case 'content-center':
      return [decl('align-content', 'center')];
    case 'content-between':
      return [decl('align-content', 'space-between')];
    case 'content-around':
      return [decl('align-content', 'space-around')];
    case 'content-evenly':
      return [decl('align-content', 'space-evenly')];
    case 'content-stretch':
      return [decl('align-content', 'stretch')];
    case 'self-auto':
      return [decl('align-self', 'auto')];
    case 'self-center':
      return [decl('align-self', 'center')];
    case 'self-start':
      return [decl('align-self', 'flex-start')];
    case 'self-end':
      return [decl('align-self', 'flex-end')];
    case 'self-stretch':
      return [decl('align-self', 'stretch')];
    case 'self-baseline':
      return [decl('align-self', 'baseline')];
    case 'overflow-hidden':
      return [decl('overflow', 'hidden')];
    case 'overflow-auto':
      return [decl('overflow', 'auto')];
    case 'overflow-scroll':
      return [decl('overflow', 'scroll')];
    case 'overflow-visible':
      return [decl('overflow', 'visible')];
    case 'static':
      return [decl('position', 'static')];
    case 'relative':
      return [decl('position', 'relative')];
    case 'absolute':
      return [decl('position', 'absolute')];
    case 'fixed':
      return [decl('position', 'fixed')];
    case 'sticky':
      return [decl('position', 'sticky')];
    case 'z':
      return parsed.value === null ? null : [decl('z-index', negateRaw(parsed.value, parsed.negative))];
    case 'order':
      return parsed.value === null ? null : [decl('order', negateRaw(parsed.value, parsed.negative))];
    case 'grow':
      return [decl('flex-grow', parsed.value ?? '1')];
    case 'shrink':
      return [decl('flex-shrink', parsed.value ?? '1')];
    // top/right/bottom/left/inset support real Tailwind's negative-value
    // convention ("-top-4") — see resolveNegatableLength's own doc comment.
    case 'top': {
      const v = resolveNegatableLength(theme, parsed);
      return v === null ? null : [decl('top', v)];
    }
    case 'right': {
      const v = resolveNegatableLength(theme, parsed);
      return v === null ? null : [decl('right', v)];
    }
    case 'bottom': {
      const v = resolveNegatableLength(theme, parsed);
      return v === null ? null : [decl('bottom', v)];
    }
    case 'left': {
      const v = resolveNegatableLength(theme, parsed);
      return v === null ? null : [decl('left', v)];
    }
    case 'inset': {
      const v = resolveNegatableLength(theme, parsed);
      return v === null ? null : [decl('inset', v)];
    }
    case 'aspect-square':
      return [decl('aspect-ratio', '1 / 1')];
    case 'aspect-video':
      return [decl('aspect-ratio', '16 / 9')];
    default:
      return null;
  }
}

/**
 * The `flex-` utility family. `web=false` (native's only caller) selects
 * the numeric RN fallback for `auto`/`initial`/`none` instead of the CSS keyword.
 */
export function resolveFlex(parsed: ParsedClass, web: boolean): Declaration[] | null {
  if (parsed.utility !== 'flex') return null;
  const value = parsed.value;
  if (value === null) return null;
  if (parsed.isArbitrary) return [decl('flex', value)];

  switch (value) {
    case 'row':
      return [decl('flex-direction', 'row')];
    case 'col':
      return [decl('flex-direction', 'column')];
    case 'row-reverse':
      return [decl('flex-direction', 'row-reverse')];
    case 'col-reverse':
      return [decl('flex-direction', 'column-reverse')];
    case 'wrap':
      return [decl('flex-wrap', 'wrap')];
    case 'wrap-reverse':
      return [decl('flex-wrap', 'wrap-reverse')];
    case 'nowrap':
      return [decl('flex-wrap', 'nowrap')];
    case '1':
      return [decl('flex', '1')];
    case 'auto':
      return [decl('flex', web ? 'auto' : '1')];
    case 'initial':
      return [decl('flex', web ? 'initial' : '1')];
    case 'none':
      return [decl('flex', web ? 'none' : '0')];
    case 'grow':
      return [decl('flex-grow', '1')];
    case 'grow-0':
      return [decl('flex-grow', '0')];
    case 'shrink':
      return [decl('flex-shrink', '1')];
    case 'shrink-0':
      return [decl('flex-shrink', '0')];
    default:
      return null;
  }
}
