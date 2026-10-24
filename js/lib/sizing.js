// Sizing rules for the hero canvas.

export const MOBILE_MAX = 767;
export const DENSITY_PX2 = 9000;
export const MIN_NODES = 40;
export const MAX_NODES = 180;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** True when the viewport width is in the mobile range (< 768 CSS px). */
export function isMobileWidth(w) {
  return w < MOBILE_MAX + 1;
}

/**
 * Node count for a canvas of cssW x cssH CSS pixels.
 * desktop = clamp(round(w * h / 9000), 40, 180); mobile = floor(desktop / 2).
 */
export function particleCount(cssW, cssH, isMobile) {
  const area = cssW * cssH;
  const raw = Number.isFinite(area) ? Math.round(area / DENSITY_PX2) : MIN_NODES;
  const desktop = clamp(raw, MIN_NODES, MAX_NODES);
  return isMobile ? Math.floor(desktop / 2) : desktop;
}

/**
 * Backing-store size for the canvas using one uniform scale on both axes.
 * scale = clamp(dpr, 1, 2); non-finite dpr is treated as 1.
 */
export function computeCanvasSize(cssW, cssH, dpr) {
  const scale = clamp(Number.isFinite(dpr) ? dpr : 1, 1, 2);
  return {
    width: Math.round(cssW * scale),
    height: Math.round(cssH * scale),
    scale,
  };
}
