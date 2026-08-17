//! Theme shape passed in as a JSON string from the TypeScript side — kept as
//! plain maps (not hardcoded in Rust) so the theme stays configurable
//! without recompiling the engine.

use serde::Deserialize;
use std::collections::HashMap;

/// A theme color entry — either a plain hex value, or a mode-aware pair that
/// resolves to a different hex depending on light/dark mode. Mode-aware
/// colors are expanded into a literal light/dark class pair before parsing
/// (see `resolvers::color::expand_mode_aware_color_classes`), mirroring
/// `old-kbach/src/core/modeAwareColors.ts`.
#[derive(Debug, Deserialize, Clone, PartialEq)]
#[serde(untagged)]
pub enum ColorValue {
    Plain(String),
    ModeAware { light: String, dark: String },
}

#[derive(Debug, Deserialize, Default, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DarkModeStrategy {
    #[default]
    Attribute,
    Class,
    Media,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ThemeConfig {
    /// e.g. "blue-6" -> "#2563eb", or "surface" -> { light, dark }
    #[serde(default)]
    pub colors: HashMap<String, ColorValue>,
    /// e.g. "4" -> 16.0 (px)
    #[serde(default)]
    pub spacing: HashMap<String, f64>,
    /// e.g. "sm" -> 640.0 (min-width px)
    #[serde(default)]
    pub screens: HashMap<String, f64>,
    #[serde(default)]
    pub dark_mode: DarkModeStrategy,
}

