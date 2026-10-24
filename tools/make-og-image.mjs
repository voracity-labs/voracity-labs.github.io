// Dev-only: generates assets/og-image.png (1200x630) using only Node built-ins.
// Usage: node tools/make-og-image.mjs
// Output is deterministic (fixed PRNG seed). Replace with a designed asset any time.
// The wordmark geometry mirrors the inline SVG logo in index.html.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const W = 1200;
const H = 630;
const SEED = 0x5eed1a65;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG = hex('#07090F');
const VIOLET = hex('#8B7CFF');
const MINT = hex('#7CF7C5');
const TEXT = hex('#E8ECF4');

// --- deterministic PRNG (mulberry32) ---
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);

// --- float RGB framebuffer ---
const buf = new Float32Array(W * H * 3);
for (let i = 0; i < W * H; i++) buf.set(BG, i * 3);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function blend(x, y, color, a) {
  if (a <= 0) return;
  const i = (y * W + x) * 3;
  for (let c = 0; c < 3; c++) buf[i + c] += (color[c] - buf[i + c]) * a;
}

function fillRect(x0, y0, x1, y1, color, a) {
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) blend(x, y, color, a);
}

// Stroke coverage of one segment at pixel center (px, py). Each end is either
// round (joints, round caps) or butt (flat, perpendicular to the segment).
function segCoverage(px, py, ax, ay, bx, by, r, roundA, roundB) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return clamp01(r + 0.5 - Math.hypot(px - ax, py - ay));
  const ux = dx / len, uy = dy / len;
  const along = (px - ax) * ux + (py - ay) * uy;
  if (along < 0 && roundA) return clamp01(r + 0.5 - Math.hypot(px - ax, py - ay));
  if (along > len && roundB) return clamp01(r + 0.5 - Math.hypot(px - bx, py - by));
  const perp = Math.abs((px - ax) * uy - (py - ay) * ux);
  const outside = Math.max(-along, along - len);
  return clamp01(r + 0.5 - perp) * clamp01(0.5 - outside);
}

// Anti-aliased strokes. Coverage is max-accumulated across all segments in the
// group so joints between segments don't double-blend.
function strokeGroup(polylines, width, color, alpha, cap = 'round') {
  const r = width / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pl of polylines)
    for (const [x, y] of pl) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  const x0 = Math.max(0, Math.floor(minX - r - 1)), y0 = Math.max(0, Math.floor(minY - r - 1));
  const x1 = Math.min(W - 1, Math.ceil(maxX + r + 1)), y1 = Math.min(H - 1, Math.ceil(maxY + r + 1));
  const bw = x1 - x0 + 1;
  const cov = new Float32Array(bw * (y1 - y0 + 1));
  for (const pl of polylines) {
    const last = pl[pl.length - 1];
    const closed = pl.length > 2 && Math.hypot(pl[0][0] - last[0], pl[0][1] - last[1]) < 1e-6;
    for (let s = 0; s < pl.length - 1; s++) {
      const [ax, ay] = pl[s], [bx, by] = pl[s + 1];
      const roundA = cap === 'round' || s > 0 || closed;
      const roundB = cap === 'round' || s < pl.length - 2 || closed;
      const sx0 = Math.max(x0, Math.floor(Math.min(ax, bx) - r - 1));
      const sx1 = Math.min(x1, Math.ceil(Math.max(ax, bx) + r + 1));
      const sy0 = Math.max(y0, Math.floor(Math.min(ay, by) - r - 1));
      const sy1 = Math.min(y1, Math.ceil(Math.max(ay, by) + r + 1));
      for (let y = sy0; y <= sy1; y++)
        for (let x = sx0; x <= sx1; x++) {
          const c = segCoverage(x + 0.5, y + 0.5, ax, ay, bx, by, r, roundA, roundB);
          const k = (y - y0) * bw + (x - x0);
          if (c > cov[k]) cov[k] = c;
        }
    }
  }
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) blend(x, y, color, cov[(y - y0) * bw + (x - x0)] * alpha);
}

