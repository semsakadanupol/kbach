import { describe, it, expect } from 'vitest';
import { patchBabelConfigPlugin, isBabelPluginWired } from './babelConfig';

const PLUGIN = '@kbach/react-native/babel-plugin';

const EXPO_FUNCTION_FORM = `module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
`;

const RN_CLI_OBJECT_FORM = `module.exports = {
  presets: ['module:@react-native/babel-preset'],
};
`;

describe('patchBabelConfigPlugin', () => {
  it('adds a new plugins array to the Expo function-export form', () => {
    const result = patchBabelConfigPlugin(EXPO_FUNCTION_FORM, PLUGIN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.code).toContain("plugins: ['@kbach/react-native/babel-plugin']");
  });

  it('adds a new plugins array to the plain object-export form (React Native CLI)', () => {
    const result = patchBabelConfigPlugin(RN_CLI_OBJECT_FORM, PLUGIN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.code).toContain("plugins: ['@kbach/react-native/babel-plugin']");
  });

  it('appends to an existing non-empty plugins array without disturbing other entries', () => {
    const source = `module.exports = {\n  presets: ['module:@react-native/babel-preset'],\n  plugins: ['react-native-reanimated/plugin'],\n};\n`;
    const result = patchBabelConfigPlugin(source, PLUGIN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain('react-native-reanimated/plugin');
    expect(result.code).toContain(PLUGIN);
  });

  it('is a no-op (changed: false) when the plugin is already present', () => {
    const first = patchBabelConfigPlugin(EXPO_FUNCTION_FORM, PLUGIN);
    if (!first.ok) throw new Error('expected ok');
    const second = patchBabelConfigPlugin(first.code, PLUGIN);
    expect(second).toEqual({ ok: true, changed: false, code: first.code });
  });

  it('handles a concise arrow function returning an object directly', () => {
    const source = `module.exports = (api) => {\n  api.cache(true);\n  return { presets: ['babel-preset-expo'] };\n};\n`;
    const result = patchBabelConfigPlugin(source, PLUGIN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain(PLUGIN);
  });

  it('reports ok:false rather than guessing for an unrecognized export shape', () => {
    const source = `const config = require('./shared-babel-config');\nmodule.exports = config;\n`;
    const result = patchBabelConfigPlugin(source, PLUGIN);
    expect(result.ok).toBe(false);
  });
});

describe('isBabelPluginWired', () => {
  it('is false before patching and true after', () => {
    expect(isBabelPluginWired(RN_CLI_OBJECT_FORM, PLUGIN)).toEqual({ ok: true, wired: false });
    const patched = patchBabelConfigPlugin(RN_CLI_OBJECT_FORM, PLUGIN);
    if (!patched.ok) throw new Error('expected ok');
    expect(isBabelPluginWired(patched.code, PLUGIN)).toEqual({ ok: true, wired: true });
  });
});
