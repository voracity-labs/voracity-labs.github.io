// Delays for revealing sibling elements one after another.

export const STAGGER_MS = 100;
export const STAGGER_MIN = 50;
export const STAGGER_MAX_TOTAL = 600;

/**
 * Delays (ms) for n siblings revealed together.
 * step = n <= 1 ? 0 : clamp(floor(600 / (n - 1)), 50, 100); delay[i] = min(i * step, 600).
 * @param {number} n sibling count
 * @returns {number[]} array of length n (empty for n <= 0)
 */
export function staggerDelays(n) {
  const count = Number.isFinite(n) ? Math.floor(n) : 0;
  if (count <= 0) return [];
  const step =
    count <= 1
      ? 0
      : Math.min(STAGGER_MS, Math.max(STAGGER_MIN, Math.floor(STAGGER_MAX_TOTAL / (count - 1))));
  const delays = new Array(count);
  for (let i = 0; i < count; i++) {
    delays[i] = Math.min(i * step, STAGGER_MAX_TOTAL);
  }
  return delays;
}
