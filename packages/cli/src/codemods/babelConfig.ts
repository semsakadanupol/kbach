import * as recast from 'recast';
import * as babelTsParser from 'recast/parsers/babel-ts';

export type PatchResult =
  | { ok: true; changed: boolean; code: string }
  | { ok: false; reason: string };

/**
 * Locates the object literal a `babel.config.js` actually exports, across
 * the two shapes this CLI's targets use (see packages/react-native/AGENTS.md
 * §1): Expo's `module.exports = function (api) { api.cache(true); return
 * {...}; }` (also handles the arrow-function / concise-body variants some
 * hand-edited configs use), and React Native CLI's plain `module.exports =
 * {...}`. Returns null — not a guess — for anything else (a config built
 * from a spread/variable, an unexpected export shape), so the caller can
 * fall back to printing the manual snippet instead.
 */
function findExportedConfigObject(ast: any): any {
  const n = recast.types.namedTypes;
  let target: any = null;

  recast.types.visit(ast, {
    visitAssignmentExpression(path: any) {
      const { left, right } = path.node;
      const isModuleExports =
        n.MemberExpression.check(left) &&
        n.Identifier.check(left.object) &&
        left.object.name === 'module' &&
        n.Identifier.check(left.property) &&
        left.property.name === 'exports';

      if (isModuleExports) {
        if (n.ObjectExpression.check(right)) {
          target = right;
        } else if (n.FunctionExpression.check(right) || n.ArrowFunctionExpression.check(right)) {
          const body = right.body;
          if (n.ObjectExpression.check(body)) {
            target = body;
          } else if (n.BlockStatement.check(body)) {
            for (const stmt of body.body) {
              if (n.ReturnStatement.check(stmt) && stmt.argument && n.ObjectExpression.check(stmt.argument)) {
                target = stmt.argument;
                break;
              }
            }
          }
        }
      }
      this.traverse(path);
    },
  });

  return target;
}

/**
 * Adds `pluginEntry` (e.g. `'@kbach/react-native/babel-plugin'`) to the
 * exported config's `plugins` array — creating the array if the config has
 * none yet. Idempotent: a re-run against an already-patched file reports
 * `changed: false` rather than adding a duplicate entry.
 */
export function patchBabelConfigPlugin(source: string, pluginEntry: string): PatchResult {
  let ast: any;
  try {
    ast = recast.parse(source, { parser: babelTsParser });
  } catch (err) {
    return { ok: false, reason: `couldn't parse babel.config.js: ${(err as Error).message}` };
  }

  const target = findExportedConfigObject(ast);
  if (!target) {
    return { ok: false, reason: "couldn't find a plain module.exports object or function returning one" };
  }

  const b = recast.types.builders;
  const n = recast.types.namedTypes;

  const isMatchingEntry = (el: any): boolean =>
    Boolean(
      el &&
        ((n.StringLiteral.check(el) && el.value === pluginEntry) ||
          (n.Literal.check(el) && el.value === pluginEntry) ||
          (n.ArrayExpression.check(el) &&
            el.elements[0] &&
            ((n.StringLiteral.check(el.elements[0]) && el.elements[0].value === pluginEntry) ||
              (n.Literal.check(el.elements[0]) && el.elements[0].value === pluginEntry)))),
    );

  const pluginsProp: any = target.properties.find(
    (prop: any) =>
      (n.ObjectProperty.check(prop) || n.Property.check(prop)) &&
      n.Identifier.check(prop.key) &&
      prop.key.name === 'plugins',
  );

  if (!pluginsProp) {
    target.properties.push(b.objectProperty(b.identifier('plugins'), b.arrayExpression([b.stringLiteral(pluginEntry)])));
    return { ok: true, changed: true, code: recast.print(ast, { quote: 'single' }).code };
  }

  if (!n.ArrayExpression.check(pluginsProp.value)) {
    return { ok: false, reason: '"plugins" exists but is not a plain array' };
  }

  if (pluginsProp.value.elements.some(isMatchingEntry)) {
    return { ok: true, changed: false, code: source };
  }

  pluginsProp.value.elements.push(b.stringLiteral(pluginEntry));
  return { ok: true, changed: true, code: recast.print(ast, { quote: 'single' }).code };
}

/** Read-only variant for `doctor` — see isViteConfigWired's own doc comment for why this shape exists. */
export function isBabelPluginWired(source: string, pluginEntry: string): { ok: true; wired: boolean } | { ok: false; reason: string } {
  const result = patchBabelConfigPlugin(source, pluginEntry);
  if (!result.ok) return result;
  return { ok: true, wired: !result.changed };
}
