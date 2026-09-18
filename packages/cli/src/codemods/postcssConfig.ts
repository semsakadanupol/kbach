import * as recast from 'recast';
import * as babelTsParser from 'recast/parsers/babel-ts';

export type PatchResult =
  | { ok: true; changed: boolean; code: string }
  | { ok: false; reason: string };

const PLUGIN_ENTRY = '@kbach/react/postcss';

/**
 * Finds the plain object literal exported via `module.exports = {...}`
 * (postcss.config.js/.cjs), `export default {...}` (postcss.config.mjs),
 * or — confirmed as the actual current `create-next-app` default output,
 * not a hypothetical edge case — `const config = {...}; export default
 * config;`. Unlike babelConfig.ts's target, postcss.config never wraps its
 * export in a function, so there's no function-body case to unwrap here.
 * Anything else (a call-wrapped export like `module.exports =
 * withSomething({...})`) returns null so the caller falls back to the
 * manual snippet rather than guessing.
 */
function findExportedConfigObject(ast: any): any {
  const n = recast.types.namedTypes;
  let target: any = null;

  function resolveVariable(name: string): any {
    let found: any = null;
    recast.types.visit(ast, {
      visitVariableDeclarator(path: any) {
        if (n.Identifier.check(path.node.id) && path.node.id.name === name && n.ObjectExpression.check(path.node.init)) {
          found = path.node.init;
        }
        this.traverse(path);
      },
    });
    return found;
  }

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
        if (n.ObjectExpression.check(right)) target = right;
        else if (n.Identifier.check(right)) target = resolveVariable(right.name);
      }
      this.traverse(path);
    },
    visitExportDefaultDeclaration(path: any) {
      const decl = path.node.declaration;
      if (n.ObjectExpression.check(decl)) target = decl;
      else if (n.Identifier.check(decl)) target = resolveVariable(decl.name);
      this.traverse(path);
    },
  });

  return target;
}

/**
 * Adds the `'@kbach/react/postcss': {}` plugin entry (packages/react/AGENTS.md
 * §1) to whichever shape the config's `plugins` already uses — the object
 * form the docs show, or a plugins ARRAY (some hand-written/Tailwind-CLI-
 * style configs use that instead; both are real PostCSS-supported shapes,
 * so supporting both isn't a guess). Creates `plugins` as an object if the
 * config has none yet. Idempotent either way.
 */
export function patchPostcssConfig(source: string): PatchResult {
  let ast: any;
  try {
    ast = recast.parse(source, { parser: babelTsParser });
  } catch (err) {
    return { ok: false, reason: `couldn't parse postcss config: ${(err as Error).message}` };
  }

  const target = findExportedConfigObject(ast);
  if (!target) {
    return { ok: false, reason: "couldn't find a plain module.exports/export default object" };
  }

  const b = recast.types.builders;
  const n = recast.types.namedTypes;

  const pluginsProp: any = target.properties.find(
    (prop: any) =>
      (n.ObjectProperty.check(prop) || n.Property.check(prop)) &&
      n.Identifier.check(prop.key) &&
      prop.key.name === 'plugins',
  );

  const keyMatches = (key: any): boolean =>
    (n.StringLiteral.check(key) || n.Literal.check(key)) && key.value === PLUGIN_ENTRY;

  if (!pluginsProp) {
    target.properties.push(
      b.objectProperty(b.identifier('plugins'), b.objectExpression([b.objectProperty(b.stringLiteral(PLUGIN_ENTRY), b.objectExpression([]))])),
    );
    return { ok: true, changed: true, code: recast.print(ast, { quote: 'single' }).code };
  }

  const pluginsValue = pluginsProp.value;

  if (n.ObjectExpression.check(pluginsValue)) {
    const already = pluginsValue.properties.some(
      (p: any) => (n.ObjectProperty.check(p) || n.Property.check(p)) && keyMatches(p.key),
    );
    if (already) return { ok: true, changed: false, code: source };
    pluginsValue.properties.push(b.objectProperty(b.stringLiteral(PLUGIN_ENTRY), b.objectExpression([])));
    return { ok: true, changed: true, code: recast.print(ast, { quote: 'single' }).code };
  }

  if (n.ArrayExpression.check(pluginsValue)) {
    const already = pluginsValue.elements.some(
      (el: any) => el && ((n.StringLiteral.check(el) || n.Literal.check(el)) && el.value === PLUGIN_ENTRY),
    );
    if (already) return { ok: true, changed: false, code: source };
    pluginsValue.elements.push(b.stringLiteral(PLUGIN_ENTRY));
    return { ok: true, changed: true, code: recast.print(ast, { quote: 'single' }).code };
  }

  return { ok: false, reason: '"plugins" exists but is neither a plain object nor an array' };
}

/** Read-only variant for `doctor`. */
export function isPostcssConfigWired(source: string): { ok: true; wired: boolean } | { ok: false; reason: string } {
  const result = patchPostcssConfig(source);
  if (!result.ok) return result;
  return { ok: true, wired: !result.changed };
}
