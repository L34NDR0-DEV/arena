'use strict';
const mailer = require('./mailer');

const SITE_NAME  = 'Tower Defense on the Space';
const SHORT_NAME = 'TowerDefenseSpace';
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
const CONTACT    = 'leandrosilva212010@gmail.com';

function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatCents(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pkgLabel(packageId) {
  const map = {
    pack_3: 'R$ 3,00 — Iniciante', pack_5: 'R$ 5,00 — Explorador',
    pack_7: 'R$ 7,00 — Piloto', pack_10: 'R$ 10,00 — Veterano',
    pack_20: 'R$ 20,00 — Elite', pack_50: 'R$ 50,00 — Comandante',
    pack_100: 'R$ 100,00 — Lendario',
  };
  return map[packageId] || packageId;
}

function buildReceiptHtml({ order, userName, userEmail }) {
  const approved  = order.status === 'approved';
  const refunded  = order.status === 'refunded';
  const statusLabel = approved ? 'APROVADO' : refunded ? 'REEMBOLSADO' : order.status.toUpperCase();
  const statusColor = approved ? '#00ffaa' : refunded ? '#ffaa00' : '#aaaaaa';
  const statusBg    = approved ? '#00ffaa18' : refunded ? '#ffaa0018' : '#aaaaaa18';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comprovante — ${SHORT_NAME}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Share+Tech+Mono&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#02050d;font-family:'Share Tech Mono',monospace;color:#c8d8e8;padding:24px 12px;}
  .wrap{max-width:540px;margin:0 auto;background:#080f1a;border:1px solid #00d4ff22;border-radius:10px;overflow:hidden;box-shadow:0 0 40px #00d4ff0a;}

  /* Header */
  .hdr{background:linear-gradient(160deg,#0b1e33 0%,#040c18 100%);padding:32px 28px 24px;text-align:center;border-bottom:1px solid #00d4ff22;position:relative;overflow:hidden;}
  .hdr::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% -20%,#00d4ff18,transparent 70%);pointer-events:none;}
  .hdr-icon{font-size:32px;margin-bottom:12px;display:block;}
  .hdr-title{font-family:'Orbitron',sans-serif;font-size:18px;font-weight:900;color:#00d4ff;letter-spacing:2px;line-height:1.3;}
  .hdr-sub{font-size:10px;color:#4a7a9a;letter-spacing:4px;margin-top:6px;text-transform:uppercase;}
  .hdr-badge{display:inline-block;margin-top:14px;padding:5px 18px;border:1px solid #00d4ff33;border-radius:20px;font-size:9px;color:#5ab8d8;letter-spacing:2px;}

  /* Status banner */
  .status-bar{padding:12px 28px;background:${statusBg};border-bottom:1px solid ${statusColor}33;text-align:center;}
  .status-text{font-family:'Orbitron',sans-serif;font-size:13px;font-weight:700;color:${statusColor};letter-spacing:3px;}

  /* Body */
  .body{padding:24px 28px;}
  .section-title{font-size:9px;color:#3a6a8a;letter-spacing:3px;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #ffffff08;}
  .row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #ffffff06;}
  .row:last-child{border-bottom:none;}
  .lbl{font-size:9px;color:#4a7a9a;letter-spacing:1px;text-transform:uppercase;}
  .val{font-size:12px;color:#d0e8ff;font-weight:700;text-align:right;max-width:60%;}
  .val.hi{font-size:20px;color:#00d4ff;font-family:'Orbitron',sans-serif;}
  .val.price{font-size:18px;color:#ffcc44;font-family:'Orbitron',sans-serif;}
  .val.id{font-size:11px;color:#4a8aaa;font-family:'Share Tech Mono',monospace;}

  .sep{height:1px;background:linear-gradient(90deg,transparent,#00d4ff22,transparent);margin:18px 0;}

  /* Nota */
  .note{background:#040c18;border:1px solid #ffcc4420;border-radius:6px;padding:16px 18px;margin-top:4px;}
  .note-title{font-size:9px;color:#ffcc44;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;}
  .note-text{font-size:10px;color:#6a8aaa;line-height:1.8;}
  .note-text strong{color:#a0c0d8;}
  .note-text a{color:#00d4ff;text-decoration:none;}

  /* Footer */
  .ftr{background:#040c18;padding:18px 28px;text-align:center;border-top:1px solid #ffffff06;}
  .ftr p{font-size:9px;color:#2a4a6a;line-height:1.8;}
  .ftr a{color:#00d4ff;text-decoration:none;}
  .ftr .copy{margin-top:10px;font-size:9px;color:#1a3a5a;letter-spacing:1px;}
</style>
</head>
<body>
<div class="wrap">

  <div class="hdr">
    <span class="hdr-icon">&#128640;</span>
    <div class="hdr-title">TOWER DEFENSE<br>ON THE SPACE</div>
    <div class="hdr-sub">towerdefensespace.com.br</div>
    <div class="hdr-badge">COMPROVANTE DE COMPRA</div>
  </div>

  <div class="status-bar">
    <span class="status-text">&#9679; PAGAMENTO ${statusLabel}</span>
  </div>

  <div class="body">

    <div class="section-title">Dados do Piloto</div>
    <div class="row"><span class="lbl">Nome</span><span class="val">${escHtml(userName)}</span></div>
    <div class="row"><span class="lbl">E-mail</span><span class="val" style="font-size:10px;">${escHtml(userEmail)}</span></div>
    <div class="row"><span class="lbl">Data da compra</span><span class="val">${formatDate(order.created_at)}</span></div>

    <div class="sep"></div>

    <div class="section-title">Detalhes da Compra</div>
    <div class="row"><span class="lbl">Pacote</span><span class="val">${escHtml(pkgLabel(order.package_id))}</span></div>
    <div class="row"><span class="lbl">Creditos recebidos</span><span class="val hi">${order.credits_amount} CR</span></div>
    <div class="row"><span class="lbl">Valor pago</span><span class="val price">${formatCents(order.price_cents)}</span></div>

    <div class="sep"></div>

    <div class="section-title">Identificacao</div>
    <div class="row"><span class="lbl">Pedido</span><span class="val id">#${order.id}</span></div>
    ${order.mp_payment_id ? `<div class="row"><span class="lbl">ID Mercado Pago</span><span class="val id">${escHtml(String(order.mp_payment_id))}</span></div>` : ''}
    <div class="row"><span class="lbl">Metodo</span><span class="val">Mercado Pago</span></div>

    <div class="sep"></div>

    <div class="note">
      <div class="note-title">&#9888; Politica de Reembolso</div>
      <div class="note-text">
        Creditos sao entregues imediatamente apos confirmacao do pagamento.<br>
        Voce tem <strong>7 dias corridos</strong> a partir da compra para solicitar reembolso integral,
        desde que os creditos <strong>nao tenham sido utilizados</strong>
        (CDC Art. 49 — direito de arrependimento em compras online).<br><br>
        Creditos ja utilizados em skins ou itens <strong>nao sao elegiveis</strong> para estorno.<br><br>
        Para solicitar: <a href="mailto:${CONTACT}">${CONTACT}</a><br>
        Informe o numero do pedido: <strong>#${order.id}</strong>
      </div>
    </div>

  </div>

  <div class="ftr">
    <p>Este e-mail foi gerado automaticamente — nao responda.</p>
    <p>Duvidas? Acesse <a href="${PUBLIC_URL}">${PUBLIC_URL}</a> ou contate <a href="mailto:${CONTACT}">${CONTACT}</a></p>
    <div class="copy">TOWER DEFENSE ON THE SPACE &copy; ${new Date().getFullYear()} &mdash; Todos os direitos reservados</div>
  </div>

</div>
</body>
</html>`;
}

async function sendReceiptEmail({ order, userName, userEmail }) {
  const html = buildReceiptHtml({ order, userName, userEmail });
  return mailer.sendEmail({
    to: userEmail,
    subject: `Comprovante #${order.id} — Tower Defense on the Space`,
    html,
  });
}

module.exports = { sendReceiptEmail, buildReceiptHtml };
