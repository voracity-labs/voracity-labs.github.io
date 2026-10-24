// Hero animation simulation. Deterministic and DOM-free; every function
// returns new state and never mutates its inputs.

/**
 * @typedef {Object} Node
 * @property {number} x     CSS px, 0 <= x < w
 * @property {number} y     CSS px, 0 <= y < h
 * @property {number} vx    base drift, CSS px / ms
 * @property {number} vy    base drift, CSS px / ms
 * @property {number} r     radius CSS px, 1.0..2.2
 * @property {0|1} tint     index into PALETTE.node
 * @property {number} glow  0..1, set by pulses / lens, decays
 */

/**
 * @typedef {Object} Pulse
 * @property {number[]} path   node indices, length >= 2
 * @property {number} hop      index of the link being travelled (path[hop] -> path[hop + 1])
 * @property {number} progress 0..1 along the current hop
 */

/**
 * @typedef {Object} FieldState
 * @property {number} w
 * @property {number} h
 * @property {number} t          accumulated ms
 * @property {Node[]} nodes
 * @property {Pulse[]} pulses
 * @property {number} rngState   mulberry32 state (uint32)
 */

/** @typedef {{x:number, y:number}} Point */

// ---- Tunables -------------------------------------------------------------

/** Pointer lens radius in CSS px. */
export const LENS_RADIUS = 200;
/** Peak lens pull, CSS px / ms, at the pointer with full strength. */
export const LENS_PULL = 0.06;
/** Lens strength rise time (0 -> 1) and fall time (1 -> 0), ms. */
export const LENS_RISE_MS = 120;
export const LENS_FALL_MS = 600;
/** Largest simulated frame duration, ms. */
export const MAX_DT_MS = 50;
/** Nodes closer than this are linked (renderer uses the same value). */
export const LINK_DISTANCE = 120;

const FLOW_SPEED = 0.008;      // px / ms, analytic flow field amplitude
const FLOW_FREQ = 0.0035;      // spatial frequency, 1 / px
const DRIFT_MIN = 0.002;       // px / ms, per-node base drift
const DRIFT_MAX = 0.006;
const R_MIN = 1.0;
const R_MAX = 2.2;
const MINT_SHARE = 0.3;        // fraction of nodes tinted mint
const GLOW_DECAY_MS = 800;     // full glow fades over this long
const LENS_GLOW = 0.5;         // peak glow from the lens alone

const PULSE_INTERVAL_MS = 2500;      // mean time between ambient pulses
const PULSE_LENS_INTERVAL_MS = 900;  // mean interval added by a full-strength lens
const PULSE_HOP_MS = 220;            // time to travel one link
const PULSE_MAX_HOPS = 4;
const MAX_PULSES = 4;

// ---- PRNG (mulberry32) ----------------------------------------------------

/**
 * One mulberry32 step.
 * @param {number} s uint32 state
 * @returns {[number, number]} [value in [0, 1), next uint32 state]
 */
function mulberry32(s) {
  const a = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a >>> 0];
}

/** Local sequential RNG over an immutable seed; read `.state` when done. */
function makeRng(state) {
  let s = state >>> 0;
  return {
    next() {
      const [v, ns] = mulberry32(s);
      s = ns;
      return v;
    },
    get state() {
      return s;
    },
  };
}

// ---- Helpers --------------------------------------------------------------

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function clampDt(dtMs) {
  return Number.isFinite(dtMs) ? clamp(dtMs, 0, MAX_DT_MS) : 0;
}

