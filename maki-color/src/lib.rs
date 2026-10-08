//! The color vocabulary every layer of maki speaks, and the running theme's
//! published style registry.
//!
//! [`SegmentColor`] is the one spelling a color has between crates: the UI
//! converts its ratatui `Color`s into it, the syntax highlighter emits it,
//! and the Lua API parses plugin strings into it. [`UiStyle`] is the style
//! table a theme publishes for plugins.
//!
//! The [`Registry`] holds the named styles the UI installs whenever a theme
//! takes over. It lives in this crate because both `maki-lua`
//! (synchronous reads while a plugin paints) and `maki-ui` (the only
//! writer) must reach it, and neither can depend on the other. Reads are
//! cheap; the UI thread is the only writer.

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, OnceLock};

/// The one spelling of "default" every layer accepts in a color string.
pub const DEFAULT_COLOR_NAME: &str = "default";

const HEX_RGB_LEN: usize = 6;

type Rgb = (u8, u8, u8);

/// A color exactly as a terminal can paint it. `Default` is "whatever the
/// theme's own color is".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SegmentColor {
    Rgb(Rgb),
    Ansi(u8),
    Default,
}

impl SegmentColor {
    /// The one reader of the `#rrggbb | index | name | default` grammar, so
    /// themes, syntax scopes and plugin spans cannot drift apart on what
    /// they accept.
    pub fn parse(s: &str) -> Option<Self> {
        if let Some(hex) = s.strip_prefix('#') {
            return parse_hex_rgb(hex).map(Self::Rgb);
        }
        if s == DEFAULT_COLOR_NAME {
            return Some(Self::Default);
        }
        if s.bytes().all(|b| b.is_ascii_digit()) {
            return s.parse().ok().map(Self::Ansi);
        }
        ansi_color_index(s).map(Self::Ansi)
    }
}

/// Rejects the `+4` and `-0` that `u8::from_str` would otherwise accept, and
/// any casing or separator sloppiness, so a spelling either resolves exactly
/// or not at all.
fn parse_hex_rgb(hex: &str) -> Option<Rgb> {
    if hex.len() != HEX_RGB_LEN || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let channel = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).ok();
    Some((channel(0)?, channel(2)?, channel(4)?))
}

/// Resolve a terminal color name to its palette index. These are Helix's
/// palette names, so its themes load unchanged. Spelling is exact:
/// `light-gray` resolves, `lightgray` and `LIGHT-GRAY` do not.
pub fn ansi_color_index(name: &str) -> Option<u8> {
    let index = match name {
        "black" => 0,
        "red" => 1,
        "green" => 2,
        "yellow" => 3,
        "blue" => 4,
        "magenta" => 5,
        "cyan" => 6,
        "gray" => 7,
        "light-gray" => 8,
        "light-red" => 9,
        "light-green" => 10,
        "light-yellow" => 11,
        "light-blue" => 12,
        "light-magenta" => 13,
        "light-cyan" => 14,
        "white" => 15,
        _ => return None,
    };
    Some(index)
}

/// A published named style: [`SegmentColor`]s plus the modifiers a
/// `ratatui::style::Style` can carry, in the shape a plugin reads through
/// `maki.ui.theme_style`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UiStyle {
    pub fg: Option<SegmentColor>,
    pub bg: Option<SegmentColor>,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub dim: bool,
    pub strikethrough: bool,
    pub reversed: bool,
}

#[derive(Default)]
struct State {
    styles: HashMap<String, UiStyle>,
}

static STATE: OnceLock<Mutex<State>> = OnceLock::new();

fn lock() -> MutexGuard<'static, State> {
    STATE
        .get_or_init(|| Mutex::new(State::default()))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

/// Serializes tests that mutate the registry, mirroring how the theme
/// globals are guarded in the crates above. Held for the whole case: the
/// registry is process-global state. Visible to dependent crates' test
/// suites, which share the same globals.
static TEST_GUARD: Mutex<()> = Mutex::new(());

/// A hold on [`TEST_GUARD`]: drop it when the case ends.
pub fn exclusive() -> MutexGuard<'static, ()> {
    TEST_GUARD.lock().unwrap_or_else(|e| e.into_inner())
}

/// The running theme's published styles. The UI thread is the only writer;
/// `maki-lua` reads synchronously while a plugin paints.
pub struct Registry;

impl Registry {
    /// Replace every published style.
    pub fn set_styles(styles: HashMap<String, UiStyle>) {
        lock().styles = styles;
    }

    /// The published style for {name}.
    pub fn style(name: &str) -> Option<UiStyle> {
        lock().styles.get(name).cloned()
    }

    /// Empty the registry. The state is process-global like the theme, so a
    /// suite that shares one process needs a way to start a case from a
    /// blank slate.
    pub fn reset() {
        *lock() = State::default();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BLUE: &str = "blue";

    #[test]
    fn hex_index_name_and_default_all_parse() {
        assert_eq!(
            SegmentColor::parse("#0a0b0c"),
            Some(SegmentColor::Rgb((0x0a, 0x0b, 0x0c)))
        );
        assert_eq!(SegmentColor::parse("4"), Some(SegmentColor::Ansi(4)));
        assert_eq!(SegmentColor::parse(BLUE), Some(SegmentColor::Ansi(4)));
        assert_eq!(
            SegmentColor::parse(DEFAULT_COLOR_NAME),
            Some(SegmentColor::Default)
        );
        assert_eq!(SegmentColor::parse("bananas"), None);
        assert_eq!(
            SegmentColor::parse("#0a0b"),
            None,
            "short hex does not resolve"
        );
    }

    #[test]
    fn styles_roundtrip_and_clear() {
        let _registry = exclusive();
        Registry::set_styles(HashMap::from([(
            "input_border".to_owned(),
            UiStyle {
                fg: Some(SegmentColor::Ansi(4)),
                bold: true,
                ..Default::default()
            },
        )]));

        let style = Registry::style("input_border").unwrap();
        assert_eq!(style.fg, Some(SegmentColor::Ansi(4)));
        assert!(style.bold);

        Registry::reset();
        assert_eq!(Registry::style("input_border"), None);
    }
}
