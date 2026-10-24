// Decides whether the hero animation runs, pauses, or shows a static frame.

/**
 * @typedef {'running' | 'paused' | 'static'} MotionMode
 */

/**
 * @typedef {Object} ModeInputs
 * @property {boolean} reducedMotion  `prefers-reduced-motion: reduce` matches.
 * @property {boolean} heroVisible    Hero intersects the viewport.
 * @property {boolean} tabVisible     `document.visibilityState === 'visible'`.
 */

/**
 * Derive the animation mode from its inputs.
 *   reducedMotion          -> 'static'
 *   heroVisible && tabVisible -> 'running'
 *   otherwise              -> 'paused'
 * @param {ModeInputs} inputs
 * @returns {MotionMode}
 */
export function deriveMode({ reducedMotion, heroVisible, tabVisible }) {
  if (reducedMotion) return 'static';
  if (heroVisible && tabVisible) return 'running';
  return 'paused';
}

/**
 * One animation tick: the mode inputs at that moment plus elapsed time.
 * `pointer` and `lensStrength` are optional and forwarded to `stepFn`.
 * @typedef {Object} Tick
 * @property {boolean} reducedMotion
 * @property {boolean} heroVisible
 * @property {boolean} tabVisible
 * @property {number} dtMs                         Elapsed ms for this tick.
 * @property {{x:number, y:number} | null} [pointer]  Pointer in CSS px, or null.
 * @property {number} [lensStrength]               0..1, defaults to 0.
 */

/**
 * Apply `stepFn` for each tick whose derived mode is 'running', in order.
 * Paused and static ticks leave the state unchanged (same reference).
 *
 * `stepFn` is called as `stepFn(state, dtMs, pointer, lensStrength)`, which
 * matches `field.step` from `js/hero/field.js`.
 *
 * @template S
 * @param {S} state
 * @param {Tick[]} ticks
 * @param {(state: S, dtMs: number, pointer: ({x:number,y:number}|null), lensStrength: number) => S} stepFn
 * @returns {S}
 */
export function runTicks(state, ticks, stepFn) {
  let s = state;
  for (const tick of ticks) {
    if (deriveMode(tick) !== 'running') continue;
    s = stepFn(s, tick.dtMs, tick.pointer ?? null, tick.lensStrength ?? 0);
  }
  return s;
}
