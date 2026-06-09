import { SKINS, REWARD_ONLY_SKIN_IDS } from './skins.js';
import { TRAILS } from './trails.js';
import { ARENA_TYPES }    from './arena.js';
import { Game }           from './game.js';
import { CHANGELOG }      from './changelog.js';
import { PROFILE_ICON_DEFS, drawProfileIcon } from './profileIcons.js';

let game=null, selectedSkin=0, selectedMode='contra1', paused=false;
let pilotName='JOGADOR';

// ── Conta / perfil (autenticação, créditos, skins) ────────────
const SHOP_PRICE = 500;
const economy_FREE_SKIN_ID = 6;
let currentUser = null; // {id,email,displayName,credits,equippedSkin}
let profile     = null; // {user,ownedSkins,equippedSkin,rewardProgress,promo}

// Preço efetivo de uma skin para o piloto atual.
// Prioridade: promoção ativa > preço customizado pelo admin > padrão.
function shopPriceFor(skinId){
  const promo = profile?.promo;
  if (promo && promo.skinIds.includes(skinId)) {
    const others = promo.skinIds.filter(id => id !== skinId);
    const owned = shopOwnedSet();
    const hasOther = others.length > 0 && others.every(id => owned.has(id));
    if (!hasOther) return promo.price;
  }
  const custom = profile?.customPrices;
  if (custom && custom[skinId] != null) return custom[skinId];
  return SHOP_PRICE;
}
function shopIsPromo(skinId){
  const promo = profile?.promo;
  if (!promo || !promo.skinIds.includes(skinId)) return false;
  const others = promo.skinIds.filter(id => id !== skinId);
  const owned = shopOwnedSet();
  const hasOther = others.length > 0 && others.every(id => owned.has(id));
  return !hasOther;
}
function promoTimeLeftLabel(){
  const promo = profile?.promo;
  if (!promo) return '';
  const ms = promo.endsAt - Date.now();
  if (ms <= 0) return '';
  const days = Math.ceil(ms / 86400000);
  return days <= 1 ? 'Termina hoje!' : `Termina em ${days} dias`;
}
let authMode    = 'login'; // 'login' | 'register'



