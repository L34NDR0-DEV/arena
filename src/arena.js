// Arena com fundo arcade-estelar: grade neon + nebulosas + estrelas piscando.
export const ARENA_W_DEFAULT = 8000;
export const ARENA_H_DEFAULT = 5500;

// Dimensões atuais da arena — bindings vivos (ESM) para permitir tamanhos
// menores em modos específicos (ex.: Teste) sem refatorar todos os imports.
export let ARENA_W = ARENA_W_DEFAULT;
export let ARENA_H = ARENA_H_DEFAULT;

// Define as dimensões ativas da arena. Chamar antes de criar Arena/entidades.
export function setArenaSize(w, h) {
  ARENA_W = w;
  ARENA_H = h;
}

// Todas as arenas disponíveis
export const ARENA_TYPES = [
  { id:'nebulosa',     label:'Nebulosa Azul'        },
  { id:'asteroide',    label:'Campo de Asteroides'  },
  { id:'vazio',        label:'Vazio Profundo'        },
  { id:'pulsar',       label:'Campo do Pulsar'       },
  { id:'supernova',    label:'Cinzas da Supernova'  },
  { id:'cristal',      label:'Gruta de Cristal'     },
  { id:'tempestade',   label:'Tempestade Ionica'    },
  { id:'abismo',       label:'Abismo Negro'         },
  { id:'aurora',       label:'Aurora Cósmica'       },
  { id:'radiacao',     label:'Zona de Radiação'     },
  { id:'buraconegro',  label:'Buraco Negro'         },
  { id:'neon',         label:'Cidade Neon'          },
  { id:'gelido',       label:'Vácuo Gélido'         },
];

// Configuração visual por arena
const ARENA_CFG = {
  nebulosa:    { bg:['#030810','#05101e'], grid:'#091428', gridAlpha:0.9, nebHue:210, nebSat:70,  nebLight:35, starPalette:[[140,200,255],[180,160,255],[200,230,255]], borderColor:'#1a4a7a', glowColor:'#00aaff', glowAlpha:0.5, arcadeColor:'#003366' },
  asteroide:   { bg:['#0c0806','#140d06'], grid:'#281408', gridAlpha:0.9, nebHue:28,  nebSat:55,  nebLight:30, starPalette:[[220,190,130],[200,200,170],[255,210,150]], borderColor:'#7a4a1a', glowColor:'#ff8800', glowAlpha:0.5, arcadeColor:'#3a1a00' },
  vazio:       { bg:['#04030a','#080412'], grid:'#100828', gridAlpha:0.8, nebHue:270, nebSat:25,  nebLight:25, starPalette:[[200,190,220],[170,165,200],[210,200,240]], borderColor:'#3a1a6a', glowColor:'#aa44ff', glowAlpha:0.5, arcadeColor:'#1a0840' },
  pulsar:      { bg:['#000a0a','#001414'], grid:'#002222', gridAlpha:1.0, nebHue:175, nebSat:80,  nebLight:30, starPalette:[[100,255,230],[80,230,200],[150,255,240]], borderColor:'#006644', glowColor:'#00ffcc', glowAlpha:0.6, arcadeColor:'#003322' },
  supernova:   { bg:['#0f0200','#180500'], grid:'#2a0800', gridAlpha:1.0, nebHue:12,  nebSat:90,  nebLight:35, starPalette:[[255,180,80],[255,220,100],[255,140,60]],  borderColor:'#882200', glowColor:'#ff4400', glowAlpha:0.6, arcadeColor:'#441100' },
  cristal:     { bg:['#000814','#001020'], grid:'#001828', gridAlpha:0.9, nebHue:195, nebSat:60,  nebLight:40, starPalette:[[180,240,255],[160,220,255],[200,255,255]], borderColor:'#004466', glowColor:'#00ddff', glowAlpha:0.6, arcadeColor:'#002233' },
  tempestade:  { bg:['#050210','#0a0418'], grid:'#150630', gridAlpha:1.0, nebHue:255, nebSat:70,  nebLight:30, starPalette:[[200,150,255],[170,120,255],[220,180,255]], borderColor:'#440088', glowColor:'#8800ff', glowAlpha:0.6, arcadeColor:'#220044' },
  abismo:      { bg:['#010102','#020103'], grid:'#060108', gridAlpha:0.7, nebHue:290, nebSat:15,  nebLight:15, starPalette:[[150,140,160],[130,120,150],[170,160,180]], borderColor:'#1a0a2a', glowColor:'#440066', glowAlpha:0.4, arcadeColor:'#0a0018' },
  aurora:      { bg:['#000a08','#001510'], grid:'#002018', gridAlpha:0.9, nebHue:145, nebSat:60,  nebLight:35, starPalette:[[120,255,180],[100,240,160],[160,255,200]], borderColor:'#1a6644', glowColor:'#00ff88', glowAlpha:0.5, arcadeColor:'#003322' },
  radiacao:    { bg:['#040a00','#081400'], grid:'#102200', gridAlpha:1.0, nebHue:82,  nebSat:80,  nebLight:30, starPalette:[[160,255,60],[140,230,40],[200,255,80]],   borderColor:'#335500', glowColor:'#88ff00', glowAlpha:0.6, arcadeColor:'#1a2800' },
  buraconegro: { bg:['#000000','#010001'], grid:'#050005', gridAlpha:0.6, nebHue:300, nebSat:60,  nebLight:20, starPalette:[[220,160,255],[200,130,240],[255,180,255]], borderColor:'#440044', glowColor:'#ff00ff', glowAlpha:0.5, arcadeColor:'#1a001a' },
  neon:        { bg:['#020204','#040208'], grid:'#0a0416', gridAlpha:1.1, nebHue:320, nebSat:75,  nebLight:35, starPalette:[[255,80,200],[255,120,220],[200,80,255]],   borderColor:'#660044', glowColor:'#ff0088', glowAlpha:0.7, arcadeColor:'#330022' },
  gelido:      { bg:['#020810','#040d18'], grid:'#081830', gridAlpha:0.9, nebHue:200, nebSat:50,  nebLight:45, starPalette:[[200,230,255],[220,245,255],[180,215,255]], borderColor:'#1a4466', glowColor:'#88ccff', glowAlpha:0.5, arcadeColor:'#0a2233' },
};

