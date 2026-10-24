// Navigation: mobile menu, scrolled style, active link, and focus on link clicks.

import { navReducer, initialNavState, ariaExpanded } from './lib/nav-state.js';
import { isScrolled, selectActiveSection } from './lib/active-section.js';
import { MOBILE_MAX } from './lib/sizing.js';

const SECTION_IDS = ['research', 'systems', 'publications', 'about'];
const DESKTOP_QUERY = `(min-width: ${MOBILE_MAX + 1}px)`;

/**
 * Wire up the navigation bar. Safe to call with a document whose window lacks
 * matchMedia or requestAnimationFrame (falls back gracefully).
 * @param {Document} doc
 */
export function initNav(doc) {
  const win = doc.defaultView;
  const header = doc.querySelector('.site-header');
  const toggle = doc.querySelector('.nav-toggle');
  const list = doc.getElementById('nav-links');
  if (!win || !header || !list) return;

  const links = Array.from(list.querySelectorAll('a[href^="#"]'));
  const hero = doc.querySelector('.hero');
  const sections = SECTION_IDS.map((id) => doc.getElementById(id)).filter(Boolean);

  // Scheduling helpers: prefer rAF, fall back to setTimeout.
  const raf =
    typeof win.requestAnimationFrame === 'function'
      ? (cb) => win.requestAnimationFrame(cb)
      : (cb) => win.setTimeout(cb, 16);

  // Breakpoint query (desktop when it matches). Missing matchMedia => fall
  // back to the current viewport width.
  const mql = typeof win.matchMedia === 'function' ? win.matchMedia(DESKTOP_QUERY) : null;
  const isMobileNow = () =>
    mql ? !mql.matches : (win.innerWidth || 0) <= MOBILE_MAX;

  // --- Progressive enhancement: JS-driven menu is now available ----------
  doc.documentElement.classList.add('js-nav');
  if (toggle) toggle.removeAttribute('hidden');

  // --- Menu state ---------------------------------------------------------
  let state = initialNavState(isMobileNow());

  function render() {
    if (toggle) toggle.setAttribute('aria-expanded', ariaExpanded(state));
    list.setAttribute('data-open', String(state.open));
    if (state.focusToggle && toggle) toggle.focus();
  }

  function dispatch(event) {
    state = navReducer(state, event);
    render();
  }

  render();

  if (toggle) {
    toggle.addEventListener('click', () => dispatch({ type: 'TOGGLE' }));
  }

  doc.addEventListener('keydown', (e) => {
    if ((e.key === 'Escape' || e.key === 'Esc') && state.open) {
      dispatch({ type: 'ESCAPE' });
    }
  });

  // --- Focus the target section after the default fragment scroll -----------
  function focusTargetLater(href) {
    const id = href && href.charAt(0) === '#' ? href.slice(1) : '';
    if (!id) return;
    const target = doc.getElementById(id);
    if (!target) return;
    // Let the browser perform the hash navigation first (no preventDefault).
    raf(() => {
      try {
        target.focus({ preventScroll: true });
      } catch {
        target.focus();
      }
    });
  }

  links.forEach((link) => {
    link.addEventListener('click', () => {
      if (state.isMobile) dispatch({ type: 'LINK_ACTIVATED' });
      focusTargetLater(link.getAttribute('href'));
    });
  });

  doc.querySelectorAll('.cta').forEach((cta) => {
    cta.addEventListener('click', () => focusTargetLater(cta.getAttribute('href')));
  });

  // --- Scrolled state + active link (rAF-throttled) ------------------------
  let activeId = null;
  let pending = false;

  function applyActive(id) {
    activeId = id;
    links.forEach((link) => {
      const isActive = id !== null && link.getAttribute('href') === `#${id}`;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  function update() {
    pending = false;
    header.setAttribute('data-scrolled', String(isScrolled(win.scrollY || 0)));

    const rects = [];
    if (hero) {
      const r = hero.getBoundingClientRect();
      rects.push({ id: null, top: r.top, bottom: r.bottom });
    }
    sections.forEach((s) => {
      const r = s.getBoundingClientRect();
      rects.push({ id: s.id, top: r.top, bottom: r.bottom });
    });
    // Rects are viewport-relative, so the viewport spans [0, innerHeight].
    const next = selectActiveSection(rects, 0, win.innerHeight || 0);
    if (next !== activeId) applyActive(next);
  }

  function schedule() {
    if (pending) return;
    pending = true;
    raf(update);
  }

  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', schedule, { passive: true });
  update();

  // --- Breakpoint crossing (menu reset + keep current section) -------------
  function onBreakpoint() {
    // activeId reflects the last frame before the layout switch.
    const keepId = activeId;
    dispatch({ type: 'BREAKPOINT', isMobile: isMobileNow() });
    if (!keepId) return;
    raf(() => {
      const el = doc.getElementById(keepId);
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const vh = win.innerHeight || 0;
      if (top < 0 || top >= vh) {
        el.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
      schedule();
    });
  }

  if (mql) {
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onBreakpoint);
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(onBreakpoint);
    }
  } else {
    // No matchMedia: detect crossings on resize.
    let lastMobile = state.isMobile;
    win.addEventListener('resize', () => {
      const m = isMobileNow();
      if (m !== lastMobile) {
        lastMobile = m;
        onBreakpoint();
      }
    }, { passive: true });
  }
}