async function apiFetch(path, opts={}){
  const r = await fetch(path, {
    method: opts.method||'GET',
    headers: opts.body ? {'Content-Type':'application/json'} : undefined,
    credentials: 'same-origin',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch {}
  return { ok:r.ok, status:r.status, data };
}

async function refreshProfile(){
  const { ok, data } = await apiFetch('/api/me');
  if (!ok || data?.loggedIn === false) return false;
  profile = data;
  currentUser = data.user;
  pilotName = currentUser.displayName.toUpperCase();
  document.getElementById('menu-pilot-name').textContent = pilotName;
  document.getElementById('hud-pname').textContent = pilotName;
  updateCreditsBadge();
  updatePilotIconBtn();
  renderSkinGrid();
  applyModeSlotToggle();
  return true;
}

// O slot de modo "Teste"/"Tower Defense" é compartilhado: enquanto o
// torneio está ativo (até 21/06), esse slot vira "Tower Defense"; quando o
// torneio acaba, o slot volta a ser "Teste" automaticamente — sem precisar
// de ação manual, lendo `profile.tournament.active` vindo do servidor.
function applyModeSlotToggle(){
  const btn   = document.getElementById('mode-slot-teste');
  const icon  = document.getElementById('mode-slot-teste-icon');
  const label = document.getElementById('mode-slot-teste-label');
  if (!btn || !icon || !label) return;
  const tournamentOn = !!(profile && profile.tournament && profile.tournament.active);
  if (tournamentOn) {
    btn.dataset.mode = 'tower_defense';
    btn.classList.add('mode-tower-defense');
    btn.classList.remove('mode-teste');
    icon.innerHTML = '<path d="M12 2 L20 7 L20 14 L12 21 L4 14 L4 7 Z"/><path d="M12 2 L12 21 M4 7 L20 14 M20 7 L4 14" opacity=".55"/><circle cx="12" cy="11" r="2.6" fill="currentColor" stroke="none"/>';
    label.textContent = 'Tower Defense';
  } else {
    btn.dataset.mode = 'teste';
    btn.classList.add('mode-teste');
    btn.classList.remove('mode-tower-defense');
    icon.innerHTML = '<rect x="9" y="2" width="6" height="10" rx="1"/><path d="M7 12 L5 20 M17 12 L19 20"/><line x1="5" y1="20" x2="19" y2="20"/>';
    label.textContent = 'Teste';
  }
  // Se o modo selecionado era o do slot que acabou de mudar, realinha a dica.
  if (selectedMode==='teste' || selectedMode==='tower_defense') {
    selectedMode = btn.dataset.mode;
    document.getElementById('mode-tip').textContent = MODE_TIPS[selectedMode]||'';
  }
  renderModeStatus();
}

// ── Tutorial de boas-vindas — guia do piloto para novos usuários ──
// Mostrado uma única vez por conta (flag `tutorialSeen` persistida no
// servidor), explicando o objetivo do jogo passo a passo com uma nave de
// exemplo girando no centro da tela e um instrutor (avatar) narrando.
const TUTORIAL_STEPS = [
  {
    title: 'Bem-vindo, piloto!',
    text: 'Eu sou seu instrutor de voo. Essa na sua frente é a Shadow Roxa, uma das naves do hangar — repare nos motores na popa: é por ali que sai a propulsão enquanto você voa pela arena.',
  },
  {
    title: 'Como mover e atirar',
    text: 'Segure o BOTÃO DIREITO do mouse: sua nave voa até onde o cursor estiver — solte para parar. Pressione ESPAÇO para atirar; a mira segue automaticamente a posição do cursor, então é só apontar e disparar.',
  },
  {
    title: 'Dash — fuga rápida',
    text: 'Enquanto estiver se movendo, segure SHIFT para disparar um dash: um impulso curto e veloz na direção do movimento, ótimo para escapar de tiros inimigos ou se reposicionar no meio do combate.',
  },
  {
    title: 'Vida, escudo e mana',
    text: 'A barra VERMELHA é sua vida — não deixe zerar. A AZUL é o escudo, que absorve parte do dano antes de chegar à vida. Já a mana (combustível dos motores) é gasta ao mover e dar dash, e recarrega sozinha quando você fica parado.',
  },
  {
    title: 'Itens e evolução',
    text: 'Durante a partida aparecem itens flutuando pela arena — use as teclas 1 a 5 (e X pro slot bônus) para ativá-los: curas, escudos, tiros especiais e muito mais. Cada inimigo abatido também rende XP — suba de nível e seus tiros ficam mais fortes.',
  },
  {
    title: 'Modos de jogo',
    text: 'No menu você escolhe o modo: enfrente a IA em Contra 1/2, sobreviva a ondas infinitas no Survivor, ou entre em batalhas online — Equipe Online (PvP em times de 3) e o Torneio Tower Defense, onde duplas disputam o controle de uma torre.',
  },
  {
    title: 'Pronto para decolar!',
    text: 'Jogue para ganhar créditos e desbloquear naves novas na loja — inclusive a nova linha Arcade! Agora é só escolher um modo e iniciar sua primeira missão. Boa sorte, piloto!',
  },
];
let _tutStep = 0;
const TUTORIAL_SHIP_ID = 6; // Shadow Roxa — nave de exemplo do guia

function _drawTutorialShip(){
  const cv = document.getElementById('tutorial-ship-canvas');
  if (!cv) return;
  const cctx = cv.getContext('2d');
  const skin = SKINS.find(s=>s.id===TUTORIAL_SHIP_ID) || SKINS[0];
  function draw(){
    cctx.clearRect(0,0,cv.width,cv.height);
    cctx.save();
    cctx.translate(cv.width/2, cv.height/2);
    skin.drawPreview(cctx, cv.width/skin._size);
    cctx.restore();
  }
  if (skin.img){ skin.img.onload = draw; setTimeout(draw, 300); }
  draw();
}

function _renderTutorialStep(){
  const step = TUTORIAL_STEPS[_tutStep];
  document.getElementById('tut-step-label').textContent = `PASSO ${_tutStep+1} / ${TUTORIAL_STEPS.length}`;
  document.getElementById('tut-title').textContent = step.title;
  document.getElementById('tut-text').textContent = step.text;
  document.getElementById('tut-next-btn').textContent = (_tutStep === TUTORIAL_STEPS.length-1) ? 'COMEÇAR' : 'PRÓXIMO';
  const dotsEl = document.getElementById('tut-dots');
  dotsEl.innerHTML = '';
  for (let i=0;i<TUTORIAL_STEPS.length;i++){
    const d = document.createElement('div');
    d.className = 'tut-dot' + (i===_tutStep ? ' active' : '');
    dotsEl.appendChild(d);
  }
}

window.nextTutorialStep = function(){
  if (_tutStep < TUTORIAL_STEPS.length-1) {
    _tutStep++;
    _renderTutorialStep();
  } else {
    finishTutorial();
  }
};
window.skipTutorial = function(){ finishTutorial(); };

function finishTutorial(){
  document.getElementById('tutorial-overlay').style.display = 'none';
}

function maybeShowTutorial(){
  if (!profile || profile.tutorialSeen) return;
  // Marca como visto já ao EXIBIR (não só ao concluir/pular): se o usuário
  // der F5 no meio do guia, ele não deve reaparecer do zero.
  profile.tutorialSeen = true;
  if (currentUser) apiFetch('/api/profile/tutorial-seen', { method:'POST' }).catch(()=>{});
  _tutStep = 0;
  _renderTutorialStep();
  document.getElementById('tutorial-overlay').style.display = 'flex';
  _drawTutorialShip();
}

// ── Aviso de novo modo de jogo — exibido quando há um modo recém-lançado
// que o jogador ainda não viu (controlado por NEW_MODE_ANNOUNCEMENTS abaixo
// + lista `seenNewModes` salva localmente por conta).
const NEW_MODE_ANNOUNCEMENTS = [
  {
    id: 'tower_defense_v1',
    mode: 'tower_defense',
    title: 'Torneio Tower Defense chegou!',
    text: 'Um novo modo por tempo limitado: equipes 2x2 online disputam o controle de uma torre central. Destrua a torre do adversário antes que destruam a sua — e quem vencer leva a skin exclusiva "Hex Champion"!',
    icon: '<path d="M12 2 L20 7 L20 14 L12 21 L4 14 L4 7 Z"/><path d="M12 2 L12 21 M4 7 L20 14 M20 7 L4 14" opacity=".55"/><circle cx="12" cy="11" r="2.6" fill="currentColor" stroke="none"/>',
  },
];

function _seenNewModesKey(){
  return currentUser ? `arena_seen_new_modes_${currentUser.id}` : null;
}
function _getSeenNewModes(){
  const key = _seenNewModesKey();
  if (!key) return [];
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function _markNewModeSeen(id){
  const key = _seenNewModesKey();
  if (!key) return;
  const seen = _getSeenNewModes();
  if (!seen.includes(id)) { seen.push(id); localStorage.setItem(key, JSON.stringify(seen)); }
}

let _pendingNewModeId = null;
window.closeNewModeAlert = function(){
  document.getElementById('new-mode-overlay').style.display = 'none';
  if (_pendingNewModeId) { _markNewModeSeen(_pendingNewModeId); _pendingNewModeId = null; }
};

function maybeShowNewModeAlert(){
  if (!currentUser) return;
  const seen = _getSeenNewModes();
  // Só anuncia modos que estão de fato disponíveis agora (ex.: torneio ativo)
  const available = NEW_MODE_ANNOUNCEMENTS.find(a => {
    if (seen.includes(a.id)) return false;
    if (a.mode === 'tower_defense') return !!(profile && profile.tournament && profile.tournament.active);
    return true;
  });
  if (!available) return;
  _pendingNewModeId = available.id;
  document.getElementById('nm-title').textContent = available.title;
  document.getElementById('nm-text').textContent = available.text;
  document.getElementById('nm-icon').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${available.icon}</svg>`;
  document.getElementById('new-mode-overlay').style.display = 'flex';
}

function updateCreditsBadge(){
  const el = document.getElementById('credits-amount');
  if (el && currentUser) el.textContent = currentUser.credits;
}

// Anima o contador de créditos de `from` até `to` em ~600ms e pulsa o badge.
function animateCreditsGain(from, to) {
  const badgeEl  = document.getElementById('credits-amount');
  const shopEl   = document.getElementById('shop-balance');
  const profileEl= document.getElementById('ps-stat-credits');
  if (!badgeEl) return;

  const duration = 600;
  const start    = performance.now();
  const diff     = to - from;

  function tick(now) {
    const t    = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cúbico
    const val  = Math.round(from + diff * ease);
    badgeEl.textContent = val;
    if (shopEl)    shopEl.textContent    = val;
    if (profileEl) profileEl.textContent = val;
    if (t < 1) { requestAnimationFrame(tick); return; }
    // garante valor final exato
    badgeEl.textContent = to;
    if (shopEl)    shopEl.textContent    = to;
    if (profileEl) profileEl.textContent = to;
  }
  requestAnimationFrame(tick);

  // Pulso de brilho no badge do menu
  badgeEl.classList.remove('credits-gain-pulse');
  void badgeEl.offsetWidth;
  badgeEl.classList.add('credits-gain-pulse');
  setTimeout(() => badgeEl.classList.remove('credits-gain-pulse'), 900);
}

function showAuthError(msg){
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
}
function hideAuthError(){
  document.getElementById('auth-error').style.display='none';
}

const AUTH_ERROR_MESSAGES = {
  invalid_email: 'E-mail inválido.',
  missing_display_name: 'Informe um nome de piloto.',
  weak_password: 'A senha precisa ter pelo menos 6 caracteres.',
  email_taken: 'Este e-mail já está cadastrado.',
  invalid_credentials: 'E-mail ou senha incorretos.',
  invalid_google_token: 'Falha ao verificar conta Google.',
};

window.switchAuthTab = function(mode){
  authMode = mode;
  hideAuthError();
  document.getElementById('auth-tab-login').classList.toggle('active', mode==='login');
  document.getElementById('auth-tab-register').classList.toggle('active', mode==='register');
  document.getElementById('auth-field-name').style.display = mode==='register' ? 'flex' : 'none';
  document.getElementById('auth-submit-btn').textContent = mode==='register'
    ? '►   CRIAR CONTA   ◄' : '►   ENTRAR   ◄';
  document.getElementById('auth-password').setAttribute('autocomplete', mode==='register' ? 'new-password' : 'current-password');
};

window.authSubmit = function(ev){
  ev.preventDefault();
  hideAuthError();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const displayName = document.getElementById('auth-name').value.trim();

  const path = authMode==='register' ? '/api/auth/register' : '/api/auth/login';
  const body = authMode==='register' ? { email, password, displayName } : { email, password };

  apiFetch(path, { method:'POST', body }).then(async ({ok, data})=>{
    if (!ok) {
      showAuthError(AUTH_ERROR_MESSAGES[data?.error] || 'Não foi possível continuar. Tente novamente.');
      return;
    }
    await onAuthSuccess();
  });
  return false;
};

window.onGoogleCredential = function(response){
  hideAuthError();
  apiFetch('/api/auth/google', { method:'POST', body:{ idToken: response.credential } }).then(async ({ok, data})=>{
    if (!ok) { showAuthError(AUTH_ERROR_MESSAGES[data?.error] || 'Falha no login com Google.'); return; }
    await onAuthSuccess();
  });
};

async function onAuthSuccess(){
  await refreshProfile();
  loadHistory();
  showScreen('menu');
  maybeShowTutorial();
  if (!profile || profile.tutorialSeen) maybeShowNewModeAlert();
  maybeShowCreditBonus();
}

function maybeShowCreditBonus(){
  if (!currentUser) return;
  const key = 'credit_bonus_pack3_v2';
  if (localStorage.getItem(key)) return;
  // Só mostra para quem tem créditos (já comprou antes)
  if (currentUser.credits <= 0) return;
  localStorage.setItem(key, '1');
  showCreditBonusAnimation();
}

function showCreditBonusAnimation(){
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.85);backdrop-filter:blur(6px);
  `;
  overlay.innerHTML = `
    <div style="
      background:linear-gradient(160deg,#0b1e33,#040c18);
      border:2px solid #ffcc44;border-radius:12px;padding:40px 48px;text-align:center;
      max-width:420px;box-shadow:0 0 60px #ffcc4433;animation:bonusCardIn .4s cubic-bezier(.2,.9,.3,1.3);
    ">
      <div style="font-size:48px;margin-bottom:16px;animation:bonusSpin 1s ease-out;">&#127881;</div>
      <div style="font-family:'Press Start 2P',monospace;font-size:13px;color:#ffcc44;letter-spacing:2px;line-height:1.8;margin-bottom:8px;">
        PRESENTE PARA VOCE!
      </div>
      <div style="font-family:'Press Start 2P',monospace;font-size:10px;color:#7aa0c0;line-height:1.8;margin-bottom:20px;">
        Melhoramos o pacote R$ 3,00<br>
        de 240 para <span style="color:#00d4ff;font-size:13px;">280 CR</span><br>
        <span style="color:#00ffaa;">+40 creditos</span> foram adicionados<br>a sua conta como compensacao!
      </div>
      <div id="bonus-cr-display" style="font-family:'Press Start 2P',monospace;font-size:28px;color:#ffcc44;margin-bottom:24px;text-shadow:0 0 20px #ffcc4466;">
        +40 CR
      </div>
      <button onclick="this.closest('div[style*=fixed]').remove()" style="
        font-family:'Press Start 2P',monospace;font-size:9px;letter-spacing:1px;
        background:linear-gradient(135deg,#ffcc00,#ff8800);color:#1a1100;
        border:none;border-radius:6px;padding:14px 32px;cursor:pointer;
        box-shadow:0 4px 20px #ffcc0044;transition:transform .15s;
      " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
        RECEBER AGORA
      </button>
    </div>
    <style>
      @keyframes bonusCardIn{from{opacity:0;transform:scale(.7) translateY(30px)}to{opacity:1;transform:none}}
      @keyframes bonusSpin{0%{transform:rotate(-20deg) scale(0)}60%{transform:rotate(10deg) scale(1.2)}100%{transform:rotate(0) scale(1)}}
    </style>
  `;
  document.body.appendChild(overlay);
  // Pulsa o número de créditos na tela principal junto
  setTimeout(() => {
    const prev = currentUser.credits - 40;
    animateCreditsGain(prev, currentUser.credits);
  }, 600);
}

// Carrega o botão Google Sign-In apenas quando necessário (tela de login).
// Chamada só pelo boot() quando não há sessão ativa — evita requisições
// desnecessárias ao Google e o auto-prompt (One Tap) para usuários já logados.
async function setupGoogleSignIn(){
  const { data } = await apiFetch('/api/config');
  const clientId = data && data.googleClientId;
  if (!clientId) return;
  const area = document.getElementById('google-signin-area');
  area.style.display = 'block';
  const onload = document.createElement('div');
  onload.id = 'g_id_onload';
  onload.dataset.client_id = clientId;
  onload.dataset.callback = 'onGoogleCredential';
  onload.dataset.auto_prompt = 'false'; // nunca dispara One Tap automático
  document.getElementById('g_id_signin_container').appendChild(onload);
  const btn = document.createElement('div');
  btn.className = 'g_id_signin';
  btn.dataset.type = 'standard';
  btn.dataset.theme = 'filled_black';
  btn.dataset.size = 'medium';
  document.getElementById('g_id_signin_container').appendChild(btn);
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true; script.defer = true;
  document.head.appendChild(script);
}
// NÃO chama setupGoogleSignIn() aqui — é chamada pelo boot() apenas se não houver sessão.

const MODE_TIPS={
  contra1: 'CONTRA 1 — 5 VIDAS CADA. QUEM PERDER TODAS PRIMEIRO PERDE!',
  contra2: 'CONTRA 2 — 2 INIMIGOS. MANTENHA DISTÂNCIA.',
  equipe_online: 'EQUIPE ONLINE — PvP em times (até 6, 3x3). Primeira equipe a 200 abates vence!',
  livre:   'LIVRE — SEM TIMER. PRATIQUE À VONTADE.',
  teste:   'TESTE — INIMIGOS NÃO ATACAM.',
  tower_defense: 'TORNEIO TOWER DEFENSE — destrua a torre central para conquistá-la! 2x2 online, vencedores ganham a skin exclusiva "Hex Champion".',
  survivor:'SURVIVOR — ONDAS INFINITAS. SOBREVIVA!',
};

// ── Status dos modos de jogo (badge perto do nome do piloto) ─────
// Fonte única de verdade: tanto o bloqueio de acesso (selectMode/startGame)
// quanto o painel "Status dos Modos" leem essa lista. O slot dinâmico
// Teste/Tower Defense muda de id conforme `profile.tournament.active`
// (mesma regra usada em applyModeSlotToggle).
function modeStatusEntries(){
  const tournamentOn = !!(profile && profile.tournament && profile.tournament.active);
  return [
    { id:'contra1',       label:'Contra 1',              maintenance:_disabledModes.includes('contra1') },
    { id:'contra2',       label:'Contra 2',              maintenance:_disabledModes.includes('contra2') },
    { id:'equipe_online', label:'Equipe Online',         maintenance:_disabledModes.includes('equipe_online') },
    { id:'livre',         label:'Livre',                 maintenance:_disabledModes.includes('livre') },
    tournamentOn
      ? { id:'tower_defense', label:'Torneio Tower Defense', maintenance:_disabledModes.includes('tower_defense') }
      : { id:'teste',         label:'Teste',                 maintenance:_disabledModes.includes('teste') },
    { id:'survivor',      label:'Survivor',              maintenance:_disabledModes.includes('survivor') },
  ];
}
function isModeInMaintenance(mode){
  return modeStatusEntries().some(m => m.id===mode && m.maintenance);
}

window.closeMaintenanceAlert = function(){
  document.getElementById('maintenance-overlay').style.display = 'none';
};
function showMaintenanceAlert(mode){
  const entry = modeStatusEntries().find(m => m.id===mode);
  document.getElementById('maint-title').textContent = `${entry ? entry.label : 'Este modo'} — em manutenção`;
  document.getElementById('maint-text').textContent =
    'Estamos fazendo ajustes nesse modo e ele está temporariamente fora do ar — não é possível entrar agora. Volte em breve, logo, logo ele estará de volta!';
  document.getElementById('maintenance-overlay').style.display = 'flex';
}

function renderModeStatus(){
  const entries = modeStatusEntries();
  const dot = document.getElementById('mode-status-dot');
  if (dot) dot.classList.toggle('maint', entries.some(m => m.maintenance));
  const list = document.getElementById('mode-status-list');
  if (!list) return;
  list.innerHTML = entries.map(m => `
    <div class="mode-status-row${m.maintenance ? ' maint' : ''}">
      <span class="mode-status-row-dot"></span>
      <span class="mode-status-row-label">${m.label}</span>
      <span class="mode-status-row-state">${m.maintenance ? 'Em manutenção' : 'Operacional'}</span>
    </div>`).join('');
}
window.openModeStatus = function(){
  renderModeStatus();
  document.getElementById('mode-status-modal').style.display = 'flex';
};
window.closeModeStatus = function(){
  document.getElementById('mode-status-modal').style.display = 'none';
};

// Monta o logo do menu letra a letra — cada caractere ganha um delay
// individual (--i) para que o CSS o "atire" na tela em sequência,
// como se o nome do jogo fosse formado por uma rajada de tiros.
function _buildShotText(container, text, startIndex){
  container.innerHTML='';
  let i=startIndex;
  for(const ch of text){
    const span=document.createElement('span');
    const isSpace = ch === ' ' || ch === ' ';
    span.className='mls-letter'+(isSpace?' is-space':'');
    span.style.setProperty('--i', i);
    span.textContent = isSpace ? ' ' : ch;
    container.appendChild(span);
    i++;
  }
  return i;
}
{
  const mainText='TOWER DEFENSE';
  const next=_buildShotText(document.getElementById('mls-line-main'), mainText, 0);
  _buildShotText(document.getElementById('mls-line-sub'), 'ON THE SPACE', next+2);
}

// ── Fundo arcade animado na tela de login ─────────────────────
const loginBg=document.getElementById('login-bg-canvas');
function resizeLoginBg(){loginBg.width=window.innerWidth;loginBg.height=window.innerHeight;}
resizeLoginBg(); window.addEventListener('resize',resizeLoginBg);

// ── Música da tela inicial: toca 1 vez por sessão/carregamento ─
(function initLoginMusic(){
  const music = document.getElementById('login-music');
  if (!music) return;
  music.volume = 0.5;
  const FLAG = 'arena_login_music_played';

  function tryPlay(){
    if (sessionStorage.getItem(FLAG)) return cleanup();
    // Não checamos mais se a tela de login está visível: contas com sessão
    // salva pulam direto pro menu (showScreen pausa a música antes do 1º
    // gesto) — bloquear aqui faria a música nunca tocar nesses casos, que
    // são a maioria no Android/desktop (no iPhone a sessão raramente
    // persiste, por isso só lá o piloto sempre passava pela tela de login).
    // music.play() funciona normalmente mesmo após showScreen() pausá-la.
    // Só marca como "tocada" e limpa os listeners se o play() realmente
    // for aceito — navegadores como Chrome/Android podem rejeitar a
    // primeira tentativa (gesto não qualificado); deixamos outros gestos
    // tentarem novamente em vez de desistir após a 1ª rejeição.
    music.play().then(()=>{
      sessionStorage.setItem(FLAG, '1');
      cleanup();
    }).catch(()=>{});
  }
  function cleanup(){
    document.removeEventListener('click', tryPlay);
    document.removeEventListener('keydown', tryPlay);
    document.removeEventListener('touchstart', tryPlay);
    ['auth-tab-login','auth-tab-register','auth-submit-btn'].forEach(id=>{
      const el = document.getElementById(id);
      if (el) el.removeEventListener('click', tryPlay);
    });
  }

  if (sessionStorage.getItem(FLAG)) return;
  // Gatilhos genéricos (cobrem o caso comum: 1º toque/clique em qualquer lugar)
  document.addEventListener('click', tryPlay, { once:true });
  document.addEventListener('keydown', tryPlay, { once:true });
  document.addEventListener('touchstart', tryPlay, { once:true });
  // Gatilhos diretos nos botões de ação da tela de login — em alguns
  // navegadores Android/desktop (Chrome), o autoplay de mídia só é liberado
  // por um gesto "qualificado" (toque/clique direto num elemento interativo
  // como um botão); cliques em campos de texto ou eventos genéricos no
  // documento podem não satisfazer a política de autoplay. Os botões abaixo
  // garantem um gesto inequívoco — sem o `once`, pois `tryPlay` já se
  // autolimpa via `cleanup()`/flag de sessão após a 1ª execução bem-sucedida.
  ['auth-tab-login','auth-tab-register','auth-submit-btn'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', tryPlay);
  });
})();

(function animateLoginBg(){
  const ctx=loginBg.getContext('2d');
  const W=loginBg.width, H=loginBg.height;
  const t=Date.now()/1000;

  // Fundo
  ctx.fillStyle='#020508'; ctx.fillRect(0,0,W,H);

  // Nebulosa central
  const cx=W/2, cy=H*0.42;
  const gn=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.min(W,H)*0.55);
  gn.addColorStop(0,'rgba(0,80,120,0.18)');
  gn.addColorStop(0.4,'rgba(0,40,80,0.08)');
  gn.addColorStop(1,'transparent');
  ctx.fillStyle=gn; ctx.fillRect(0,0,W,H);

  // Grade neon pulsante
  const gs=60, gridPulse=0.3+0.2*Math.sin(t*0.7);
  ctx.strokeStyle='#001428'; ctx.lineWidth=0.6; ctx.globalAlpha=gridPulse;
  for (let x=0;x<W;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for (let y=0;y<H;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  ctx.globalAlpha=1;

  // Estrelas pixel animadas
  if (!animateLoginBg._stars){
    animateLoginBg._stars=Array.from({length:180},()=>({
      x:Math.random()*W,y:Math.random()*H,
      r:Math.random()*1.6+0.2,
      a:Math.random()*0.7+0.1,
      sp:0.4+Math.random()*1.4,
      bk:Math.random()*Math.PI*2,
      px:Math.random()<0.15,
    }));
  }
  for (const s of animateLoginBg._stars){
    const a=s.a*(0.4+0.6*Math.sin(t*s.sp+s.bk));
    ctx.fillStyle=`rgba(140,200,255,${a})`;
    if(s.px){ctx.fillRect(s.x-s.r,s.y-s.r,s.r*2,s.r*2);}
    else{ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();}
  }

  // Naves do próprio jogo cruzando o fundo, deixando um rastro luminoso
  if (!animateLoginBg._ships) animateLoginBg._ships = [];
  const ships = animateLoginBg._ships;
  if (Math.random() < 0.012 && ships.length < 4 && SKINS.length) {
    const dir = Math.random()<0.5 ? 1 : -1;
    const depth = 0.5 + Math.random()*0.9; // tamanho/brilho relativo (perspectiva)
    ships.push({
      x: dir>0 ? -70 : W+70,
      y: H*(0.12+Math.random()*0.6),
      dir, depth,
      speed: (40+Math.random()*70)*dir,
      skin: SKINS[Math.floor(Math.random()*SKINS.length)],
      bob: Math.random()*Math.PI*2,
      trail: [],
    });
  }
  for (let i=ships.length-1;i>=0;i--){
    const s = ships[i];
    s.x += s.speed * (1/60);
    const yy = s.y + Math.sin(t*1.6+s.bob)*6;
    const sz = 15*s.depth;

    // Memoriza posições recentes para desenhar o rastro
    s.trail.push({x:s.x,y:yy});
    if (s.trail.length>16) s.trail.shift();

    const hue = s.skin.color || '#5be8ff';
    ctx.save();
    ctx.globalAlpha = 0.3*s.depth + 0.12;
    for (let k=0;k<s.trail.length;k++){
      const p=s.trail[k];
      const a=(k/s.trail.length);
      ctx.beginPath();
      ctx.fillStyle=hue;
      ctx.globalAlpha=(0.3*s.depth+0.12)*a*0.5;
      ctx.arc(p.x - s.dir*sz*0.9, p.y, sz*0.32*a, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(s.x, yy);
    ctx.rotate(s.dir>0 ? Math.PI/2 : -Math.PI/2);
    ctx.globalAlpha = 0.32*s.depth + 0.16;
    ctx.shadowColor = hue; ctx.shadowBlur = 9*s.depth;
    s.skin.drawPreview(ctx, (sz*2)/s.skin._size);
    ctx.restore();
    ctx.globalAlpha = 1;

    if ((s.dir>0 && s.x > W+90) || (s.dir<0 && s.x < -90)) ships.splice(i,1);
  }

  // Scanlines
  ctx.globalAlpha=0.03; ctx.fillStyle='#000';
  for (let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
  ctx.globalAlpha=1;

  requestAnimationFrame(animateLoginBg);
})();

// ── Skin grid no menu (bloqueada/desbloqueada conforme posse) ─
const grid=document.getElementById('skin-grid');
function renderSkinGrid(){
  const owned = new Set(profile ? profile.ownedSkins : [economy_FREE_SKIN_ID]);
  const equipped = profile ? profile.equippedSkin : economy_FREE_SKIN_ID;
  grid.innerHTML='';
  // Agrupa: equipada primeiro, depois as demais já desbloqueadas (compradas
  // ou ganhas — ficam lado a lado nas primeiras linhas), por fim as bloqueadas.
  // Assim, toda skin nova que o piloto destrava aparece junto das outras já
  // ativas, em vez de espalhada entre as bloqueadas.
  const rank = (s)=> s.id===equipped ? 0 : (owned.has(s.id) ? 1 : 2);
  const ordered = [...SKINS].sort((a,b)=> rank(a)-rank(b));
  ordered.forEach(skin=>{
    const isOwned = owned.has(skin.id);
    const isEquipped = skin.id===equipped;
    if (isEquipped) selectedSkin = skin.id;
    const card=document.createElement('div');
    card.className='skin-card'+(isEquipped?' active':'')+(isOwned?'':' locked');
    card.dataset.id=skin.id;
    const cv=document.createElement('canvas'); cv.width=cv.height=42;
    const cctx=cv.getContext('2d');
    function drawCard(){cctx.clearRect(0,0,42,42);cctx.save();cctx.translate(21,21);skin.drawPreview(cctx,42/skin._size);cctx.restore();}
    if(skin.img){skin.img.onload=drawCard;setTimeout(drawCard,300);}
    drawCard();
    const info=document.createElement('div');
    info.className='skin-info';
    info.innerHTML = isOwned
      ? `<div class="skin-name">${skin.name}</div><div class="skin-sub">${skin.color.toUpperCase()}</div>`
      : `<div class="skin-name">${skin.name}</div><div class="skin-sub skin-price">${SHOP_PRICE} CR</div>`;
    card.append(cv,info);
    card.onclick=()=> isOwned ? equipSkin(skin.id) : openShopAt(skin.id);
    grid.appendChild(card);
  });
}

// ── Loja: carrossel de naves (esquerda → direita, vitrine na direita) ──
// ── Ícones de perfil (sistema separado das skins de nave — todo
// jogador escolhe livremente, sem custo nem posse) ────────────
function currentProfileIconId(){
  return profile ? (profile.profileIcon||0) : 0;
}

// Renderiza o ícone (ilustração canvas) dentro de `el`, substituindo
// qualquer conteúdo anterior — usado no botão do piloto e no seletor.
function _renderIconInto(el, iconId, px){
  el.innerHTML = '';
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  cv.style.width = cv.style.height = '100%';
  drawProfileIcon(cv.getContext('2d'), iconId, px, px);
  el.appendChild(cv);
}

function updatePilotIconBtn(){
  const btn = document.getElementById('pilot-icon-btn');
  if (btn) _renderIconInto(btn, currentProfileIconId(), 44);
}

window.openIconPicker = function(){
  if (!currentUser) return;
  const grid = document.getElementById('icon-picker-grid');
  const equipped = currentProfileIconId();
  grid.innerHTML = '';
  PROFILE_ICON_DEFS.forEach((_, idx)=>{
    const item = document.createElement('div');
    item.className = 'icon-picker-item'+(idx===equipped?' active':'');
    item.onclick = ()=> setProfileIcon(idx);
    _renderIconInto(item, idx, 64);
    grid.appendChild(item);
  });
  document.getElementById('icon-picker-overlay').classList.add('show');
};

window.closeIconPicker = function(){
  document.getElementById('icon-picker-overlay').classList.remove('show');
};

window.setProfileIcon = async function(iconId){
  const { ok, data } = await apiFetch('/api/profile/icon', { method:'POST', body:{ iconId } });
  if (ok && data) {
    profile.profileIcon = data.profileIcon;
    updatePilotIconBtn();
    closeIconPicker();
  }
};

window.openNameEdit = function(){
  if (!currentUser) return;
  const input = document.getElementById('name-edit-input');
  input.value = currentUser.displayName || '';
  document.getElementById('name-edit-error').style.display = 'none';
  document.getElementById('name-edit-overlay').classList.add('show');
  input.focus();
};

window.closeNameEdit = function(){
  document.getElementById('name-edit-overlay').classList.remove('show');
};

window.saveNameEdit = async function(){
  const input = document.getElementById('name-edit-input');
  const errorEl = document.getElementById('name-edit-error');
  const displayName = input.value.trim();
  if (!displayName) {
    errorEl.textContent = 'Digite um nome.';
    errorEl.style.display = '';
    return;
  }
  const { ok, data } = await apiFetch('/api/profile/name', { method:'POST', body:{ displayName } });
  if (ok && data) {
    currentUser.displayName = data.displayName;
    pilotName = data.displayName.toUpperCase();
    document.getElementById('menu-pilot-name').textContent = pilotName;
    closeNameEdit();
  } else {
    errorEl.textContent = 'Não foi possível salvar o nome. Tente novamente.';
    errorEl.style.display = '';
  }
};

let shopSelectedId = null;

window.equipSkin = async function(skinId){
  if (!currentUser) return;
  const { ok, data } = await apiFetch('/api/shop/equip', { method:'POST', body:{ skinId } });
  if (ok && data) {
    profile.equippedSkin = data.equippedSkin;
    currentUser.equippedSkin = data.equippedSkin;
    renderSkinGrid();
  }
};

function shopOwnedSet(){
  return new Set(profile ? profile.ownedSkins : [economy_FREE_SKIN_ID]);
}

function shopAvailableSkins(){
  // A vitrine só mostra naves que o piloto ainda não possui — comprar o que já se tem não faz sentido.
  // Skins de recompensa (ex.: "Hex Champion" do torneio) nunca aparecem para compra.
  const owned = shopOwnedSet();
  return SKINS.filter(s=>!owned.has(s.id) && !REWARD_ONLY_SKIN_IDS.includes(s.id));
}

function buildShopTrack(){
  const track = document.getElementById('shop-track');
  track.innerHTML = '';
  const available = shopAvailableSkins();

  if (!available.length) {
    track.innerHTML = `<div class="shop-track-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 16 L7 6 L17 6 L19 16 Z"/><circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/></svg>
      <span>Você já desbloqueou todas as naves disponíveis!</span>
    </div>`;
    return;
  }

  // Agrupa: linha clássica primeiro, depois — separadas por uma divisória —
  // as naves da linha Arcade (novidade, com seu próprio visual de motores).
  const classics = available.filter(s=>!s.isArcade);
  const arcades  = available.filter(s=>s.isArcade);
  let i = 0;
  function appendCard(skin){
    const card = document.createElement('div');
    card.className = 'shop-card' + (skin.id===shopSelectedId ? ' selected' : '');
    card.dataset.id = skin.id;
    card.style.setProperty('--i', i++);
    const cv = document.createElement('canvas'); cv.width = cv.height = 56;
    const cctx = cv.getContext('2d');
    function draw(){
      cctx.clearRect(0,0,56,56);
      cctx.save(); cctx.translate(28,28);
      skin.drawPreview(cctx, 56/skin._size);
      cctx.restore();
    }
    if (skin.img){ skin.img.onload=draw; setTimeout(draw,300); }
    draw();
    const name = document.createElement('div');
    name.className = 'shop-card-name';
    name.textContent = skin.name;
    const tag = document.createElement('div');
    const price = shopPriceFor(skin.id);
    const isPromo = shopIsPromo(skin.id);
    tag.className = 'shop-card-tag locked' + (isPromo ? ' promo' : '');
    tag.innerHTML = isPromo
      ? `<span class="shop-card-tag-old">${SHOP_PRICE} CR</span> ${price} CR`
      : `${price} CR`;
    card.append(cv, name, tag);
    if (isPromo) {
      const badge = document.createElement('div');
      badge.className = 'shop-card-promo-badge';
      badge.textContent = 'OFERTA';
      card.appendChild(badge);
    }
    card.onclick = () => selectShopSkin(skin.id);
    track.appendChild(card);
  }
  classics.forEach(appendCard);
  if (classics.length && arcades.length) {
    const divider = document.createElement('div');
    divider.className = 'shop-track-divider';
    divider.innerHTML = '<span>LINHA ARCADE</span>';
    track.appendChild(divider);
  }
  arcades.forEach(appendCard);
}

function drawShopFrame(skin){
  const cv = document.getElementById('shop-skin-canvas');
  const cctx = cv.getContext('2d');
  function draw(){
    cctx.clearRect(0,0,cv.width,cv.height);
    cctx.save();
    cctx.translate(cv.width/2,cv.height/2);
    skin.drawPreview(cctx, cv.width/skin._size);
    cctx.restore();
  }
  if (skin.img){ skin.img.onload=draw; setTimeout(draw,300); }
  draw();
}

window.selectShopSkin = function(skinId){
  const skin = SKINS.find(s=>s.id===skinId);
  if (!skin) return;
  shopSelectedId = skinId;
  const errEl = document.getElementById('shop-error');
  errEl.style.display = 'none';
  errEl.textContent = '';
  const successEl = document.getElementById('shop-success');
  successEl.style.display = 'none';
  successEl.style.animation = 'none';

  document.getElementById('shop-skin-name').textContent = skin.name;
  const statusEl = document.getElementById('shop-skin-status');
  const isPromo = shopIsPromo(skin.id);
  const price = shopPriceFor(skin.id);
  statusEl.textContent = isPromo ? `OFERTA POR TEMPO LIMITADO — ${promoTimeLeftLabel()}` : 'BLOQUEADA';
  statusEl.className = 'shop-frame-status' + (isPromo ? ' promo' : '');
  const priceEl = document.getElementById('shop-skin-price');
  priceEl.style.display = 'block';
  priceEl.innerHTML = isPromo
    ? `<span class="shop-card-tag-old">${SHOP_PRICE} CR</span> ${price} CR`
    : `${price} CR`;
  priceEl.classList.toggle('promo', isPromo);
  document.getElementById('shop-buy-btn').style.display = 'flex';
  document.getElementById('shop-equip-btn').style.display = 'none';
  drawShopFrame(skin);

  // Atualiza destaque na esteira sem reconstruir tudo
  document.querySelectorAll('#shop-track .shop-card').forEach(c=>{
    c.classList.toggle('selected', Number(c.dataset.id)===skinId);
  });
};

window.shopScroll = function(dir){
  const track = document.getElementById('shop-track');
  track.scrollBy({ left: dir * 130, behavior: 'smooth' });
};

window.openShop = async function(){
  if (!currentUser) return;
  // Atualiza precos/promo antes de mostrar — evita valores stale de sessoes longas
  try {
    const { ok, data } = await apiFetch('/api/me');
    if (ok && data?.loggedIn !== false) {
      if (data.promo        !== undefined) profile.promo        = data.promo;
      if (data.customPrices !== undefined) profile.customPrices = data.customPrices;
      currentUser.credits = data.user?.credits ?? currentUser.credits;
    }
  } catch(e) {}
  document.getElementById('shop-balance').textContent = currentUser.credits;
  updateCreditsBadge();
  switchShopTab('ships');
  buildShopTrack();
  const available = shopAvailableSkins();
  const frame = document.getElementById('shop-frame');
  if (available.length) { frame.style.display = ''; selectShopSkin(available[0].id); }
  else { frame.style.display = 'none'; }
  document.getElementById('shop-modal').style.display='flex';
};

window.openShopAt = async function(skinId){
  if (!currentUser) return;
  try {
    const { ok, data } = await apiFetch('/api/me');
    if (ok && data?.loggedIn !== false) {
      if (data.promo        !== undefined) profile.promo        = data.promo;
      if (data.customPrices !== undefined) profile.customPrices = data.customPrices;
      currentUser.credits = data.user?.credits ?? currentUser.credits;
    }
  } catch(e) {}
  document.getElementById('shop-balance').textContent = currentUser.credits;
  updateCreditsBadge();
  switchShopTab('ships');
  buildShopTrack();
  const available = shopAvailableSkins();
  const frame = document.getElementById('shop-frame');
  const target = available.find(s=>s.id===skinId) ? skinId : available[0]?.id;
  if (target!=null) { frame.style.display = ''; selectShopSkin(target); }
  else { frame.style.display = 'none'; }
  document.getElementById('shop-modal').style.display='flex';
  setTimeout(()=>{
    const card = document.querySelector(`#shop-track .shop-card[data-id="${target}"]`);
    if (card) card.scrollIntoView({ behavior:'instant', inline:'center', block:'nearest' });
  }, 0);
};

window.closeShop = function(){
  _stopAllTrailPreviews();
  document.getElementById('shop-modal').style.display='none';
};

function setBtnLoading(btn, loading){
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

window.equipFromShop = async function(){
  if (shopSelectedId==null) return;
  const btn = document.getElementById('shop-equip-btn');
  if (btn.disabled) return;
  setBtnLoading(btn, true);
  try { await equipSkin(shopSelectedId); }
  finally { setBtnLoading(btn, false); }
};

const SHOP_ERROR_MESSAGES = {
  insufficient_credits: 'Créditos insuficientes!',
  already_owned: 'Você já possui esta skin.',
  rate_limited: 'Muitas tentativas seguidas — aguarde um instante.',
};

window.confirmPurchase = async function(){
  if (shopSelectedId==null) return;
  const btn = document.getElementById('shop-buy-btn');
  if (btn.disabled) return;
  setBtnLoading(btn, true);
  const errEl = document.getElementById('shop-error');
  errEl.style.display = 'none';
  try {
    const purchasedId = shopSelectedId;
    const { ok, data } = await apiFetch('/api/shop/buy', { method:'POST', body:{ skinId: purchasedId } });
    if (ok && data) {
      profile = data;
      currentUser.credits = data.user.credits;
      currentUser.equippedSkin = data.equippedSkin;
      updateCreditsBadge();
      renderSkinGrid();
      document.getElementById('shop-balance').textContent = currentUser.credits;

      // Animação de sucesso: substitui temporariamente o botão "Comprar"
      const skin = SKINS.find(s=>s.id===purchasedId);
      btn.style.display = 'none';
      const successEl = document.getElementById('shop-success');
      successEl.style.animation = 'none';
      void successEl.offsetWidth; // reinicia a animação
      successEl.style.animation = '';
      successEl.style.display = 'flex';
      showNotify(`${skin ? skin.name : 'Skin'} desbloqueada!`);
      setTimeout(()=>{
        successEl.style.display = 'none';
        btn.style.display = '';
        // A nave comprada some da vitrine — seleciona a próxima disponível (se houver).
        buildShopTrack();
        const available = shopAvailableSkins();
        const frame = document.getElementById('shop-frame');
        if (available.length) { frame.style.display = ''; selectShopSkin(available[0].id); }
        else { frame.style.display = 'none'; }
      }, 1400);
      return;
    }
    errEl.textContent = (data && SHOP_ERROR_MESSAGES[data.error]) || 'Não foi possível concluir a compra.';
    errEl.style.display = 'block';
  } finally {
    setBtnLoading(btn, false);
  }
};

// ── Loja: aba de Créditos (compra com dinheiro real via Mercado Pago) ──
let creditPackagesLoaded = false;

window.switchShopTab = function(tab){
  const shipsBtn   = document.getElementById('shop-tab-ships-btn');
  const trailsBtn  = document.getElementById('shop-tab-trails-btn');
  const creditsBtn = document.getElementById('shop-tab-credits-btn');
  const shipsBody   = document.getElementById('shop-tab-ships');
  const trailsBody  = document.getElementById('shop-tab-trails');
  const creditsBody = document.getElementById('shop-tab-credits');
  shipsBtn.classList.toggle('active',   tab === 'ships');
  trailsBtn.classList.toggle('active',  tab === 'trails');
  creditsBtn.classList.toggle('active', tab === 'credits');
  shipsBody.style.display   = tab === 'ships'   ? 'flex'  : 'none';
  trailsBody.style.display  = tab === 'trails'  ? 'block' : 'none';
  creditsBody.style.display = tab === 'credits' ? 'flex'  : 'none';
  if (tab === 'trails') buildTrailsTab();
  if (tab === 'credits' && !creditPackagesLoaded) loadCreditPackages();
};

// ── Loja: aba de Rastros ──────────────────────────────────────
let _trailPreviewCanvases = [];

function _stopAllTrailPreviews(){
  _trailPreviewCanvases.forEach(cv => {
    if (cv._trailAnimId) { cancelAnimationFrame(cv._trailAnimId); cv._trailAnimId = null; }
  });
  _trailPreviewCanvases = [];
}

function buildTrailsTab(){
  _stopAllTrailPreviews();
  const grid = document.getElementById('shop-trails-grid');
  if (!grid) return;
  const owned    = new Set(profile?.ownedTrails || []);
  const equipped = profile?.equippedTrail ?? 0;
  grid.innerHTML = '';

  TRAILS.forEach(trail => {
    const isOwned    = trail.free || owned.has(trail.id);
    const isEquipped = equipped === trail.id;

    const card = document.createElement('div');
    card.className = 'trail-card' + (isEquipped ? ' trail-equipped' : '');

    // Canvas preview animado
    const cv = document.createElement('canvas');
    cv.width = 80; cv.height = 80;
    _trailPreviewCanvases.push(cv);
    startTrailPreview(cv, trail);

    // Nome
    const nameEl = document.createElement('div');
    nameEl.className = 'trail-card-name';
    nameEl.textContent = trail.name;

    // Preço (só para rastros pagos não possuídos)
    let priceEl = null;
    if (!isOwned && trail.price > 0) {
      priceEl = document.createElement('div');
      priceEl.className = 'trail-card-price';
      priceEl.textContent = trail.price + ' CR';
    }

    // Botão
    const btn = document.createElement('button');
    btn.className = 'play-btn trail-card-btn';
    btn.setAttribute('aria-label', trail.name);
    if (isEquipped) {
      btn.textContent = 'EQUIPADO';
      btn.disabled = true;
      btn.style.cssText = 'background:linear-gradient(90deg,#0a4,#0f8);color:#020a14;cursor:default;';
    } else if (isOwned) {
      btn.textContent = 'EQUIPAR';
      btn.addEventListener('click', (e) => { e.stopPropagation(); equipTrail(trail.id); });
    } else {
      btn.textContent = 'COMPRAR';
      btn.addEventListener('click', (e) => { e.stopPropagation(); buyTrail(trail.id); });
    }

    // Clicar no card equipa/compra também (exceto se já equipado)
    if (!isEquipped) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => isOwned ? equipTrail(trail.id) : buyTrail(trail.id));
    }

    const els = [cv, nameEl];
    if (priceEl) els.push(priceEl);
    els.push(btn);
    card.append(...els);
    grid.appendChild(card);
  });
}

function startTrailPreview(canvas, trailDef){
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let t = 0;
  let points = [];
  if (canvas._trailAnimId) cancelAnimationFrame(canvas._trailAnimId);

  // Para "Sem Rastro" só desenha a nave parada
  if (trailDef.style === 'none') {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W/2, H/2);
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(7, 8); ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = '#aaddff';
    ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
    return;
  }

  function tick(){
    t += 0.04;
    ctx.clearRect(0, 0, W, H);
    const r = Math.min(W, H) * 0.28;
    const cx = W/2 + Math.cos(t) * r;
    const cy = H/2 + Math.sin(t) * r;
    // Emite partícula a cada tick
    points.push({ x: cx, y: cy, life: 1 });
    points = points.filter(p => p.life > 0);
    points.forEach(p => {
      p.life -= 0.055;
      if (p.life > 0) drawPreviewParticle(ctx, p, p.life, trailDef, W, H);
    });
    // Nave
    const ang = Math.atan2(Math.sin(t + Math.PI/2) * r, Math.cos(t + Math.PI/2) * r);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = '#aaddff';
    ctx.shadowColor = '#00d4ff88'; ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
    canvas._trailAnimId = requestAnimationFrame(tick);
  }
  tick();
}

function drawPreviewParticle(ctx, p, a, trailDef, W, H){
  const color = trailDef.colors[Math.floor(Math.random() * trailDef.colors.length)];
  ctx.save();
  ctx.globalAlpha = a * 0.9;
  if (trailDef.style === 'flame') {
    const r = 5 * a;
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.8);
    grd.addColorStop(0, color);
    grd.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 2.8, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
  } else if (trailDef.style === 'sparkle') {
    const sz = 4 * a;
    ctx.fillStyle = color;
    ctx.shadowColor = trailDef.glow || color;
    ctx.shadowBlur = 6;
    // Estrela de 4 pontas
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(ang) * sz, p.y + Math.sin(ang) * sz);
      ctx.lineWidth = 1.5 * a;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  } else if (trailDef.style === 'lightning') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * a;
    ctx.shadowColor = trailDef.glow || color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + (Math.random()-0.5)*10, p.y + (Math.random()-0.5)*10);
    ctx.stroke();
  } else { // smoke
    const r = 7 * a;
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    grd.addColorStop(0, color + 'cc');
    grd.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
  }
  ctx.restore();
}

