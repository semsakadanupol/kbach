import * as vscode from 'vscode';
import * as path from 'node:path';
import { MODIFIERS, BASE_UTILITIES } from './generatedVocabulary';
import { isKnownToken, describeToken, resolveThemeJsonForDir, invalidateThemeJsonForRoot, setThemeJsonForRoot, DEFAULT_THEME_JSON } from './engine';
import { scanClassTokens } from './scanTokens';
import { isInsideClassNameContext } from './completionContext';
import { suggestCorrection } from './suggestCorrection';
import { COLOR_PREFIXES } from './colorPrefixes';
import { parseColorFromText } from './colorValue';
import { buildColorReplacement, isArbitraryColorToken } from './colorToken';
import { isReactNativeProject, nativeUnsupportedReason } from './nativeUnsupported';
import { findProjectRoot } from './projectRoot';
import type { ColorEntry } from './defaultTheme';

const LANGUAGES = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'];

// VS Code's default word pattern stops at `-`/`[`/`:`/`/`/`%`/`#` — none of
// which are optional for a real Kbach token (`bg-blue-6`, `dark:`,
// `w-[calc(100%-1rem)]`). Used for both hover's word-at-position lookup
// and the diagnostic range VS Code quick-fixes anchor to.
const TOKEN_CHAR_RE = /[a-zA-Z0-9_\-[\]().,%/#:]+/;

/** `undefined` if the text right before the cursor doesn't end in a known color-utility prefix (`bg-`, `dark:text-`, ...). */
function colorPrefixBeforeCursor(linePrefix: string): string | undefined {
  for (const prefix of COLOR_PREFIXES) {
    if (linePrefix.endsWith(`${prefix}-`)) return prefix;
  }
  return undefined;
}

function colorSwatchMarkdown(hex: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14'><rect width='14' height='14' fill='${hex}' stroke='#888' stroke-width='1'/></svg>`;
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return `![swatch](${dataUri})`;
}

/**
 * `kbach.config.js`-aware caches are keyed by the resolved THEME JSON
 * string itself, not by project root — every workspace with the same
 * (or no) customization shares one cache entry, and the overwhelmingly
 * common "no kbach.config.js at all" case costs exactly what it always
 * did (one cache entry, built once). `resolveEffectiveThemeJson` below is
 * what turns a document into the right cache key.
 */
const parsedColorsCache = new Map<string, Record<string, ColorEntry>>();

function getThemeColors(themeJson: string): Record<string, ColorEntry> {
  let colors = parsedColorsCache.get(themeJson);
  if (!colors) {
    colors = (JSON.parse(themeJson) as { colors: Record<string, ColorEntry> }).colors;
    parsedColorsCache.set(themeJson, colors);
  }
  return colors;
}

function colorEntryHex(entry: ColorEntry): string {
  return typeof entry === 'string' ? entry : entry.light;
}

// Warned-about roots — so a broken kbach.config.js gets exactly ONE
// warning per session, not one on every debounced diagnostics pass,
// hover, and completion request until it's fixed. Cleared on the next
// save of that root's config file (see activate()'s onDidSaveTextDocument
// hook), so a renewed failure after an attempted fix warns again.
const warnedConfigRoots = new Set<string>();

/**
 * The theme a given document should actually be resolved against —
 * `DEFAULT_THEME_JSON` for a non-file document (untitled, etc.) or a
 * project with no `kbach.config.js`; that project's own merged theme
 * otherwise. A load/evaluate failure (a real syntax error in the config
 * file, most likely) is caught HERE rather than in engine.ts, which has
 * no access to `vscode.window` to actually surface it — shown once per
 * root via a warning notification, and the failure result is cached
 * (`setThemeJsonForRoot`) so a broken config doesn't get re-attempted on
 * every keystroke until the file is saved again.
 */
async function resolveEffectiveThemeJson(document: vscode.TextDocument): Promise<string> {
  if (document.uri.scheme !== 'file') return DEFAULT_THEME_JSON;
  const startDir = path.dirname(document.uri.fsPath);
  try {
    return await resolveThemeJsonForDir(startDir);
  } catch (err) {
    const root = findProjectRoot(startDir);
    if (root) {
      setThemeJsonForRoot(root, DEFAULT_THEME_JSON);
      if (!warnedConfigRoots.has(root)) {
        warnedConfigRoots.add(root);
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showWarningMessage(`Kbach: couldn't load kbach.config.js — using the default theme instead. (${message})`);
      }
    }
    return DEFAULT_THEME_JSON;
  }
}

// Built lazily per resolved theme, not per-keystroke. `describeToken`
// calls the real WASM engine; doing that 2500+ times on every single
// completion request (every keystroke inside a className string) would
// be real, needless per-request cost for a list whose contents only ever
// change when the EFFECTIVE theme does (practically never mid-session,
// outside an explicit kbach.config.js save).
const staticCompletionItemsCache = new Map<string, vscode.CompletionItem[]>();

function buildStaticCompletionItems(themeJson: string): vscode.CompletionItem[] {
  const cached = staticCompletionItemsCache.get(themeJson);
  if (cached) return cached;
  const items: vscode.CompletionItem[] = [];
  for (const modifier of MODIFIERS) {
    items.push(new vscode.CompletionItem(modifier, vscode.CompletionItemKind.Keyword));
  }
  for (const utility of BASE_UTILITIES) {
    const item = new vscode.CompletionItem(utility, vscode.CompletionItemKind.Value);
    const description = describeToken(utility, themeJson);
    if (description !== null) item.detail = description;
    items.push(item);
  }
  staticCompletionItemsCache.set(themeJson, items);
  return items;
}

class KbachCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[]> {
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    const textBeforeCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    if (!isInsideClassNameContext(textBeforeCursor)) return [];

    const themeJson = await resolveEffectiveThemeJson(document);

    const colorPrefix = colorPrefixBeforeCursor(linePrefix);
    if (colorPrefix) {
      // Every color this document's EFFECTIVE theme actually has — the
      // real palette plus whatever a project's own kbach.config.js
      // `extend.colors`/`theme.colors` added or replaced, not just the
      // built-in default families. One flat list (not grouped by a
      // "family-N" shade guess, which a custom color's own name — e.g.
      // `surface-dim` — wouldn't fit and would otherwise get silently
      // dropped) — VS Code's own fuzzy filtering handles narrowing it
      // down as the user keeps typing.
      const colors = getThemeColors(themeJson);
      const items: vscode.CompletionItem[] = [];
      for (const name of Object.keys(colors).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
        const entry = colors[name]!;
        const hex = colorEntryHex(entry);
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Color);
        item.detail = hex;
        const modeNote = typeof entry === 'string' ? '' : ` (light: \`${entry.light}\`, dark: \`${entry.dark}\`)`;
        item.documentation = new vscode.MarkdownString(`${colorSwatchMarkdown(hex)} \`${hex}\`${modeNote}`);
        items.push(item);
      }
      return items;
    }

    return buildStaticCompletionItems(themeJson);
  }
}