// Anti-aliased polygon fill, 4x4 supersampling, even-odd rule.
function fillPolygon(pts, color, alpha) {
  const SS = 4;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      let n = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
          let inside = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const [xi, yi] = pts[i], [xj, yj] = pts[j];
            if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
          }
          if (inside) n++;
        }
      blend(x, y, color, (n / (SS * SS)) * alpha);
    }
}

function disc(cx, cy, r, color, alpha) {
  for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(H - 1, Math.ceil(cy + r + 1)); y++)
    for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(W - 1, Math.ceil(cx + r + 1)); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      blend(x, y, color, clamp01(r + 0.5 - d) * alpha);
    }
}

function glow(cx, cy, R, color, alpha) {
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, Math.ceil(cy + R)); y++)
    for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, Math.ceil(cx + R)); x++) {
      const t = 1 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
      if (t > 0) blend(x, y, color, t * t * alpha);
    }
}

// --- node/link field ---
const nodes = [];
for (let i = 0; i < 90; i++) {
  nodes.push({
    x: rand() * W,
    y: rand() * H,
    r: 1.5 + rand() * 2.5,
    color: rand() < 0.7 ? VIOLET : MINT,
  });
}
const LINK_DIST = 170;
for (let i = 0; i < nodes.length; i++)
  for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < LINK_DIST) strokeGroup([[[a.x, a.y], [b.x, b.y]]], 1.2, VIOLET, 0.45 * (1 - d / LINK_DIST));
  }
for (const n of nodes) {
  if (n.color === MINT) glow(n.x, n.y, n.r * 5, MINT, 0.25);
  disc(n.x, n.y, n.r, n.color, 0.95);
}

// --- text plate (keeps the wordmark legible over the field) ---
const PLATE = { x0: 120, y0: 215, x1: 1080, y1: 415 };
fillRect(PLATE.x0, PLATE.y0, PLATE.x1, PLATE.y1, BG, 0.72);

// --- wordmark: same geometry as the inline SVG logo in index.html ---------
// Logo units: cap height 100, heavy strokes 13, light strokes 5.
function arc(cx, cy, rx, ry, a0, a1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
function cubicPath(start, segs, n = 20) {
  const pts = [start];
  let p0 = start;
  for (const [p1, p2, p3] of segs) {
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t;
      pts.push([
        k0 * p0[0] + k1 * p1[0] + k2 * p2[0] + k3 * p3[0],
        k0 * p0[1] + k1 * p1[1] + k2 * p2[1] + k3 * p3[1],
      ]);
    }
    p0 = p3;
  }
  return pts;
}

