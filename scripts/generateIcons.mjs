// Pure-Node PNG generator (no external deps).
// Disegna l'icon set EarthRadar: globo stilizzato + sweep radar ciano→magenta + data points,
// su sfondo space gradient. Stesso pipeline di MeteorWatch, identità diversa.
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'public', 'icons');

if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(width, height, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(c1, c2, t) {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

function setPixel(buf, w, x, y, r, g, b, a) {
  const i = (y * w + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function compositePixel(buf, w, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= w || y >= w) return;
  const i = (y * w + x) * 4;
  const srcA = a / 255;
  const dstA = buf[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;
  buf[i] = Math.round((r * srcA + buf[i] * dstA * (1 - srcA)) / outA);
  buf[i + 1] = Math.round((g * srcA + buf[i + 1] * dstA * (1 - srcA)) / outA);
  buf[i + 2] = Math.round((b * srcA + buf[i + 2] * dstA * (1 - srcA)) / outA);
  buf[i + 3] = Math.round(outA * 255);
}

function drawDisk(buf, size, cx, cy, r, R, G, B, A) {
  const r2 = r * r;
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(size - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(size - 1, Math.ceil(cy + r));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const dist = Math.sqrt(d2);
      const edge = Math.max(0, 1 - Math.max(0, dist - (r - 1)));
      compositePixel(buf, size, x, y, R, G, B, Math.round(A * edge));
    }
  }
}

function drawRing(buf, size, cx, cy, r, thickness, R, G, B, A) {
  const rOuter = r + thickness / 2;
  const rInner = r - thickness / 2;
  const minX = Math.max(0, Math.floor(cx - rOuter));
  const maxX = Math.min(size - 1, Math.ceil(cx + rOuter));
  const minY = Math.max(0, Math.floor(cy - rOuter));
  const maxY = Math.min(size - 1, Math.ceil(cy + rOuter));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < rInner - 1 || d > rOuter + 1) continue;
      const fade = 1 - Math.min(1, Math.abs(d - r) / (thickness / 2));
      const a = Math.round(A * Math.max(0, fade));
      compositePixel(buf, size, x, y, R, G, B, a);
    }
  }
}

function drawEllipseRing(buf, size, cx, cy, rx, ry, thickness, R, G, B, A) {
  const minX = Math.max(0, Math.floor(cx - rx - 2));
  const maxX = Math.min(size - 1, Math.ceil(cx + rx + 2));
  const minY = Math.max(0, Math.floor(cy - ry - 2));
  const maxY = Math.min(size - 1, Math.ceil(cy + ry + 2));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.92 || d > 1.08) continue;
      const fade = 1 - Math.min(1, Math.abs(d - 1) / (thickness / Math.min(rx, ry)));
      const a = Math.round(A * Math.max(0, fade));
      compositePixel(buf, size, x, y, R, G, B, a);
    }
  }
}

function drawSweep(buf, size, cx, cy, rOuter, rInner, startDeg, endDeg, c1, c2, alpha) {
  const minX = Math.max(0, Math.floor(cx - rOuter));
  const maxX = Math.min(size - 1, Math.ceil(cx + rOuter));
  const minY = Math.max(0, Math.floor(cy - rOuter));
  const maxY = Math.min(size - 1, Math.ceil(cy + rOuter));
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > rOuter || d < rInner) continue;
      let a = Math.atan2(dy, dx);
      if (a < 0) a += Math.PI * 2;
      const norm = startRad <= endRad
        ? a >= startRad && a <= endRad
        : a >= startRad || a <= endRad;
      if (!norm) continue;
      const t = (a - startRad + Math.PI * 2) % (Math.PI * 2);
      const total = (endRad - startRad + Math.PI * 2) % (Math.PI * 2);
      const ratio = total === 0 ? 0 : t / total;
      const c = lerpColor(c1, c2, ratio);
      // Fade alpha verso il bordo esterno e i bordi angolari per look "sweep"
      const radialFade = 1 - (d - rInner) / (rOuter - rInner);
      const edgeFade = Math.min(ratio, 1 - ratio) * 4;
      const finalA = Math.round(alpha * radialFade * Math.min(1, edgeFade));
      compositePixel(buf, size, x, y, c[0], c[1], c[2], finalA);
    }
  }
}