class KbachHoverProvider implements vscode.HoverProvider {
  async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
    const range = document.getWordRangeAtPosition(position, TOKEN_CHAR_RE);
    if (!range) return undefined;
    const token = document.getText(range);
    const themeJson = await resolveEffectiveThemeJson(document);
    const description = describeToken(token, themeJson);
    if (description === null) return undefined;

    const markdown = new vscode.MarkdownString();
    const colorMatch = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/.exec(description);
    if (colorMatch) markdown.appendMarkdown(`${colorSwatchMarkdown(colorMatch[0])} `);
    markdown.appendCodeblock(description, 'css');
    return new vscode.Hover(markdown, range);
  }
}

/**
 * VS Code's NATIVE color decorator + picker wheel (`DocumentColorProvider`)
 * — distinct from the hover provider's own static swatch image. A Kbach
 * class names a PALETTE ENTRY, not a literal color value the way CSS's
 * own `color: #fff` is, so there's no single "the" literal to overwrite
 * in place when a new color is picked — `provideColorPresentations`
 * instead rewrites the whole token to the equivalent arbitrary-value
 * class for whatever was picked (`bg-blue-6` -> `bg-[#ff0000]`), via
 * `buildColorReplacement` (colorToken.ts), preserving every modifier
 * prefix and the original color-utility name unchanged.
 *
 * ONLY offered for arbitrary-value tokens (`bg-[#fff]`), though — a
 * NAMED palette shade (`bg-blue-6`) deliberately does NOT get this
 * editable decorator at all (`isArbitraryColorToken` filters it out
 * below), by explicit design: this widget's only possible edit for a
 * named shade is to blow it away into a raw literal hex, which defeats
 * the entire point of a curated, theme-linked palette — a drag on the
 * wheel is exactly the kind of accidental edit that should NOT be one
 * click away for those. The named shade's color is still visible via the
 * hover provider's own static (non-editable) swatch image, just not
 * picker-editable through this one.
 */
