import * as recast from 'recast';
import * as babelTsParser from 'recast/parsers/babel-ts';

export type PatchResult =
  | { ok: true; changed: boolean; code: string }
  | { ok: false; reason: string };

/**
 * A codemod, not a template stomp: parses with recast (which preserves
 * existing formatting/comments outside the nodes it touches) so re-running
 * `init` on an already-patched file is a true no-op, and a hand-edited
 * `vite.config.ts` comes back out looking hand-edited, not regenerated.
 *
 * Only handles the one shape the docs themselves show — `export default
 * defineConfig({ plugins: [...] })` with a literal object argument. Per
 * the CLI's own failure-mode rule, anything else (a callback form, a
 * spread, a config built from a variable) is reported as unpatchable
 * rather than guessed at — the caller falls back to printing the same
 * snippet the README shows for pasting in by hand.
 */
export function patchViteConfig(source: string): PatchResult {
  let ast: any;
  try {
    ast = recast.parse(source, { parser: babelTsParser });
  } catch (err) {
    return { ok: false, reason: `couldn't parse vite.config: ${(err as Error).message}` };
  }

  const b = recast.types.builders;
  const n = recast.types.namedTypes;
  let pluginsArray: any = null;
  let defineConfigCallFound = false;

  recast.types.visit(ast, {
    visitCallExpression(path: any) {
      const callee = path.node.callee;
      if (n.Identifier.check(callee) && callee.name === 'defineConfig') {
        defineConfigCallFound = true;
        const arg = path.node.arguments[0];
        if (arg && n.ObjectExpression.check(arg)) {
          const pluginsProp: any = arg.properties.find(
            (prop: any) =>
              (n.ObjectProperty.check(prop) || n.Property.check(prop)) &&
              n.Identifier.check(prop.key) &&
              prop.key.name === 'plugins',
          );
          if (pluginsProp && n.ArrayExpression.check(pluginsProp.value)) {
            pluginsArray = pluginsProp.value;
          }
        }
      }
      this.traverse(path);
    },
  });

  if (!defineConfigCallFound) {
    return { ok: false, reason: 'no defineConfig(...) call found' };
  }
  if (!pluginsArray) {
    return {
      ok: false,
      reason: "defineConfig(...)'s argument isn't a plain object with a \"plugins\" array",
    };
  }

  let localName = 'kbach';
  let hasImport = false;
  recast.types.visit(ast, {
    visitImportDeclaration(path: any) {
      if (path.node.source.value === '@kbach/react/vite') {
        hasImport = true;
        const spec = (path.node.specifiers ?? []).find(
          (s: any) => n.ImportSpecifier.check(s) && s.imported.name === 'kbach',
        );
        if (spec) localName = spec.local.name;
      }
      this.traverse(path);
    },
  });

  const alreadyWired = pluginsArray.elements.some(
    (el: any) => el && n.CallExpression.check(el) && n.Identifier.check(el.callee) && el.callee.name === localName,
  );

  let changed = false;

  if (!hasImport) {
    const importDecl = b.importDeclaration(
      [b.importSpecifier(b.identifier('kbach'))],
      b.stringLiteral('@kbach/react/vite'),
    );
    const bodyList = ast.program.body;
    let lastImportIdx = -1;
    bodyList.forEach((node: any, i: number) => {
      if (n.ImportDeclaration.check(node)) lastImportIdx = i;
    });
    bodyList.splice(lastImportIdx + 1, 0, importDecl);
    changed = true;
  }

  if (!alreadyWired) {
    const callExpr = b.callExpression(b.identifier(localName), []);
    const reactIdx = pluginsArray.elements.findIndex(
      (el: any) => el && n.CallExpression.check(el) && n.Identifier.check(el.callee) && el.callee.name === 'react',
    );
    if (reactIdx >= 0) pluginsArray.elements.splice(reactIdx, 0, callExpr);
    else pluginsArray.elements.unshift(callExpr);
    changed = true;
  }

  if (!changed) return { ok: true, changed: false, code: source };
  return { ok: true, changed: true, code: recast.print(ast, { quote: 'single' }).code };
}

/**
 * Read-only variant for `doctor`: `patchViteConfig` already tells us
 * whether the file needs changes (`ok: true, changed: false` means
 * "already fully wired up") without ever writing anything back, so this
 * just re-exposes that same check under a name that makes the read-only
 * intent obvious at the call site instead of a `doctor` check discarding
 * a `code` string it never uses.
 */
export function isViteConfigWired(source: string): { ok: true; wired: boolean } | { ok: false; reason: string } {
  const result = patchViteConfig(source);
  if (!result.ok) return result;
  return { ok: true, wired: !result.changed };
}
