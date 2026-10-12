#!/usr/bin/env node
/* Draws the SaveTube app icon as a flat PNG in the brand red.
 *
 * Why this exists rather than a hand-made file: the PNG icons on the site
 * were an older green mark, while the favicon and every button use the red
 * one. A phone installing the app therefore showed a logo that existed
 * nowhere else on the site, which read as "wrong build". Rendering the icons
 * from the same geometry as favicon.svg removes the possibility of them
 * drifting apart again.
 *
 * The mark is the same shape as favicon.svg on a 64x64 grid: a rounded red
 * tile, a download arrow cut into it, and an underline that reads as a
 * shelf. Pure zlib + PNG chunks, no image library, so it runs anywhere
 * Node does.
 */

const fs = require("fs");
const zlib = require("zlib");

/* ---- brand colour, taken from favicon.svg's gradient midpoint ---- */
const RED = [0xe6, 0x00, 0x00];

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

/* ---- geometry, mirrored from favicon.svg's paths on a 64-unit grid ---- */

/* Rounded-square tile. Coverage is computed by distance to the rounded
   rect rather than by a shape library so the edge stays smooth at 512px. */
function insideTile(x, y, inset, radius) {
  const lo = inset, hi = 64 - inset;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + radius), hi - radius);
  const cy = Math.min(Math.max(y, lo + radius), hi - radius);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/* Download arrow: a stem plus a chevron head, both white. */
function insideArrow(x, y) {
  /* stem: x in 30..34, y in 15..38 */
  if (x >= 30 && x <= 34 && y >= 15 && y <= 38) return true;
  /* head: the two diagonals of a V, drawn as thin rotated bars */
  const half = 1.7;
  /* left diagonal from (20,28) to (32,40) */
  const t1 = Math.abs((y - 28) - ((x - 20) * (12 / 12))) ;
  if (x >= 20 && x <= 32 && y >= 28 && y <= 40 && t1 <= half) return true;
  /* right diagonal from (32,40) to (44,28) */
  const t2 = Math.abs((y - 40) + ((x - 32) * (12 / 12)));
  if (x >= 32 && x <= 44 && y >= 28 && y <= 40 && t2 <= half) return true;
  return false;
}

/* Underline shelf. */
function insideShelf(x, y) {
  return x >= 17 && x <= 47 && y >= 49 && y <= 53;
}

function render(size) {
  const scale = 64 / size;
  const rows = [];
  /* 4x supersampling: a 1px line drawn at 1x is a jagged staircase on a
     rounded corner, and these files are viewed at 180px on a phone. */
  const SS = 4;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) * scale;
          const py = (y + (sy + 0.5) / SS) * scale;
          let r = 0, g = 0, b = 0, a = 0;
          if (insideTile(px, py, 4, 13)) {
            /* Slight vertical shade so it does not read as a flat sticker. */
            const t = py / 64;
            r = RED[0] * (1 - t * 0.35);
            g = RED[1] * (1 - t * 0.35);
            b = RED[2] * (1 - t * 0.35);
            a = 255;
            if (insideArrow(px, py) || insideShelf(px, py)) { r = 255; g = 255; b = 255; }
          }
          R += r; G += g; B += b; A += a;
        }
      }
      const n = SS * SS;
      const o = 1 + x * 4;
      row[o] = Math.round(R / n);
      row[o + 1] = Math.round(G / n);
      row[o + 2] = Math.round(B / n);
      row[o + 3] = Math.round(A / n);
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    /* bit depth */
  ihdr[9] = 6;    /* RGBA */
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const targets = [
  [512, "icon-512.png"],
  [192, "icon-192.png"],
  [180, "apple-touch-icon.png"],
  [32, "favicon-32.png"],
];

for (const [size, name] of targets) {
  const buf = render(size);
  fs.writeFileSync(name, buf);
  console.log("  " + name + "  " + size + "x" + size + "  " + buf.length + " bytes  (brand red)");
}
console.log("done - icons now match favicon.svg instead of the old green mark");