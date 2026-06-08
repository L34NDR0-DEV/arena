// Skins com sprite PNG. Cada skin declara nozzle (bico) e engines (lista de pontos de motor).
// getNozzle → ponto do bico em coords mundo
// getEngines → array de pontos de motor em coords mundo (para chama múltipla)

const _imgCache = {};
function loadImg(src) {
  if (_imgCache[src]) return _imgCache[src];
  const img = new Image();
  img.src = src;
  _imgCache[src] = img;
  return img;
}

function drawSprite(ctx, img, w, h, angle = 0) {
  if (!img.complete || !img.naturalWidth) return false;
  ctx.save();
  ctx.rotate(angle);
  ctx.drawImage(img, -w/2, -h/2, w, h);
  ctx.restore();
  return true;
}

// Converte vetor local normalizado → coordenada mundo, considerando rotação da nave
function localToWorld(x, y, angle, scale, cx, cy, size) {
  const h = size * scale * 0.5;
  const lx = x * h, ly = y * h;
  // Mesma rotação usada para desenhar o sprite (ctx.rotate(angle) + drawImage
  // centralizado), assim o ponto local cai no mesmo lugar do desenho rotacionado.
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  return {
    x: cx + lx*ca - ly*sa,
    y: cy + lx*sa + ly*ca,
  };
}

function makeSprite(id, name, color, file, opts = {}) {
  const path = `./src/sprites/${file}`;
  const img  = loadImg(path);
  const size  = opts.size ?? 72;
  const nozzle = opts.nozzle ?? { x:0, y:-0.85 };
  // engines: array de vetores locais normalizados (onde ficam os motores)
  const engines = opts.engines ?? [{ x:0, y:0.85 }];
  const previewAngle = opts.previewAngle ?? 0;
  const isAlien = opts.isAlien ?? false;
  const isArcade = opts.isArcade ?? false;

  const spinsOnAxis = opts.spinsOnAxis ?? false;
  // Discos "UFO" totalmente blindados — sem chama de propulsão visível
  // (nem o rastro clássico, nem o thruster de energia alienígena).
  const noThruster = opts.noThruster ?? false;

  return {
    id, name, color, isAlien, isArcade, spinsOnAxis, noThruster, hasSprite:true, img,
    _nozzle:nozzle, _engines:engines, _size:size,

    getNozzle(cx, cy, angle, scale=1) {
      return localToWorld(nozzle.x, nozzle.y, angle, scale, cx, cy, size);
    },

    // Retorna array de pontos de motor em coords mundo
    getEngines(cx, cy, angle, scale=1) {
      return engines.map(e => localToWorld(e.x, e.y, angle, scale, cx, cy, size));
    },

    // Compat retroativa: retorna o primeiro motor
    getEngine(cx, cy, angle, scale=1) {
      return this.getEngines(cx, cy, angle, scale)[0];
    },

    draw(ctx, scale=1) {
      drawSprite(ctx, img, size*scale, size*scale);
    },

    drawPreview(ctx, scale=1) {
      drawSprite(ctx, img, size*scale, size*scale, previewAngle);
    },
  };
}

// ══════════════════════════════════════════════════════════════
// SKINS — apenas as que têm sprite PNG
// ══════════════════════════════════════════════════════════════

// Falcon Vermelho — 3 pods, motores: central inferior + 2 laterais base dos pods
const skinVermelho = makeSprite(0, 'Falcon Vermelho', '#cc2233', 'Vermelho.png', {
  size: 80,
  nozzle: { x:0, y:-0.72 },        // ponta do pod central (bico)
  engines: [
    { x: 0,     y:  0.82 },        // motor central
    { x:-0.52,  y:  0.72 },        // motor pod esquerdo
    { x: 0.52,  y:  0.72 },        // motor pod direito
  ],
});

// Ponta BR — caça com 2 motores na popa
const skinPonta = makeSprite(1, 'Ponta BR', '#ffcc00', 'Ponta.png', {
  size: 76,
  nozzle: { x:0, y:-0.88 },
  engines: [
    { x:-0.22, y: 0.78 },
    { x: 0.22, y: 0.78 },
  ],
});

// Ghost Verde — motor central + 2 naceles laterais
const skinVerde = makeSprite(2, 'Ghost Verde', '#00e87a', 'Verde.png', {
  size: 76,
  nozzle: { x:0, y:-0.85 },
  engines: [
    { x: 0,    y:  0.82 },        // motor central
    { x:-0.42, y:  0.52 },        // nacel esquerdo
    { x: 0.42, y:  0.52 },        // nacel direito
  ],
});

// Valkyrie Azul — caça com motor único central largo
const skinAzul = makeSprite(3, 'Valkyrie Azul', '#0088ff', 'Azul.png', {
  size: 84,
  nozzle: { x:0, y:-0.88 },
  engines: [
    { x: 0, y: 0.80 },
  ],
});

// Stealthwing — triângulo giratório (spinsOnAxis)
const skinTriangulo = makeSprite(4, 'Stealthwing', '#8899aa', 'Triangulo.png', {
  size: 80,
  nozzle: { x:0, y:-0.72 },
  engines: [
    { x:-0.62, y: 0.68 },
    { x: 0.62, y: 0.68 },
  ],
  spinsOnAxis: true,
});

// Alien Disc — disco voador totalmente blindado, sem nenhuma chama de
// propulsão visível (nem rastro clássico, nem thruster de energia).
const skinAlien = makeSprite(5, 'Alien Disc', '#aa44ff', 'Alien.png', {
  size: 80,
  nozzle: { x:0, y:0 },           // emite de qualquer direção (disco)
  engines: [{ x:0, y:0.2 }],
  isAlien: true,
  noThruster: true,
});