export class Arena {
  constructor(w, h, arenaType = 'nebulosa') {
    this.w = w; this.h = h;
    this.type = arenaType;
    this.particles = [];
    this._build();
  }

  resize(w, h) { this.w = w; this.h = h; }

  setType(type) { this.type = type; this._build(); }

  _build() {
    this.cfg = ARENA_CFG[this.type] || ARENA_CFG.nebulosa;
    this.stars      = this._genStars();
    this.nebulae    = this._genNebulae();
    this.asteroids  = this._genAsteroids();
    this._gridPhase = Math.random() * Math.PI * 2;
  }

  _genAsteroids() {
    const count = 18 + Math.floor(Math.random()*10); // 18-27 para arena grande
    const asts = [];
    for (let i = 0; i < count; i++) {
      const r = 18 + Math.random()*32;
      const a = Math.random()*Math.PI*2;
      const spd = 18 + Math.random()*38;
      // vértices do polígono irregular (6-9 pontos)
      const pts = Math.floor(6+Math.random()*4);
      const verts = Array.from({length:pts}, (_,j) => {
        const ang = (j/pts)*Math.PI*2;
        const rr  = r*(0.65+Math.random()*0.55);
        return { x: Math.cos(ang)*rr, y: Math.sin(ang)*rr };
      });
      asts.push({
        x: 120 + Math.random()*(ARENA_W-240),
        y: 120 + Math.random()*(ARENA_H-240),
        vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
        rot: 0, vr: (Math.random()-0.5)*0.6,
        r, verts,
        hp: Math.round(r*2.5), maxHp: Math.round(r*2.5),
        dead: false,
        color: this._asteroidColor(),
        crackAge: 0,
      });
    }
    return asts;
  }

  _asteroidColor() {
    const palettes = ['#7a6a55','#8a7060','#6a5a45','#9a8070','#5a4a38'];
    return palettes[Math.floor(Math.random()*palettes.length)];
  }

  _genStars() {
    const pal = this.cfg.starPalette;
    return Array.from({length:600}, () => {
      const c = pal[Math.floor(Math.random()*pal.length)];
      return {
        x: Math.random()*ARENA_W, y: Math.random()*ARENA_H,
        r: Math.random()*2.2+0.15,
        a: Math.random()*0.85+0.15,
        blink: Math.random()*Math.PI*2,
        speed: 0.3+Math.random()*1.2,
        color: `rgb(${c[0]},${c[1]},${c[2]})`,
        pixel: Math.random() < 0.18,
      };
    });
  }