class KbachColorProvider implements vscode.DocumentColorProvider {
  async provideDocumentColors(document: vscode.TextDocument): Promise<vscode.ColorInformation[]> {
    const themeJson = await resolveEffectiveThemeJson(document);
    const results: vscode.ColorInformation[] = [];
    for (const match of scanClassTokens(document.getText())) {
      if (!isArbitraryColorToken(match.token)) continue;
      const description = describeToken(match.token, themeJson);
      if (description === null) continue;
      const rgba = parseColorFromText(description);
      if (rgba === null) continue;
      const range = new vscode.Range(document.positionAt(match.start), document.positionAt(match.end));
      results.push(new vscode.ColorInformation(range, new vscode.Color(rgba.r / 255, rgba.g / 255, rgba.b / 255, rgba.a)));
    }
    return results;
  }

  provideColorPresentations(color: vscode.Color, context: { document: vscode.TextDocument; range: vscode.Range }): vscode.ColorPresentation[] {
    const rgba = { r: color.red * 255, g: color.green * 255, b: color.blue * 255, a: color.alpha };

    // NOT `context.document.getText(context.range)` — this runs on every
    // tick while the user drags the wheel, and VS Code keeps re-using the
    // SAME `range` object from the picker's original `ColorInformation`
    // for every call in that session. A named-shade token (`bg-blue-6`)
    // rewrites to a DIFFERENT-LENGTH arbitrary-value token
    // (`bg-[#ff0000]`), so the moment the first edit lands, that original
    // range no longer covers the (now-longer/shorter) token — every
    // later tick in the same drag reads a stale, wrong substring, fails
    // to parse as a color-utility token, and silently returns `[]` from
    // here on: the picker "does nothing" past the very first tick. An
    // arbitrary-to-arbitrary edit (same hex length) happened to dodge
    // this by accident, which is why only named shades looked broken.
    // Re-scanning the CURRENT document for the token that starts at the
    // same offset the picker originally opened on — rather than trusting
    // `context.range` to still be accurate — sidesteps that: it finds the
    // token's real, current boundaries every single tick, however much
    // its length has changed since the last one. The explicit `textEdit`
    // below (rather than the default label-over-`context.range`
    // insertion `ColorPresentation`'s own doc comment describes) is what
    // actually targets THIS freshly-computed range instead of the stale
    // one VS Code would otherwise use.
    const anchorOffset = context.document.offsetAt(context.range.start);
    const liveMatch = scanClassTokens(context.document.getText()).find((m) => m.start === anchorOffset);
    const token = liveMatch ? liveMatch.token : context.document.getText(context.range);
    const range = liveMatch
      ? new vscode.Range(context.document.positionAt(liveMatch.start), context.document.positionAt(liveMatch.end))
      : context.range;

    const replacement = buildColorReplacement(token, rgba);
    if (replacement === null) return [];
    const presentation = new vscode.ColorPresentation(replacement);
    presentation.textEdit = new vscode.TextEdit(range, replacement);
    return [presentation];
  }
}

/** One-click "Replace with X" for a diagnostic that carried a typo suggestion (`diagnostic.code`, set in `runDiagnostics`). */
class KbachCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(document: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      // 'native-unsupported' is a sentinel `code` runDiagnostics also
      // sets (on a DIFFERENT diagnostic kind — see its own comment) —
      // never an actual typo suggestion to offer as a replacement.
      if (diagnostic.source !== 'kbach' || typeof diagnostic.code !== 'string' || diagnostic.code === 'native-unsupported') continue;
      const suggestion = diagnostic.code;
      const action = new vscode.CodeAction(`Replace with "${suggestion}"`, vscode.CodeActionKind.QuickFix);
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(document.uri, diagnostic.range, suggestion);
      action.diagnostics = [diagnostic];
      action.isPreferred = true;
      actions.push(action);
    }
    return actions;
  }
}

// Cached per starting directory — isReactNativeProject() does real disk
// I/O (walks up looking for the nearest package.json), and this runs on
// every debounced diagnostics pass, not just once.
const reactNativeProjectCache = new Map<string, boolean>();