async function buyTrail(trailId){
  const { ok, data } = await apiFetch('/api/shop/trail/buy', { method:'POST', body:{ trailId } });
  if (!ok) {
    const msg = data?.error === 'already_owned' ? 'Rastro já possuído'
              : data?.error === 'not_enough_credits' ? 'Créditos insuficientes'
              : (data?.error || 'Erro ao comprar rastro');
    showNotify(msg);
    return;
  }
  currentUser.credits = data.credits;
  document.getElementById('shop-balance').textContent = data.credits;
  updateCreditsBadge();
  if (!profile.ownedTrails) profile.ownedTrails = [];
  profile.ownedTrails.push(trailId);
  showNotify('Rastro desbloqueado!');
  buildTrailsTab();
}

async function equipTrail(trailId){
  const { ok } = await apiFetch('/api/shop/trail/equip', { method:'POST', body:{ trailId } });
  if (!ok) { showNotify('Erro ao equipar rastro'); return; }
  profile.equippedTrail = trailId;
  // Atualiza também o jogador caso esteja numa partida
  if (game && game.player) game.player.equippedTrailId = trailId;
  buildTrailsTab();
}

async function loadCreditPackages(){
  const disabledEl = document.getElementById('shop-credits-disabled');
  const listEl = document.getElementById('shop-credits-packages');
  try {
    const { ok, data } = await apiFetch('/api/payments/packages');
    if (!ok || !data) return;
    creditPackagesLoaded = true;
    if (!data.enabled) {
      disabledEl.style.display = 'block';
      listEl.innerHTML = '';
      return;
    }
    disabledEl.style.display = 'none';
    listEl.innerHTML = '';
    const bestId = data.packages.reduce((best, p) =>
      (!best || p.priceCents > best.priceCents) ? p : best, null)?.id;
    data.packages.forEach(pkg => listEl.appendChild(buildPackageCard(pkg, pkg.id === bestId)));
  } catch {}
}

