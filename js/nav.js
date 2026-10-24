// Navigation: mobile menu, rotating in-hero panels, contact scroll.

import { navReducer, initialNavState, ariaExpanded } from './lib/nav-state.js';
import { isScrolled } from './lib/active-section.js';
import { MOBILE_MAX } from './lib/sizing.js';

const PANEL_IDS = ['mission', 'projects', 'blog'];
const ROTATE_MS = 8000;
const DESKTOP_QUERY = `(min-width: ${MOBILE_MAX + 1}px)`;
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Wire up the navigation bar and in-hero content panels.
 * @param {Document} doc
 */
export function initNav(doc) {
  const win = doc.defaultView;
  const header = doc.querySelector('.site-header');
  const toggle = doc.querySelector('.nav-toggle');
  const list = doc.getElementById('nav-links');
  if (!win || !header || !list) return;

  const links = Array.from(list.querySelectorAll('a[href^="#"]'));
  const panelLinks = Array.from(list.querySelectorAll('a[data-panel]'));
  const panels = PANEL_IDS.map((id) => doc.getElementById(id)).filter(Boolean);
  const panelById = new Map(panels.map((p) => [p.id, p]));
  const dots = Array.from(doc.querySelectorAll('[data-panel-dot]'));
  const stage = doc.querySelector('[data-panel-stage]');

  const raf =
    typeof win.requestAnimationFrame === 'function'
      ? (cb) => win.requestAnimationFrame(cb)
      : (cb) => win.setTimeout(cb, 16);

  const mql = typeof win.matchMedia === 'function' ? win.matchMedia(DESKTOP_QUERY) : null;
  const reduceMql = typeof win.matchMedia === 'function' ? win.matchMedia(REDUCE_QUERY) : null;
  const isMobileNow = () =>
    mql ? !mql.matches : (win.innerWidth || 0) <= MOBILE_MAX;
  const prefersReducedMotion = () => !!(reduceMql && reduceMql.matches);

  doc.documentElement.classList.add('js-nav');
  if (toggle) toggle.removeAttribute('hidden');
  if (stage) stage.style.setProperty('--panel-rotate-ms', `${ROTATE_MS}ms`);

  // --- Mobile menu --------------------------------------------------------
  let state = initialNavState(isMobileNow());

  function renderMenu() {
    if (toggle) toggle.setAttribute('aria-expanded', ariaExpanded(state));
    list.setAttribute('data-open', String(state.open));
    if (state.focusToggle && toggle) toggle.focus();
  }

  function dispatch(event) {
    state = navReducer(state, event);
    renderMenu();
  }

  renderMenu();

  if (toggle) {
    toggle.addEventListener('click', () => dispatch({ type: 'TOGGLE' }));
  }

  // --- Panels + rotation -----------------------------------------------------
  let openId = null;
  let rotateTimer = null;
  let rotating = false;

  function applyActive(id) {
    links.forEach((link) => {
      const href = link.getAttribute('href');
      const isActive = id !== null && href === `#${id}`;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  function syncIndicator(id) {
    const activeIndex = PANEL_IDS.indexOf(id);
    dots.forEach((dot) => {
      const key = dot.getAttribute('data-panel-dot');
      const index = PANEL_IDS.indexOf(key);
      const on = key === id;
      const done = activeIndex >= 0 && index >= 0 && index < activeIndex;
      dot.classList.toggle('is-active', on);
      dot.classList.toggle('is-done', done);
      dot.setAttribute('aria-selected', on ? 'true' : 'false');
      // Restart fill animation on the active track.
      if (on && rotating && !prefersReducedMotion()) {
        const fill = dot.querySelector('.panel-indicator-fill');
        if (fill) {
          fill.style.animation = 'none';
          // Force reflow so the animation restarts cleanly.
          void fill.offsetWidth;
          fill.style.animation = '';
        }
      }
    });
    if (stage) {
      stage.classList.toggle('is-rotating', rotating && !!id && !prefersReducedMotion());
    }
  }

  function stopRotate() {
    rotating = false;
    if (rotateTimer !== null) {
      win.clearTimeout(rotateTimer);
      rotateTimer = null;
    }
    if (stage) stage.classList.remove('is-rotating');
  }

  function scheduleRotate() {
    if (rotateTimer !== null) win.clearTimeout(rotateTimer);
    rotateTimer = null;
    if (!rotating || prefersReducedMotion() || !openId) return;
    rotateTimer = win.setTimeout(() => {
      rotateTimer = null;
      const i = PANEL_IDS.indexOf(openId);
      const next = PANEL_IDS[(i + 1) % PANEL_IDS.length];
      openPanel(next, { updateUrl: false, focus: false, restartRotate: true });
    }, ROTATE_MS);
  }

  function startRotate() {
    if (prefersReducedMotion()) {
      stopRotate();
      syncIndicator(openId);
      return;
    }
    rotating = true;
    scheduleRotate();
    syncIndicator(openId);
  }

  function closePanel({ updateUrl = true, focusToggle = false } = {}) {
    stopRotate();
    if (!openId) {
      applyActive(null);
      syncIndicator(null);
      return;
    }
    const panel = panelById.get(openId);
    if (panel) {
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
    }
    openId = null;
    doc.documentElement.classList.remove('panel-open');
    applyActive(null);
    syncIndicator(null);
    if (updateUrl && win.history && typeof win.history.replaceState === 'function') {
      win.history.replaceState(null, '', `${win.location.pathname}${win.location.search}`);
    }
    if (focusToggle && toggle) toggle.focus();
  }

  function openPanel(id, { updateUrl = true, focus = false, restartRotate = false } = {}) {
    const panel = panelById.get(id);
    if (!panel) return;

    panels.forEach((p) => {
      const on = p.id === id;
      p.classList.toggle('is-open', on);
      p.setAttribute('aria-hidden', on ? 'false' : 'true');
    });

    openId = id;
    doc.documentElement.classList.add('panel-open');
    applyActive(id);

    if (updateUrl && win.history && typeof win.history.replaceState === 'function') {
      win.history.replaceState(null, '', `#${id}`);
    }

    if (restartRotate || rotating) startRotate();
    else syncIndicator(id);

    if (focus) {
      raf(() => {
        try {
          panel.focus({ preventScroll: true });
        } catch {
          panel.focus();
        }
      });
    }
  }

  // Initial: honor panel hash, else open mission and start rotating.
  const initialHash = (win.location.hash || '').slice(1);
  if (PANEL_IDS.includes(initialHash)) {
    openPanel(initialHash, { updateUrl: false, focus: false, restartRotate: true });
  } else if (initialHash === 'contact') {
    syncIndicator(null);
  } else {
    openPanel('mission', { updateUrl: false, focus: false, restartRotate: true });
  }

  panelLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href') || '';
      const id = href.charAt(0) === '#' ? href.slice(1) : '';
      if (!PANEL_IDS.includes(id)) return;
      e.preventDefault();
      if (state.isMobile) dispatch({ type: 'LINK_ACTIVATED' });
      // Manual pick: jump to panel and keep the carousel going from there.
      openPanel(id, { updateUrl: true, focus: true, restartRotate: true });
    });
  });

  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      const id = dot.getAttribute('data-panel-dot');
      if (!PANEL_IDS.includes(id)) return;
      openPanel(id, { updateUrl: true, focus: true, restartRotate: true });
    });
  });

  // Contact: close panels / pause rotate, then allow normal hash scroll.
  const contactLink = list.querySelector('a[href="#contact"]');
  if (contactLink) {
    contactLink.addEventListener('click', () => {
      closePanel({ updateUrl: false });
      if (state.isMobile) dispatch({ type: 'LINK_ACTIVATED' });
      applyActive('contact');
      raf(() => {
        const target = doc.getElementById('contact');
        if (!target) return;
        try {
          target.focus({ preventScroll: true });
        } catch {
          target.focus();
        }
      });
    });
  }

  doc.querySelectorAll('[data-close-panel]').forEach((el) => {
    el.addEventListener('click', (e) => {
      // Logo returns to mission and resumes the carousel.
      e.preventDefault();
      openPanel('mission', { updateUrl: true, focus: false, restartRotate: true });
      win.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });
  });

  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (state.open) dispatch({ type: 'ESCAPE' });
    }
  });

  win.addEventListener('hashchange', () => {
    const id = (win.location.hash || '').slice(1);
    if (PANEL_IDS.includes(id)) {
      openPanel(id, { updateUrl: false, focus: false, restartRotate: true });
    } else if (id === 'contact') {
      closePanel({ updateUrl: false });
      applyActive('contact');
    } else if (!id || id === 'top') {
      openPanel('mission', { updateUrl: false, focus: false, restartRotate: true });
    }
  });

  if (reduceMql) {
    const onReduce = () => {
      if (prefersReducedMotion()) stopRotate();
      else if (openId) startRotate();
      syncIndicator(openId);
    };
    if (typeof reduceMql.addEventListener === 'function') reduceMql.addEventListener('change', onReduce);
    else if (typeof reduceMql.addListener === 'function') reduceMql.addListener(onReduce);
  }

  // Pause rotation while the tab is hidden.
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') {
      if (rotateTimer !== null) {
        win.clearTimeout(rotateTimer);
        rotateTimer = null;
      }
    } else if (rotating && openId) {
      scheduleRotate();
      syncIndicator(openId);
    }
  });

  // --- Scrolled chrome (contact section / footer) -------------------------
  let pending = false;

  function updateScrollChrome() {
    pending = false;
    header.setAttribute('data-scrolled', String(isScrolled(win.scrollY || 0)));
    if (openId) return;
    const contact = doc.getElementById('contact');
    if (!contact) return;
    const r = contact.getBoundingClientRect();
    const vh = win.innerHeight || 0;
    const onContact = r.top < vh * 0.45 && r.bottom > 80;
    applyActive(onContact ? 'contact' : null);
  }

  function schedule() {
    if (pending) return;
    pending = true;
    raf(updateScrollChrome);
  }

  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', schedule, { passive: true });
  updateScrollChrome();

  // --- Breakpoint ---------------------------------------------------------
  function onBreakpoint() {
    dispatch({ type: 'BREAKPOINT', isMobile: isMobileNow() });
  }

  if (mql) {
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onBreakpoint);
    else if (typeof mql.addListener === 'function') mql.addListener(onBreakpoint);
  } else {
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