function isReactNativeWorkspace(document: vscode.TextDocument): boolean {
  if (document.uri.scheme !== 'file') return false;
  // The FILE's own directory, not the VS Code workspace folder root — in
  // a monorepo (this very repo included) the workspace folder is usually
  // the repo root, which has no react-native/expo dependency itself;
  // isReactNativeProject() walks up from here to find the nearest
  // package.json (e.g. packages/react-native/'s own), same reasoning as
  // its own doc comment.
  const startDir = path.dirname(document.uri.fsPath);
  let cached = reactNativeProjectCache.get(startDir);
  if (cached === undefined) {
    cached = isReactNativeProject(startDir);
    reactNativeProjectCache.set(startDir, cached);
  }
  return cached;
}

async function runDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): Promise<void> {
  if (!LANGUAGES.includes(document.languageId)) return;
  const diagnostics: vscode.Diagnostic[] = [];
  const checkNativeSupport = isReactNativeWorkspace(document);
  const themeJson = await resolveEffectiveThemeJson(document);

  for (const match of scanClassTokens(document.getText())) {
    const range = new vscode.Range(document.positionAt(match.start), document.positionAt(match.end));

    if (!isKnownToken(match.token, themeJson)) {
      const suggestion = suggestCorrection(match.token);
      const message = suggestion
        ? `Unknown Kbach class "${match.token}" — did you mean "${suggestion}"?`
        : `Unknown Kbach class "${match.token}"`;
      const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
      diagnostic.source = 'kbach';
      // Carries the suggestion for KbachCodeActionProvider to read
      // directly — never re-parsed out of `message`'s own text, which is
      // a display string, not an API contract.
      if (suggestion) diagnostic.code = suggestion;
      diagnostics.push(diagnostic);
      continue;
    }

    // A SEPARATE, real-engine-resolves-fine-on-web case: `group-hover:`/
    // `peer-*`/`has-[…]`/grid/pseudo-elements parse without error and
    // apply ZERO style on native, with no runtime warning at all —
    // confirmed the single most dangerous silent-failure class this
    // project's own docs describe (root AGENTS.md's "read this first"
    // callout). Only ever checked in a React Native workspace — these
    // all work completely normally on web.
    if (checkNativeSupport) {
      const reason = nativeUnsupportedReason(match.token);
      if (reason) {
        const diagnostic = new vscode.Diagnostic(
          range,
          `"${match.token}" parses but applies NO style on React Native — ${reason}`,
          vscode.DiagnosticSeverity.Warning,
        );
        diagnostic.source = 'kbach';
        diagnostic.code = 'native-unsupported';
        diagnostics.push(diagnostic);
      }
    }
  }
  collection.set(document.uri, diagnostics);
}

function isKbachConfigFile(uri: vscode.Uri): boolean {
  const base = path.basename(uri.fsPath);
  return base === 'kbach.config.js' || base === 'kbach.config.cjs' || base === 'kbach.config.mjs';
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(LANGUAGES, new KbachCompletionProvider()),
    vscode.languages.registerHoverProvider(LANGUAGES, new KbachHoverProvider()),
    vscode.languages.registerColorProvider(LANGUAGES, new KbachColorProvider()),
    vscode.languages.registerCodeActionsProvider(LANGUAGES, new KbachCodeActionProvider(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
  );

  const diagnosticCollection = vscode.languages.createDiagnosticCollection('kbach');
  context.subscriptions.push(diagnosticCollection);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleDiagnostics = (document: vscode.TextDocument) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runDiagnostics(document, diagnosticCollection), 300);
  };

  for (const doc of vscode.workspace.textDocuments) scheduleDiagnostics(doc);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(scheduleDiagnostics),
    vscode.workspace.onDidChangeTextDocument((e) => scheduleDiagnostics(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => diagnosticCollection.delete(doc.uri)),
    // A saved kbach.config.(js|cjs|mjs) makes that project's cached theme
    // (engine.ts's own cache, plus this file's completion/color caches,
    // all keyed off it) stale — without this, an edit to the config would
    // silently keep being ignored for the rest of the editor session,
    // since nothing else ever re-reads the file once cached.
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.scheme !== 'file' || !isKbachConfigFile(doc.uri)) return;
      const root = path.dirname(doc.uri.fsPath);
      invalidateThemeJsonForRoot(root);
      warnedConfigRoots.delete(root);
      staticCompletionItemsCache.clear();
      parsedColorsCache.clear();
      for (const openDoc of vscode.workspace.textDocuments) scheduleDiagnostics(openDoc);
    }),
  );
}

export function deactivate(): void {}
