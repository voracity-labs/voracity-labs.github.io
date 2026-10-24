// WCAG 2.x contrast helpers.
// Colors may be given as hex strings ('#RRGGBB', '#RGB', with or without '#')
// or as { r, g, b } objects with channels in 0..255.

/**
 * Parse a hex color into { r, g, b } with channels 0..255.
 * Accepts '#RRGGBB', 'RRGGBB', '#RGB', 'RGB'. Throws on invalid input.
 */
export function parseHex(hex) {
  if (typeof hex !== 'string') throw new TypeError('parseHex expects a string');
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Invalid hex color: ${hex}`);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Normalize a hex string or { r, g, b } object to { r, g, b }. */
function toRgb(color) {
  return typeof color === 'string' ? parseHex(color) : color;
}

/** Linearize one 0..255 sRGB channel per WCAG 2.x. */
function linearize(channel) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * WCAG 2.x relative luminance in [0, 1].
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(color) {
  const { r, g, b } = toRgb(color);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * WCAG 2.x contrast ratio in [1, 21]: (L1 + 0.05) / (L2 + 0.05), L1 >= L2.
 * Symmetric in its arguments.
 */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * sRGB source-over compositing of `fg` at opacity `alpha` onto opaque `bg`.
 * Matches how canvas / CSS blend in gamma-encoded sRGB space.
 * Returns { r, g, b } with unrounded channels in 0..255.
 */
export function composite(fg, alpha, bg) {
  const f = toRgb(fg);
  const k = toRgb(bg);
  const a = Math.min(1, Math.max(0, alpha));
  return {
    r: f.r * a + k.r * (1 - a),
    g: f.g * a + k.g * (1 - a),
    b: f.b * a + k.b * (1 - a),
  };
}