const C_CX = 516.5 - Math.sqrt(44.5 ** 2 - 31.5 ** 2); // center of the C's arc
const C_DEG = (Math.atan2(31.5, 516.5 - C_CX) * 180) / Math.PI;
const LOGO = {
  // V and both A's (no crossbar) are filled shapes with sharp points.
  fills: [
    [[0, 0], [14, 0], [40, 65], [66, 0], [80, 0], [40, 100]],
    [[328, 100], [342, 100], [368, 35], [394, 100], [408, 100], [368, 0]],
    [[936, 100], [941.4, 100], [976, 13.5], [1010.6, 100], [1016, 100], [976, 0]],
  ],
  heavy: [
    arc(157, 50, 44.5, 44.5, 0, 360, 72), // O
    [[240.5, 0], [240.5, 100]], // R
    [[240.5, 6.5], [270, 6.5], ...arc(270, 30.5, 24, 24, -90, 90, 20), [240.5, 54.5]],
    [[268, 54.5], [300, 100]],
    arc(C_CX, 50, 44.5, 44.5, -C_DEG, -(360 - C_DEG), 60), // C
    [[553.5, 0], [553.5, 100]], // I
    [[586, 6.5], [666, 6.5]], // T
    [[626, 6.5], [626, 100]],
    [[697, 0], [737, 52], [777, 0]], // Y
    [[737, 52], [737, 100]],
  ],
  light: [
    [[842.5, 0], [842.5, 97.5], [900, 97.5]], // L
    [[1054.5, 0], [1054.5, 100]], // B
    [[1054.5, 2.5], [1086, 2.5], ...arc(1086, 25.25, 22.75, 22.75, -90, 90, 20), [1054.5, 48]],
    [[1054.5, 48], [1090, 48], ...arc(1090, 72.75, 24.75, 24.75, -90, 90, 20), [1054.5, 97.5]],
    cubicPath([1219, 14], [ // S
      [[1209, 4], [1197, 0], [1185, 0]],
      [[1167, 0], [1157, 11], [1157, 25]],
      [[1157, 40], [1169, 46], [1187, 50]],
      [[1207, 54], [1221, 61], [1221, 76]],
      [[1221, 91], [1207, 100], [1187, 100]],
      [[1173, 100], [1161, 95], [1153, 85]],
    ]),
  ],
};

/** Draw the logo centered on (cx, cy), `inkW` px wide. */
function drawLogo(cx, cy, inkW, color) {
  const X0 = 0, X1 = 1223.5; // horizontal ink extent, logo units
  const s = inkW / (X1 - X0);
  const ox = cx - ((X0 + X1) / 2) * s, oy = cy - 50 * s;
  const tf = (pl) => pl.map(([x, y]) => [ox + x * s, oy + y * s]);
  for (const poly of LOGO.fills) fillPolygon(tf(poly), color, 1);
  strokeGroup(LOGO.heavy.map(tf), 13 * s, color, 1, 'butt');
  strokeGroup(LOGO.light.map(tf), 5 * s, color, 1, 'butt');
  return { x0: ox + X0 * s, x1: ox + X1 * s };
}

const word = drawLogo(W / 2, 300, 880, TEXT);
// Mint accent rule with a node at each end, echoing the favicon.
const ruleY = 372;
strokeGroup([[[word.x0, ruleY], [word.x0 + 150, ruleY]]], 4, MINT, 1);
disc(word.x0 + 150, ruleY, 6, MINT, 1);

// --- PNG encoding (RGB, 8-bit, adaptive per-row filtering) ---
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const stride = W * 3;
const pixels = Buffer.alloc(H * stride);
for (let i = 0; i < buf.length; i++) pixels[i] = Math.max(0, Math.min(255, Math.round(buf[i])));

const raw = Buffer.alloc(H * (stride + 1));
const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
for (let y = 0; y < H; y++) {
  const row = pixels.subarray(y * stride, (y + 1) * stride);
  const up = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
  for (let i = 0; i < stride; i++) {
    const a = i >= 3 ? row[i - 3] : 0, b = up[i], c = i >= 3 ? up[i - 3] : 0;
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    cand[0][i] = row[i];
    cand[1][i] = (row[i] - a) & 0xff;
    cand[2][i] = (row[i] - b) & 0xff;
    cand[3][i] = (row[i] - ((a + b) >> 1)) & 0xff;
    cand[4][i] = (row[i] - paeth) & 0xff;
  }
  let best = 0, bestScore = Infinity;
  cand.forEach((cb, f) => {
    let s = 0;
    for (const v of cb) s += v < 128 ? v : 256 - v;
    if (s < bestScore) { bestScore = s; best = f; }
  });
  raw[y * (stride + 1)] = best;
  cand[best].copy(raw, y * (stride + 1) + 1);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: truecolor RGB
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outPath = fileURLToPath(new URL('../assets/og-image.png', import.meta.url));
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, png);
console.log(`wrote ${outPath} (${W}x${H}, ${png.length} bytes)`);
