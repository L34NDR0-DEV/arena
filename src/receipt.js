'use strict';
// Gera o HTML do comprovante de compra e envia por e-mail via Resend.

const mailer = require('./mailer');

const SITE_NAME = 'Arena Transformers';
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatCents(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildReceiptHtml({ order, userName, userEmail }) {
  const statusLabel = order.status === 'approved' ? 'Aprovado' :
                      order.status === 'refunded'  ? 'Reembolsado' : order.status;
  const statusColor = order.status === 'approved' ? '#00d4aa' :
                      order.status === 'refunded'  ? '#ffaa00' : '#aaaaaa';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comprovante de Compra — ${SITE_NAME}</title>
<style>
  body{margin:0;padding:0;background:#04080f;font-family:'Courier New',monospace;color:#c8d8e8;}
  .wrap{max-width:560px;margin:32px auto;background:#0a1420;border:1px solid #00d4ff33;border-radius:8px;overflow:hidden;}
  .header{background:linear-gradient(135deg,#0d2035,#061525);padding:28px 32px;border-bottom:2px solid #00d4ff44;text-align:center;}
  .logo{font-size:22px;font-weight:700;color:#00d4ff;letter-spacing:3px;text-transform:uppercase;}
  .logo-sub{font-size:10px;color:#7aa0c0;letter-spacing:6px;margin-top:4px;}
  .title{margin:18px 0 0;font-size:13px;color:#a0c0d8;letter-spacing:2px;text-transform:uppercase;}
  .body{padding:28px 32px;}
  .row{display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid #ffffff0d;}
  .row:last-child{border-bottom:none;}
  .label{font-size:10px;color:#7aa0c0;letter-spacing:1px;text-transform:uppercase;}
  .value{font-size:13px;color:#e0f0ff;font-weight:700;text-align:right;}
  .value.big{font-size:18px;color:#00d4ff;}
  .value.status{color:${statusColor};}
  .divider{height:1px;background:linear-gradient(90deg,transparent,#00d4ff44,transparent);margin:20px 0;}
  .footer{background:#061525;padding:20px 32px;text-align:center;border-top:1px solid #00d4ff22;}
  .footer p{margin:6px 0;font-size:10px;color:#5a7a9a;line-height:1.6;}
  .footer a{color:#00d4ff;text-decoration:none;}
  .note{background:#0d2035;border:1px solid #ffcc0033;border-radius:6px;padding:14px 18px;margin-top:20px;font-size:10px;color:#a0a8b0;line-height:1.7;}
  .note strong{color:#ffcc44;}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">${SITE_NAME}</div>
    <div class="logo-sub">SPACE ARENA</div>
    <div class="title">Comprovante de Compra</div>
  </div>

  <div class="body">
    <div class="row">
      <span class="label">Piloto</span>
      <span class="value">${escHtml(userName)}</span>
    </div>
    <div class="row">
      <span class="label">E-mail</span>
      <span class="value">${escHtml(userEmail)}</span>
    </div>
    <div class="row">
      <span class="label">Data</span>
      <span class="value">${formatDate(order.created_at)}</span>
    </div>

    <div class="divider"></div>

    <div class="row">
      <span class="label">Pacote</span>
      <span class="value">${escHtml(order.package_id.replace('pack_', 'Pacote '))}</span>
    </div>
    <div class="row">
      <span class="label">Creditos concedidos</span>
      <span class="value big">${order.credits_amount} CR</span>
    </div>
    <div class="row">
      <span class="label">Valor pago</span>
      <span class="value big">${formatCents(order.price_cents)}</span>
    </div>
    <div class="row">
      <span class="label">Status</span>
      <span class="value status">${statusLabel}</span>
    </div>

    <div class="divider"></div>

    <div class="row">
      <span class="label">ID do pedido</span>
      <span class="value">#${order.id}</span>
    </div>
    ${order.mp_payment_id ? `
    <div class="row">
      <span class="label">ID Mercado Pago</span>
      <span class="value">${escHtml(String(order.mp_payment_id))}</span>
    </div>` : ''}

    <div class="note">
      <strong>Politica de reembolso</strong><br>
      Creditos digitais sao entregues imediatamente apos a confirmacao do pagamento.
      Caso voce nao tenha utilizado os creditos e deseje solicitar reembolso em ate
      <strong>7 dias</strong> corridos da compra (direito de arrependimento — CDC Art. 49),
      entre em contato pelo e-mail <a href="mailto:leandrosilva212010@gmail.com" style="color:#00d4ff;">leandrosilva212010@gmail.com</a>
      informando o numero do pedido (<strong>#${order.id}</strong>).
      Creditos ja utilizados em compras dentro do jogo nao sao elegíveis para reembolso.
    </div>
  </div>

  <div class="footer">
    <p>Este e-mail foi gerado automaticamente. Nao responda a este endereco.</p>
    <p>Em caso de duvidas acesse <a href="${PUBLIC_URL}">${PUBLIC_URL}</a></p>
    <p style="margin-top:12px;color:#3a5a7a;">${SITE_NAME} &copy; ${new Date().getFullYear()}</p>
  </div>
</div>
</body>
</html>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendReceiptEmail({ order, userName, userEmail }) {
  const html = buildReceiptHtml({ order, userName, userEmail });
  return mailer.sendEmail({
    to: userEmail,
    subject: `Comprovante de Compra #${order.id} — ${SITE_NAME}`,
    html,
  });
}

module.exports = { sendReceiptEmail, buildReceiptHtml };
