// node generate-icons.js
// Gera ícones PNG para PWA sem nenhuma dependência npm — usa apenas Node.js built-in.
// Técnica: escreve PNG raw (IHDR + IDAT com zlib.deflateRawSync + IEND).

'use strict';
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const OUT   = path.join(__dirname, 'icons');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

// ── Paleta de cores (fundo roxo escuro + nave laranja) ──
const BG   = [4,   8,  15, 255]; // #04080f
const C1   = [155, 92, 255, 255]; // #9b5cff violeta
const C2   = [255, 140,  0, 255]; // #ff8c00 laranja
const WHT  = [255, 255, 255, 200]; // branco semi

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function lerpC(ca, cb, t) { return [lerp(ca[0],cb[0],t), lerp(ca[1],cb[1],t), lerp(ca[2],cb[2],t), lerp(ca[3],cb[3],t)]; }

// Desenha pixels RGBA num array flat [r,g,b,a, r,g,b,a ...]
function renderIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const set = (x, y, c) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    // alpha blend sobre o que já existe
    const a = c[3] / 255;
    px[i]   = lerp(px[i],   c[0], a);
    px[i+1] = lerp(px[i+1], c[1], a);
    px[i+2] = lerp(px[i+2], c[2], a);
    px[i+3] = Math.min(255, px[i+3] + c[3]);
  };
  const fillRect = (x, y, w, h, c) => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set(x+dx, y+dy, c);
  };
  const fillCircle = (cx, cy, r, c) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
      if (dx*dx + dy*dy <= r*r) set(cx+dx, cy+dy, c);
  };
  const fillTri = (pts, c) => {
    // scanline
    const ys = pts.map(p=>p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(size-1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      let xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax,ay] = pts[i], [bx,by] = pts[(i+1)%pts.length];
        if ((ay <= y && by > y) || (by <= y && ay > y)) {
          xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
        }
      }
      xs.sort((a,b)=>a-b);
      for (let j = 0; j < xs.length - 1; j += 2)
        for (let x = Math.ceil(xs[j]); x <= Math.floor(xs[j+1]); x++) set(x, y, c);
    }
  };

  const s = size;
  const r = Math.round(s * 0.18); // border-radius

  // Fundo com rounded rect
  fillRect(0, 0, s, s, BG);
  // Cantos arredondados (apaga)
  for (let dy = 0; dy < r; dy++) for (let dx = 0; dx < r; dx++) {
    const dist = Math.sqrt((r-dx-1)**2 + (r-dy-1)**2);
    if (dist > r) {
      set(dx, dy, [0,0,0,0]);             // top-left
      set(s-1-dx, dy, [0,0,0,0]);         // top-right
      set(dx, s-1-dy, [0,0,0,0]);         // bot-left
      set(s-1-dx, s-1-dy, [0,0,0,0]);     // bot-right
    }
  }

  // Halo violeta central
  const hR = Math.round(s * 0.30);
  for (let dy = -hR; dy <= hR; dy++) for (let dx = -hR; dx <= hR; dx++) {
    const d = Math.sqrt(dx*dx+dy*dy);
    if (d < hR) {
      const a = Math.round(55 * (1 - d/hR));
      set(s/2+dx, s/2+dy, [155,92,255,a]);
    }
  }

  // Estrelas
  fillCircle(Math.round(s*0.18), Math.round(s*0.20), Math.max(1,Math.round(s*0.022)), WHT);
  fillCircle(Math.round(s*0.80), Math.round(s*0.16), Math.max(1,Math.round(s*0.016)), [255,200,60,180]);
  fillCircle(Math.round(s*0.84), Math.round(s*0.72), Math.max(1,Math.round(s*0.013)), WHT);

  // Nave (triângulo laranja)
  const tx = s/2, ty0 = s*0.15, ty1 = s*0.74, tw = s*0.26;
  fillTri([[tx, ty0],[tx+tw, ty1],[tx-tw, ty1]], C2);
  // Interior escuro
  fillTri([[tx, ty0+s*0.14],[tx+tw*0.55, ty1-s*0.06],[tx-tw*0.55, ty1-s*0.06]], [10,4,20,230]);
  // Motor (elipse laranja brilhante na base)
  const ey = Math.round(s*0.76), er = Math.round(s*0.09);
  fillCircle(s/2, ey, er, C2);
  fillCircle(s/2, ey, Math.round(er*0.55), [255,240,200,200]);

  return px;
}

// ── Encoder PNG mínimo (sem libs) ──
function u32be(n) { return [(n>>24)&0xff,(n>>16)&0xff,(n>>8)&0xff,n&0xff]; }

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const d = Buffer.from(data);
  const len = u32be(d.length);
  const crcBuf = Buffer.concat([t, d]);
  const crc = u32be(crc32(crcBuf));
  return Buffer.concat([Buffer.from(len), t, d, Buffer.from(crc)]);
}

function encodePNG(pixels, width, height) {
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);

  // IHDR
  const ihdr = Buffer.from([
    ...u32be(width), ...u32be(height),
    8, 6,  // bit depth=8, colorType=6 (RGBA)
    0, 0, 0
  ]);

  // IDAT: filtro tipo 0 (None) por linha
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter byte
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw.push(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]);
    }
  }
  const compressed = zlib.deflateSync(Buffer.from(raw), { level: 6 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Gera todos os tamanhos
for (const size of SIZES) {
  const pixels = renderIcon(size);
  const png    = encodePNG(pixels, size, size);
  const file   = path.join(OUT, `icon-${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`  gerado: icons/icon-${size}.png (${png.length} bytes)`);
}
console.log('\nIcones PWA gerados com sucesso!');