// Roxa — caça pesado, motor central + 2 laterais na base das asas
const skinRoxa = makeSprite(6, 'Shadow Roxa', '#aa44ff', 'Roxa.png', {
  size: 84,
  nozzle:  { x:0, y:-0.80 },
  engines: [
    { x: 0,    y:  0.78 },   // motor central
    { x:-0.48, y:  0.62 },   // motor asa esquerda
    { x: 0.48, y:  0.62 },   // motor asa direita
  ],
});

// Marrom-Azul — caça pesado, motor central + 2 motores nas naceles laterais
const skinMarromAzul = makeSprite(7, 'Stratos Azul', '#3388dd', 'Marromeazul.png', {
  size: 84,
  nozzle:  { x:0, y:-0.85 },
  engines: [
    { x: 0,    y:  0.92 },   // motor central
    { x:-0.34, y:  0.78 },   // nacel esquerdo
    { x: 0.34, y:  0.78 },   // nacel direito
  ],
});

// Rosa & Verde — caça com emblema nas asas, motor central + 2 nas naceles
const skinRosaVerde = makeSprite(8, 'Aurora Rosa', '#ff5fa8', 'Rosaeverde.png', {
  size: 84,
  nozzle:  { x:0, y:-0.85 },
  engines: [
    { x: 0,    y:  0.90 },   // motor central
    { x:-0.32, y:  0.80 },   // nacel esquerdo
    { x: 0.32, y:  0.80 },   // nacel direito
  ],
});

// Rosa Neon — caça compacto, motor central único
const skinRosaNeon = makeSprite(9, 'Nebula Rosa', '#ff3d9a', 'Rosa.png', {
  size: 80,
  nozzle:  { x:0, y:-0.85 },
  engines: [
    { x: 0,    y:  0.88 },   // motor central
    { x:-0.30, y:  0.62 },   // motor lateral esquerdo
    { x: 0.30, y:  0.62 },   // motor lateral direito
  ],
});

// Hex Champion — recompensa exclusiva do Torneio Tower Defense (não é vendida
// na loja, só concedida pelo servidor a quem vencer durante a janela ativa).
// Reaproveita a silhueta angular do Stealthwing sob um tom dourado de campeão.
const skinHexChampion = makeSprite(10, 'Hex Champion', '#ffcf4d', 'Triangulo.png', {
  size: 80,
  nozzle: { x:0, y:-0.72 },
  engines: [
    { x:-0.62, y: 0.68 },
    { x: 0.62, y: 0.68 },
  ],
  spinsOnAxis: true,
});

// Arcade Verde — caça de asas largas, nova linha "arcade", com par de
// motores gêmeos bem na popa central (já com brilho de chama no sprite).
const skinArcadeVerde = makeSprite(11, 'Arcade Verde', '#33cc55', 'Arcadeverde.png', {
  size: 84,
  nozzle:  { x:0, y:-0.85 },
  engines: [
    { x:-0.16, y: 0.86 },   // motor esquerdo
    { x: 0.16, y: 0.86 },   // motor direito
  ],
  isArcade: true,
});

// UFO Dourado — disco blindado dourado com núcleo vermelho (mesmo padrão
// giratório da Hex Champion), totalmente blindado: sem chama de propulsão.
const skinUfoDourado = makeSprite(12, 'UFO Dourado', '#ffcc33', 'Uforecompensa.png', {
  size: 80,
  nozzle: { x:0, y:-0.72 },
  engines: [
    { x:-0.62, y: 0.68 },
    { x: 0.62, y: 0.68 },
  ],
  spinsOnAxis: true,
  noThruster: true,
});

// Amarela — caça robusto laranja/dourado, opção intermediária/premium
// (550 CR — equivalente ao pacote de R$10).
const skinAmarela = makeSprite(13, 'Amarela', '#ffaa22', 'Amarela.png', {
  size: 84,
  nozzle: { x:0, y:-0.85 },
  engines: [
    { x: 0,    y:  0.84 },
    { x:-0.46, y:  0.62 },
    { x: 0.46, y:  0.62 },
  ],
});

// Arcade Branca — nova linha "arcade", visual claro/tecnológico com
// naceles em arco — opção econômica (100 CR).
const skinArcadeBranca = makeSprite(14, 'Arcade Branca', '#e8eef5', 'Arcadebranca.png', {
  size: 84,
  nozzle:  { x:0, y:-0.85 },
  engines: [
    { x:-0.50, y: 0.74 },
    { x: 0.50, y: 0.74 },
  ],
  isArcade: true,
});

// Arcade Vermelha — nova linha "arcade", silhueta angular vermelho/cobre —
// opção econômica (100 CR).
const skinArcadeVermelha = makeSprite(15, 'Arcade Vermelha', '#cc3322', 'Acadevermelha.png', {
  size: 84,
  nozzle:  { x:0, y:-0.85 },
  engines: [
    { x:-0.46, y: 0.70 },
    { x: 0.46, y: 0.70 },
  ],
  isArcade: true,
});

export const SKINS = [
  skinVermelho,
  skinPonta,
  skinVerde,
  skinAzul,
  skinTriangulo,
  skinAlien,
  skinRoxa,
  skinMarromAzul,
  skinRosaVerde,
  skinRosaNeon,
  skinArcadeVerde,
  skinHexChampion,
  skinUfoDourado,
  skinAmarela,
  skinArcadeBranca,
  skinArcadeVermelha,
];

// IDs de skins que NUNCA aparecem na loja para compra — concedidas apenas
// por eventos especiais (ex.: recompensa do Torneio Tower Defense) ou
// presenteadas individualmente a contas específicas (ex.: UFO Dourado).
export const REWARD_ONLY_SKIN_IDS = [10, 12];