  _genNebulae() {
    const { nebHue, nebSat, nebLight } = this.cfg;
    return Array.from({length:9}, (_, i) => ({
      x: (0.08 + i*0.12) * ARENA_W + (Math.random()-0.5)*200,
      y: (0.1  + (i%3)*0.38) * ARENA_H + (Math.random()-0.5)*150,
      r: 320 + Math.random()*380,
      hue: nebHue + (Math.random()-0.5)*45,
      sat: nebSat,
      light: nebLight,
      a: 0.028 + Math.random()*0.048,
    }));
  }

  spawnParticles(x, y, color, count=8, speed=130) {
    for (let i=0;i<count;i++) {
      const a=Math.random()*Math.PI*2, v=speed*(0.3+Math.random()*0.9);
      this.particles.push({
        x,y, vx:Math.cos(a)*v, vy:Math.sin(a)*v,
        life:1, decay:0.9+Math.random()*0.7,
        r:2+Math.random()*3, color,
      });
    }
  }

  update(dt) {
    this.particles = this.particles.filter(p=>{
      p.x+=p.vx*dt; p.y+=p.vy*dt;
      p.vx*=0.96; p.vy*=0.96;
      p.life-=p.decay*dt;
      return p.life>0;
    });

    // Asteroides
    for (const a of this.asteroids) {
      if (a.dead) continue;
      a.x += a.vx*dt; a.y += a.vy*dt;
      a.rot += a.vr*dt;
      // Rebate nas bordas
      if (a.x - a.r < 0)       { a.x = a.r;        a.vx = Math.abs(a.vx); }
      if (a.x + a.r > ARENA_W) { a.x = ARENA_W-a.r; a.vx = -Math.abs(a.vx); }
      if (a.y - a.r < 0)       { a.y = a.r;         a.vy = Math.abs(a.vy); }
      if (a.y + a.r > ARENA_H) { a.y = ARENA_H-a.r; a.vy = -Math.abs(a.vy); }
      if (a.crackAge > 0) a.crackAge -= dt;
    }
    // Respawn de asteroides destruídos
    this.asteroids = this.asteroids.filter(a => !a.dead);
    while (this.asteroids.length < 15) {
      const side = Math.floor(Math.random()*4);
      let x,y;
      if (side===0) { x=Math.random()*ARENA_W; y=60; }
      else if (side===1) { x=ARENA_W-60; y=Math.random()*ARENA_H; }
      else if (side===2) { x=Math.random()*ARENA_W; y=ARENA_H-60; }
      else { x=60; y=Math.random()*ARENA_H; }
      const r=18+Math.random()*28;
      const pts=Math.floor(6+Math.random()*4);
      const verts=Array.from({length:pts},(_,j)=>{const ang=(j/pts)*Math.PI*2;const rr=r*(0.65+Math.random()*0.55);return{x:Math.cos(ang)*rr,y:Math.sin(ang)*rr};});
      const spd=18+Math.random()*38;
      const ang=Math.atan2(ARENA_H/2-y,ARENA_W/2-x)+(Math.random()-0.5)*1.2;
      this.asteroids.push({x,y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,rot:0,vr:(Math.random()-0.5)*0.6,r,verts,hp:Math.round(r*2.5),maxHp:Math.round(r*2.5),dead:false,color:this._asteroidColor(),crackAge:0});
    }
  }

  // Retorna true se o ponto (px,py) com raio pr colide com algum asteroide
  checkAsteroidCollision(px, py, pr, damage=0) {
    for (const a of this.asteroids) {
      if (a.dead) continue;
      const d = Math.hypot(a.x-px, a.y-py);
      if (d < a.r + pr) {
        if (damage > 0) {
          a.hp -= damage;
          a.crackAge = 0.4;
          if (a.hp <= 0) {
            a.dead = true;
            this.spawnParticles(a.x, a.y, a.color, 12, 120);
          }
        }
        return a; // retorna o asteroide colidido
      }
    }
    return null;
  }