function safeSize(v) {
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/** Wrap v into [0, m). Guards the float case where v % m + m rounds to m. */
function wrap(v, m) {
  if (!Number.isFinite(v)) return 0;
  let r = v % m;
  if (r < 0) r += m;
  if (r >= m) r = 0;
  return r;
}

/** Clamp v into [0, m) without wrapping (used by remap). */
function clampBelow(v, m) {
  if (!Number.isFinite(v) || v < 0) return 0;
  if (v >= m) return m * (1 - Number.EPSILON);
  return v;
}

function makeNode(rng, w, h) {
  const angle = rng.next() * Math.PI * 2;
  const speed = DRIFT_MIN + rng.next() * (DRIFT_MAX - DRIFT_MIN);
  return {
    x: rng.next() * w,
    y: rng.next() * h,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: R_MIN + rng.next() * (R_MAX - R_MIN),
    tint: rng.next() < MINT_SHARE ? 1 : 0,
    glow: 0,
  };
}

// ---- Public API -----------------------------------------------------------

/**
 * Build a deterministic initial field.
 * @param {number} seed
 * @param {number} count  number of nodes (non-negative integer)
 * @param {number} w      CSS px
 * @param {number} h      CSS px
 * @returns {FieldState}
 */
export function createField(seed, count, w, h) {
  const W = safeSize(w);
  const H = safeSize(h);
  const rng = makeRng(Number.isFinite(seed) ? seed : 0);
  const n = Math.max(0, Math.floor(count) || 0);
  const nodes = [];
  for (let i = 0; i < n; i++) nodes.push(makeNode(rng, W, H));
  return { w: W, h: H, t: 0, nodes, pulses: [], rngState: rng.state };
}

/**
 * Pointer lens pull on a node. Points toward the pointer with magnitude
 * `LENS_PULL * s * (1 - d / LENS_RADIUS)` for d < LENS_RADIUS, else zero.
 * Zero when the pointer is null, s <= 0, or the node sits on the pointer.
 * @param {{x:number, y:number}} node
 * @param {Point | null} pointer
 * @param {number} lensStrength  0..1
 * @returns {{x:number, y:number}}  velocity contribution, CSS px / ms
 */
export function lensForce(node, pointer, lensStrength) {
  const zero = { x: 0, y: 0 };
  if (!pointer) return zero;
  const s = clamp(Number.isFinite(lensStrength) ? lensStrength : 0, 0, 1);
  if (s === 0) return zero;
  const dx = pointer.x - node.x;
  const dy = pointer.y - node.y;
  const d = Math.hypot(dx, dy);
  if (!(d < LENS_RADIUS) || d === 0) return zero;
  const mag = LENS_PULL * s * (1 - d / LENS_RADIUS);
  return { x: (mag * dx) / d, y: (mag * dy) / d };
}

/**
 * Advance lens strength linearly: up over LENS_RISE_MS while the pointer is
 * inside, down over LENS_FALL_MS while outside. Result is clamped to [0, 1],
 * so it reaches exactly 0 within LENS_FALL_MS (< 1 s) after the pointer leaves.
 * @param {number} current
 * @param {boolean} pointerInside
 * @param {number} dtMs  clamped to [0, MAX_DT_MS]
 * @returns {number}
 */
export function nextLensStrength(current, pointerInside, dtMs) {
  const c = clamp(Number.isFinite(current) ? current : 0, 0, 1);
  const dt = clampDt(dtMs);
  const next = pointerInside ? c + dt / LENS_RISE_MS : c - dt / LENS_FALL_MS;
  return clamp(next, 0, 1);
}

/** Index of the nearest node to `p` within LENS_RADIUS, or -1. */
function nearestInLens(nodes, p) {
  let best = -1;
  let bestD = LENS_RADIUS;
  for (let i = 0; i < nodes.length; i++) {
    const d = Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Random walk over links (no revisits) starting at `start`. */
function buildPath(nodes, start, rng) {
  const path = [start];
  const visited = new Set(path);
  let cur = start;
  for (let hop = 0; hop < PULSE_MAX_HOPS; hop++) {
    const a = nodes[cur];
    const candidates = [];
    for (let j = 0; j < nodes.length; j++) {
      if (visited.has(j)) continue;
      if (Math.hypot(nodes[j].x - a.x, nodes[j].y - a.y) < LINK_DISTANCE) candidates.push(j);
    }
    if (candidates.length === 0) break;
    cur = candidates[Math.floor(rng.next() * candidates.length)];
    path.push(cur);
    visited.add(cur);
  }
  return path;
}

/**
 * Advance pulses by dt. A pulse lights the node it arrives at and is removed
 * once it has travelled its last hop.
 * @returns {Pulse[]}
 */
function advancePulses(pulses, dt, nodes) {
  const out = [];
  for (const p of pulses) {
    let hop = p.hop;
    let progress = p.progress + dt / PULSE_HOP_MS;
    while (progress >= 1 && hop < p.path.length - 1) {
      progress -= 1;
      hop += 1;
      const n = nodes[p.path[hop]];
      if (n) n.glow = 1;
    }
    if (hop < p.path.length - 1) out.push({ path: p.path, hop, progress });
  }
  return out;
}

/**
 * One simulation step. Returns a new state; the input is untouched.
 * @param {FieldState} state
 * @param {number} dtMs                clamped to [0, MAX_DT_MS]
 * @param {Point | null} pointer       CSS px, or null when outside
 * @param {number} lensStrength        0..1
 * @returns {FieldState}
 */
export function step(state, dtMs, pointer, lensStrength) {
  const dt = clampDt(dtMs);
  const { w, h } = state;
  const t = state.t + dt;
  const s = clamp(Number.isFinite(lensStrength) ? lensStrength : 0, 0, 1);
  const lensOn = !!pointer && s > 0;
  const decay = dt / GLOW_DECAY_MS;

  const nodes = state.nodes.map((n) => {
    // Analytic flow field plus the node's own drift.
    const fx = Math.sin(n.y * FLOW_FREQ + t * 0.00011) * FLOW_SPEED + n.vx;
    const fy = Math.cos(n.x * FLOW_FREQ - t * 0.00009) * FLOW_SPEED + n.vy;
    let x = n.x + fx * dt;
    let y = n.y + fy * dt;
    let glow = Math.max(0, n.glow - decay);

    if (lensOn) {
      const f = lensForce(n, pointer, s);
      if (f.x !== 0 || f.y !== 0) {
        // Never overshoot the pointer in one step.
        const dx = pointer.x - n.x;
        const dy = pointer.y - n.y;
        const d = Math.hypot(dx, dy);
        const k = Math.min(1, d / (Math.hypot(f.x, f.y) * dt || Infinity));
        x += f.x * dt * k;
        y += f.y * dt * k;
        glow = Math.max(glow, LENS_GLOW * s * (1 - d / LENS_RADIUS));
      }
    }

    return { x: wrap(x, w), y: wrap(y, h), vx: n.vx, vy: n.vy, r: n.r, tint: n.tint, glow };
  });

  let pulses = advancePulses(state.pulses, dt, nodes);

  // Spawn: one Bernoulli draw per step, rate boosted by the lens.
  const rng = makeRng(state.rngState);
  if (nodes.length > 1 && dt > 0) {
    const rate = 1 / PULSE_INTERVAL_MS + (lensOn ? s / PULSE_LENS_INTERVAL_MS : 0);
    if (rng.next() < rate * dt && pulses.length < MAX_PULSES) {
      const near = lensOn ? nearestInLens(nodes, pointer) : -1;
      const useNear = near >= 0 && rng.next() < 0.7 * s;
      const start = useNear ? near : Math.floor(rng.next() * nodes.length);
      const path = buildPath(nodes, start, rng);
      if (path.length >= 2) {
        nodes[start].glow = 1;
        pulses = pulses.concat([{ path, hop: 0, progress: 0 }]);
      }
    }
  }

  return { w, h, t, nodes, pulses, rngState: rng.state };
}

/**
 * Remap node positions proportionally to new dimensions. Radii are unchanged
 * and every node ends up within 0 <= x < newW, 0 <= y < newH.
 * @param {FieldState} state
 * @param {number} oldW
 * @param {number} oldH
 * @param {number} newW
 * @param {number} newH
 * @returns {FieldState}
 */
export function remap(state, oldW, oldH, newW, newH) {
  const W = safeSize(newW);
  const H = safeSize(newH);
  const sx = W / safeSize(oldW);
  const sy = H / safeSize(oldH);
  const nodes = state.nodes.map((n) => ({
    ...n,
    x: clampBelow(n.x * sx, W),
    y: clampBelow(n.y * sy, H),
  }));
  return { ...state, w: W, h: H, nodes, pulses: state.pulses.slice() };
}

/**
 * Grow or trim the node list to `count`, keeping existing nodes as they are.
 * New nodes come from the state's PRNG. Pulses that reference trimmed nodes
 * are dropped.
 * @param {FieldState} state
 * @param {number} count
 * @returns {FieldState}
 */
export function resizeNodes(state, count) {
  const n = Math.max(0, Math.floor(count) || 0);
  const cur = state.nodes.length;
  if (n === cur) return { ...state, nodes: state.nodes.slice(), pulses: state.pulses.slice() };
  if (n < cur) {
    return {
      ...state,
      nodes: state.nodes.slice(0, n),
      pulses: state.pulses.filter((p) => p.path.every((i) => i < n)),
    };
  }
  const rng = makeRng(state.rngState);
  const nodes = state.nodes.slice();
  for (let i = cur; i < n; i++) nodes.push(makeNode(rng, state.w, state.h));
  return { ...state, nodes, pulses: state.pulses.slice(), rngState: rng.state };
}
