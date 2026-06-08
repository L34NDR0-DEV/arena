// Motor de áudio procedural — Web Audio API pura, sem arquivos externos.
// Gera todos os sons sinteticamente em tempo real.

export class AudioEngine {
  constructor() {
    this._ctx    = null;
    this._master = null;
    this._engine = null; // nó do loop de motor
    this._engineGain = null;
    this._muted  = false;
    this._ready  = false;
    this._init();
  }

  _init() {
    try {
      this._ctx    = new (window.AudioContext || window.webkitAudioContext)();
      this._master = this._ctx.createGain();
      this._master.gain.value = 0.7;
      this._master.connect(this._ctx.destination);
      this._ready  = true;
    } catch(e) {
      console.warn('[Audio] Web Audio API não disponível:', e);
    }
  }

  // Deve ser chamado após gesto do usuário (click) para desbloquear o contexto
  resume() {
    if (this._ctx?.state === 'suspended') this._ctx.resume();
  }

  get ctx() { return this._ctx; }

  // ── Tiro do jogador ────────────────────────────────────────
  playShoot() {
    if (!this._ready) return;
    const ac  = this._ctx;
    const now = ac.currentTime;

    // Oscilador de plasma — frequência descendente rápida
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    const dist = ac.createWaveShaper();
    dist.curve = this._makeDistCurve(80);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.12);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(dist); dist.connect(gain); gain.connect(this._master);
    osc.start(now); osc.stop(now + 0.15);
  }

  // ── Tiro inimigo ───────────────────────────────────────────
  playEnemyShoot() {
    if (!this._ready) return;
    const ac  = this._ctx;
    const now = ac.currentTime;

    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.10);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain); gain.connect(this._master);
    osc.start(now); osc.stop(now + 0.13);
  }

  // ── Explosão ───────────────────────────────────────────────
  playExplosion(size = 1) {
    if (!this._ready) return;
    const ac  = this._ctx;
    const now = ac.currentTime;
    const dur = 0.3 + size * 0.25;

    // Ruído branco filtrado
    const bufLen = Math.floor(ac.sampleRate * dur);
    const buf    = ac.createBuffer(1, bufLen, ac.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1);

    const src    = ac.createBufferSource();
    src.buffer   = buf;

    const filter = ac.createBiquadFilter();
    filter.type  = 'lowpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + dur);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(size * 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    // Grave de impacto
    const osc  = ac.createOscillator();
    const og   = ac.createGain();
    osc.type   = 'sine';
    osc.frequency.setValueAtTime(120 * size, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
    og.gain.setValueAtTime(0.6, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    src.connect(filter); filter.connect(gain); gain.connect(this._master);
    osc.connect(og); og.connect(this._master);
    src.start(now);
    osc.start(now); osc.stop(now + 0.25);
    setTimeout(() => {}, (dur + 0.1) * 1000);
  }

  // ── Coleta de item ─────────────────────────────────────────
  playCollect() {
    if (!this._ready) return;
    const ac  = this._ctx;
    const now = ac.currentTime;

    // Acorde ascendente rápido
    const freqs = [523, 659, 784];
    freqs.forEach((f, i) => {
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.type   = 'sine';
      osc.frequency.value = f;
      const t = now + i * 0.06;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain); gain.connect(this._master);
      osc.start(t); osc.stop(t + 0.24);
    });
  }

  // ── Batida física (colisão entre naves/asteroides) ─────────
  playCollision(strength = 1) {
    if (!this._ready) return;
    const ac  = this._ctx;
    const now = ac.currentTime;

    // Impacto metálico curto — ruído filtrado em banda + thump grave
    const dur    = 0.1 + strength * 0.05;
    const bufLen = Math.floor(ac.sampleRate * dur);
    const buf    = ac.createBuffer(1, bufLen, ac.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1);

    const src    = ac.createBufferSource();
    src.buffer   = buf;
    const filter = ac.createBiquadFilter();
    filter.type  = 'bandpass';
    filter.frequency.value = 700 + strength * 200;
    filter.Q.value = 1.2;

    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.35 * strength, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + dur);

    const osc = ac.createOscillator();
    const og  = ac.createGain();
    osc.type  = 'triangle';
    osc.frequency.setValueAtTime(140 * strength, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.09);
    og.gain.setValueAtTime(0.45 * strength, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    src.connect(filter); filter.connect(ng); ng.connect(this._master);
    osc.connect(og); og.connect(this._master);
    src.start(now);
    osc.start(now); osc.stop(now + 0.12);
  }

  // ── Dano recebido ──────────────────────────────────────────
  playHit() {
    if (!this._ready) return;
    const ac  = this._ctx;
    const now = ac.currentTime;

    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.type   = 'square';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain); gain.connect(this._master);
    osc.start(now); osc.stop(now + 0.15);
  }

  // ── Level up ───────────────────────────────────────────────
  playLevelUp() {
    if (!this._ready) return;
    const ac  = this._ctx;
    const now = ac.currentTime;
    const notes = [392, 494, 587, 784];
    notes.forEach((f, i) => {
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const t = now + i * 0.1;
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain); gain.connect(this._master);
      osc.start(t); osc.stop(t + 0.2);
    });
  }

  // ── Loop de motor da nave ──────────────────────────────────
  startEngine(intensity = 0.5) {
    if (!this._ready || this._engine) return;
    const ac  = this._ctx;

    // Ronco grave e suave do motor — ondas senoidal/triangular (poucos
    // harmônicos) filtradas em passa-baixa, para um "hum" contínuo em vez
    // do zumbido áspero que serra/quadrada produziam sem filtro.
    const osc1   = ac.createOscillator();
    const osc2   = ac.createOscillator();
    const lfo    = ac.createOscillator();
    const lfoG   = ac.createGain();
    const filter = ac.createBiquadFilter();
    this._engineGain = ac.createGain();
    this._engineGain.gain.value = intensity * 0.04;

    osc1.type = 'sine';     osc1.frequency.value = 50;
    osc2.type = 'triangle'; osc2.frequency.value = 53;
    lfo.type  = 'sine';     lfo.frequency.value  = 2.2;
    lfoG.gain.value = 3;

    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.Q.value = 0.7;

    lfo.connect(lfoG); lfoG.connect(osc1.frequency);
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(this._engineGain);
    this._engineGain.connect(this._master);

    osc1.start(); osc2.start(); lfo.start();
    this._engine = { osc1, osc2, lfo, filter };
  }

  setEngineIntensity(v) {
    if (this._engineGain) {
      this._engineGain.gain.setTargetAtTime(v * 0.05, this._ctx.currentTime, 0.1);
    }
  }

  stopEngine() {
    if (!this._engine) return;
    try {
      this._engine.osc1.stop(); this._engine.osc2.stop(); this._engine.lfo.stop();
    } catch {}
    this._engine = null;
  }

  // ── Bomba ──────────────────────────────────────────────────
  playBomb() {
    if (!this._ready) return;
    this.playExplosion(3);
  }

  // ── Onda nova ─────────────────────────────────────────────
  playWaveStart() {
    if (!this._ready) return;
    const ac  = this._ctx;
    const now = ac.currentTime;
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.linearRampToValueAtTime(400, now + 0.3);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain); gain.connect(this._master);
    osc.start(now); osc.stop(now + 0.36);
  }

  // ── Morte do jogador ───────────────────────────────────────
  playDeath() {
    if (!this._ready) return;
    this.playExplosion(2.5);
    setTimeout(() => this.playExplosion(1.5), 200);
  }

  // ── Impacto em estrutura (torre/parede) ───────────────────
  playTowerHit() {
    if (!this._ready) return;
    const ac  = this._ctx;
    const now = ac.currentTime;

    // Impacto pesado: camada grave + estrondo metálico profundo
    // (sem a agudez de alumínio do playCollision — sons mais baixos e densos)
    const dur = 0.25;
    const bufLen = Math.floor(ac.sampleRate * dur);
    const buf    = ac.createBuffer(1, bufLen, ac.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1);

    const src    = ac.createBufferSource();
    src.buffer   = buf;

    // Filtro passa-baixa bem estreito — só o "thud" grave, sem chirp metálico
    const filter = ac.createBiquadFilter();
    filter.type  = 'lowpass';
    filter.frequency.setValueAtTime(320, now);
    filter.frequency.exponentialRampToValueAtTime(60, now + dur);
    filter.Q.value = 0.5;

    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.55, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + dur);

    // Sub-grave de impacto
    const osc  = ac.createOscillator();
    const og   = ac.createGain();
    osc.type   = 'sine';
    osc.frequency.setValueAtTime(75, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.18);
    og.gain.setValueAtTime(0.7, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    // Camada de "crack" médio — dá sensação de resistência da estrutura
    const osc2 = ac.createOscillator();
    const og2  = ac.createGain();
    osc2.type  = 'triangle';
    osc2.frequency.setValueAtTime(220, now);
    osc2.frequency.exponentialRampToValueAtTime(80, now + 0.08);
    og2.gain.setValueAtTime(0.25, now);
    og2.gain.exponentialRampToValueAtTime(0.001, now + 0.10);

    src.connect(filter); filter.connect(ng); ng.connect(this._master);
    osc.connect(og);   og.connect(this._master);
    osc2.connect(og2); og2.connect(this._master);
    src.start(now);
    osc.start(now); osc.stop(now + 0.24);
    osc2.start(now); osc2.stop(now + 0.11);
  }

  // ── Toggle mudo ───────────────────────────────────────────
  toggleMute() {
    this._muted = !this._muted;
    if (this._master) this._master.gain.value = this._muted ? 0 : 0.7;
    return this._muted;
  }

  _makeDistCurve(amount) {
    const n = 256, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }
}