  drawBackground(ctx, camX, camY) {
    const { w, h, cfg } = this;
    const t = Date.now()/1000;

    // ── Fundo base ─────────────────────────────────────────
    const bg = ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0, cfg.bg[0]); bg.addColorStop(1, cfg.bg[1]);
    ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);

    // ── Nebulosas com paralaxe ─────────────────────────────
    for (const n of this.nebulae) {
      const sx = n.x - camX*0.07;
      const sy = n.y - camY*0.07;
      const pulse = 1 + 0.04*Math.sin(t*0.4+n.hue);
      const g = ctx.createRadialGradient(sx,sy,0,sx,sy,n.r*pulse);
      g.addColorStop(0, `hsla(${n.hue},${n.sat}%,${n.light}%,${n.a*1.5})`);
      g.addColorStop(0.5,`hsla(${n.hue},${n.sat}%,${n.light}%,${n.a})`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    }

    // ── Elementos únicos por arena ─────────────────────────
    ctx.save();
    ctx.translate(-camX, -camY);
    this._drawArenaFx(ctx, t, camX, camY, w, h);
    ctx.restore();

    // ── Grade arcade neon ──────────────────────────────────
    ctx.save();
    ctx.translate(-camX, -camY);
    const gs = 100;
    const ox = Math.floor(camX/gs)*gs;
    const oy = Math.floor(camY/gs)*gs;
    const gridPulse = 0.4 + 0.25*Math.sin(t*0.8+this._gridPhase);

    ctx.strokeStyle = cfg.grid;
    ctx.lineWidth   = 0.5;
    ctx.globalAlpha = gridPulse * 0.45;
    for (let x=ox; x<camX+w+gs; x+=gs) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,ARENA_H); ctx.stroke();
    }
    for (let y=oy; y<camY+h+gs; y+=gs) {
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(ARENA_W,y); ctx.stroke();
    }
    const gs4=gs*4, ox4=Math.floor(camX/gs4)*gs4, oy4=Math.floor(camY/gs4)*gs4;
    ctx.lineWidth=1; ctx.globalAlpha=gridPulse*0.85;
    for (let x=ox4; x<camX+w+gs4; x+=gs4) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,ARENA_H); ctx.stroke();
    }
    for (let y=oy4; y<camY+h+gs4; y+=gs4) {
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(ARENA_W,y); ctx.stroke();
    }
    ctx.globalAlpha=gridPulse*0.65; ctx.fillStyle=cfg.grid;
    for (let x=ox4; x<camX+w+gs4; x+=gs4)
      for (let y=oy4; y<camY+h+gs4; y+=gs4)
        { ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill(); }
    ctx.globalAlpha=1;
    ctx.restore();

    // ── Estrelas (paralaxe) ────────────────────────────────
    for (const s of this.stars) {
      const wx = s.x - camX*0.22;
      const wy = s.y - camY*0.22;
      if (wx<-4||wx>w+4||wy<-4||wy>h+4) continue;
      const blink = 0.45+0.55*Math.sin(t*s.speed+s.blink);
      const alpha  = s.a*blink;
      const col    = s.color.replace('rgb(','rgba(').replace(')',`,${alpha})`);
      if (s.pixel) {
        ctx.fillStyle=col;
        const sz=s.r*1.6; ctx.fillRect(wx-sz/2,wy-sz/2,sz,sz);
      } else {
        ctx.fillStyle=col;
        ctx.beginPath(); ctx.arc(wx,wy,s.r,0,Math.PI*2); ctx.fill();
        if (s.r>1.2) {
          ctx.fillStyle=col.replace(`,${alpha})`,',' + alpha*0.3 + ')');
          ctx.beginPath(); ctx.arc(wx,wy,s.r*2.5,0,Math.PI*2); ctx.fill();
        }
      }
    }

    // ── Scanlines arcade leves ─────────────────────────────
    ctx.save();
    ctx.globalAlpha=0.022; ctx.fillStyle='#000';
    for (let y=0; y<h; y+=3) ctx.fillRect(0,y,w,1);
    ctx.restore();
  }

  // ── Elementos visuais exclusivos por arena ────────────────
  _drawArenaFx(ctx, t, camX, camY, w, h) {
    const type = this.type;
    const cfg  = this.cfg;

    // Pré-inicializa dados estáticos da arena (gerados uma vez)
    if (!this._fxData) this._fxData = this._genFxData();
    const d = this._fxData;

    if (type === 'nebulosa') {
      // Filamentos de gás azul serpenteando
      ctx.globalAlpha=0.12;
      for (let i=0;i<5;i++) {
        ctx.strokeStyle=`hsl(${210+i*8},80%,60%)`;
        ctx.lineWidth=80+i*30; ctx.lineCap='round';
        ctx.beginPath();
        ctx.moveTo(d.fil[i].x0,d.fil[i].y0);
        ctx.bezierCurveTo(
          d.fil[i].cx1+Math.sin(t*0.12+i)*60, d.fil[i].cy1+Math.cos(t*0.09+i)*40,
          d.fil[i].cx2+Math.cos(t*0.1+i)*50,  d.fil[i].cy2+Math.sin(t*0.13+i)*50,
          d.fil[i].x1, d.fil[i].y1
        );
        ctx.stroke();
      }
      ctx.globalAlpha=1;

    } else if (type === 'supernova') {
      // Ondas de choque em expansão + chuva de cinzas
      for (let i=0;i<4;i++) {
        const phase = ((t*0.06+i*0.25)%1);
        const r = phase * Math.max(ARENA_W,ARENA_H)*0.9;
        const alpha = (1-phase)*0.18;
        ctx.globalAlpha=alpha;
        ctx.strokeStyle=`hsl(${15+i*10},90%,55%)`;
        ctx.lineWidth=6+phase*10;
        ctx.beginPath(); ctx.arc(ARENA_W/2,ARENA_H/2,r,0,Math.PI*2); ctx.stroke();
      }
      // Partículas de cinza caindo
      ctx.globalAlpha=0.08; ctx.fillStyle='#ffaa44';
      for (const p of d.ash) {
        const py = (p.y+t*p.vy*60)%ARENA_H;
        ctx.beginPath(); ctx.arc(p.x,py,p.r,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;

    } else if (type === 'buraconegro') {
      // Disco de acreção girando + lentilhamento gravitacional
      const cx=ARENA_W/2, cy=ARENA_H/2;
      for (let i=0;i<6;i++) {
        const r=180+i*120, thickness=40+i*20;
        const alpha=0.18-i*0.025;
        ctx.globalAlpha=Math.max(0,alpha);
        const g=ctx.createRadialGradient(cx,cy,r-thickness/2,cx,cy,r+thickness/2);
        g.addColorStop(0,'transparent');
        g.addColorStop(0.4,`hsla(${280+i*15},80%,40%,1)`);
        g.addColorStop(0.6,`hsla(${300+i*10},70%,60%,1)`);
        g.addColorStop(1,'transparent');
        ctx.save(); ctx.translate(cx,cy); ctx.rotate(t*(0.04+i*0.01));
        ctx.scale(1,0.32); ctx.translate(-cx,-cy);
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,r+thickness/2,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }
      // Núcleo negro absoluto
      ctx.globalAlpha=1;
      const gBlack=ctx.createRadialGradient(cx,cy,0,cx,cy,160);
      gBlack.addColorStop(0,'#000000'); gBlack.addColorStop(0.7,'#000000'); gBlack.addColorStop(1,'transparent');
      ctx.fillStyle=gBlack; ctx.beginPath(); ctx.arc(cx,cy,160,0,Math.PI*2); ctx.fill();

    } else if (type === 'pulsar') {
      // Pulsos de energia em cruz irradiando do centro
      const cx=ARENA_W/2, cy=ARENA_H/2;
      const pulse=(t*0.5)%1;
      for (let beam=0;beam<4;beam++) {
        const angle=beam*Math.PI/2+t*0.03;
        const len=Math.max(ARENA_W,ARENA_H)*0.8;
        const w2=8+pulse*60;
        const alpha=0.25*(1-pulse);
        ctx.globalAlpha=alpha;
        ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle);
        const g=ctx.createLinearGradient(0,0,len,0);
        g.addColorStop(0,`hsla(175,90%,55%,1)`); g.addColorStop(1,'transparent');
        ctx.fillStyle=g; ctx.fillRect(0,-w2/2,len,w2);
        ctx.restore();
      }
      // Anel de pulsar
      for (let i=0;i<3;i++) {
        const rp=((t*0.4+i/3)%1)*800;
        ctx.globalAlpha=0.2*(1-rp/800);
        ctx.strokeStyle='#00ffcc'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.arc(cx,cy,rp,0,Math.PI*2); ctx.stroke();
      }
      ctx.globalAlpha=1;

    } else if (type === 'tempestade') {
      // Raios elétricos se formando e desaparecendo
      ctx.globalAlpha=0.22;
      for (const bolt of d.bolts) {
        const phase=(t*bolt.speed+bolt.offset)%1;
        if (phase>0.15) continue; // flash curto
        ctx.strokeStyle=`hsl(${260+bolt.hue},85%,75%)`;
        ctx.lineWidth=2+phase*4;
        ctx.beginPath(); ctx.moveTo(bolt.x0,bolt.y0);
        for (const seg of bolt.segs) {
          ctx.lineTo(bolt.x0+seg.dx+Math.sin(t*20+seg.dx)*8*(0.15-phase)*6,
                     bolt.y0+seg.dy+Math.cos(t*18+seg.dy)*8*(0.15-phase)*6);
        }
        ctx.stroke();
      }
      ctx.globalAlpha=1;

    } else if (type === 'cristal') {
      // Facetas hexagonais brilhantes espalhadas
      ctx.globalAlpha=0.07;
      for (const hex of d.hexes) {
        const pulse=0.8+0.2*Math.sin(t*hex.speed+hex.phase);
        ctx.strokeStyle=`hsl(${190+hex.hue},75%,70%)`;
        ctx.lineWidth=1.5;
        ctx.save(); ctx.translate(hex.x,hex.y); ctx.rotate(t*hex.rot+hex.phase);
        ctx.beginPath();
        for (let i=0;i<6;i++) {
          const a=i*Math.PI/3;
          if(i===0) ctx.moveTo(Math.cos(a)*hex.r*pulse,Math.sin(a)*hex.r*pulse);
          else ctx.lineTo(Math.cos(a)*hex.r*pulse,Math.sin(a)*hex.r*pulse);
        }
        ctx.closePath(); ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha=1;

    } else if (type === 'neon') {
      // Grade de luzes neon com cidades em perspectiva
      ctx.globalAlpha=0.13;
      for (const b of d.neonBars) {
        const flicker=0.6+0.4*Math.sin(t*b.fq+b.ph);
        ctx.fillStyle=`hsl(${b.hue},90%,60%)`;
        ctx.globalAlpha=0.08*flicker;
        ctx.fillRect(b.x,b.y,b.w,b.h);
        ctx.globalAlpha=0.25*flicker;
        ctx.fillStyle=`hsl(${b.hue},95%,75%)`;
        ctx.fillRect(b.x,b.y,b.w,2);
      }
      ctx.globalAlpha=1;

    } else if (type === 'abismo') {
      // Vórtice em espiral puxando tudo para o centro
      const cx=ARENA_W/2, cy=ARENA_H/2;
      for (let arm=0;arm<3;arm++) {
        ctx.globalAlpha=0.06;
        ctx.strokeStyle='#330055';
        ctx.lineWidth=120;
        ctx.beginPath();
        for (let i=0;i<80;i++) {
          const a=arm*Math.PI*2/3+i*0.15+t*0.04;
          const r2=80+i*22;
          const px2=cx+Math.cos(a)*r2, py2=cy+Math.sin(a)*r2;
          if(i===0) ctx.moveTo(px2,py2); else ctx.lineTo(px2,py2);
        }
        ctx.stroke();
      }
      ctx.globalAlpha=1;

    } else if (type === 'aurora') {
      // Cortinas de aurora boreal ondulando
      ctx.globalAlpha=0.09;
      for (let i=0;i<6;i++) {
        const x0=d.aur[i].x, ww=d.aur[i].w;
        const g=ctx.createLinearGradient(x0,0,x0+ww,0);
        g.addColorStop(0,'transparent');
        g.addColorStop(0.3,`hsla(${140+i*12},70%,50%,1)`);
        g.addColorStop(0.7,`hsla(${160+i*8},80%,55%,1)`);
        g.addColorStop(1,'transparent');
        ctx.fillStyle=g;
        // Ondas verticais
        const pts=20;
        ctx.beginPath();
        for (let j=0;j<=pts;j++) {
          const yy=j/pts*ARENA_H;
          const xx=x0+Math.sin(yy*0.003+t*(0.3+i*0.05)+i)*80*d.aur[i].amp;
          if(j===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
        }
        for (let j=pts;j>=0;j--) {
          const yy=j/pts*ARENA_H;
          const xx=x0+ww+Math.sin(yy*0.003+t*(0.3+i*0.05)+i+1)*60*d.aur[i].amp;
          ctx.lineTo(xx,yy);
        }
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha=1;

    } else if (type === 'radiacao') {
      // Piscadas de radiação em setores da arena
      const sects=6;
      for (let i=0;i<sects;i++) {
        const phase=(t*0.35+i/sects)%1;
        if (phase>0.3) continue;
        const alpha=Math.sin(phase/0.3*Math.PI)*0.12;
        ctx.globalAlpha=alpha;
        ctx.fillStyle=`hsl(${80+i*5},90%,55%)`;
        const x0=(i/sects)*ARENA_W, sw=ARENA_W/sects;
        ctx.fillRect(x0,0,sw,ARENA_H);
      }
      // Símbolo de radiação central gigante
      ctx.globalAlpha=0.04;
      const rcx=ARENA_W/2, rcy=ARENA_H/2;
      for (let i=0;i<3;i++) {
        ctx.save(); ctx.translate(rcx,rcy); ctx.rotate(i*Math.PI*2/3+t*0.02);
        ctx.fillStyle='#88ff00';
        ctx.beginPath(); ctx.arc(0,0,380,Math.PI*0.15,Math.PI*0.85); ctx.arc(0,0,180,Math.PI*0.85,Math.PI*0.15,true); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha=1;

    } else if (type === 'gelido') {
      // Cristais de gelo hexagonais flutuando
      ctx.globalAlpha=0.06;
      for (const fl of d.flakes) {
        const fy=(fl.y+t*fl.vy*20)%ARENA_H;
        ctx.save(); ctx.translate(fl.x, fy); ctx.rotate(t*fl.rot);
        ctx.strokeStyle='#aaddff'; ctx.lineWidth=1.2;
        for (let i=0;i<6;i++) {
          ctx.save(); ctx.rotate(i*Math.PI/3);
          ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-fl.r); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0,-fl.r*0.5); ctx.lineTo(fl.r*0.25,-fl.r*0.7); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0,-fl.r*0.5); ctx.lineTo(-fl.r*0.25,-fl.r*0.7); ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      }
      ctx.globalAlpha=1;

    } else if (type === 'vazio') {
      // Distorção gravitacional leve — grades onduladas
      ctx.globalAlpha=0.06; ctx.strokeStyle='#8844ff'; ctx.lineWidth=0.8;
      for (let i=0;i<12;i++) {
        ctx.beginPath();
        for (let j=0;j<=60;j++) {
          const x2=(j/60)*ARENA_W;
          const y2=i*(ARENA_H/12)+Math.sin(x2*0.002+t*0.2+i)*30;
          if(j===0) ctx.moveTo(x2,y2); else ctx.lineTo(x2,y2);
        }
        ctx.stroke();
      }
      ctx.globalAlpha=1;

    } else if (type === 'asteroide') {
      // Poeira cósmica flutuando + rastros
      ctx.globalAlpha=0.07; ctx.fillStyle='#aa8855';
      for (const dp of d.dust) {
        const dx2=(dp.x+t*dp.vx*15)%ARENA_W;
        const dy2=(dp.y+t*dp.vy*10)%ARENA_H;
        ctx.beginPath(); ctx.arc(dx2,dy2,dp.r,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;
    }
  }

  _genFxData() {
    const rnd=(a,b)=>a+Math.random()*(b-a);
    const d = {};
    // Filamentos nebulosa
    d.fil=Array.from({length:5},()=>({
      x0:rnd(0,ARENA_W), y0:rnd(0,ARENA_H),
      x1:rnd(0,ARENA_W), y1:rnd(0,ARENA_H),
      cx1:rnd(0,ARENA_W), cy1:rnd(0,ARENA_H),
      cx2:rnd(0,ARENA_W), cy2:rnd(0,ARENA_H),
    }));
    // Cinzas supernova
    d.ash=Array.from({length:80},()=>({
      x:rnd(0,ARENA_W), y:rnd(0,ARENA_H), vy:0.3+Math.random()*0.9, r:2+Math.random()*5
    }));
    // Raios tempestade
    d.bolts=Array.from({length:18},()=>{
      const x0=rnd(0,ARENA_W), y0=rnd(0,ARENA_H);
      const segs=Array.from({length:8},()=>({dx:rnd(-300,300),dy:rnd(-300,300)}));
      return {x0,y0,segs,speed:0.4+Math.random()*0.6,offset:Math.random(),hue:Math.random()*40};
    });
    // Hexagonos cristal
    d.hexes=Array.from({length:50},()=>({
      x:rnd(0,ARENA_W), y:rnd(0,ARENA_H),
      r:60+Math.random()*200, hue:Math.random()*40,
      speed:0.3+Math.random()*0.8, phase:Math.random()*Math.PI*2,
      rot:(Math.random()-0.5)*0.01,
    }));
    // Barras neon cidade
    d.neonBars=Array.from({length:60},()=>({
      x:rnd(0,ARENA_W), y:rnd(0,ARENA_H),
      w:20+Math.random()*200, h:40+Math.random()*300,
      hue:280+Math.random()*80, fq:0.8+Math.random()*3, ph:Math.random()*Math.PI*2,
    }));
    // Aurora
    d.aur=Array.from({length:6},()=>({
      x:rnd(0,ARENA_W), w:200+Math.random()*500, amp:0.4+Math.random()*0.9
    }));
    // Flocos gelido
    d.flakes=Array.from({length:120},()=>({
      x:rnd(0,ARENA_W), y:rnd(0,ARENA_H),
      r:20+Math.random()*80, vy:0.1+Math.random()*0.4, rot:(Math.random()-0.5)*0.02
    }));
    // Poeira asteroide
    d.dust=Array.from({length:100},()=>({
      x:rnd(0,ARENA_W), y:rnd(0,ARENA_H),
      vx:(Math.random()-0.5)*2, vy:(Math.random()-0.5)*1.5, r:3+Math.random()*10
    }));
    return d;
  }

  drawBorder(ctx) {
    const { cfg } = this;
    const t = Date.now()/1000;

    // Escurecer fora da arena
    ctx.fillStyle='#00000099';
    ctx.fillRect(-2000,-2000,2000,ARENA_H+4000);
    ctx.fillRect(ARENA_W,-2000,2000,ARENA_H+4000);
    ctx.fillRect(0,-2000,ARENA_W,2000);
    ctx.fillRect(0,ARENA_H,ARENA_W,2000);

    // Borda interna neon pulsante
    const pulse = 0.7 + 0.3*Math.sin(t*2.5);
    ctx.save();
    ctx.shadowColor = cfg.glowColor + Math.round(pulse*200).toString(16).padStart(2,'0');
    ctx.shadowBlur  = 22;
    ctx.strokeStyle = cfg.borderColor;
    ctx.lineWidth   = 2;
    ctx.strokeRect(1,1,ARENA_W-2,ARENA_H-2);

    ctx.shadowBlur  = 40;
    ctx.strokeStyle = cfg.glowColor + 'aa';
    ctx.lineWidth   = 4;
    ctx.strokeRect(1,1,ARENA_W-2,ARENA_H-2);
    ctx.restore();

    // Cantos arcade: quadrados + L
    const c = 32;
    ctx.strokeStyle = cfg.glowColor;
    ctx.lineWidth   = 2;
    ctx.shadowColor = cfg.glowColor;
    ctx.shadowBlur  = 10;
    [[0,0],[ARENA_W,0],[0,ARENA_H],[ARENA_W,ARENA_H]].forEach(([cx,cy]) => {
      const sx = cx===0?1:-1, sy = cy===0?1:-1;
      // Quadradinho de canto
      ctx.strokeRect(cx+sx*2, cy+sy*2, sx*12, sy*12);
      // L do canto
      ctx.beginPath();
      ctx.moveTo(cx+sx*(c+2), cy+sy*2);
      ctx.lineTo(cx+sx*2, cy+sy*2);
      ctx.lineTo(cx+sx*2, cy+sy*(c+2));
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
  }

  drawAsteroids(ctx) {
    const t = Date.now()/1000;
    for (const a of this.asteroids) {
      if (a.dead) continue;
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rot);

      // Sombra/glow de crack
      if (a.crackAge > 0) {
        ctx.shadowColor = '#ffaa44';
        ctx.shadowBlur  = 14 * (a.crackAge / 0.4);
      }

      // Corpo do asteroide
      ctx.beginPath();
      ctx.moveTo(a.verts[0].x, a.verts[0].y);
      for (let i=1; i<a.verts.length; i++) ctx.lineTo(a.verts[i].x, a.verts[i].y);
      ctx.closePath();

      // Gradiente radial para dar volume
      const g = ctx.createRadialGradient(-a.r*0.2,-a.r*0.2,0,0,0,a.r*1.1);
      g.addColorStop(0, '#c8b090');
      g.addColorStop(0.5, a.color);
      g.addColorStop(1, '#2a2018');
      ctx.fillStyle = g;
      ctx.fill();

      // Borda escura
      ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Linhas de superfície (crateras)
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.8;
      for (let i=0; i<2; i++) {
        const cx2 = (Math.sin(a.rot*3+i)*0.3)*a.r;
        const cy2 = (Math.cos(a.rot*2+i*1.4)*0.25)*a.r;
        const cr  = a.r*(0.12+i*0.1);
        ctx.beginPath(); ctx.arc(cx2, cy2, cr, 0, Math.PI*2); ctx.stroke();
      }

      // Barra de HP embaixo (só se danificado)
      if (a.hp < a.maxHp) {
        const bw = a.r*1.8, bh = 3;
        ctx.fillStyle = '#0a0a0a'; ctx.fillRect(-bw/2, a.r+4, bw, bh);
        const hpPct = a.hp/a.maxHp;
        ctx.fillStyle = hpPct>0.5?'#cc8822':'#ff4422';
        ctx.fillRect(-bw/2, a.r+4, bw*hpPct, bh);
      }

      ctx.restore();
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*p.life,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
