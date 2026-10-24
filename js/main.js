// Entry point. Sets up nav, reveal, and the footer year, then loads the hero
// animation separately so a failure there can't break the rest of the page.

import { initNav } from './nav.js';
import { initReveal } from './reveal.js';

// Each enhancement is isolated: one throwing must not break the others.
const safely = (label, fn) => {
  try {
    fn();
  } catch (err) {
    console.error(`[voracity] ${label} failed:`, err);
  }
};

safely('nav', () => initNav(document));
safely('reveal', () => initReveal(document));
safely('year', () => {
  const year = String(new Date().getFullYear());
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = year;
  });
});

const heroFallback = () => {
  document.documentElement.classList.add('hero-fallback'); // static gradient stays
};

const startHero = async () => {
  const heroEl = document.querySelector('.hero');
  const canvas = document.querySelector('.hero-canvas');
  if (!heroEl || !canvas) {
    heroFallback();
    return;
  }
  try {
    const { createController } = await import('./animation-controller.js');
    createController(heroEl, canvas);
  } catch (err) {
    console.error('[voracity] hero failed:', err);
    heroFallback();
  }
};

// Defer the hero until after load so it never competes with first paint.
if (document.readyState === 'complete') {
  startHero();
} else {
  window.addEventListener('load', startHero, { once: true });
}