function buildPackageCard(pkg, isBest){
  const card = document.createElement('div');
  card.className = 'pkg-card' + (isBest ? ' best' : '');
  card.innerHTML = `
    <div class="pkg-card-price">${pkg.label}</div>
    <div class="pkg-card-credits">${pkg.credits} Créditos</div>
    ${pkg.bonus ? `<div class="pkg-card-bonus">+${pkg.bonus} CRÉDITOS DE BÔNUS</div>` : ''}
    <button class="pkg-buy-btn">
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.2" y="2.5" width="9.6" height="7" rx="1"/><path d="M1.2 4.6 H10.8"/><path d="M2.6 7.4 H4.6"/></svg>
      PAGAR
    </button>
  `;
  const btn = card.querySelector('button');
  btn.onclick = () => startCheckout(pkg.id, btn);
  return card;
}

async function startCheckout(packageId, btn){
  if (btn.disabled) return;
  setBtnLoading(btn, true);
  try {
    const { ok, data } = await apiFetch('/api/payments/checkout', { method:'POST', body:{ packageId } });
    if (ok && data && data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }
    showNotify('Não foi possível iniciar o pagamento. Tente novamente.');
  } catch {
    showNotify('Não foi possível iniciar o pagamento. Tente novamente.');
  } finally {
    setBtnLoading(btn, false);
  }
}

async function pollOrderStatus(orderId, attemptsLeft){
  const statusEl = document.getElementById('shop-credits-status');
  try {
    const { ok, data } = await apiFetch('/api/payments/orders/recent');
    if (ok && data) {
      const order = data.orders.find(o => o.id === orderId);
      if (order && order.status === 'approved') {
        statusEl.textContent = 'Pagamento aprovado! Créditos adicionados à sua conta.';
        statusEl.classList.add('success');
        const prevCredits = currentUser.credits;
        await refreshProfile();
        animateCreditsGain(prevCredits, currentUser.credits);
        showNotify('Créditos adicionados com sucesso!');
        return;
      }
      if (order && (order.status === 'rejected' || order.status === 'cancelled')) {
        statusEl.textContent = 'Pagamento não foi concluído. Você pode tentar novamente.';
        return;
      }
    }
  } catch {}
  if (attemptsLeft > 0) {
    setTimeout(() => pollOrderStatus(orderId, attemptsLeft - 1), 2000);
  } else {
    statusEl.textContent = 'Ainda processando seu pagamento — o saldo será atualizado assim que for confirmado.';
  }
}

