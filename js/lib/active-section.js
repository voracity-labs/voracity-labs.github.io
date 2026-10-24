// Helpers for the nav bar's scrolled style and active link.

/** Scroll offset (CSS px) beyond which the nav bar switches to its scrolled style. */
export const SCROLL_THRESHOLD = 50;

/**
 * Height of the part of `rect` that falls inside [viewportTop, viewportBottom].
 * @param {{top: number, bottom: number}} rect
 * @param {number} viewportTop
 * @param {number} viewportBottom
 * @returns {number} visible height, always >= 0
 */
export function visibleHeight(rect, viewportTop, viewportBottom) {
  const h = Math.min(rect.bottom, viewportBottom) - Math.max(rect.top, viewportTop);
  return h > 0 ? h : 0;
}

/**
 * Pick the section with the largest visible height. Ties go to the earlier entry.
 * Returns null when the winner is the hero (id null) or nothing is visible.
 * @param {Array<{id: string|null, top: number, bottom: number}>} sections in document order
 * @param {number} viewportTop
 * @param {number} viewportHeight
 * @returns {string|null}
 */
export function selectActiveSection(sections, viewportTop, viewportHeight) {
  const viewportBottom = viewportTop + viewportHeight;
  let best = null;
  let bestHeight = 0;
  for (const section of sections) {
    const h = visibleHeight(section, viewportTop, viewportBottom);
    // Strict comparison keeps the earlier entry on ties.
    if (h > bestHeight) {
      bestHeight = h;
      best = section;
    }
  }
  return best ? best.id ?? null : null;
}

/**
 * @param {number} scrollY
 * @returns {boolean} true when the page has scrolled past the threshold
 */
export function isScrolled(scrollY) {
  return scrollY > SCROLL_THRESHOLD;
}
