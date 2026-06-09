#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'extension', 'icons');
const SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 4;

function rgba(hex, alpha = 1) {
  const text = String(hex || '').replace(/^#/, '');
  return [
    parseInt(text.slice(0, 2), 16),
    parseInt(text.slice(2, 4), 16),
    parseInt(text.slice(4, 6), 16),
    Math.max(0, Math.min(1, Number(alpha)))
  ];
}

function blend(buffer, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= width) return;
  const offset = (y * width + x) * 4;
  const srcA = color[3];
  const dstA = buffer[offset + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  for (let i = 0; i < 3; i += 1) {
    const dst = buffer[offset + i] / 255;
    const src = color[i] / 255;
    buffer[offset + i] = Math.round(((src * srcA + dst * dstA * (1 - srcA)) / outA) * 255);
  }
  buffer[offset + 3] = Math.round(outA * 255);
}

function eachPixel(width, fn) {
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) fn(x, y);
  }
}

function toSvgCoord(x, y, width) {
  return [(x + 0.5) * 64 / width, (y + 0.5) * 64 / width];
}

function roundedRectContains(px, py, x, y, w, h, r) {
  const innerX = Math.max(x + r, Math.min(px, x + w - r));
  const innerY = Math.max(y + r, Math.min(py, y + h - r));
  const dx = px - innerX;
  const dy = py - innerY;
  return dx * dx + dy * dy <= r * r;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
  const cx = ax + t * vx;
  const cy = ay + t * vy;
  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

function fillRoundedRect(buffer, width, x, y, w, h, r, color) {
  eachPixel(width, (px, py) => {
    const [sx, sy] = toSvgCoord(px, py, width);
    if (roundedRectContains(sx, sy, x, y, w, h, r)) blend(buffer, width, px, py, color);
  });
}

function fillCircle(buffer, width, cx, cy, r, color) {
  const r2 = r * r;
  eachPixel(width, (px, py) => {
    const [sx, sy] = toSvgCoord(px, py, width);
    const dx = sx - cx;
    const dy = sy - cy;
    if (dx * dx + dy * dy <= r2) blend(buffer, width, px, py, color);
  });
}

function strokeCircle(buffer, width, cx, cy, r, strokeWidth, color) {
  const lo = r - strokeWidth / 2;
  const hi = r + strokeWidth / 2;
  eachPixel(width, (px, py) => {
    const [sx, sy] = toSvgCoord(px, py, width);
    const d = Math.hypot(sx - cx, sy - cy);
    if (d >= lo && d <= hi) blend(buffer, width, px, py, color);
  });
}

function strokeLine(buffer, width, ax, ay, bx, by, strokeWidth, color) {
  const radius = strokeWidth / 2;
  eachPixel(width, (px, py) => {
    const [sx, sy] = toSvgCoord(px, py, width);
    if (distanceToSegment(sx, sy, ax, ay, bx, by) <= radius) blend(buffer, width, px, py, color);
  });
}

function downsample(high, highWidth, size) {
  const out = Buffer.alloc(size * size * 4);
  const factor = highWidth / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const acc = [0, 0, 0, 0];
      for (let yy = 0; yy < factor; yy += 1) {
        for (let xx = 0; xx < factor; xx += 1) {
          const offset = ((y * factor + yy) * highWidth + (x * factor + xx)) * 4;
          for (let i = 0; i < 4; i += 1) acc[i] += high[offset + i];
        }
      }
      const count = factor * factor;
      const outOffset = (y * size + x) * 4;
      for (let i = 0; i < 4; i += 1) out[outOffset + i] = Math.round(acc[i] / count);
    }
  }
  return out;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgbaBuffer) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgbaBuffer.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function render(size) {
  const highWidth = size * SUPERSAMPLE;
  const high = Buffer.alloc(highWidth * highWidth * 4);
  fillRoundedRect(high, highWidth, 0, 0, 64, 64, 14, rgba('#060b16'));
  strokeCircle(high, highWidth, 32, 32, 23, 4, rgba('#38bdf8', 0.55));
  strokeLine(high, highWidth, 32, 9, 32, 55, 3, rgba('#94a3b8', 0.45));
  strokeLine(high, highWidth, 9, 32, 55, 32, 3, rgba('#94a3b8', 0.45));
  fillCircle(high, highWidth, 32, 32, 7, rgba('#34d399'));
  fillCircle(high, highWidth, 46, 20, 4, rgba('#38bdf8'));
  fillCircle(high, highWidth, 19, 43, 4, rgba('#fb7185'));
  strokeLine(high, highWidth, 32, 32, 46, 20, 4, rgba('#38bdf8'));
  return encodePng(size, size, downsample(high, highWidth, size));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  fs.writeFileSync(path.join(OUT_DIR, `icon-${size}.png`), render(size));
}

console.log(JSON.stringify({
  outDir: OUT_DIR,
  icons: SIZES.map(size => `icon-${size}.png`)
}, null, 2));
