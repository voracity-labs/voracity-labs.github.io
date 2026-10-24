// Runs, pauses, or freezes the hero animation based on motion settings and visibility.

import { createHero } from './hero/hero.js';
import { deriveMode } from './lib/motion-state.js';
import { isMobileWidth } from './lib/sizing.js';

const RESIZE_DEBOUNCE_MS = 150;
const MAX_FRAME_DT = 50; // ms; field.step also clamps, this keeps the lens easing sane

/**
 * Wire the hero canvas to its inputs and drive the animation loop.
 * If createHero throws, the error propagates to the caller (main.js).
 * @param {HTMLElement} heroEl
 * @param {HTMLCanvasElement} canvas
 * @returns {{ destroy(): void, readonly mode: 'running'|'paused'|'static' }}
 */
export function createController(heroEl, canvas) {
  const doc = heroEl.ownerDocument;
  const win = doc.defaultView;

  const viewportWidth = () => (Number.isFinite(win.innerWidth) ? win.innerWidth : 1024);

  const measure = () => {
    let w = 0;
    let h = 0;
    if (typeof heroEl.getBoundingClientRect === 'function') {
      const r = heroEl.getBoundingClientRect();
      w = r.width;
      h = r.height;
    }
    if (!(w > 0)) w = heroEl.clientWidth || 0;
    if (!(h > 0)) h = heroEl.clientHeight || 0;
    return { w, h };
  };

  const hero = createHero(canvas, { isMobile: isMobileWidth(viewportWidth()) });
  {
    const { w, h } = measure();
    hero.resize(w, h, isMobileWidth(viewportWidth()));
  }

  // ---- Inputs ---------------------------------------------------------------

  const mql = typeof win.matchMedia === 'function'
    ? win.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  const inputs = {
    reducedMotion: !!(mql && mql.matches),
    heroVisible: true, // fallback when IntersectionObserver is unavailable
    tabVisible: doc.visibilityState ? doc.visibilityState === 'visible' : true,
  };

  let mode = null;
  let rafId = null;
  let lastTime = null;
  let failed = false;
  let destroyed = false;
  let pointerAttached = false;
  let resizeTimer = null;

  // ---- Loop -----------------------------------------------------------------

  const raf = (cb) => win.requestAnimationFrame(cb);
  const caf = (id) => win.cancelAnimationFrame(id);

  function stopLoop() {
    if (rafId !== null) caf(rafId);
    rafId = null;
    lastTime = null;
  }

  function onFrame(now) {
    rafId = null;
    if (mode !== 'running' || failed || destroyed) return;
    try {
      // First frame after (re)start: dt = 0, so resuming never jumps.
      const dt = lastTime === null ? 0 : Math.min(MAX_FRAME_DT, Math.max(0, now - lastTime));
      lastTime = now;
      hero.frame(dt);
    } catch (err) {
      fail(err);
      return;
    }
    rafId = raf(onFrame);
  }

  function startLoop() {
    if (rafId !== null || failed) return;
    lastTime = null; // reset the frame clock; simulation state is preserved in hero
    rafId = raf(onFrame);
  }

  function fail(err) {
    if (failed) return;
    failed = true;
    stopLoop();
    detachPointer();
    if (doc.documentElement) doc.documentElement.classList.add('hero-fallback');
    const c = win.console || (typeof console !== 'undefined' ? console : null);
    if (c) (c.error || c.warn).call(c, 'Signal Field disabled after a runtime error:', err);
  }

  // ---- Pointer --------------------------------------------------------------

  function onPointerMove(e) {
    const r = canvas.getBoundingClientRect();
    hero.setPointer({ x: e.clientX - r.left, y: e.clientY - r.top });
  }

  function onPointerLeave() {
    hero.setPointer(null);
  }

  function attachPointer() {
    if (pointerAttached) return;
    heroEl.addEventListener('pointermove', onPointerMove);
    heroEl.addEventListener('pointerleave', onPointerLeave);
    pointerAttached = true;
  }

  function detachPointer() {
    if (!pointerAttached) return;
    heroEl.removeEventListener('pointermove', onPointerMove);
    heroEl.removeEventListener('pointerleave', onPointerLeave);
    pointerAttached = false;
  }

  // ---- Mode transitions -----------------------------------------------------

  function update() {
    if (destroyed || failed) return;
    const next = deriveMode(inputs);
    if (next === mode) return;
    mode = next;
    if (next === 'running') {
      attachPointer();
      startLoop();
    } else if (next === 'paused') {
      stopLoop();
      detachPointer();
      hero.setPointer(null); // no pointerleave arrives while detached
    } else {
      stopLoop();
      detachPointer();
      hero.setPointer(null);
      safeRenderStatic();
    }
  }

  function safeRenderStatic() {
    try {
      hero.renderStatic();
    } catch (err) {
      fail(err);
    }
  }

  // Reduced motion
  const onMotionChange = (e) => {
    inputs.reducedMotion = !!(e && typeof e.matches === 'boolean' ? e.matches : mql.matches);
    update();
  };
  if (mql) {
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onMotionChange);
    else if (typeof mql.addListener === 'function') mql.addListener(onMotionChange);
  }

  // Hero visibility
  let io = null;
  if (typeof win.IntersectionObserver === 'function') {
    io = new win.IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inputs.heroVisible = entry.isIntersecting;
      update();
    }, { threshold: 0 });
    io.observe(heroEl);
  }

  // Tab visibility
  const onVisibility = () => {
    inputs.tabVisible = doc.visibilityState === 'visible';
    update();
  };
  doc.addEventListener('visibilitychange', onVisibility);

  // Resize
  function applyResize() {
    resizeTimer = null;
    if (destroyed || failed) return;
    const { w, h } = measure();
    try {
      hero.resize(w, h, isMobileWidth(viewportWidth()));
    } catch (err) {
      fail(err);
      return;
    }
    if (mode === 'static') safeRenderStatic();
  }
  const scheduleResize = () => {
    if (resizeTimer !== null) win.clearTimeout(resizeTimer);
    resizeTimer = win.setTimeout(applyResize, RESIZE_DEBOUNCE_MS);
  };
  let ro = null;
  if (typeof win.ResizeObserver === 'function') {
    ro = new win.ResizeObserver(scheduleResize);
    ro.observe(heroEl);
  } else {
    win.addEventListener('resize', scheduleResize);
  }

  update();

  return {
    get mode() {
      return mode;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      detachPointer();
      if (resizeTimer !== null) win.clearTimeout(resizeTimer);
      resizeTimer = null;
      if (mql) {
        if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onMotionChange);
        else if (typeof mql.removeListener === 'function') mql.removeListener(onMotionChange);
      }
      if (io) io.disconnect();
      if (ro) ro.disconnect();
      else win.removeEventListener('resize', scheduleResize);
      doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
