// Roda uma vez no servidor: node generate-icons.js
// Gera os ícones PWA a partir do favicon.svg usando canvas nativo do Node (via @napi-rs/canvas)
// Se não tiver a lib, usa sharp ou apenas copia o SVG como fallback.

const fs   = require('fs');
const path = require('path');

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const OUT   = path.join(__dirname, 'icons');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

// SVG do ícone — nave espacial estilo arcade com fundo roxo/violeta
const makeSvg = (size) => {
  const s = size;
  const r = Math.round(s * 0.22); // border-radius
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#1a0840"/>
      <stop offset="100%" stop-color="#04080f"/>
    </radialGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#cc88ff"/>
      <stop offset="100%" stop-color="#7722cc"/>
    </linearGradient>
    <linearGradient id="hull" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ff9922"/>
      <stop offset="100%" stop-color="#cc5500"/>
    </linearGradient>
  </defs>
  <!-- Fundo roxo escuro -->
  <rect width="${s}" height="${s}" rx="${r}" fill="url(#bg)"/>
  <!-- Halo atrás da nave -->
  <ellipse cx="${s*0.5}" cy="${s*0.52}" rx="${s*0.30}" ry="${s*0.30}" fill="#9b5cff" opacity="0.18"/>
  <!-- Estrelas -->
  <circle cx="${s*0.18}" cy="${s*0.22}" r="${s*0.025}" fill="#ffffff" opacity="0.7"/>
  <circle cx="${s*0.78}" cy="${s*0.18}" r="${s*0.018}" fill="#ffcc44" opacity="0.9"/>
  <circle cx="${s*0.85}" cy="${s*0.70}" r="${s*0.015}" fill="#ffffff" opacity="0.5"/>
  <circle cx="${s*0.12}" cy="${s*0.75}" r="${s*0.020}" fill="#aaddff" opacity="0.6"/>
  <!-- Nave (triângulo com casco laranja) -->
  <polygon
    points="${s*0.50},${s*0.16} ${s*0.72},${s*0.72} ${s*0.50},${s*0.60} ${s*0.28},${s*0.72}"
    fill="url(#hull)" stroke="#ffdd88" stroke-width="${s*0.018}"/>
  <!-- Interior da nave (mais escuro) -->
  <polygon
    points="${s*0.50},${s*0.30} ${s*0.60},${s*0.64} ${s*0.50},${s*0.56} ${s*0.40},${s*0.64}"
    fill="#1a0420"/>
  <!-- Motor / propulsão (violeta neon) -->
  <ellipse cx="${s*0.50}" cy="${s*0.76}" rx="${s*0.11}" ry="${s*0.065}" fill="#ff8c00" opacity="0.9"/>
  <ellipse cx="${s*0.50}" cy="${s*0.78}" rx="${s*0.07}" ry="${s*0.05}" fill="#ffffff" opacity="0.55"/>
</svg>`;
};

// Tenta usar sharp (mais comum em servidores Node) para converter SVG → PNG
async function run() {
  let sharp;
  try { sharp = require('sharp'); } catch { sharp = null; }

  for (const size of SIZES) {
    const svgBuf = Buffer.from(makeSvg(size));
    const outFile = path.join(OUT, `icon-${size}.png`);
    if (sharp) {
      await sharp(svgBuf).png().toFile(outFile);
      console.log(`  gerado: icon-${size}.png`);
    } else {
      // Fallback: salva o SVG renomeado (PWABuilder aceita SVG como PNG se declarado)
      fs.writeFileSync(outFile.replace('.png', '.svg'), svgBuf);
      console.log(`  (sharp não encontrado) SVG salvo: icon-${size}.svg`);
    }
  }
  console.log('Ícones gerados em /icons/');
}

run().catch(console.error);
