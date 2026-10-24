// Fades [data-reveal] elements in as they scroll into view.
// Elements are only hidden here, so without JS everything stays visible.

import { staggerDelays } from './lib/stagger.js';

const PENDING = 'reveal-pending';
const IN = 'reveal-in';
const THRESHOLD = 0.15;
const BATCH_MS = 100;
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Initialise reveal animations.
 * @param {Document} doc
 * @returns {{ disconnect: () => void } | null} handle, or null when reveals are skipped
 */
export function initReveal(doc) {
  const win = doc && doc.defaultView;
  if (!win || typeof win.IntersectionObserver !== 'function') return null;

  let mql = null;
  if (typeof win.matchMedia === 'function') {
    try {
      mql = win.matchMedia(REDUCE_QUERY);
    } catch {
      mql = null;
    }
  }
  // Reduced motion: do nothing, CSS already shows everything.
  if (mql && mql.matches) return null;

  const targets = Array.from(doc.querySelectorAll('[data-reveal]'));
  if (targets.length === 0) return null;

  // Only hide targets fully below the viewport so on-screen content never flashes.
  const viewportH = win.innerHeight || (doc.documentElement && doc.documentElement.clientHeight) || 0;
  const pending = targets.filter((el) => {
    if (typeof el.getBoundingClientRect !== 'function') return false;
    const rect = el.getBoundingClientRect();
    return rect.top >= viewportH;
  });
  if (pending.length === 0) return null;
  pending.forEach((el) => el.classList.add(PENDING));

  let queue = [];
  let timer = null;
  let stopped = false;

  const flush = () => {
    timer = null;
    const batch = queue;
    queue = [];
    if (stopped || batch.length === 0) return;

    // Group by parent, preserving document order within each group.
    const order = new Map(targets.map((el, i) => [el, i]));
    batch.sort((a, b) => order.get(a) - order.get(b));
    const groups = new Map();
    for (const el of batch) {
      const key = el.parentNode;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(el);
    }

    for (const group of groups.values()) {
      const delays = staggerDelays(group.length);
      group.forEach((el, i) => {
        el.style.setProperty('--reveal-delay', `${delays[i]}ms`);
        el.classList.remove(PENDING);
        el.classList.add(IN);
      });
    }
  };

  const observer = new win.IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        // Unobserve immediately so the reveal never replays.
        observer.unobserve(el);
        if (!queue.includes(el)) queue.push(el);
      }
      if (queue.length > 0 && timer === null) {
        timer = win.setTimeout(flush, BATCH_MS);
      }
    },
    { threshold: THRESHOLD }
  );
  pending.forEach((el) => observer.observe(el));

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) {
      win.clearTimeout(timer);
      timer = null;
    }
    queue = [];
    observer.disconnect();
    detach();
  };

  // Live switch to reduced motion: show everything and stop observing.
  const onChange = (e) => {
    const matches = e && typeof e.matches === 'boolean' ? e.matches : mql && mql.matches;
    if (!matches) return;
    targets.forEach((el) => el.classList.remove(PENDING));
    stop();
  };

  function detach() {
    if (!mql) return;
    if (typeof mql.removeEventListener === 'function') {
      mql.removeEventListener('change', onChange);
    } else if (typeof mql.removeListener === 'function') {
      mql.removeListener(onChange);
    }
  }

  if (mql) {
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(onChange);
    }
  }

  return { disconnect: stop };
}