window.loadMyOrders = async function() {
  const btn  = document.getElementById('shop-orders-btn');
  const area = document.getElementById('shop-receipt-area');
  const list = document.getElementById('shop-orders-list');
  if (!currentUser) return;
  if (btn) btn.disabled = true;
  const { ok, data } = await apiFetch('/api/payments/orders/recent');
  if (btn) btn.disabled = false;
  if (!ok || !data || !data.orders.length) {
    if (list) list.innerHTML = '<p style="font-size:9px;color:#5a7a9a;margin:8px 0;">Nenhum pedido encontrado.</p>';
    if (area) area.style.display = 'block';
    return;
  }
  const statusLabel = { approved: 'Aprovado', pending: 'Aguardando', refunded: 'Reembolsado',
                        rejected: 'Rejeitado', cancelled: 'Cancelado' };
  list.innerHTML = data.orders.map(o => `
    <div class="shop-order-row">
      <div class="shop-order-info">
        <span class="shop-order-id">Pedido #${o.id} &mdash; ${new Date(o.created_at).toLocaleDateString('pt-BR')}</span>
        <span class="shop-order-val">${o.credits_amount} CR &mdash; R$ ${(o.price_cents/100).toFixed(2).replace('.',',')}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <span class="shop-order-status ${o.status}">${statusLabel[o.status] || o.status}</span>
        ${o.status === 'approved' || o.status === 'refunded' ? `
          <button class="shop-receipt-btn" onclick="sendReceipt(${o.id},this)">Comprovante</button>
        ` : ''}
      </div>
    </div>
  `).join('');
  if (area) area.style.display = 'block';
  if (btn) btn.style.display = 'none';
};

window.sendReceipt = async function(orderId, btn) {
  btn.disabled = true;
  btn.textContent = '...';
  const { ok, data } = await apiFetch('/api/payments/receipt', { method: 'POST', body: { orderId } });
  if (ok && data?.sent) {
    btn.textContent = 'Enviado!';
    showNotify('Comprovante enviado para o seu e-mail!');
  } else if (data?.error === 'email_not_configured') {
    btn.textContent = 'Comprovante';
    btn.disabled = false;
    showNotify('Envio de e-mail nao configurado. Contate o suporte.');
  } else {
    btn.textContent = 'Erro';
    setTimeout(() => { btn.textContent = 'Comprovante'; btn.disabled = false; }, 3000);
  }
};

function checkPendingCreditOrder(){
  const params = new URLSearchParams(window.location.search);
  if (params.get('shop') !== 'credits') return;
  const orderId = Number(params.get('order'));
  history.replaceState(null, '', window.location.pathname);
  if (!currentUser) return;
  openShop();
  switchShopTab('credits');
  if (Number.isInteger(orderId)) {
    const statusEl = document.getElementById('shop-credits-status');
    statusEl.classList.remove('success');
    statusEl.textContent = 'Pagamento em processamento...';
    statusEl.style.display = 'block';
    pollOrderStatus(orderId, 3);
  }
}

// ── Arena select ──────────────────────────────────────────────
const arenaSelect=document.getElementById('arena-select');
ARENA_TYPES.forEach(a=>{
  const opt=document.createElement('option');
  opt.value=a.id; opt.textContent=a.label;
  arenaSelect.appendChild(opt);
});

function updateArenaPreview(){
  const cv=document.getElementById('arena-preview-canvas');
  const ctx=cv.getContext('2d');
  const type=arenaSelect.value;
  ctx.clearRect(0,0,cv.width,cv.height);
  const cfgMap={
    nebulosa:[210,70],asteroide:[28,55],vazio:[270,25],pulsar:[175,80],supernova:[12,90],
    cristal:[195,60],tempestade:[255,70],abismo:[290,15],aurora:[145,60],radiacao:[82,80],
    buraconegro:[300,60],neon:[320,75],gelido:[200,50],
  };
  const [hue,sat]=cfgMap[type]||[210,70];
  const g=ctx.createLinearGradient(0,0,cv.width,cv.height);
  g.addColorStop(0,`hsl(${hue},${sat}%,5%)`); g.addColorStop(1,`hsl(${hue},${sat}%,10%)`);
  ctx.fillStyle=g; ctx.fillRect(0,0,cv.width,cv.height);
  // Grade neon
  ctx.strokeStyle=`hsl(${hue},${sat}%,15%)`; ctx.lineWidth=0.5; ctx.globalAlpha=0.6;
  for(let x=0;x<cv.width;x+=16){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,cv.height);ctx.stroke();}
  for(let y=0;y<cv.height;y+=16){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(cv.width,y);ctx.stroke();}
  ctx.globalAlpha=1;
  // Estrelas
  for(let i=0;i<55;i++){
    ctx.fillStyle=`rgba(180,220,255,${Math.random()*.5+.1})`;
    ctx.beginPath();ctx.arc(Math.random()*cv.width,Math.random()*cv.height,Math.random()*1.2+.15,0,Math.PI*2);ctx.fill();
  }
  // Borda
  ctx.strokeStyle=`hsla(${hue},${sat}%,50%,.35)`; ctx.lineWidth=1;
  ctx.strokeRect(1,1,cv.width-2,cv.height-2);
}
updateArenaPreview();
window.updateArenaPreview=updateArenaPreview;
arenaSelect.addEventListener('change',updateArenaPreview);

