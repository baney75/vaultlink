import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';

// Same 64-unit geometry as public/brand.svg and src/components/Brand.tsx.
const GROUND = [0x13, 0x3a, 0x32], VAULT = [0xf3, 0xf0, 0xe4], WEB = [0x7d, 0xc9, 0xa5];
const TILE_RADIUS = 15, LEAF_RADIUS = 4.5, KEYLINE = 2;
const APEX = [32, 46], VAULT_TOP = [19, 18], WEB_TOP = [45, 18];
// inset: transparent margin in output pixels. weight: optical thickening for small sizes.
const SIZES = [{ n: 16, inset: 0, weight: 1.12 }, { n: 32, inset: 1, weight: 1.05 }, { n: 48, inset: 2, weight: 1 }, { n: 128, inset: 8, weight: 1 }];
const SAMPLES = 8;

function crc32(b) { let c = 0xffffffff; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function chunk(t, d) { const b = Buffer.from(t), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(d.length); c.writeUInt32BE(crc32(Buffer.concat([b, d]))); return Buffer.concat([l, b, d, c]); }
function segment(x, y, [x1, y1], [x2, y2]) { const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2))); return Math.hypot(x - (x1 + t * (x2 - x1)), y - (y1 + t * (y2 - y1))); }
function insideTile(x, y) { const e = 32 - TILE_RADIUS; return Math.hypot(Math.max(0, Math.abs(x - 32) - e), Math.max(0, Math.abs(y - 32) - e)) <= TILE_RADIUS; }
function sample(x, y, leaf) {
  if (!insideTile(x, y)) return null;
  const vault = segment(x, y, VAULT_TOP, APEX);
  if (vault <= leaf) return VAULT;
  if (vault <= leaf + KEYLINE) return GROUND;
  return segment(x, y, WEB_TOP, APEX) <= leaf ? WEB : GROUND;
}
function render({ n, inset, weight }) {
  const raw = Buffer.alloc((n * 4 + 1) * n), span = n - inset * 2, leaf = LEAF_RADIUS * weight;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let r = 0, g = 0, b = 0, hits = 0;
    for (let sy = 0; sy < SAMPLES; sy++) for (let sx = 0; sx < SAMPLES; sx++) {
      const color = sample((x + (sx + .5) / SAMPLES - inset) / span * 64, (y + (sy + .5) / SAMPLES - inset) / span * 64, leaf);
      if (!color) continue;
      r += color[0]; g += color[1]; b += color[2]; hits++;
    }
    const i = y * (n * 4 + 1) + 1 + x * 4;
    if (hits) { raw[i] = Math.round(r / hits); raw[i + 1] = Math.round(g / hits); raw[i + 2] = Math.round(b / hits); }
    raw[i + 3] = Math.round(hits / SAMPLES ** 2 * 255);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(n); header.writeUInt32BE(n, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

await mkdir('public/icons', { recursive: true });
for (const size of SIZES) await writeFile(`public/icons/icon-${size.n}.png`, render(size));
