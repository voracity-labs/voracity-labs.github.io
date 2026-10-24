// Draws the field.js simulation onto the hero canvas, using PALETTE colors only.

import { computeCanvasSize, particleCount } from '../lib/sizing.js';
import {
  createField,
  step,
  remap,
  resizeNodes,
  nextLensStrength,
  LINK_DISTANCE,
  LENS_RADIUS,
} from './field.js';
import { PALETTE } from './palette.js';

const SEED = 0x5eed1ab5;          // fixed seed: same field on every load
const LINK_ALPHA = 0.32;          // peak link alpha outside the lens
const LINK_LENS_BOOST = 0.4;      // extra link alpha at the lens center, full strength
const NODE_ALPHA = 0.7;           // base node alpha
const NODE_GLOW_ALPHA = 0.3;      // extra node alpha at full glow
const PULSE_LINK_ALPHA = 0.85;
const PULSE_HEAD_R = 2.4;         // CSS px
const ALPHA_BUCKETS = 10;         // links are batched into this many alpha levels

const clampAlpha = (a) => Math.min(PALETTE.maxAlpha, Math.max(0, a));

/**
 * Create the hero renderer for a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{ isMobile?: boolean }} [options]
 */
export function createHero(canvas, { isMobile = false } = {}) {
  const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx) throw new Error('Signal Field: 2D canvas context unavailable');

  // Decorative only: hide from keyboard and screen readers.
  if (typeof canvas.setAttribute === 'function') {
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('tabindex', '-1');
  }

  const win = (canvas.ownerDocument && canvas.ownerDocument.defaultView) || null;

  let mobile = !!isMobile;
  let field = null;
  let cssW = 0;
  let cssH = 0;
  let pointer = null;     // {x, y} in CSS px relative to the canvas, or null
  let lens = 0;           // 0..1
  let lastPointer = null; // last non-null pointer, used while the lens eases out

  /** Resize backing store and field. Optional third arg updates isMobile. */
  function resize(w, h, nextIsMobile) {
    if (typeof nextIsMobile === 'boolean') mobile = nextIsMobile;
    const W = Number.isFinite(w) && w > 0 ? w : 1;
    const H = Number.isFinite(h) && h > 0 ? h : 1;
    const dpr = win && Number.isFinite(win.devicePixelRatio) ? win.devicePixelRatio : 1;
    const size = computeCanvasSize(W, H, dpr);

    canvas.width = size.width;
    canvas.height = size.height;
    if (canvas.style) {
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    }
    // Resizing resets the context, so reapply the scale.
    ctx.setTransform(size.scale, 0, 0, size.scale, 0, 0);

    const count = particleCount(W, H, mobile);
    if (!field) {
      field = createField(SEED, count, W, H);
    } else {
      field = remap(field, cssW, cssH, W, H);
      if (field.nodes.length !== count) field = resizeNodes(field, count);
    }
    cssW = W;
    cssH = H;
    draw(lens, true);
  }

  function setPointer(p) {
    pointer = p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
  }

  /** Advance one animation frame and draw it. */
  function frame(dtMs) {
    if (!field) return;
    lens = nextLensStrength(lens, pointer !== null, dtMs);
    // Keep the last pointer position while the lens eases out, so nodes release smoothly.
    if (pointer) lastPointer = pointer;
    const p = lens > 0 ? pointer || lastPointer : null;
    field = step(field, dtMs, p, lens);
    draw(lens, true, p);
  }

  /** One calm frame: lens off, pulses hidden, time not advanced. */
  function renderStatic() {
    if (!field) return;
    draw(0, false, null);
  }

  // ---- Drawing --------------------------------------------------------------

  function draw(lensStrength, showPulses, lensPoint = null) {
    if (!field) return;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cssW, cssH);
    const lp = lensStrength > 0 ? lensPoint : null;
    drawLinks(field.nodes, lp, lensStrength);
    drawNodes(field.nodes, showPulses);
    if (showPulses) drawPulses(field);
    ctx.globalAlpha = 1;
  }

  /** Links via a uniform grid (cell = LINK_DISTANCE), batched by alpha level. */
  function drawLinks(nodes, lp, s) {
    const n = nodes.length;
    if (n < 2) return;
    const cell = LINK_DISTANCE;
    const cols = Math.max(1, Math.ceil(cssW / cell));
    const rows = Math.max(1, Math.ceil(cssH / cell));
    const grid = new Map();
    for (let i = 0; i < n; i++) {
      const cx = Math.min(cols - 1, Math.floor(nodes[i].x / cell));
      const cy = Math.min(rows - 1, Math.floor(nodes[i].y / cell));
      const key = cy * cols + cx;
      const list = grid.get(key);
      if (list) list.push(i);
      else grid.set(key, [i]);
    }

    const buckets = Array.from({ length: ALPHA_BUCKETS }, () => []);
    const maxD2 = LINK_DISTANCE * LINK_DISTANCE;
    const maxLinkAlpha = clampAlpha(LINK_ALPHA + LINK_LENS_BOOST);

    for (const [key, list] of grid) {
      const cx = key % cols;
      const cy = (key - cx) / cols;
      // Visit each neighbor cell pair once: self + 4 "forward" neighbors.
      for (const [ox, oy] of [[0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
        const nx = cx + ox;
        const ny = cy + oy;
        if (nx < 0 || nx >= cols || ny >= rows) continue;
        const other = ox === 0 && oy === 0 ? list : grid.get(ny * cols + nx);
        if (!other) continue;
        for (let a = 0; a < list.length; a++) {
          const i = list[a];
          const A = nodes[i];
          for (let b = other === list ? a + 1 : 0; b < other.length; b++) {
            const B = nodes[other[b]];
            const dx = A.x - B.x;
            const dy = A.y - B.y;
            const d2 = dx * dx + dy * dy;
            if (d2 >= maxD2) continue;
            let alpha = LINK_ALPHA * (1 - Math.sqrt(d2) / LINK_DISTANCE);
            if (lp) {
              const md = Math.hypot((A.x + B.x) / 2 - lp.x, (A.y + B.y) / 2 - lp.y);
              if (md < LENS_RADIUS) alpha += LINK_LENS_BOOST * s * (1 - md / LENS_RADIUS);
            }
            const k = Math.min(ALPHA_BUCKETS - 1, Math.floor((alpha / maxLinkAlpha) * ALPHA_BUCKETS));
            if (k > 0 || alpha > 0.01) buckets[k].push(A.x, A.y, B.x, B.y);
          }
        }
      }
    }

    ctx.strokeStyle = PALETTE.link;
    ctx.lineWidth = 0.6;
    for (let k = 0; k < ALPHA_BUCKETS; k++) {
      const segs = buckets[k];
      if (segs.length === 0) continue;
      ctx.globalAlpha = clampAlpha(((k + 0.5) / ALPHA_BUCKETS) * maxLinkAlpha);
      ctx.beginPath();
      for (let j = 0; j < segs.length; j += 4) {
        ctx.moveTo(segs[j], segs[j + 1]);
        ctx.lineTo(segs[j + 2], segs[j + 3]);
      }
      ctx.stroke();
    }
  }

  function drawNodes(nodes, showGlow) {
    for (const node of nodes) {
      const glow = showGlow ? node.glow : 0;
      ctx.globalAlpha = clampAlpha(NODE_ALPHA + NODE_GLOW_ALPHA * glow);
      ctx.fillStyle = glow > 0.5 ? PALETTE.pulse : PALETTE.node[node.tint] || PALETTE.node[0];
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r * (1 + 0.4 * glow), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPulses(state) {
    const { nodes, pulses } = state;
    if (pulses.length === 0) return;
    ctx.strokeStyle = PALETTE.pulse;
    ctx.fillStyle = PALETTE.pulse;
    ctx.lineWidth = 1.2;
    for (const p of pulses) {
      const a = nodes[p.path[p.hop]];
      const b = nodes[p.path[p.hop + 1]];
      if (!a || !b) continue;
      // Skip links that wrapped across an edge; they would streak across the canvas.
      if (Math.hypot(b.x - a.x, b.y - a.y) > LINK_DISTANCE * 1.5) continue;
      const hx = a.x + (b.x - a.x) * p.progress;
      const hy = a.y + (b.y - a.y) * p.progress;
      ctx.globalAlpha = clampAlpha(PULSE_LINK_ALPHA);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.globalAlpha = clampAlpha(1);
      ctx.beginPath();
      ctx.arc(hx, hy, PULSE_HEAD_R, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return { resize, frame, renderStatic, setPointer };
}