function drawIcon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  // Background gradient (top space-700 -> bottom space-900)
  const cTop = [11, 17, 41];
  const cBot = [3, 5, 12];

  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const [r, g, b] = lerpColor(cTop, cBot, t);
    for (let x = 0; x < size; x++) {
      let alpha = 255;
      if (!maskable) {
        const radius = size * 0.22;
        const dx = Math.max(0, Math.abs(x - cx) - (cx - radius));
        const dy = Math.max(0, Math.abs(y - cy) - (cy - radius));
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius) alpha = 0;
        else if (d > radius - 1) alpha = Math.round(255 * (radius - d));
      }
      if (alpha > 0) {
        setPixel(px, size, x, y, r, g, b, alpha);
      } else {
        setPixel(px, size, x, y, 0, 0, 0, 0);
      }
    }
  }

  // Globo: cerchio + ellisse equatoriale + meridiano
  const globeR = size * 0.32;
  drawRing(px, size, cx, cy, globeR, Math.max(2, size * 0.014), 92, 240, 255, 230);
  drawEllipseRing(px, size, cx, cy, globeR, globeR * 0.4, Math.max(2, size * 0.012), 92, 240, 255, 160);
  // Meridiano (cerchio prospettico verticale = ellisse stretta)
  drawEllipseRing(px, size, cx, cy, globeR * 0.4, globeR, Math.max(2, size * 0.012), 92, 240, 255, 130);

  // Sweep radar dal centro: arco ciano→magenta, 90° in alto-destra
  drawSweep(
    px,
    size,
    cx,
    cy,
    globeR * 1.05,
    size * 0.04,
    300, // start deg (alto-destra)
    30, // end deg
    [92, 240, 255],
    [255, 92, 208],
    220,
  );

  // Punti dati sul globo
  const dataPoints = [
    { x: 0.62, y: 0.36, c: [255, 92, 208], r: 0.018 },
    { x: 0.38, y: 0.48, c: [251, 191, 36], r: 0.014 },
    { x: 0.66, y: 0.64, c: [92, 240, 255], r: 0.016 },
    { x: 0.45, y: 0.62, c: [255, 255, 255], r: 0.012 },
  ];
  for (const p of dataPoints) {
    drawDisk(px, size, p.x * size, p.y * size, size * p.r * 1.8, p.c[0], p.c[1], p.c[2], 70);
    drawDisk(px, size, p.x * size, p.y * size, size * p.r, p.c[0], p.c[1], p.c[2], 240);
  }

  // Centro luminoso (origine radar)
  drawDisk(px, size, cx, cy, size * 0.025, 92, 240, 255, 255);
  drawDisk(px, size, cx, cy, size * 0.05, 92, 240, 255, 90);

  // Stelline ai bordi
  const stars = [
    { x: 0.18, y: 0.2, c: [255, 255, 255] },
    { x: 0.82, y: 0.18, c: [92, 240, 255] },
    { x: 0.18, y: 0.82, c: [255, 92, 208] },
    { x: 0.82, y: 0.78, c: [255, 255, 255] },
  ];
  for (const s of stars) {
    drawDisk(px, size, s.x * size, s.y * size, size * 0.012, s.c[0], s.c[1], s.c[2], 220);
    drawDisk(px, size, s.x * size, s.y * size, size * 0.025, s.c[0], s.c[1], s.c[2], 60);
  }

  // Safe inset per maskable
  if (maskable) {
    const inset = size * 0.1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (x < inset || y < inset || x > size - inset || y > size - inset) {
          const i = (y * size + x) * 4;
          px[i] = Math.round(px[i] * 0.6);
          px[i + 1] = Math.round(px[i + 1] * 0.6);
          px[i + 2] = Math.round(px[i + 2] * 0.6);
        }
      }
    }
  }

  return makePng(size, size, px);
}

const TARGETS = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180 },
];

for (const t of TARGETS) {
  const png = drawIcon(t.size, { maskable: t.maskable });
  await writeFile(path.join(outDir, t.name), png);
  console.log(`  ✓ ${t.name} (${t.size}×${t.size}, ${png.length.toLocaleString()} bytes)`);
}
console.log('Icons generated in', outDir);
