// Navigation: mobile menu, rotating in-hero panels, contact scroll.

import { navReducer, initialNavState, ariaExpanded } from './lib/nav-state.js';
import { isScrolled } from './lib/active-section.js';
import { MOBILE_MAX } from './lib/sizing.js';

const PANEL_IDS = ['mission', 'projects', 'blog'];
const ROTATE_MS = 14000;
const SCROLL_BOTTOM_PX = 12;
const DESKTOP_QUERY = `(min-width: ${MOBILE_MAX + 1}px)`;
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

const FOUNDERS = {
  mark: {
    id: 'founder-mark',
    name: 'Mark Mu',
    role: 'Co-founder',
    photo: 'assets/mark-mu.svg',
  },
  gabriel: {
    id: 'founder-gabriel',
    name: 'Gabriel You',
    role: 'Co-founder',
    photo: 'assets/gabriel-you.svg',
  },
};

/** Hover cards for citation / external links in panel copy. */
const LINK_PREVIEWS = {
  'https://sre.google/': {
    kicker: 'sre.google',
    title: 'Site Reliability Engineering',
    desc: 'Google’s SRE practices: availability, latency, performance, and capacity as measurable engineering concerns.',
  },
  'https://csrc.nist.gov/pubs/sp/800/218/final': {
    kicker: 'csrc.nist.gov',
    title: 'Secure Software Development Framework',
    desc: 'NIST SP 800-218 — practices for reducing vulnerabilities and integrating security through the SDLC.',
  },
  'https://research.google/pubs/dora-2025-state-of-ai-assisted-software-development-report/': {
    kicker: 'research.google',
    title: 'DORA 2025: AI-assisted Software Development',
    desc: 'AI as an amplifier of existing organizational strengths and dysfunctions — value depends on the environment.',
  },
  'https://metr.org/Early_2025_AI_Experienced_OS_Devs_Study-paper.pdf': {
    kicker: 'metr.org',
    title: 'Early-2025 AI coding tools study',
    desc: 'RCT: early-2025 AI tools increased task completion time by 19% for experienced developers in familiar repos.',
  },
  'https://github.com/voracity-labs': {
    kicker: 'github.com',
    title: 'voracity-labs',
    desc: 'Public repositories for Voracity Labs on GitHub.',
  },
};

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
  const rail = doc.querySelector('.panel-rail');
  const preview = doc.getElementById('link-preview');

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

  // --- Panels + rotate -----------------------------------------------------
  let openId = null;
  let rotateTimer = null;
  let rotating = false;
  let rotateHold = false; // true while mission is unread (not scrolled to bottom)

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
    const showFill = rotating && !rotateHold && !prefersReducedMotion();
    dots.forEach((dot) => {
      const key = dot.getAttribute('data-panel-dot');
      const index = PANEL_IDS.indexOf(key);
      const on = key === id;
      const done = activeIndex >= 0 && index >= 0 && index < activeIndex;
      dot.classList.toggle('is-active', on);
      dot.classList.toggle('is-done', done);
      dot.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on && showFill) {
        const fill = dot.querySelector('.panel-indicator-fill');
        if (fill) {
          fill.style.animation = 'none';
          void fill.offsetWidth;
          fill.style.animation = '';
        }
      }
    });
    if (stage) {
      stage.classList.toggle('is-rotating', showFill && !!id);
    }
  }

  function stopRotate() {
    rotating = false;
    rotateHold = false;
    if (rotateTimer !== null) {
      win.clearTimeout(rotateTimer);
      rotateTimer = null;
    }
    if (stage) stage.classList.remove('is-rotating');
  }

  function clearRotateTimer() {
    if (rotateTimer !== null) {
      win.clearTimeout(rotateTimer);
      rotateTimer = null;
    }
  }

  function scheduleRotate() {
    clearRotateTimer();
    if (!rotating || rotateHold || prefersReducedMotion() || !openId) {
      syncIndicator(openId);
      return;
    }
    rotateTimer = win.setTimeout(() => {
      rotateTimer = null;
      const i = PANEL_IDS.indexOf(openId);
      const next = PANEL_IDS[(i + 1) % PANEL_IDS.length];
      openPanel(next, { updateUrl: false, focus: false, restartRotate: true });
    }, ROTATE_MS);
    syncIndicator(openId);
  }

  function startRotate() {
    if (prefersReducedMotion()) {
      stopRotate();
      syncIndicator(openId);
      return;
    }
    rotating = true;
    evaluateMissionHold();
    scheduleRotate();
  }

  function railAtBottom() {
    if (!rail) return true;
    const remaining = rail.scrollHeight - rail.clientHeight - rail.scrollTop;
    // No overflow, or within a few px of the end.
    return remaining <= SCROLL_BOTTOM_PX;
  }

  /** Hold the carousel while mission content is still unread. */
  function evaluateMissionHold() {
    if (openId !== 'mission') {
      rotateHold = false;
      return;
    }
    if (!rail) {
      rotateHold = false;
      return;
    }
    // If it fits, no hold. If it overflows, hold until the reader reaches the bottom.
    const overflows = rail.scrollHeight > rail.clientHeight + SCROLL_BOTTOM_PX;
    rotateHold = overflows && !railAtBottom();
  }

  function resetRailScroll() {
    if (rail) rail.scrollTop = 0;
  }

  function closePanel({ updateUrl = true, focusToggle = false } = {}) {
    stopRotate();
    hidePreview();
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
    resetRailScroll();
    if (updateUrl && win.history && typeof win.history.replaceState === 'function') {
      win.history.replaceState(null, '', `${win.location.pathname}${win.location.search}`);
    }
    if (focusToggle && toggle) toggle.focus();
  }

  function openPanel(id, { updateUrl = true, focus = false, restartRotate = false } = {}) {
    const panel = panelById.get(id);
    if (!panel) return;

    hidePreview();

    panels.forEach((p) => {
      const on = p.id === id;
      p.classList.toggle('is-open', on);
      p.setAttribute('aria-hidden', on ? 'false' : 'true');
    });

    openId = id;
    doc.documentElement.classList.add('panel-open');
    applyActive(id);
    resetRailScroll();

    if (updateUrl && win.history && typeof win.history.replaceState === 'function') {
      win.history.replaceState(null, '', `#${id}`);
    }

    if (restartRotate || rotating) startRotate();
    else {
      evaluateMissionHold();
      syncIndicator(id);
    }

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
  } else if (initialHash === 'founder-mark' || initialHash === 'founder-gabriel') {
    openPanel('mission', { updateUrl: false, focus: false, restartRotate: true });
    raf(() => scrollToFounder(initialHash === 'founder-mark' ? 'mark' : 'gabriel'));
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

  // Mission rail scroll: hold rotate until the bottom is reached.
  if (rail) {
    rail.addEventListener(
      'scroll',
      () => {
        if (openId !== 'mission' || !rotating) return;
        const wasHeld = rotateHold;
        evaluateMissionHold();
        if (wasHeld && !rotateHold) {
          // Reached the bottom — start the dwell timer now.
          scheduleRotate();
        } else if (!wasHeld && rotateHold) {
          clearRotateTimer();
          syncIndicator(openId);
        } else if (rotateHold) {
          clearRotateTimer();
          if (stage) stage.classList.remove('is-rotating');
        }
      },
      { passive: true },
    );

    // At rail edges, continue the wheel into page scroll (hero → contact).
    rail.addEventListener(
      'wheel',
      (e) => {
        if (!rail) return;
        const dy = e.deltaY;
        if (!dy) return;
        const atTop = rail.scrollTop <= SCROLL_BOTTOM_PX;
        const atBottom =
          rail.scrollTop + rail.clientHeight >= rail.scrollHeight - SCROLL_BOTTOM_PX;

        const se = doc.scrollingElement || doc.documentElement;
        const pageY = se.scrollTop || 0;
        if (dy > 0 && atBottom) {
          e.preventDefault();
          se.scrollTop = pageY + dy;
        } else if (dy < 0 && atTop && pageY > 0) {
          e.preventDefault();
          se.scrollTop = Math.max(0, pageY + dy);
        }
      },
      { passive: false },
    );
  }

  // --- Link / founder hover previews --------------------------------------
  function hidePreview() {
    if (!preview) return;
    preview.hidden = true;
    preview.setAttribute('aria-hidden', 'true');
  }

  function placePreview(anchor) {
    if (!preview || !anchor) return;
    preview.hidden = false;
    preview.setAttribute('aria-hidden', 'false');
    const rect = anchor.getBoundingClientRect();
    const pad = 12;
    const pw = preview.offsetWidth || 320;
    const ph = preview.offsetHeight || 96;
    let left = rect.left;
    let top = rect.bottom + 8;
    if (left + pw > win.innerWidth - pad) left = win.innerWidth - pw - pad;
    if (left < pad) left = pad;
    if (top + ph > win.innerHeight - pad) top = rect.top - ph - 8;
    if (top < pad) top = pad;
    preview.style.left = `${Math.round(left)}px`;
    preview.style.top = `${Math.round(top)}px`;
  }

  function showFounderPreview(key, anchor) {
    const data = FOUNDERS[key];
    if (!preview || !data || !anchor) return;
    const img = preview.querySelector('.link-preview-photo');
    const kicker = preview.querySelector('.link-preview-kicker');
    const title = preview.querySelector('.link-preview-title');
    const desc = preview.querySelector('.link-preview-desc');
    if (img) {
      img.hidden = false;
      img.src = data.photo;
      img.alt = `Portrait of ${data.name}`;
    }
    if (kicker) kicker.textContent = data.role;
    if (title) title.textContent = data.name;
    if (desc) desc.textContent = '';
    placePreview(anchor);
  }

  function showLinkPreview(href, label, anchor) {
    if (!preview || !anchor) return;
    const meta =
      LINK_PREVIEWS[href] ||
      LINK_PREVIEWS[href.replace(/\/$/, '')] ||
      LINK_PREVIEWS[`${href.replace(/\/$/, '')}/`] ||
      null;
    let host = '';
    try {
      host = new URL(href, win.location.href).hostname.replace(/^www\./, '');
    } catch {
      host = href;
    }
    const img = preview.querySelector('.link-preview-photo');
    const kicker = preview.querySelector('.link-preview-kicker');
    const title = preview.querySelector('.link-preview-title');
    const desc = preview.querySelector('.link-preview-desc');
    if (img) {
      img.hidden = true;
      img.removeAttribute('src');
      img.alt = '';
    }
    if (kicker) kicker.textContent = meta ? meta.kicker : host;
    if (title) title.textContent = meta ? meta.title : label || host;
    if (desc) desc.textContent = meta ? meta.desc : '';
    placePreview(anchor);
  }

  function scrollToFounder(key) {
    const data = FOUNDERS[key];
    if (!data) return;
    const el = doc.getElementById(data.id);
    if (!el || !rail) return;

    // Ensure mission is open so the founder cards exist in layout.
    if (openId !== 'mission') {
      openPanel('mission', { updateUrl: true, focus: false, restartRotate: true });
    }

    raf(() => {
      const railRect = rail.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const nextTop = rail.scrollTop + (elRect.top - railRect.top) - 16;
      rail.scrollTo({
        top: Math.max(0, nextTop),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
      el.classList.add('is-targeted');
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
      win.setTimeout(() => el.classList.remove('is-targeted'), 1600);
      // After jumping to bios, treat mission as read so rotate can resume.
      evaluateMissionHold();
      if (rotating && !rotateHold) scheduleRotate();
    });
  }

  doc.querySelectorAll('.founder-jump').forEach((link) => {
    const key = link.getAttribute('data-founder');
    link.addEventListener('click', (e) => {
      e.preventDefault();
      hidePreview();
      scrollToFounder(key);
    });
    link.addEventListener('mouseenter', () => showFounderPreview(key, link));
    link.addEventListener('mouseleave', hidePreview);
    link.addEventListener('focus', () => showFounderPreview(key, link));
    link.addEventListener('blur', hidePreview);
  });

  // External citation links in panels get the same preview treatment.
  doc.querySelectorAll('.panel a[href^="http"]').forEach((link) => {
    if (link.classList.contains('founder-jump')) return;
    const href = link.href;
    const label = (link.textContent || '').trim();
    link.addEventListener('mouseenter', () => showLinkPreview(href, label, link));
    link.addEventListener('mouseleave', hidePreview);
    link.addEventListener('focus', () => showLinkPreview(href, label, link));
    link.addEventListener('blur', hidePreview);
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
      e.preventDefault();
      openPanel('mission', { updateUrl: true, focus: false, restartRotate: true });
      win.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });
  });

  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      hidePreview();
      if (state.open) dispatch({ type: 'ESCAPE' });
    }
  });

  win.addEventListener('hashchange', () => {
    const id = (win.location.hash || '').slice(1);
    if (PANEL_IDS.includes(id)) {
      openPanel(id, { updateUrl: false, focus: false, restartRotate: true });
    } else if (id === 'founder-mark' || id === 'founder-gabriel') {
      openPanel('mission', { updateUrl: false, focus: false, restartRotate: true });
      raf(() => scrollToFounder(id === 'founder-mark' ? 'mark' : 'gabriel'));
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

  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') {
      clearRotateTimer();
    } else if (rotating && openId && !rotateHold) {
      scheduleRotate();
    }
  });

  // --- Scrolled chrome (contact section / footer) -------------------------
  let pending = false;

  function updateScrollChrome() {
    pending = false;
    header.setAttribute('data-scrolled', String(isScrolled(win.scrollY || 0)));
    const contact = doc.getElementById('contact');
    if (!contact) return;
    const r = contact.getBoundingClientRect();
    const vh = win.innerHeight || 0;
    const onContact = r.top < vh * 0.4 && r.bottom > 80;
    if (onContact) applyActive('contact');
    else if (openId) applyActive(openId);
    else applyActive(null);
  }

  function schedule() {
    if (pending) return;
    pending = true;
    raf(updateScrollChrome);
  }

  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', schedule, { passive: true });
  updateScrollChrome();

  // Re-check mission hold on resize (overflow may appear/disappear).
  win.addEventListener(
    'resize',
    () => {
      if (openId !== 'mission' || !rotating) return;
      const wasHeld = rotateHold;
      evaluateMissionHold();
      if (wasHeld !== rotateHold) {
        if (rotateHold) {
          clearRotateTimer();
          syncIndicator(openId);
        } else {
          scheduleRotate();
        }
      }
    },
    { passive: true },
  );

  // --- Breakpoint ---------------------------------------------------------
  function onBreakpoint() {
    dispatch({ type: 'BREAKPOINT', isMobile: isMobileNow() });
  }

  if (mql) {
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onBreakpoint);
    else if (typeof mql.addListener === 'function') mql.addListener(onBreakpoint);
  } else {
    let lastMobile = state.isMobile;
    win.addEventListener(
      'resize',
      () => {
        const m = isMobileNow();
        if (m !== lastMobile) {
          lastMobile = m;
          onBreakpoint();
        }
      },
      { passive: true },
    );
  }
}
