import * as vscode from 'vscode';
import { MODIFIERS, BASE_UTILITIES } from './generatedVocabulary';
import { PALETTE } from './generatedPalette';
import { isKnownToken, describeToken } from './engine';
import { scanClassTokens } from './scanTokens';
import { isInsideClassNameContext } from './completionContext';
import { suggestCorrection } from './suggestCorrection';

const LANGUAGES = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'];

// VS Code's default word pattern stops at `-`/`[`/`:`/`/`/`%`/`#` — none of
// which are optional for a real Kbach token (`bg-blue-6`, `dark:`,
// `w-[calc(100%-1rem)]`). Used for both hover's word-at-position lookup
// and the diagnostic range VS Code quick-fixes anchor to.
const TOKEN_CHAR_RE = /[a-zA-Z0-9_\-[\]().,%/#:]+/;

const COLOR_PREFIXES = ['bg', 'text', 'border', 'ring', 'from', 'via', 'to', 'decoration', 'caret', 'accent', 'divide', 'outline', 'fill', 'stroke'];
const SHADES = Array.from({ length: 12 }, (_, i) => String(i + 1));
const FAMILIES = [...new Set(Object.keys(PALETTE).filter((k) => k.includes('-')).map((k) => k.slice(0, k.lastIndexOf('-'))))];

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

class KbachCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    const textBeforeCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    if (!isInsideClassNameContext(textBeforeCursor)) return [];

    const colorPrefix = colorPrefixBeforeCursor(linePrefix);
    if (colorPrefix) {
      const items: vscode.CompletionItem[] = [];
      for (const family of FAMILIES) {
        for (const shade of SHADES) {
          const key = `${family}-${shade}`;
          const hex = PALETTE[key];
          if (!hex) continue;
          const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Color);
          item.detail = hex;
          item.documentation = new vscode.MarkdownString(`${colorSwatchMarkdown(hex)} \`${hex}\``);
          items.push(item);
        }
      }
      for (const name of ['white', 'black', 'transparent', 'current']) {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Color);
        if (PALETTE[name]) item.detail = PALETTE[name];
        items.push(item);
      }
      return items;
    }

    const items: vscode.CompletionItem[] = [];
    for (const modifier of MODIFIERS) {
      items.push(new vscode.CompletionItem(modifier, vscode.CompletionItemKind.Keyword));
    }
    for (const utility of BASE_UTILITIES) {
      items.push(new vscode.CompletionItem(utility, vscode.CompletionItemKind.Value));
    }
    return items;
  }
}

class KbachHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const range = document.getWordRangeAtPosition(position, TOKEN_CHAR_RE);
    if (!range) return undefined;
    const token = document.getText(range);
    const description = describeToken(token);
    if (description === null) return undefined;

    const markdown = new vscode.MarkdownString();
    const colorMatch = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/.exec(description);
    if (colorMatch) markdown.appendMarkdown(`${colorSwatchMarkdown(colorMatch[0])} `);
    markdown.appendCodeblock(description, 'css');
    return new vscode.Hover(markdown, range);
  }
}

function runDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
  if (!LANGUAGES.includes(document.languageId)) return;
  const diagnostics: vscode.Diagnostic[] = [];
  for (const match of scanClassTokens(document.getText())) {
    if (isKnownToken(match.token)) continue;
    const range = new vscode.Range(document.positionAt(match.start), document.positionAt(match.end));
    const suggestion = suggestCorrection(match.token);
    const message = suggestion
      ? `Unknown Kbach class "${match.token}" — did you mean "${suggestion}"?`
      : `Unknown Kbach class "${match.token}"`;
    const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
    diagnostic.source = 'kbach';
    diagnostics.push(diagnostic);
  }
  collection.set(document.uri, diagnostics);
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(LANGUAGES, new KbachCompletionProvider()),
    vscode.languages.registerHoverProvider(LANGUAGES, new KbachHoverProvider()),
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
  );
}

export function deactivate(): void {}
