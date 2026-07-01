import React, { useCallback } from 'react';
import { useTheme } from './context';

// ─── Platform-agnostic primitives ─────────────────────────────────────────────
// Imported conditionally so the package works on both web and native.

type ViewType = React.ComponentType<{
  style?: object;
  accessibilityRole?: string;
  accessible?: boolean;
  accessibilityLabel?: string;
}>;

type TextType = React.ComponentType<{ style?: object }>;

type TouchableType = React.ComponentType<{
  onPress?: () => void;
  style?: object;
  accessibilityRole?: string;
  accessibilityLabel?: string;
  accessibilityState?: object;
}>;

type SwitchType = React.ComponentType<{
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  trackColor?: { false?: string; true?: string };
  thumbColor?: string;
  ios_backgroundColor?: string;
  style?: object;
  accessibilityLabel?: string;
}>;

function getPrimitives() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RN = require('react-native');
    return {
      View: RN.View as ViewType,
      Text: RN.Text as TextType,
      Touchable: RN.TouchableOpacity as TouchableType,
      Switch: RN.Switch as SwitchType,
    };
  } catch {
    // Web fallback — use plain HTML elements
    const View = ({ style, ...rest }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', { style, ...rest });
    const Text = ({ style, ...rest }: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement('span', { style, ...rest });
    const Touchable = ({ onPress, style, ...rest }: { onPress?: () => void; style?: object; [k: string]: unknown }) =>
      React.createElement('button', { onClick: onPress, style, ...rest });
    const Switch = ({
      value,
      onValueChange,
      accessibilityLabel,
    }: {
      value?: boolean;
      onValueChange?: (v: boolean) => void;
      accessibilityLabel?: string;
    }) =>
      React.createElement('input', {
        type: 'checkbox',
        checked: value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onValueChange?.(e.target.checked),
        'aria-label': accessibilityLabel,
      });
    return { View, Text, Touchable, Switch } as unknown as {
      View: ViewType;
      Text: TextType;
      Touchable: TouchableType;
      Switch: SwitchType;
    };
  }
}

// ─── Stable primitive references (module-level so React never sees new types) ─
// getPrimitives() on web creates new function components in its catch branch.
// If called inside the component, React sees different types each render and
// unmounts + remounts the entire subtree on every re-render.
const { View: _View, Text: _Text, Touchable: _Touchable, Switch: _Switch } = getPrimitives();

// ─── ThemeToggle props ────────────────────────────────────────────────────────

export type ToggleVariant = 'button' | 'switch' | 'icon-button';

export interface ThemeToggleProps {
  /** Visual variant. Default: 'button' */
  variant?: ToggleVariant;
  /** Override label text (button variant) */
  label?: string;
  /** Custom light-mode label */
  lightLabel?: string;
  /** Custom dark-mode label */
  darkLabel?: string;
  /** Show system mode option */
  includeSystem?: boolean;
  /** Custom styles applied to the root container */
  style?: object;
  /** Custom styles for the label text */
  labelStyle?: object;
}

// ─── ThemeToggle ──────────────────────────────────────────────────────────────

/**
 * Drop-in theme toggle. Works on web and React Native.
 *
 * ```tsx
 * <ThemeToggle />
 * <ThemeToggle variant="switch" />
 * <ThemeToggle variant="icon-button" lightLabel="☀️" darkLabel="🌙" />
 * ```
 */
export function ThemeToggle({
  variant = 'button',
  label,
  lightLabel = 'Light',
  darkLabel = 'Dark',
  includeSystem = false,
  style,
  labelStyle,
}: ThemeToggleProps): React.JSX.Element {
  const { mode, isDark, setMode, toggle } = useTheme();
  const View = _View, Text = _Text, Touchable = _Touchable, Switch = _Switch;

  // ── Switch variant ─────────────────────────────────────────────────────────
  if (variant === 'switch') {
    return React.createElement(
      View,
      { style: { flexDirection: 'row', alignItems: 'center', gap: 8, ...style } as object },
      React.createElement(Text, { style: { fontSize: 14, ...labelStyle } as object }, lightLabel),
      React.createElement(Switch, {
        value: isDark,
        onValueChange: (v: boolean) => setMode(v ? 'dark' : 'light'),
        trackColor: { false: '#d1d5db', true: '#6366f1' },
        thumbColor: isDark ? '#ffffff' : '#f3f4f6',
        ios_backgroundColor: '#d1d5db',
        accessibilityLabel: 'Toggle dark mode',
      }),
      React.createElement(Text, { style: { fontSize: 14, ...labelStyle } as object }, darkLabel),
    );
  }

  // ── Icon-button variant ────────────────────────────────────────────────────
  if (variant === 'icon-button') {
    const icon = isDark ? darkLabel : lightLabel;
    return React.createElement(Touchable, {
      onPress: toggle,
      style: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: isDark ? '#374151' : '#f3f4f6',
        ...style,
      } as object,
      accessibilityRole: 'button',
      accessibilityLabel: `Switch to ${isDark ? 'light' : 'dark'} mode`,
      accessibilityState: {},
    },
      React.createElement(Text, { style: { fontSize: 18, ...labelStyle } as object }, icon),
    );
  }

  // ── Button variant (default) ───────────────────────────────────────────────
  if (includeSystem) {
    const modes: Array<{ key: typeof mode; label: string }> = [
      { key: 'light', label: lightLabel },
      { key: 'dark', label: darkLabel },
      { key: 'system', label: 'System' },
    ];

    return React.createElement(
      View,
      { style: { flexDirection: 'row', gap: 4, ...style } as object },
      ...modes.map(({ key, label: mLabel }) =>
        React.createElement(Touchable, {
          key,
          onPress: () => setMode(key),
          style: {
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: mode === key
              ? (isDark ? '#6366f1' : '#3b82f6')
              : (isDark ? '#374151' : '#e5e7eb'),
          } as object,
          accessibilityRole: 'button',
          accessibilityLabel: `Set ${key} theme`,
          accessibilityState: { selected: mode === key },
        },
          React.createElement(Text, {
            style: {
              fontSize: 13,
              fontWeight: '500',
              color: mode === key ? '#ffffff' : (isDark ? '#d1d5db' : '#374151'),
              ...labelStyle,
            } as object,
          }, mLabel),
        ),
      ),
    );
  }

  const currentLabel = label ?? (isDark ? darkLabel : lightLabel);
  return React.createElement(Touchable, {
    onPress: toggle,
    style: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: isDark ? '#374151' : '#e5e7eb',
      ...style,
    } as object,
    accessibilityRole: 'button',
    accessibilityLabel: `Switch to ${isDark ? 'light' : 'dark'} mode`,
    accessibilityState: {},
  },
    React.createElement(Text, {
      style: {
        fontSize: 14,
        fontWeight: '500',
        color: isDark ? '#f9fafb' : '#111827',
        ...labelStyle,
      } as object,
    }, currentLabel),
  );
}
