// Navigation: mobile menu, in-hero panels (mission / projects / blog), contact scroll.

import { navReducer, initialNavState, ariaExpanded } from './lib/nav-state.js';
import { isScrolled } from './lib/active-section.js';
import { MOBILE_MAX } from './lib/sizing.js';

const PANEL_IDS = ['mission', 'projects', 'blog'];
const DESKTOP_QUERY = `(min-width: ${MOBILE_MAX + 1}px)`;

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

  const raf =
    typeof win.requestAnimationFrame === 'function'
      ? (cb) => win.requestAnimationFrame(cb)
      : (cb) => win.setTimeout(cb, 16);

  const mql = typeof win.matchMedia === 'function' ? win.matchMedia(DESKTOP_QUERY) : null;
  const isMobileNow = () =>
    mql ? !mql.matches : (win.innerWidth || 0) <= MOBILE_MAX;

  doc.documentElement.classList.add('js-nav');
  if (toggle) toggle.removeAttribute('hidden');

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

  // --- Panels -------------------------------------------------------------
  let openId = null;

  function applyActive(id) {
    links.forEach((link) => {
      const href = link.getAttribute('href');
      const isActive = id !== null && href === `#${id}`;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  function closePanel({ updateUrl = true, focusToggle = false } = {}) {
    if (!openId) {
      applyActive(null);
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
    if (updateUrl && win.history && typeof win.history.replaceState === 'function') {
      win.history.replaceState(null, '', `${win.location.pathname}${win.location.search}`);
    }
    if (focusToggle && toggle) toggle.focus();
  }

  function openPanel(id, { updateUrl = true } = {}) {
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

    raf(() => {
      try {
        panel.focus({ preventScroll: true });
      } catch {
        panel.focus();
      }
    });
  }

  function togglePanel(id) {
    if (openId === id) closePanel();
    else openPanel(id);
  }

  // Initial hash: open matching panel without scrolling the page.
  const initialHash = (win.location.hash || '').slice(1);
  if (PANEL_IDS.includes(initialHash)) {
    openPanel(initialHash, { updateUrl: false });
  } else {
    panels.forEach((p) => {
      p.setAttribute('aria-hidden', 'true');
      p.classList.remove('is-open');
    });
  }

  panelLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href') || '';
      const id = href.charAt(0) === '#' ? href.slice(1) : '';
      if (!PANEL_IDS.includes(id)) return;
      e.preventDefault();
      if (state.isMobile) dispatch({ type: 'LINK_ACTIVATED' });
      togglePanel(id);
    });
  });

  // Contact: close any panel, then allow normal hash scroll.
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
      if (!openId) return;
      e.preventDefault();
      closePanel();
      if (win.history && typeof win.history.replaceState === 'function') {
        win.history.replaceState(null, '', `${win.location.pathname}${win.location.search}`);
      }
    });
  });

  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (state.open) dispatch({ type: 'ESCAPE' });
      else if (openId) closePanel({ focusToggle: false });
    }
  });

  win.addEventListener('hashchange', () => {
    const id = (win.location.hash || '').slice(1);
    if (PANEL_IDS.includes(id)) openPanel(id, { updateUrl: false });
    else if (id === 'contact') {
      closePanel({ updateUrl: false });
      applyActive('contact');
    } else if (!id || id === 'top') {
      closePanel({ updateUrl: false });
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
    const onContact = r.top < vh * 0.45 && r.bottom > varNavInset();
    applyActive(onContact ? 'contact' : null);
  }

  function varNavInset() {
    return 80;
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