/// Kbach's default color palette (Phase 16) — NOT part of `ThemeConfig`
/// deserialization above (a caller's *actual* theme stays arbitrary,
/// fully-configurable JSON, per this module's own opening doc comment).
/// This is the separate, single-source-of-truth *starter* palette every
/// platform's `defaultTheme` ships with — 22 families x 12 shades
/// (1 = lightest, 12 = darkest), ported from
/// `old-kbach/packages/ui/src/core/theme.ts`'s `defaultColors`, plus a
/// small hand-picked "metals & materials" set (coal/gold/silver/bronze/
/// copper) — standalone flat accent colors like `black`/`white` below, not
/// full 12-shade families (there's no Tailwind/Radix convention for those
/// names to follow the way the 22 families do). Consumed via `lib.rs`'s
/// `default_colors_json()` WASM export by
/// `packages/core-engine/scripts/generate-palette.mjs`, which writes it
/// into `packages/react/src/generatedPalette.ts` and
/// `packages/react-native/src/generatedPalette.ts` — those two files used
/// to be hand-duplicated copies of this same data; this is now the one
/// place it's hand-maintained.
pub const DEFAULT_COLORS: &[(&str, &str)] = &[
    ("transparent", "transparent"),
    ("current", "currentColor"),
    ("black", "#000000"),
    ("white", "#ffffff"),

    // Metals & materials — standalone accent colors, not shade families.
    ("coal", "#1c1c1c"),
    ("gold", "#d4af37"),
    ("silver", "#c0c0c0"),
    ("bronze", "#cd7f32"),
    ("copper", "#b87333"),

    ("slate-1", "#f8fafc"), ("slate-2", "#f1f5f9"), ("slate-3", "#e2e8f0"), ("slate-4", "#cbd5e1"),
    ("slate-5", "#94a3b8"), ("slate-6", "#64748b"), ("slate-7", "#475569"), ("slate-8", "#334155"),
    ("slate-9", "#1e293b"), ("slate-10", "#0f172a"), ("slate-11", "#020617"), ("slate-12", "#01020a"),

    ("gray-1", "#f9fafb"), ("gray-2", "#f3f4f6"), ("gray-3", "#e5e7eb"), ("gray-4", "#d1d5db"),
    ("gray-5", "#9ca3af"), ("gray-6", "#6b7280"), ("gray-7", "#4b5563"), ("gray-8", "#374151"),
    ("gray-9", "#1f2937"), ("gray-10", "#111827"), ("gray-11", "#030712"), ("gray-12", "#020409"),

    ("zinc-1", "#fafafa"), ("zinc-2", "#f4f4f5"), ("zinc-3", "#e4e4e7"), ("zinc-4", "#d4d4d8"),
    ("zinc-5", "#a1a1aa"), ("zinc-6", "#71717a"), ("zinc-7", "#52525b"), ("zinc-8", "#3f3f46"),
    ("zinc-9", "#27272a"), ("zinc-10", "#18181b"), ("zinc-11", "#09090b"), ("zinc-12", "#050506"),

    ("neutral-1", "#fafafa"), ("neutral-2", "#f5f5f5"), ("neutral-3", "#e5e5e5"), ("neutral-4", "#d4d4d4"),
    ("neutral-5", "#a3a3a3"), ("neutral-6", "#737373"), ("neutral-7", "#525252"), ("neutral-8", "#404040"),
    ("neutral-9", "#262626"), ("neutral-10", "#171717"), ("neutral-11", "#0a0a0a"), ("neutral-12", "#050505"),

    ("stone-1", "#fafaf9"), ("stone-2", "#f5f5f4"), ("stone-3", "#e7e5e4"), ("stone-4", "#d6d3d1"),
    ("stone-5", "#a8a29e"), ("stone-6", "#78716c"), ("stone-7", "#57534e"), ("stone-8", "#44403c"),
    ("stone-9", "#292524"), ("stone-10", "#1c1917"), ("stone-11", "#0c0a09"), ("stone-12", "#070605"),

    ("red-1", "#fef2f2"), ("red-2", "#fee2e2"), ("red-3", "#fecaca"), ("red-4", "#fca5a5"),
    ("red-5", "#f87171"), ("red-6", "#ef4444"), ("red-7", "#dc2626"), ("red-8", "#b91c1c"),
    ("red-9", "#991b1b"), ("red-10", "#7f1d1d"), ("red-11", "#450a0a"), ("red-12", "#280606"),

    ("orange-1", "#fff7ed"), ("orange-2", "#ffedd5"), ("orange-3", "#fed7aa"), ("orange-4", "#fdba74"),
    ("orange-5", "#fb923c"), ("orange-6", "#f97316"), ("orange-7", "#ea580c"), ("orange-8", "#c2410c"),
    ("orange-9", "#9a3412"), ("orange-10", "#7c2d12"), ("orange-11", "#431407"), ("orange-12", "#270c04"),

    ("amber-1", "#fffbeb"), ("amber-2", "#fef3c7"), ("amber-3", "#fde68a"), ("amber-4", "#fcd34d"),
    ("amber-5", "#fbbf24"), ("amber-6", "#f59e0b"), ("amber-7", "#d97706"), ("amber-8", "#b45309"),
    ("amber-9", "#92400e"), ("amber-10", "#78350f"), ("amber-11", "#451a03"), ("amber-12", "#291002"),

    ("yellow-1", "#fefce8"), ("yellow-2", "#fef9c3"), ("yellow-3", "#fef08a"), ("yellow-4", "#fde047"),
    ("yellow-5", "#facc15"), ("yellow-6", "#eab308"), ("yellow-7", "#ca8a04"), ("yellow-8", "#a16207"),
    ("yellow-9", "#854d0e"), ("yellow-10", "#713f12"), ("yellow-11", "#422006"), ("yellow-12", "#271304"),

    ("lime-1", "#f7fee7"), ("lime-2", "#ecfccb"), ("lime-3", "#d9f99d"), ("lime-4", "#bef264"),
    ("lime-5", "#a3e635"), ("lime-6", "#84cc16"), ("lime-7", "#65a30d"), ("lime-8", "#4d7c0f"),
    ("lime-9", "#3f6212"), ("lime-10", "#365314"), ("lime-11", "#1a2e05"), ("lime-12", "#0f1b03"),

    ("green-1", "#f0fdf4"), ("green-2", "#dcfce7"), ("green-3", "#bbf7d0"), ("green-4", "#86efac"),
    ("green-5", "#4ade80"), ("green-6", "#22c55e"), ("green-7", "#16a34a"), ("green-8", "#15803d"),
    ("green-9", "#166534"), ("green-10", "#14532d"), ("green-11", "#052e16"), ("green-12", "#031b0d"),

    ("emerald-1", "#ecfdf5"), ("emerald-2", "#d1fae5"), ("emerald-3", "#a7f3d0"), ("emerald-4", "#6ee7b7"),
    ("emerald-5", "#34d399"), ("emerald-6", "#10b981"), ("emerald-7", "#059669"), ("emerald-8", "#047857"),
    ("emerald-9", "#065f46"), ("emerald-10", "#064e3b"), ("emerald-11", "#022c22"), ("emerald-12", "#011a14"),

    ("teal-1", "#f0fdfa"), ("teal-2", "#ccfbf1"), ("teal-3", "#99f6e4"), ("teal-4", "#5eead4"),
    ("teal-5", "#2dd4bf"), ("teal-6", "#14b8a6"), ("teal-7", "#0d9488"), ("teal-8", "#0f766e"),
    ("teal-9", "#115e59"), ("teal-10", "#134e4a"), ("teal-11", "#042f2e"), ("teal-12", "#021c1b"),

    ("cyan-1", "#ecfeff"), ("cyan-2", "#cffafe"), ("cyan-3", "#a5f3fc"), ("cyan-4", "#67e8f9"),
    ("cyan-5", "#22d3ee"), ("cyan-6", "#06b6d4"), ("cyan-7", "#0891b2"), ("cyan-8", "#0e7490"),
    ("cyan-9", "#155e75"), ("cyan-10", "#164e63"), ("cyan-11", "#083344"), ("cyan-12", "#041e28"),

    ("sky-1", "#f0f9ff"), ("sky-2", "#e0f2fe"), ("sky-3", "#bae6fd"), ("sky-4", "#7dd3fc"),
    ("sky-5", "#38bdf8"), ("sky-6", "#0ea5e9"), ("sky-7", "#0284c7"), ("sky-8", "#0369a1"),
    ("sky-9", "#075985"), ("sky-10", "#0c4a6e"), ("sky-11", "#082f49"), ("sky-12", "#041b2b"),

    ("blue-1", "#eff6ff"), ("blue-2", "#dbeafe"), ("blue-3", "#bfdbfe"), ("blue-4", "#93c5fd"),
    ("blue-5", "#60a5fa"), ("blue-6", "#3b82f6"), ("blue-7", "#2563eb"), ("blue-8", "#1d4ed8"),
    ("blue-9", "#1e40af"), ("blue-10", "#1e3a8a"), ("blue-11", "#172554"), ("blue-12", "#0d1633"),

    ("indigo-1", "#eef2ff"), ("indigo-2", "#e0e7ff"), ("indigo-3", "#c7d2fe"), ("indigo-4", "#a5b4fc"),
    ("indigo-5", "#818cf8"), ("indigo-6", "#6366f1"), ("indigo-7", "#4f46e5"), ("indigo-8", "#4338ca"),
    ("indigo-9", "#3730a3"), ("indigo-10", "#312e81"), ("indigo-11", "#1e1b4b"), ("indigo-12", "#12102d"),

    ("violet-1", "#f5f3ff"), ("violet-2", "#ede9fe"), ("violet-3", "#ddd6fe"), ("violet-4", "#c4b5fd"),
    ("violet-5", "#a78bfa"), ("violet-6", "#8b5cf6"), ("violet-7", "#7c3aed"), ("violet-8", "#6d28d9"),
    ("violet-9", "#5b21b6"), ("violet-10", "#4c1d95"), ("violet-11", "#2e1065"), ("violet-12", "#1c0a3d"),

    ("purple-1", "#faf5ff"), ("purple-2", "#f3e8ff"), ("purple-3", "#e9d5ff"), ("purple-4", "#d8b4fe"),
    ("purple-5", "#c084fc"), ("purple-6", "#a855f7"), ("purple-7", "#9333ea"), ("purple-8", "#7e22ce"),
    ("purple-9", "#6b21a8"), ("purple-10", "#581c87"), ("purple-11", "#3b0764"), ("purple-12", "#23043c"),

    ("fuchsia-1", "#fdf4ff"), ("fuchsia-2", "#fae8ff"), ("fuchsia-3", "#f5d0fe"), ("fuchsia-4", "#f0abfc"),
    ("fuchsia-5", "#e879f9"), ("fuchsia-6", "#d946ef"), ("fuchsia-7", "#c026d3"), ("fuchsia-8", "#a21caf"),
    ("fuchsia-9", "#86198f"), ("fuchsia-10", "#701a75"), ("fuchsia-11", "#4a044e"), ("fuchsia-12", "#2d022f"),

    ("pink-1", "#fdf2f8"), ("pink-2", "#fce7f3"), ("pink-3", "#fbcfe8"), ("pink-4", "#f9a8d4"),
    ("pink-5", "#f472b6"), ("pink-6", "#ec4899"), ("pink-7", "#db2777"), ("pink-8", "#be185d"),
    ("pink-9", "#9d174d"), ("pink-10", "#831843"), ("pink-11", "#500724"), ("pink-12", "#300415"),

    ("rose-1", "#fff1f2"), ("rose-2", "#ffe4e6"), ("rose-3", "#fecdd3"), ("rose-4", "#fda4af"),
    ("rose-5", "#fb7185"), ("rose-6", "#f43f5e"), ("rose-7", "#e11d48"), ("rose-8", "#be123c"),
    ("rose-9", "#9f1239"), ("rose-10", "#881337"), ("rose-11", "#4c0519"), ("rose-12", "#2d030e"),
];
