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