// ── Histórico ─────────────────────────────────────────────────
function _drawItemIconSmall(ctx, type, color, s) {
  // Miniatura do ícone de item (canvas pequeno)
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.18;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch(type) {
    case 'HEALTH': case 'HEALTH_BIG':
      { const b=s*.28,a=s*.7; ctx.fillRect(-b,-a,b*2,a*2); ctx.fillRect(-a,-b,a*2,b*2); break; }
    case 'SHIELD': case 'SHIELD_BIG': case 'SHIELD_AURA':
      ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s,-s*.4); ctx.lineTo(s,s*.1); ctx.quadraticCurveTo(s,s*.8,0,s); ctx.quadraticCurveTo(-s,s*.8,-s,s*.1); ctx.lineTo(-s,-s*.4); ctx.closePath(); ctx.fill(); break;
    case 'MANA': case 'MANA_FULL':
      ctx.beginPath(); ctx.moveTo(0,-s); ctx.bezierCurveTo(s*.8,-s*.2,s*.8,s*.5,0,s); ctx.bezierCurveTo(-s*.8,s*.5,-s*.8,-s*.2,0,-s); ctx.closePath(); ctx.fill(); break;
    case 'NUKE':
      ctx.beginPath(); ctx.arc(0,s*.15,s*.6,0,Math.PI*2); ctx.fill(); break;
    case 'MINE':
      ctx.beginPath(); ctx.arc(0,s*.1,s*.5,0,Math.PI*2); ctx.fill();
      for(let i=0;i<6;i++){const a=i*Math.PI/3; ctx.beginPath(); ctx.moveTo(Math.cos(a)*s*.5,s*.1+Math.sin(a)*s*.5); ctx.lineTo(Math.cos(a)*s*.85,s*.1+Math.sin(a)*s*.85); ctx.stroke();}
      break;
    case 'MISSILE':
      ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*.3,-s*.2); ctx.lineTo(s*.2,s*.5); ctx.lineTo(-s*.2,s*.5); ctx.lineTo(-s*.3,-s*.2); ctx.closePath(); ctx.fill(); break;
    case 'FREEZE':
      for(let i=0;i<6;i++){ctx.save();ctx.rotate(i*Math.PI/3);ctx.strokeStyle=color;ctx.lineWidth=s*.15;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-s);ctx.stroke();ctx.restore();} break;
    case 'OVERCLOCK':
      ctx.beginPath(); ctx.moveTo(-s*.2,-s); ctx.lineTo(s*.5,0); ctx.lineTo(-s*.1,0); ctx.lineTo(s*.2,s); ctx.lineTo(-s*.5,0); ctx.lineTo(s*.1,0); ctx.closePath(); ctx.fill(); break;
    case 'NOVA':
      for(let i=0;i<6;i++){ctx.save();ctx.rotate(i*Math.PI/3);ctx.beginPath();ctx.moveTo(0,s*.15);ctx.lineTo(s*.18,s*.5);ctx.lineTo(0,s);ctx.lineTo(-s*.18,s*.5);ctx.closePath();ctx.fill();ctx.restore();} break;
    case 'WARP':
      ctx.beginPath(); ctx.arc(0,0,s*.7,0,Math.PI*2); ctx.fillStyle=color+'44'; ctx.fill();
      ctx.beginPath(); ctx.arc(0,0,s*.3,0,Math.PI*2); ctx.fillStyle=color; ctx.fill(); break;
    case 'GODMODE':
      for(let i=0;i<8;i++){ctx.save();ctx.rotate(i*Math.PI/4);ctx.beginPath();ctx.moveTo(0,-s*.3);ctx.lineTo(s*.12,-s*.7);ctx.lineTo(0,-s);ctx.lineTo(-s*.12,-s*.7);ctx.closePath();ctx.fill();ctx.restore();} break;
    default:
      ctx.beginPath(); ctx.arc(0,0,s*.55,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function _buildHistoryEntry(e) {
  const el = document.createElement('div');
  el.className = `history-entry ${e.win?'win':'lose'}`;

  // Sumário (sempre visível)
  const summary = document.createElement('div');
  summary.className = 'he-summary';

  // Ícone da nave
  const shipCv = document.createElement('canvas');
  shipCv.className = 'he-ship-icon';
  shipCv.width = shipCv.height = 28;
  summary.appendChild(shipCv);

  const info = document.createElement('div');
  info.className = 'he-info';
  info.innerHTML = `
    <div class="he-top">
      <span class="he-result">${e.win?'VITÓRIA':'DERROTA'} · ${e.mode??''}</span>
      <span class="he-date">${e.date??''}</span>
    </div>
    <div class="he-detail">${e.score??0}pts · ${e.kills??0}kills · ${e.items??0}itens</div>
    <div class="he-ship-name">${e.skinName??'Nave'}</div>
  `;
  summary.appendChild(info);

  const arrow = document.createElement('div');
  arrow.className = 'he-expand-arrow';
  arrow.textContent = '▼';
  summary.appendChild(arrow);
  el.appendChild(summary);

  // Painel expandido
  const panel = document.createElement('div');
  panel.className = 'he-detail-panel';

  // Stats
  const statsRow = document.createElement('div');
  statsRow.className = 'he-stats-row';
  const statsHtml = [
    ['KILLS', e.kills??0],
    ['SCORE', e.score??0],
    ['NV', e.level??1],
    ['ITENS', e.items??0],
  ].map(([l,v])=>`<div class="he-stat-box"><span class="sv">${v}</span><span class="sl">${l}</span></div>`).join('');
  statsRow.innerHTML = statsHtml;
  panel.appendChild(statsRow);

  // Grade de itens coletados
  if (e.itemTypeCounts && Object.keys(e.itemTypeCounts).length > 0) {
    const itemsTitle = document.createElement('div');
    itemsTitle.className = 'he-items-title';
    itemsTitle.textContent = 'ITENS COLETADOS';
    panel.appendChild(itemsTitle);

    const itemsGrid = document.createElement('div');
    itemsGrid.className = 'he-items-grid';

    // Ordena por quantidade desc
    const sorted = Object.entries(e.itemTypeCounts).sort((a,b)=>b[1]-a[1]);
    for (const [type, count] of sorted) {
      const chip = document.createElement('div');
      chip.className = 'he-item-chip';

      const icv = document.createElement('canvas');
      icv.width = icv.height = 18;
      const ictx = icv.getContext('2d');
      ictx.translate(9,9);
      // Cor do item
      const itemColors = {
        HEALTH:'#ff3366',HEALTH_BIG:'#ff6699',SHIELD:'#00aaee',SHIELD_BIG:'#44ccff',
        MANA:'#4488ff',MANA_FULL:'#88aaff',RAPID:'#ff8800',MULTISHOT:'#ffaa22',
        PIERCING:'#ff6600',MAGNET:'#00ffee',BOOST:'#00ff88',DASH_BOOST:'#00ffaa',
        MINE:'#ff4400',NUKE:'#ff2200',FREEZE:'#88ddff',REGEN:'#ff88aa',
        SHIELD_AURA:'#00ccff',OVERCLOCK:'#ffdd00',INVISIBLE:'#aaaacc',
        GODMODE:'#ffd700',NOVA:'#ff00ff',VAMPIRO:'#cc0044',WARP:'#aa44ff',
        MISSILE:'#ff6600',SLOW:'#cc44aa',DRAIN:'#aa2200',BLIND:'#6622aa',POISON:'#336600',
      };
      const col = itemColors[type]||'#ffffff';
      ictx.fillStyle = col;
      ictx.strokeStyle = col;
      _drawItemIconSmall(ictx, type, col, 7);

      chip.appendChild(icv);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'he-item-chip-name';
      const itemLabels = {
        HEALTH:'HP+',HEALTH_BIG:'HP++',SHIELD:'Escudo',SHIELD_BIG:'Escudo++',
        MANA:'Mana+',MANA_FULL:'Mana Max',RAPID:'Turbo',MULTISHOT:'3-Way',
        PIERCING:'Pierce',MAGNET:'Ímã',BOOST:'Boost',DASH_BOOST:'Dash+',
        MINE:'Mina',NUKE:'Nuke',FREEZE:'Freeze',REGEN:'Regen',
        SHIELD_AURA:'Aura',OVERCLOCK:'Ovrclk',INVISIBLE:'Cloak',
        GODMODE:'Deus',NOVA:'Nova',VAMPIRO:'Vampiro',WARP:'Warp',
        MISSILE:'Míssil',SLOW:'Slow',DRAIN:'Drain',BLIND:'Cego',POISON:'Veneno',
      };
      nameSpan.textContent = itemLabels[type]||type;
      chip.appendChild(nameSpan);

      const countSpan = document.createElement('span');
      countSpan.className = 'he-item-chip-count';
      countSpan.textContent = `×${count}`;
      chip.appendChild(countSpan);

      itemsGrid.appendChild(chip);
    }
    panel.appendChild(itemsGrid);
  }

  el.appendChild(panel);

  // Toggle expandir
  summary.onclick = () => {
    el.classList.toggle('expanded');
    // Desenha ícone da nave quando expandido (lazy)
    if (el.classList.contains('expanded') && shipCv._drawn) return;
    _drawShipIconOnCanvas(shipCv, e.skinIndex??0);
    shipCv._drawn = true;
  };

  // Desenha ícone da nave pequeno no sumário imediatamente
  _drawShipIconOnCanvas(shipCv, e.skinIndex??0);

  return el;
}

function _drawShipIconOnCanvas(cv, skinIndex) {
  const skin = SKINS[skinIndex] || SKINS[0];
  const ctx = cv.getContext('2d');
  const doDraw = () => {
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.save();
    ctx.translate(cv.width/2, cv.height/2);
    try { skin.drawPreview(ctx, cv.width/skin._size); } catch(e){}
    ctx.restore();
  };
  // Se a imagem ainda não carregou, aguarda o onload antes de desenhar
  if (skin.img && (!skin.img.complete || !skin.img.naturalWidth)) {
    skin.img.addEventListener('load', doDraw, { once: true });
  } else {
    doDraw();
  }
}

// Converte uma linha vinda de GET /api/matches/recent (servidor, sincronizada
// entre dispositivos) no mesmo formato que _buildHistoryEntry espera.
function _historyEntryFromServerRow(r){
  const skin = SKINS.find(s=>s.id===r.skinId);
  let date = '';
  if (r.createdAt) {
    // created_at vem em UTC ("YYYY-MM-DD HH:MM:SS") — converte para hora local.
    const d = new Date(r.createdAt.replace(' ','T')+'Z');
    if (!isNaN(d)) {
      const pad=n=>String(n).padStart(2,'0');
      date = `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
  return {
    win: !!r.win, mode: r.mode, date,
    score: r.score??0, kills: r.kills??0,
    items: r.items??0,
    itemTypeCounts: r.itemTypeCounts??{},
    skinIndex: r.skinId??0,
    skinName: r.skinName??(skin?.name??'Nave'),
    level: r.level??1,
  };
}
// Histórico de partidas vem do servidor (tabela `matches`, por user_id) —
// assim ele é o mesmo em qualquer dispositivo/navegador onde o piloto entrar.
async function loadHistory(){
  const list=document.getElementById('history-list');
  const countEl=document.getElementById('history-count');
  if(!currentUser){
    list.innerHTML='<div class="history-empty">Faça login para ver seu histórico.</div>';
    countEl.textContent='';
    return;
  }
  const { ok, data } = await apiFetch('/api/matches/recent');
  const rows = (ok && data && Array.isArray(data.matches)) ? data.matches : null;
  list.innerHTML='';
  if(!rows){
    list.innerHTML='<div class="history-empty">Não foi possível carregar o histórico agora.</div>';
    countEl.textContent='';
    return;
  }
  if(!rows.length){list.innerHTML='<div class="history-empty">Sem partidas ainda.</div>';}
  else{
    rows.slice(0,15).forEach(r=>{
      list.appendChild(_buildHistoryEntry(_historyEntryFromServerRow(r)));
    });
  }
  countEl.textContent=`${rows.length} partida(s)`;
}

// ── Telas ──────────────────────────────────────────────────────
function showScreen(name){
  document.getElementById('login-screen').style.display = name==='login'?'flex':'none';
  if (name!=='login') {
    const music = document.getElementById('login-music');
    if (music && !music.paused) music.pause();
  }
  document.getElementById('menu').style.display         = name==='menu' ?'flex':'none';
  document.getElementById('game-canvas').style.display  = name==='game' ?'block':'none';
  document.getElementById('hud').style.display          = name==='game' ?'block':'none';
  document.getElementById('pause').style.display        = 'none';
  document.getElementById('gameover').style.display     = 'none';
}

// Volta ao menu principal sem fazer logout (usado pelo kick de inatividade)
window.exitToMenu=function(){
  if(game){game.destroy();game=null;}
  paused=false;
  showScreen('menu');
};

window.goLoginScreen=async function(){
  if(game){game.destroy();game=null;}
  paused=false;
  await apiFetch('/api/auth/logout', { method:'POST' });
  currentUser=null; profile=null;
  document.getElementById('auth-email').value='';
  document.getElementById('auth-password').value='';
  document.getElementById('auth-name').value='';
  hideAuthError();
  switchAuthTab('login');
  showScreen('login');
};

window.switchChangelogTab=function(tab){
  const isNews = tab==='news';
  document.getElementById('cl-tab-news-btn').classList.toggle('active', isNews);
  document.getElementById('cl-tab-about-btn').classList.toggle('active', !isNews);
  document.getElementById('changelog-list').style.display = isNews ? '' : 'none';
  document.getElementById('changelog-about').style.display = isNews ? 'none' : '';
};

window.openChangelog=function(){
  const list=document.getElementById('changelog-list');
  list.innerHTML=CHANGELOG.map(entry=>`
    <div class="changelog-entry">
      <span class="changelog-version">${entry.version}</span><span class="changelog-date">${entry.date}</span>
      <ul class="changelog-changes">${entry.changes.map(c=>`<li>${c}</li>`).join('')}</ul>
    </div>
  `).join('');
  switchChangelogTab('news');
  document.getElementById('changelog-modal').style.display='flex';
};

window.closeChangelog=function(){
  document.getElementById('changelog-modal').style.display='none';
};

window.openHowToPlay=function(){
  document.getElementById('howtoplay-modal').style.display='flex';
};

window.closeHowToPlay=function(){
  document.getElementById('howtoplay-modal').style.display='none';
};

window.selectMode=function(mode,btn){
  if (_disabledModes.includes(mode) || isModeInMaintenance(mode)) {
    showMaintenanceAlert(mode);
    return;
  }
  selectedMode=mode;
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('mode-tip').textContent=MODE_TIPS[mode]||'';
};

// ── Jogo ───────────────────────────────────────────────────────
const canvas=document.getElementById('game-canvas');
function resizeCanvas(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;if(game)game.onResize(canvas.width,canvas.height);}
resizeCanvas(); window.addEventListener('resize',resizeCanvas);

// ── Detecção de dispositivo móvel / orientação / controles touch ──
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer:coarse)').matches);

const orientationWarning = document.getElementById('orientation-warning');
const touchControls      = document.getElementById('touch-controls');

function isPortrait(){ return window.innerHeight > window.innerWidth; }

// Trava a orientação da tela no mobile via Screen Orientation API: menus
// (login/menu) ficam presos no retrato — onde os botões/textos foram
// desenhados — e a partida em si fica presa na paisagem. É "best effort":
// a API exige suporte do navegador (falha silenciosamente no iOS Safari,
// que não a implementa) e, em vários navegadores, só funciona em
// fullscreen — por isso é chamada também ao entrar/sair da partida, perto
// de requestMobileFullscreen/exitMobileFullscreen.
function lockOrientation(orientation){
  if (!IS_MOBILE) return;
  const so = screen.orientation;
  if (so && typeof so.lock === 'function') so.lock(orientation).catch(()=>{});
}

function updateOrientationUI(){
  if (!IS_MOBILE) return;
  const inGame = document.getElementById('game-canvas').style.display !== 'none';
  const portrait = isPortrait();
  const overGameOver = document.getElementById('gameover').style.display !== 'none';
  const overPause = document.getElementById('pause').style.display !== 'none';
  const showControls = inGame && !portrait && !overGameOver && !overPause;
  orientationWarning.classList.toggle('show', inGame && portrait);
  touchControls.classList.toggle('active', showControls);
  if (game) game._touchActive = showControls;
  const hudBottom = document.getElementById('hud-bottom');
  if (hudBottom) hudBottom.style.display = 'none';
}
window.addEventListener('resize', updateOrientationUI);
window.addEventListener('orientationchange', updateOrientationUI);

const _origShowScreen = showScreen;
showScreen = function(name){
  _origShowScreen(name);
  updateOrientationUI();
  lockOrientation(name==='game' ? 'landscape' : 'portrait');
};

// ── Controles touch personalizados (joystick virtual + botões) ──
(function setupTouchControls(){
  if (!IS_MOBILE) return;

  const stickZone = document.getElementById('touch-stick-zone');
  const stickKnob = document.getElementById('touch-stick-knob');
  const btnFire   = document.getElementById('touch-btn-fire');
  const btnDash   = document.getElementById('touch-btn-dash');
  const btnPause  = document.getElementById('touch-btn-pause');
  const slots     = touchControls.querySelectorAll('.touch-slot');

  btnPause?.addEventListener('touchstart', e => {
    e.preventDefault();
    btnPause.classList.add('pressed');
    window.togglePause?.();
  }, { passive:false });
  btnPause?.addEventListener('touchend', e => {
    e.preventDefault();
    btnPause.classList.remove('pressed');
  }, { passive:false });

  const STICK_RADIUS = 65;
  let stickTouchId = null;
  const stickVec = { x:0, y:0, active:false };

  function stickCenter(){
    const r = stickZone.getBoundingClientRect();
    return { cx: r.left + r.width/2, cy: r.top + r.height/2 };
  }
  function stickStart(touch){
    if (stickTouchId !== null) return;
    stickTouchId = touch.identifier;
    stickMove(touch);
  }
  function stickMove(touch){
    const { cx, cy } = stickCenter();
    let dx = touch.clientX - cx, dy = touch.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > STICK_RADIUS) { dx = dx/dist*STICK_RADIUS; dy = dy/dist*STICK_RADIUS; }
    stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    stickVec.x = dx / STICK_RADIUS;
    stickVec.y = dy / STICK_RADIUS;
    stickVec.active = Math.hypot(stickVec.x, stickVec.y) > 0.12;
  }
  function stickEnd(){
    stickTouchId = null;
    stickKnob.style.transform = 'translate(-50%,-50%)';
    stickVec.x = 0; stickVec.y = 0; stickVec.active = false;
  }
  stickZone.addEventListener('touchstart', e=>{
    e.preventDefault();
    for (const t of e.changedTouches) stickStart(t);
  }, { passive:false });
  stickZone.addEventListener('touchmove', e=>{
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === stickTouchId) stickMove(t);
  }, { passive:false });
  stickZone.addEventListener('touchend', e=>{
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === stickTouchId) stickEnd();
  }, { passive:false });
  stickZone.addEventListener('touchcancel', stickEnd);

  function bindHold(el, onStart, onEnd){
    el.addEventListener('touchstart', e=>{ e.preventDefault(); el.classList.add('pressed'); onStart(); }, { passive:false });
    el.addEventListener('touchend',   e=>{ e.preventDefault(); el.classList.remove('pressed'); onEnd(); }, { passive:false });
    el.addEventListener('touchcancel',e=>{ e.preventDefault(); el.classList.remove('pressed'); onEnd(); }, { passive:false });
  }

  const touchState = { firing:false, dashing:false };
  // Armazena a última direção do stick para manter a mira ao soltar e atirar
  const lastFireVec = { x:0, y:-1 };
  bindHold(btnFire, ()=>touchState.firing=true,  ()=>touchState.firing=false);
  bindHold(btnDash, ()=>touchState.dashing=true, ()=>touchState.dashing=false);

  const SLOT_CODE = { '1':'Digit1','2':'Digit2','3':'Digit3','4':'Digit4','5':'Digit5','x':'KeyX' };
  function fireKey(type, code){
    window.dispatchEvent(new KeyboardEvent(type, { code, bubbles:true }));
  }
  slots.forEach(slot=>{
    const code = SLOT_CODE[slot.dataset.slot];
    slot.addEventListener('touchstart', e=>{
      e.preventDefault(); slot.classList.add('pressed');
      fireKey('keydown', code);
    }, { passive:false });
    slot.addEventListener('touchend', e=>{
      e.preventDefault(); slot.classList.remove('pressed');
      fireKey('keyup', code);
    }, { passive:false });
    slot.addEventListener('touchcancel', e=>{
      slot.classList.remove('pressed');
      fireKey('keyup', code);
    });
  });

  window._touchState = touchState;
  window._touchStick = stickVec;

  // ── Injeta os controles touch no fluxo de input do jogo ──
  // O jogo usa "mira/movimento até o ponteiro do mouse"; no touch, a mira
  // (worldMouseX/Y) segue a mesma direção para onde o jogador está movendo
  // a nave pelo analógico — sem mira automática em inimigos.
  const TOUCH_AIM_DIST = 260;
  const origInput = Game.prototype._input;
  Game.prototype._input = function(){
    const base = origInput.call(this);
    if (!this._touchActive) return base;

    const px = this.player ? this.player.x : base.worldMouseX;
    const py = this.player ? this.player.y : base.worldMouseY;

    // Mira e movimento seguem a mesma direção: o vetor do analógico.
    // Sem o analógico ativo, mantém a direção atual da nave (evita
    // "destravar" a mira para o canto da tela).
    let wmx, wmy, moveTargetX, moveTargetY, holdRight = base.holdRight;
    if (stickVec.active) {
      // Stick ativo: atualiza mira e memória de direção
      lastFireVec.x = stickVec.x;
      lastFireVec.y = stickVec.y;
      wmx = px + stickVec.x * TOUCH_AIM_DIST;
      wmy = py + stickVec.y * TOUCH_AIM_DIST;
      moveTargetX = wmx;
      moveTargetY = wmy;
      holdRight = true;
    } else if (touchState.firing) {
      // Botão de fogo sem stick: aponta na última direção do stick
      wmx = px + lastFireVec.x * TOUCH_AIM_DIST;
      wmy = py + lastFireVec.y * TOUCH_AIM_DIST;
    } else if (this.player) {
      wmx = px + Math.cos(this.player._aimAngle - Math.PI/2) * TOUCH_AIM_DIST;
      wmy = py + Math.sin(this.player._aimAngle - Math.PI/2) * TOUCH_AIM_DIST;
    } else {
      wmx = base.worldMouseX; wmy = base.worldMouseY;
    }

    return {
      shooting:    base.shooting || touchState.firing,
      space:       base.space    || touchState.firing,
      holdRight:   holdRight,
      dash:        base.dash     || touchState.dashing,
      worldMouseX: wmx,
      worldMouseY: wmy,
      moveTargetX: moveTargetX,
      moveTargetY: moveTargetY,
    };
  };
})();

// Tela cheia no mobile ao iniciar partida — esconde as barras do navegador.
// Precisa ser chamada a partir de um gesto do usuário (toque no botão jogar);
// iOS Safari não suporta Fullscreen API em elementos comuns, então falha
// silenciosamente nesse caso (a chamada é apenas "best effort").
function requestMobileFullscreen(){
  if (!IS_MOBILE) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (req) { try { req.call(el); } catch {} }
}
function exitMobileFullscreen(){
  if (!document.fullscreenElement && !document.webkitFullscreenElement) return;
  const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
  if (exit) { try { exit.call(document); } catch {} }
}

window.startGame=function(){
  // Trava de segurança — impede entrar num modo em manutenção mesmo que
  // selectedMode tenha ficado "preso" num estado antigo (ex.: torneio
  // encerrou entre a seleção e o clique em JOGAR).
  if (isModeInMaintenance(selectedMode)) { showMaintenanceAlert(selectedMode); return; }
  const diff=document.getElementById('diff-select').value;
  requestMobileFullscreen();
  showScreen('game');
  paused=false;
  if(game)game.destroy();
  game=new Game(canvas,{skinIndex:selectedSkin,playerName:pilotName,profileIcon:(profile?(profile.profileIcon||0):0),equippedTrail:(profile?.equippedTrail||0),mode:selectedMode,difficulty:diff,roomId:'default'});
  game.start();
  window._game=game;
  updateOrientationUI();
};

window.restartGame=function(){document.getElementById('gameover').style.display='none';startGame();};

window.goMenu=function(){
  if(game){game.destroy();game=null;}
  paused=false; showScreen('menu'); loadHistory();
  exitMobileFullscreen();
};

// Botão "X" do lobby/fila online — avisa o servidor para sair da fila
// (libera a vaga para outros jogadores na hora) e volta ao menu.
window.cancelOnlineQueue=function(){
  if (game?.net) {
    if (game.mode==='tower_defense') game.net.tdQueueLeave();
    else game.net.queueLeave();
  }
  goMenu();
};

window.resumeGame=function(){
  document.getElementById('pause').style.display='none';
  paused=false; game?.resume();
  updateOrientationUI();
};

window.surrenderGame=function(){
  document.getElementById('pause').style.display='none';
  paused=false; game?.surrender();
  updateOrientationUI();
};

window.togglePause=function(){
  if(document.getElementById('gameover').style.display!=='none') return;
  if(!game||game.over) return;
  if(paused){resumeGame();}
  else{paused=true;game.pause();document.getElementById('pause').style.display='flex';updateOrientationUI();}
};

// ESC é tratado pelo game.js via window.togglePause

// ── Mudo na tela de pausa ─────────────────────────────────
window.pauseToggleMute=function(){
  const muted=game?._audio?.toggleMute?.();
  const label=document.getElementById('pause-mute-label');
  const waves=document.getElementById('pause-sound-waves');
  if(label) label.textContent = muted ? 'SOM: MUDO' : 'SOM: LIGADO';
  if(waves) waves.style.display = muted ? 'none' : '';
};

// ── Perfil e configurações ────────────────────────────────
// WASD: persistido em localStorage, lido como window._useWASD pelo game.js
window._useWASD = !IS_MOBILE && localStorage.getItem('useWASD')==='1';

function _syncProfileSettingsUI(){
  const wasdBtn=document.getElementById('wasd-toggle');
  if(wasdBtn){
    wasdBtn.textContent=window._useWASD?'ON':'OFF';
    wasdBtn.className='setting-toggle '+(window._useWASD?'on':'off');
  }
  const soundBtn=document.getElementById('sound-toggle');
  const muted=game?._audio?._muted ?? false;
  if(soundBtn){
    soundBtn.textContent=muted?'MUDO':'LIGADO';
    soundBtn.className='setting-toggle '+(muted?'off':'on');
  }
  // Esconde configurações de PC em mobile
  const desktopSettings=document.getElementById('ps-desktop-settings');
  if(desktopSettings) desktopSettings.style.display=IS_MOBILE?'none':'flex';

  // Preenche dados do perfil
  const nameEl=document.getElementById('ps-pilot-name');
  if(nameEl) nameEl.textContent=pilotName||'JOGADOR';
  const emailEl=document.getElementById('ps-pilot-email');
  if(emailEl) emailEl.textContent=currentUser?.email||'';
  const credEl=document.getElementById('ps-stat-credits');
  if(credEl) credEl.textContent=currentUser?.credits??'-';

  // Ícone de perfil no modal
  const iconBtn=document.getElementById('ps-icon-btn');
  if(iconBtn && typeof drawProfileIcon==='function'){
    iconBtn.innerHTML='';
    const c=document.createElement('canvas');
    c.width=40;c.height=40;
    drawProfileIcon(c.getContext('2d'),profile?profile.profileIcon||0:0,40);
    iconBtn.appendChild(c);
  }

  // Estatísticas rápidas do histórico local
  const hist=loadHistory?.[Symbol.toStringTag]!==undefined ? [] : (() => {
    try{ return JSON.parse(localStorage.getItem('arena_history')||'[]'); }catch{return [];}
  })();
  const kills=hist.reduce((s,m)=>s+(m.kills||0),0);
  const killEl=document.getElementById('ps-stat-kills');
  if(killEl) killEl.textContent=kills;
  const matchEl=document.getElementById('ps-stat-matches');
  if(matchEl) matchEl.textContent=hist.length;
}

window.openProfileSettings=function(){
  _syncProfileSettingsUI();
  document.getElementById('profile-settings-overlay').style.display='flex';
};
window.closeProfileSettings=function(){
  document.getElementById('profile-settings-overlay').style.display='none';
};
window.toggleWASD=function(){
  window._useWASD=!window._useWASD;
  localStorage.setItem('useWASD',window._useWASD?'1':'0');
  _syncProfileSettingsUI();
};
window.toggleSoundSetting=function(){
  if(game?._audio) {
    game._audio.toggleMute();
  }
  _syncProfileSettingsUI();
};

window.showGameOver=function(data){
  const go=document.getElementById('gameover');
  go.className=data.win?'win':'lose';
  go.style.display='flex';
  updateOrientationUI();
  go.querySelector('.go-icon-win').style.display=data.win?'block':'none';
  go.querySelector('.go-icon-lose').style.display=data.win?'none':'block';
  document.getElementById('go-result-label').textContent=data.win?'VITÓRIA':'DERROTA';
  if (selectedMode==='equipe_online' && data.teamWinner) {
    const teamLabel = t => t==='red' ? 'Time Vermelho' : 'Time Azul';
    document.getElementById('go-title').textContent = data.win ? 'EQUIPE VENCEDORA!' : 'EQUIPE DERROTADA';
    const ts=data.teamScores||{red:0,blue:0};
    document.getElementById('go-sub').textContent =
      `${teamLabel(data.teamWinner)} venceu por ${ts.red} x ${ts.blue} abates! Você jogou pelo ${teamLabel(data.team)}.`;
  } else if (selectedMode==='tower_defense') {
    const teamLabel = t => t==='red' ? 'Time Vermelho' : 'Time Azul';
    document.getElementById('go-title').textContent = data.win ? 'TORRE CONQUISTADA!' : 'TORRE PERDIDA';
    document.getElementById('go-sub').textContent = data.win
      ? `Seu time destruiu a torre central e venceu o confronto! ${(profile&&profile.tournament&&profile.tournament.active) ? 'Você desbloqueou a skin exclusiva "Hex Champion"!' : ''}`
      : `${teamLabel(data.teamWinner)} destruiu a torre central primeiro. Tente novamente na fila do torneio!`;
  } else {
    document.getElementById('go-title').textContent=data.win?'MISSÃO CUMPRIDA':'NAVE DESTRUÍDA';
    document.getElementById('go-sub').textContent=data.win?'Você dominou a arena.':'Suas vidas acabaram.';
  }
  document.getElementById('go-kills').textContent=data.kills;
  document.getElementById('go-score').textContent=data.score;
  document.getElementById('go-items').textContent=data.items;

  // Vidas no Contra1
  const livesEl=document.getElementById('go-lives');
  if(selectedMode==='contra1'&&data.playerLives!==undefined){
    livesEl.style.display='flex';
    const max=5;
    const pDots=document.getElementById('go-player-dots');
    const eDots=document.getElementById('go-enemy-dots');
    pDots.innerHTML=''; eDots.innerHTML='';
    for(let i=0;i<max;i++){
      const dp=document.createElement('div');
      dp.className='go-live-dot '+(i<data.playerLives?'filled-player':'empty');
      pDots.appendChild(dp);
      const de=document.createElement('div');
      de.className='go-live-dot '+(i<data.enemyLives?'filled-enemy':'empty');
      eDots.appendChild(de);
    }
  } else { livesEl.style.display='none'; }

  // O resultado é gravado no servidor (tabela `matches`, por user_id) — assim
  // o histórico aparece igual em qualquer dispositivo onde o piloto entrar.
  if (currentUser) {
    apiFetch('/api/matches', { method:'POST', body:{
      mode: selectedMode, difficulty: document.getElementById('diff-select').value,
      win: !!data.win, score: data.score, kills: data.kills, skinId: data.skinIndex??selectedSkin,
      items: data.items, itemTypeCounts: data.itemTypeCounts??{},
      skinName: data.skinName??(SKINS[selectedSkin]?.name??'Nave'),
      level: data.level??1,
    }}).then(({ok, data:res})=>{
      if (!ok || !res) return;
      const prevCredits = currentUser.credits;
      currentUser.credits = res.creditsBalance;
      if (res.creditsBalance > prevCredits) {
        animateCreditsGain(prevCredits, res.creditsBalance);
      } else {
        updateCreditsBadge();
      }
      if (res.rewardGranted) showNotify('+10 Créditos! Recompensa de partidas concedida.');
      loadHistory();
    });
  }
};

// ── Carta de revelação da skin de recompensa do torneio (Hex Champion) ──
window.closeSkinReveal=function(ev){
  if (ev && ev.target && ev.target.closest && ev.target.closest('#sr-card') && !ev.target.closest('.sr-card-front')) return;
  const el=document.getElementById('skin-reveal');
  el.style.display='none';
  el.classList.remove('show');
};
function showSkinRevealCard(skinName){
  const skin = SKINS.find(s=>s.name===skinName) || SKINS.find(s=>REWARD_ONLY_SKIN_IDS?.includes(s.id));
  if (!skin) return;
  const el = document.getElementById('skin-reveal');
  const card = document.getElementById('sr-card');
  document.getElementById('sr-skin-name').textContent = skin.name;
  // Reinicia as animações de flip/brilho
  card.style.animation='none';
  card.querySelectorAll('.sr-card-face').forEach(f=>{ f.style.animation='none'; });
  card.querySelectorAll('.sr-card-shine').forEach(s=>{ s.style.animation='none'; });
  void card.offsetWidth;
  card.style.animation='';
  card.querySelectorAll('.sr-card-face').forEach(f=>{ f.style.animation=''; });
  card.querySelectorAll('.sr-card-shine').forEach(s=>{ s.style.animation=''; });

  el.style.display='flex';
  el.classList.add('show');

  const cv = document.getElementById('sr-skin-canvas');
  const cctx = cv.getContext('2d');
  function draw(){
    cctx.clearRect(0,0,cv.width,cv.height);
    cctx.save();
    cctx.translate(cv.width/2,cv.height/2);
    skin.drawPreview(cctx, cv.width/skin._size);
    cctx.restore();
  }
  if (skin.img){ skin.img.onload=draw; setTimeout(draw,300); }
  draw();
}
window._showSkinReveal = showSkinRevealCard;

// ── Promoção de Skins — aparece a cada 20 sessões ─────────────────────────
// Mostra 3 cartas sequenciais com skins aleatórias disponíveis para compra.
const SKIN_PROMO_KEY       = 'skin_promo_session_count';
const SKIN_PROMO_SEEN_KEY  = 'skin_promo_seen_ids';
const SKIN_PROMO_INTERVAL  = 20;

function _skinPromoPrice(skin) {
  // Usa exatamente a mesma lógica de shopPriceFor — fonte única de verdade
  return shopPriceFor(skin.id);
}

function _skinPromoNextBatch() {
  // Skins disponíveis para compra (não possui, não é reward-only, não é gratuita)
  const owned    = profile?.ownedSkins || [];
  const EXCL     = [6, 10, 12]; // gratuita + reward-only
  const available = SKINS.filter(s => !owned.includes(s.id) && !EXCL.includes(s.id));
  if (available.length === 0) return [];

  // Evita repetir skins já vistas em sessões anteriores (reseta quando esgotar)
  let seen = JSON.parse(localStorage.getItem(SKIN_PROMO_SEEN_KEY) || '[]');
  let pool = available.filter(s => !seen.includes(s.id));
  if (pool.length < 3) { seen = []; pool = available; }

  // Seleciona 3 aleatórias
  const picked = [];
  const copy   = [...pool];
  for (let i = 0; i < 3 && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(idx, 1)[0]);
  }
  seen = [...seen, ...picked.map(s => s.id)];
  localStorage.setItem(SKIN_PROMO_SEEN_KEY, JSON.stringify(seen));
  return picked;
}

function maybeShowSkinPromo() {
  if (!profile || !currentUser) return;
  const owned = profile.ownedSkins || [];
  const EXCL  = [6, 10, 12];
  const hasUnowned = SKINS.some(s => !owned.includes(s.id) && !EXCL.includes(s.id));
  if (!hasUnowned) return; // já tem tudo

  const key   = `${SKIN_PROMO_KEY}_${currentUser.id}`;
  const count = (parseInt(localStorage.getItem(key)) || 0) + 1;
  localStorage.setItem(key, count);
  if (count % SKIN_PROMO_INTERVAL !== 1) return; // só na 1ª, 21ª, 41ª... sessão

  const batch = _skinPromoNextBatch();
  if (batch.length === 0) return;
  _showSkinPromoOverlay(batch);
}

function _showSkinPromoOverlay(skins) {
  document.getElementById('skin-promo-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'skin-promo-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;
    align-items:center;justify-content:center;
    background:rgba(2,5,13,.92);backdrop-filter:blur(8px);
    animation:srFadeIn .3s ease both;padding:20px;box-sizing:border-box;
  `;

  overlay.innerHTML = `
    <div style="text-align:center;margin-bottom:22px;">
      <div style="font-family:'Press Start 2P',monospace;font-size:8px;
        color:#00d4ff;letter-spacing:3px;border:1px solid #00d4ff33;
        border-radius:3px;padding:5px 14px;display:inline-block;margin-bottom:12px;">
        PILOTOS DISPONIVEIS
      </div>
      <div style="font-family:'Press Start 2P',monospace;font-size:13px;
        color:#fff;letter-spacing:1px;line-height:1.6;">
        NOVAS NAVES NA LOJA
      </div>
      <div style="font-size:11px;color:#4a7a9a;margin-top:6px;letter-spacing:1px;">
        Customize sua nave com skins exclusivas
      </div>
    </div>
    <div id="skin-promo-cards" style="display:flex;gap:20px;flex-wrap:wrap;justify-content:center;align-items:flex-start;"></div>
    <button onclick="document.getElementById('skin-promo-overlay').remove()" style="
      margin-top:28px;font-family:'Press Start 2P',monospace;font-size:8px;
      letter-spacing:1px;background:transparent;color:#4a7a9a;
      border:1px solid #2a4a6a;border-radius:6px;padding:10px 24px;
      cursor:pointer;transition:.15s;
    " onmouseover="this.style.color='#00d4ff';this.style.borderColor='#00d4ff44'"
       onmouseout="this.style.color='#4a7a9a';this.style.borderColor='#2a4a6a'">
      AGORA NAO
    </button>
  `;
  document.body.appendChild(overlay);

  const container = document.getElementById('skin-promo-cards');
  skins.forEach((skin, i) => {
    const price   = _skinPromoPrice(skin);
    const credits = currentUser?.credits ?? 0;
    const canBuy  = credits >= price;
    const owned   = (profile?.ownedSkins || []).includes(skin.id);

    const card = document.createElement('div');
    card.style.cssText = `
      background:linear-gradient(160deg,#0b1e33,#040c18);
      border:1px solid #00d4ff22;border-radius:12px;
      padding:20px 16px 16px;text-align:center;width:200px;flex-shrink:0;
      box-shadow:0 0 30px #00d4ff0a;
      display:flex;flex-direction:column;align-items:center;
      animation:bonusCardIn .4s cubic-bezier(.2,.9,.3,1.3) both;
      animation-delay:${i * 0.12}s;
    `;

    const badge = document.createElement('div');
    badge.style.cssText = `font-family:'Press Start 2P',monospace;font-size:7px;
      color:#00d4ff;letter-spacing:2px;border:1px solid #00d4ff33;
      border-radius:3px;padding:3px 8px;display:inline-block;margin-bottom:10px;`;
    badge.textContent = 'SKIN';

    const cv = document.createElement('canvas');
    cv.width = 140; cv.height = 140;
    cv.style.cssText = 'display:block;margin:0 auto 14px;';

    const nameEl = document.createElement('div');
    nameEl.style.cssText = `font-family:'Press Start 2P',monospace;font-size:8px;
      color:#fff;letter-spacing:.5px;margin-bottom:8px;line-height:1.7;
      word-break:break-word;width:100%;`;
    nameEl.textContent = skin.name;

    const priceEl = document.createElement('div');
    priceEl.style.cssText = `font-family:'Press Start 2P',monospace;font-size:13px;
      color:#ffcc44;margin-bottom:14px;text-shadow:0 0 12px #ffcc4466;`;
    priceEl.textContent = `${price} CR`;

    const btn = document.createElement('button');
    const btnLabel = owned ? 'POSSUIDA' : canBuy ? 'COMPRAR' : 'VER NA LOJA';
    // Estilo igual ao #shop-buy-btn da loja (dourado pulsante)
    btn.style.cssText = `
      position:relative;overflow:hidden;
      font-family:'Press Start 2P',monospace;font-size:8px;letter-spacing:1px;
      width:100%;padding:11px 8px;border-radius:6px;cursor:pointer;
      border:none;transition:transform .15s,box-shadow .15s,filter .15s;
      ${owned
        ? 'background:#0d2035;color:#4a8aaa;cursor:default;'
        : canBuy
          ? `background:linear-gradient(90deg,#ffaa00,#ffe34d,#ffaa00);background-size:220% 100%;
             color:#1a1100;font-weight:800;
             animation:shopBuyGradient 3s linear infinite,shopBuyPulse 2s ease-in-out infinite;`
          : `background:linear-gradient(90deg,#0050a0,#00aaff,#0050a0);background-size:220% 100%;
             color:#020a14;font-weight:800;
             animation:shopBuyGradient 3s linear infinite;`
      }
    `;
    btn.textContent = btnLabel;
    if (owned) btn.disabled = true;
    if (!owned) {
      btn.onmouseover = () => { btn.style.filter='brightness(1.12)'; btn.style.transform='translateY(-1px)'; };
      btn.onmouseout  = () => { btn.style.filter=''; btn.style.transform=''; };
    }

    btn.onclick = async () => {
      if (owned) return;
      if (canBuy) {
        btn.textContent = '...';
        btn.disabled = true;
        btn.style.animation = 'none';
        try {
          const { ok: bought, data: bdata } = await apiFetch('/api/shop/buy', { method:'POST', body:{ skinId: skin.id } });
          if (!bought) throw new Error(bdata?.error || 'Erro');
          currentUser = bdata.user || currentUser;
          profile = { ...profile, ownedSkins: bdata.ownedSkins || profile.ownedSkins };
          updateCreditsBadge();
          animateCreditsGain(currentUser.credits + price, currentUser.credits);
          btn.textContent = 'COMPRADA!';
          btn.style.background = 'linear-gradient(135deg,#00ffaa,#00cc88)';
          btn.style.color = '#020a14';
          card.style.borderColor = '#00ffaa44';
          card.style.boxShadow = '0 0 30px #00ffaa0a';
        } catch(e) {
          btn.textContent = 'ERRO';
          btn.disabled = false;
        }
      } else {
        document.getElementById('skin-promo-overlay').remove();
        openShopAt(skin.id);
      }
    };

    card.appendChild(badge);
    card.appendChild(cv);
    card.appendChild(nameEl);
    card.appendChild(priceEl);
    card.appendChild(btn);
    container.appendChild(card);

    // Desenha a skin — aguarda imagem carregar igual às demais telas do jogo
    const drawPromo = () => {
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.save();
      ctx.translate(cv.width / 2, cv.height / 2);
      try { skin.drawPreview(ctx, cv.width / skin._size); } catch(e) {}
      ctx.restore();
    };
    if (skin.img) { skin.img.onload = drawPromo; setTimeout(drawPromo, 300); }
    drawPromo();
  });
}

function showNotify(text){
  const el=document.getElementById('notify');
  if(!el) return;
  const div=document.createElement('div');
  div.className='notify-item';
  div.textContent=text;
  el.appendChild(div);
  setTimeout(()=>div.remove(),4000);
}

// ── Sistema de Manutenção / Graceful Shutdown ─────────────────────────────
// Verifica o status do servidor a cada 30s e exibe banner ou overlay conforme a fase.
let _maintPhase = 'off';
let _maintCountdownInterval = null;

function _maintBanner() { return document.getElementById('maint-banner'); }

function _showMaintBanner(minutesLeft) {
  let banner = _maintBanner();
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'maint-banner';
    document.body.appendChild(banner);
  }
  // Atualiza o countdown sem recriar o banner inteiro
  const countdown = banner.querySelector('#maint-countdown');
  if (countdown) { countdown.textContent = minutesLeft !== null ? `${minutesLeft} min` : '—'; return; }

  banner.innerHTML = `
    <div class="maint-banner-inner">
      <div class="maint-banner-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
          <path d="M14.7 6.3a4 4 0 0 1-5.7 5.7L4 17l3 3 5-5a4 4 0 0 1 5.7-5.7l-2.5 2.5-2-2 2.5-2.5z"/>
        </svg>
      </div>
      <div class="maint-banner-text">
        <span class="maint-banner-title">MANUTENCAO PROGRAMADA</span>
        <span class="maint-banner-sub">Termine sua partida. O servidor sera reiniciado em <strong id="maint-countdown">${minutesLeft !== null ? minutesLeft + ' min' : '—'}</strong></span>
      </div>
    </div>
  `;
}

function _showMaintLocked() {
  let banner = _maintBanner();
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'maint-banner';
    document.body.appendChild(banner);
  }
  banner.className = 'maint-banner-locked';
  banner.innerHTML = `
    <div class="maint-banner-inner">
      <div class="maint-banner-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <div class="maint-banner-text">
        <span class="maint-banner-title">NOVAS PARTIDAS BLOQUEADAS</span>
        <span class="maint-banner-sub">Manutencao em andamento. Termine sua partida atual e aguarde a reabertura.</span>
      </div>
    </div>
  `;
}

function _hideMaintBanner() {
  const b = _maintBanner();
  if (b) { b.classList.add('maint-banner-hide'); setTimeout(() => b.remove(), 500); }
  if (_maintCountdownInterval) { clearInterval(_maintCountdownInterval); _maintCountdownInterval = null; }
}

// Modos desativados pelo admin — atualizado a cada poll de status
let _disabledModes = [];

function _applyDisabledModes(modes) {
  _disabledModes = modes || [];
  document.querySelectorAll('.mode-btn').forEach(btn => {
    const mode = btn.dataset.mode || btn.getAttribute('onclick')?.match(/selectMode\('([^']+)'/)?.[1];
    if (!mode) return;
    btn.classList.toggle('mode-disabled-admin', _disabledModes.includes(mode));
  });
  // Atualiza o painel de status dos modos (dot + lista)
  renderModeStatus();
}

async function _checkMaintenanceStatus() {
  try {
    const res  = await fetch('/api/server/status');
    const data = await res.json();
    const phase = data.phase;

    // Atualiza modos desativados independentemente da fase
    _applyDisabledModes(data.disabledModes || []);

    if (phase === _maintPhase) {
      // Só atualiza o countdown sem redesenhar
      if (phase === 'warning') _showMaintBanner(data.minutesLeft);
      return;
    }
    const prevPhase = _maintPhase;
    _maintPhase = phase;

    if (phase === 'off') {
      _hideMaintBanner();
      if (prevPhase === 'locked' || prevPhase === 'draining') location.reload();
    } else if (phase === 'warning') {
      _showMaintBanner(data.minutesLeft);
      // Heartbeat local: conta regressiva no próprio client
      if (_maintCountdownInterval) clearInterval(_maintCountdownInterval);
      _maintCountdownInterval = setInterval(() => {
        const c = document.getElementById('maint-countdown');
        if (!c) return;
        const cur = parseInt(c.textContent) || 0;
        if (cur > 0) c.textContent = (cur - 1) + ' min';
      }, 60000);
    } else if (phase === 'locked' || phase === 'draining') {
      _showMaintLocked();
      // Avisa quem está na tela de login
      const loginScreen = document.getElementById('login-screen');
      if (loginScreen && loginScreen.style.display !== 'none') {
        const overlay = document.getElementById('maintenance-overlay');
        if (overlay && overlay.style.display === 'none') {
          document.getElementById('maint-title').textContent = 'Servidor em manutencao';
          document.getElementById('maint-text').textContent  =
            'O servidor esta temporariamente indisponivel para manutencao. Voltaremos em breve!';
          overlay.style.display = 'flex';
        }
      }
    }

    // Reporta ao servidor se está em partida ativa
    if (currentUser) {
      const inMatch = !!document.getElementById('game-canvas') &&
                      document.getElementById('game-canvas').style.display !== 'none';
      fetch('/api/server/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inMatch }),
      }).catch(() => {});
    }
  } catch(e) { /* servidor offline — ignora */ }
}

window.checkMaintenanceNow = _checkMaintenanceStatus;

// Verifica a cada 30s
setInterval(_checkMaintenanceStatus, 30000);
// Primeira verificação após 3s do boot
setTimeout(_checkMaintenanceStatus, 3000);

// Trata mensagem WebSocket de partida bloqueada
window._handleMaintenanceLocked = function(status) {
  _maintPhase = status.phase || 'locked';
  _showMaintLocked();
  // Mostra overlay do estilo nm-card igual ao de manutenção de modo
  const overlay = document.getElementById('maintenance-overlay');
  if (overlay) {
    document.getElementById('maint-title').textContent = 'Manutencao em andamento';
    document.getElementById('maint-text').textContent  =
      'Novas partidas estao bloqueadas. Aguarde a reabertura do servidor para jogar novamente.';
    overlay.style.display = 'flex';
  }
};

// Trata mudanças aplicadas pelo admin em tempo real via WebSocket
window._handleAdminUpdate = function(msg) {
  if (!currentUser) return;
  if (msg.kind === 'credits') {
    const prev = currentUser.credits ?? 0;
    currentUser.credits = msg.credits;
    updateCreditsBadge();
    // Animação de ganho/perda de créditos igual à da loja
    if (msg.credits !== prev) animateCreditsGain(prev, msg.credits);
  } else if (msg.kind === 'skins') {
    if (profile) profile.ownedSkins = msg.skins;
  } else if (msg.kind === 'blocked' && msg.blocked) {
    // Conta bloqueada: desconecta e volta ao login com aviso
    showNotify('Sua conta foi suspensa pelo administrador.');
    setTimeout(() => {
      if (typeof net !== 'undefined') { try { net.disconnect(); } catch(e){} }
      showScreen('login');
    }, 2000);
  }
};

// Atualiza promo em tempo real quando o admin altera (broadcast para todos)
window._handlePromoUpdate = function(promo) {
  if (profile) profile.promo = promo || null;
  // Se a loja estiver aberta, reconstrói o carrossel de naves
  const shopOpen = document.getElementById('shop-modal')?.style.display !== 'none';
  if (shopOpen) buildShopTrack();
};

// Atualiza preços customizados em tempo real quando o admin altera
window._handlePricesUpdate = function(prices) {
  if (profile) profile.customPrices = prices || {};
  const shopOpen = document.getElementById('shop-modal')?.style.display !== 'none';
  if (shopOpen) buildShopTrack();
};

// ── Inicialização: tenta sessão existente, senão mostra tela de login ──
// setupGoogleSignIn() só é chamada aqui, quando não há sessão, para evitar
// requisições desnecessárias ao Google e o One Tap automático para logados.
(async function boot(){
  const hasSession = await refreshProfile();
  if (hasSession) {
    loadHistory();
    showScreen('menu');
    checkPendingCreditOrder();
    maybeShowTutorial();
    if (!profile || profile.tutorialSeen) {
      maybeShowNewModeAlert();
      // Promo de skins: só mostra se não há tutorial nem modo novo pendente
      if (profile?.tutorialSeen) setTimeout(maybeShowSkinPromo, 1200);
    }
  } else {
    showScreen('login');
    setupGoogleSignIn();
  }
})();
