export const TRAILS = [
  // id 0 — sempre disponivel, gratis
  { id:0,  name:'Sem Rastro',        price:0,   free:true,  colors:['transparent'],                          style:'none',      glow:null },

  // ── Chamas ─────────────────────────────────────────────────────────────────
  { id:1,  name:'Chama Azul',        price:280, free:false, colors:['#00d4ff','#0077ff','#ffffff'],           style:'flame',     glow:'#00aaff' },
  { id:2,  name:'Fogo Infernal',     price:280, free:false, colors:['#ff3300','#ff8800','#ffee00'],           style:'flame',     glow:'#ff5500' },
  { id:3,  name:'Esmeralda',         price:320, free:false, colors:['#00ff88','#00cc44','#88ffcc'],           style:'flame',     glow:'#00ff66' },
  { id:4,  name:'Chama Violeta',     price:320, free:false, colors:['#aa00ff','#ff00cc','#ffffff'],           style:'flame',     glow:'#cc00ff' },

  // ── Faiscas / Sparkle ──────────────────────────────────────────────────────
  { id:5,  name:'Nebula Rosa',       price:350, free:false, colors:['#ff44aa','#cc22ff','#ffffff'],           style:'sparkle',   glow:'#ff44cc' },
  { id:6,  name:'Ouro Galactico',    price:450, free:false, colors:['#ffdd00','#ffaa00','#fff5aa'],           style:'sparkle',   glow:'#ffcc00' },
  { id:7,  name:'Cristal Branco',    price:350, free:false, colors:['#ffffff','#ccf0ff','#88ddff'],           style:'sparkle',   glow:'#aaeeff' },

  // ── Relampago ──────────────────────────────────────────────────────────────
  { id:8,  name:'Relampago Azul',    price:380, free:false, colors:['#88ffff','#4488ff','#ffffff'],           style:'lightning', glow:'#66eeff' },
  { id:9,  name:'Relampago Roxo',    price:380, free:false, colors:['#dd00ff','#8800cc','#ffffff'],           style:'lightning', glow:'#cc00ff' },
  { id:10, name:'Tempestade',        price:460, free:false, colors:['#ffffff','#ffff88','#ffaa00'],           style:'lightning', glow:'#ffeeaa' },

  // ── Fumaca / Smoke ─────────────────────────────────────────────────────────
  { id:11, name:'Void Escuro',       price:420, free:false, colors:['#440066','#110022','#ff00ff'],           style:'smoke',     glow:'#cc00ff' },
  { id:12, name:'Nevoa Glacial',     price:380, free:false, colors:['#aaddff','#66aacc','#ffffff'],           style:'smoke',     glow:'#88ccff' },
  { id:13, name:'Fumaca Toxica',     price:400, free:false, colors:['#44ff00','#226600','#88ff44'],           style:'smoke',     glow:'#66ff22' },

  // ── Especiais ──────────────────────────────────────────────────────────────
  { id:14, name:'Arco-Iris',         price:480, free:false, colors:['#ff0044','#ff8800','#ffee00','#00ff88','#00aaff','#cc00ff'], style:'rainbow',   glow:'#ffffff' },
  { id:15, name:'Plasma Sombrio',    price:480, free:false, colors:['#ff00aa','#6600ff','#00ffff'],           style:'plasma',    glow:'#ff00ff' },
  { id:16, name:'Cometa Vermelho',   price:460, free:false, colors:['#ff1111','#ff6600','#ffeecc'],           style:'comet',     glow:'#ff4400' },

  // ── ULTRA PREMIUM ─────────────────────────────────────────────────────────
  { id:17, name:'Fenda Cosmica',     price:590, free:false, colors:['#00ffff','#ffffff','#ff00ff','#ffff00'], style:'cosmic',    glow:'#ffffff', premium:true },
];

export const FREE_TRAIL_ID = 0;
