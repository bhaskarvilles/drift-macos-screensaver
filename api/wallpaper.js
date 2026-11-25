// Renders one still frame of the Drift pattern as a PNG.
// A new random pattern is generated on every request (or fixed with ?seed=).
// Usage: /api/wallpaper?w=1179&h=2556[&seed=123][&density=1]
const { createCanvas } = require('@napi-rs/canvas');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(rand) {
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const grad = (h, x, y, z) => {
    h &= 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  };
  return function noise(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(
      lerp(lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
           lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
           lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  };
}

const palette = [
  [255, 120, 50], [255, 175, 70], [255, 232, 180], [255, 255, 255],
  [150, 200, 255], [90, 140, 255], [170, 120, 255],
  [255, 110, 160], [255, 150, 90], [200, 150, 120]
];
function colorAt(v) {
  v = Math.min(0.9999, Math.max(0, v)) * (palette.length - 1);
  const i = v | 0, f = v - i;
  const a = palette[i], b = palette[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

module.exports = (req, res) => {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const clamp = (v, lo, hi, d) => {
    v = parseInt(v, 10);
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  };
  const W = clamp(q.w, 200, 3200, 1179);
  const H = clamp(q.h, 200, 3200, 2556);
  const seed = clamp(q.seed, 0, 2147483647, (Math.random() * 2147483647) | 0);
  const density = Math.min(3, Math.max(0.3, parseFloat(q.density) || 1));

  const rand = mulberry32(seed);
  const noise = makeNoise(rand);
  const t = rand() * 50;
  const ox = rand() * 100, oy = rand() * 100; // random pan so every wallpaper differs

  const S = Math.min(W, H) / 600;
  const SCALE = 0.0016 / S;
  const count = Math.floor((W * H) / (S * S) / 70 * 1.4 * density);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.6 * S;

  for (let i = 0; i < count; i++) {
    const x = rand() * W, y = rand() * H;
    const nx = x * SCALE + ox, ny = y * SCALE + oy;

    const region = noise(nx * 0.9 + 100, ny * 0.9 + 100, t * 0.6) * 0.5 + 0.5;
    const bright = Math.pow(Math.max(0, (region - 0.28) / 0.72), 1.6);
    const a = bright * (0.35 + 0.65 * rand());
    if (a < 0.03) continue;

    const ang = -0.75 + noise(nx, ny, t) * 4.2 + noise(nx * 2.3, ny * 2.3, t * 1.7 + 9) * 0.9;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const hue = noise(nx * 0.7 + 300, ny * 0.7, t * 0.4) * 0.5 + 0.5;
    const c = colorAt((hue - 0.5) * 2.2 + 0.5 + noise(nx * 3 + 500, ny * 3, t) * 0.15);

    const L = (12 + 22 * bright) * (0.8 + rand() * 0.9) * S;
    const tx = x - dx * L, ty = y - dy * L;
    const g = ctx.createLinearGradient(tx, ty, x, y);
    const rgb = `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(1, `rgba(${rgb},${a.toFixed(3)})`);
    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  const png = canvas.toBuffer('image/png');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).send(png);
};
