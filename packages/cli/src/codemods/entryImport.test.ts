import { describe, it, expect } from 'vitest';
import { patchEntryFileImport, hasKbachCssImport } from './entryImport';

describe('patchEntryFileImport', () => {
  it('inserts the import right after the last existing import', () => {
    const source = `import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\n\ncreateRoot(document.getElementById('root')!).render(<App />);\n`;
    const result = patchEntryFileImport(source);
    expect(result.changed).toBe(true);
    const lines = result.code.split('\n');
    expect(lines[3]).toBe("import './kbach.css';");
  });

  it('inserts at the top when the file has no imports at all', () => {
    const source = `console.log('hi');\n`;
    const result = patchEntryFileImport(source);
    expect(result.changed).toBe(true);
    expect(result.code.split('\n')[0]).toBe("import './kbach.css';");
  });

  it('is a no-op when a kbach.css import already exists, regardless of relative path', () => {
    for (const existing of ["import './kbach.css';", "import '../styles/kbach.css'", 'import "./kbach.css"']) {
      const source = `import React from 'react';\n${existing}\n`;
      const result = patchEntryFileImport(source);
      expect(result.changed).toBe(false);
      expect(result.code).toBe(source);
    }
  });
});

describe('hasKbachCssImport', () => {
  it('matches single or double quotes', () => {
    expect(hasKbachCssImport(`import "./kbach.css";`)).toBe(true);
    expect(hasKbachCssImport(`import './kbach.css';`)).toBe(true);
  });

  it('does not match an unrelated import', () => {
    expect(hasKbachCssImport(`import './app.css';`)).toBe(false);
  });
});
