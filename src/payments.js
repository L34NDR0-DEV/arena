'use strict';
// Integração com Mercado Pago Checkout Pro (PIX + cartão).
// Sem MP_ACCESS_TOKEN configurado, os pacotes ficam "desabilitados" e o
// restante do jogo continua funcionando normalmente — não é um requisito
// para rodar o servidor.
const db      = require('./db');
const receipt = require('./receipt');

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const PUBLIC_URL      = (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');

// `bonus` agora é a quantidade FIXA de créditos extras (exibida como
// "+N créditos de bônus" na loja, em vez da porcentagem de antes) —
// `credits` já é o total final (base + bônus) creditado na compra.
// Os pacotes 10/50/100 mantêm o mesmo total de antes; o `bonus` aqui é
// só a conversão das antigas porcentagens (+10/+30/+40%) para valor fixo
// (ex.: pack_50 → base 2500 × 1.30 = 3250 ⇒ bônus = 750).
const CREDIT_PACKAGES = {
  pack_3:  { id: 'pack_3',  credits: 280,   priceCents: 300,   label: 'R$ 3,00',  bonus: 130  },
  pack_5:  { id: 'pack_5',  credits: 250,   priceCents: 500,   label: 'R$ 5,00',  bonus: null },
  pack_7:  { id: 'pack_7',  credits: 564,   priceCents: 700,   label: 'R$ 7,00',  bonus: 214  },
  pack_10: { id: 'pack_10', credits: 550,   priceCents: 1000,  label: 'R$ 10,00', bonus: 50   },
  pack_20: { id: 'pack_20', credits: 1162,  priceCents: 2000,  label: 'R$ 20,00', bonus: 162  },
  pack_50: { id: 'pack_50', credits: 3250,  priceCents: 5000,  label: 'R$ 50,00', bonus: 750  },
  pack_100:{ id: 'pack_100',credits: 7000,  priceCents: 10000, label: 'R$ 100,00',bonus: 2000 },
};

let mpClient = null;
let mpPreferenceApi = null;
let mpPaymentApi = null;

function getMp() {
  if (!MP_ACCESS_TOKEN) return null;
  if (mpClient) return { preference: mpPreferenceApi, payment: mpPaymentApi };
  // Carregado sob demanda — assim o servidor roda mesmo sem o pacote instalado/configurado.
  const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
  mpClient = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
  mpPreferenceApi = new Preference(mpClient);
  mpPaymentApi    = new Payment(mpClient);
  return { preference: mpPreferenceApi, payment: mpPaymentApi };
}

function isEnabled() {
  return !!MP_ACCESS_TOKEN;
}

async function createCheckout(user, packageId) {
  const pkg = CREDIT_PACKAGES[packageId];
  if (!pkg) throw Object.assign(new Error('invalid_package'), { code: 'invalid_package' });

  const mp = getMp();
  if (!mp) throw Object.assign(new Error('payments_disabled'), { code: 'payments_disabled' });

  const info = db.insertOrder.run(user.id, pkg.id, pkg.credits, pkg.priceCents);
  const orderId = Number(info.lastInsertRowid);

  // O Mercado Pago rejeita "auto_return" quando back_urls não são URLs
  // públicas e absolutas em HTTPS (ex.: http://localhost) — sem PUBLIC_URL
  // configurado em produção, isso fazia toda criação de preferência falhar
  // com "invalid_auto_return" e o checkout nunca abria.
  const isPublicHttps = /^https:\/\//i.test(PUBLIC_URL);
  const body = {
    items: [{
      title: `${pkg.credits} Créditos — Arena`,
      quantity: 1,
      unit_price: pkg.priceCents / 100,
      currency_id: 'BRL',
    }],
    external_reference: String(orderId),
    back_urls: {
      success: `${PUBLIC_URL}/?shop=credits&order=${orderId}`,
      failure: `${PUBLIC_URL}/?shop=credits&order=${orderId}&status=failure`,
      pending: `${PUBLIC_URL}/?shop=credits&order=${orderId}&status=pending`,
    },
    notification_url: `${PUBLIC_URL}/api/payments/webhook`,
  };
  if (isPublicHttps) body.auto_return = 'approved';

  let result;
  try {
    result = await mp.preference.create({ body });
  } catch (err) {
    // Remove a ordem pendente para não deixar registros órfãos no banco.
    try { db.deleteOrder.run(orderId); } catch {}
    // O SDK do Mercado Pago expõe os detalhes do erro da API em `err.cause`
    // (array de {code, description}) — sem logar isso, só vemos "Error"
    // genérico e fica impossível saber o motivo real da rejeição.
    const details = Array.isArray(err.cause) ? err.cause.map(c => `${c.code}: ${c.description}`).join(' | ') : err.message;
    console.error(`[PAGAMENTOS] mercadopago rejeitou a preferência (order ${orderId}): ${details}`);
    if (!isPublicHttps) {
      console.error('[PAGAMENTOS] dica: PUBLIC_URL não está configurado como HTTPS público — defina a variável de ambiente PUBLIC_URL com a URL real do site (ex.: https://seujogo.com)');
    }
    throw err;
  }

  db.setOrderPreference.run(result.id, orderId);
  // Tokens de teste começam com "TEST-" — usar sandbox_init_point nesses casos.
  const isTest = MP_ACCESS_TOKEN.startsWith('TEST-');
  const checkoutUrl = isTest ? result.sandbox_init_point : result.init_point;
  return { checkoutUrl, orderId };
}

// Processa notificações do Mercado Pago. Nunca confia no payload da
// notificação por si só — sempre confirma consultando a API de pagamentos
// pelo ID, que é a defesa central contra notificações forjadas.
async function handleWebhook(query, body) {
  const mp = getMp();
  if (!mp) return { ok: false, reason: 'payments_disabled' };

  // IPN v1: ?topic=payment&id=123
  // Webhooks v2: ?data.id=123&type=payment  OU  body.type + body.data.id
  const paymentId = (query && (query['data.id'] || query.id))
                 || (body && body.data && body.data.id)
                 || null;
  const type = (query && (query.type || query.topic)) || (body && body.type);
  if (type !== 'payment' || !paymentId) return { ok: false, reason: 'ignored' };

  let payment;
  try { payment = await mp.payment.get({ id: paymentId }); }
  catch (err) { return { ok: false, reason: 'payment_lookup_failed' }; }

  const orderId = Number(payment.external_reference);
  if (!Number.isInteger(orderId) || orderId <= 0) return { ok: false, reason: 'missing_external_reference' };

  const order = db.findOrderById.get(orderId);
  if (!order) return { ok: false, reason: 'order_not_found' };

  if (payment.status !== 'approved') {
    if (order.status === 'pending') {
      db.setOrderStatus.run(payment.status, String(payment.id), orderId);
    }
    return { ok: true, reason: `status_${payment.status}` };
  }

  const result = db.transaction(() => {
    const res = db.approveOrderIfPending.run(String(payment.id), orderId);
    if (res.changes === 0) return false; // já processado — idempotência
    db.addCredits.run(order.credits_amount, order.user_id);
    return true;
  });

  // Envia comprovante por e-mail após crédito confirmado (não bloqueia a resposta ao MP).
  if (result) {
    const orderUser = db.findUserById.get(order.user_id);
    const updatedOrder = db.findOrderById.get(orderId);
    if (orderUser && updatedOrder) {
      receipt.sendReceiptEmail({
        order: updatedOrder,
        userName: orderUser.display_name,
        userEmail: orderUser.email,
      }).catch(err => console.error('[EMAIL] Falha ao enviar comprovante:', err.message));
    }
  }

  return { ok: true, credited: result };
}

// Solicita estorno total de um pagamento ao Mercado Pago.
async function refundPayment(mpPaymentId) {
  const mp = getMp();
  if (!mp) return { ok: false, reason: 'payments_disabled' };
  try {
    // A API do MP para reembolso é um POST em /v1/payments/{id}/refunds.
    // O SDK v2 expõe isso via mp.payment.refund ou via fetch direto.
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}/refunds`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[PAGAMENTOS] Reembolso rejeitado pelo MP (payment ${mpPaymentId}):`, data);
      return { ok: false, reason: data.message || `http_${res.status}` };
    }
    console.log(`[PAGAMENTOS] Reembolso aprovado pelo MP: payment ${mpPaymentId}, refund ${data.id}`);
    return { ok: true, refundId: data.id };
  } catch (err) {
    console.error('[PAGAMENTOS] Erro ao solicitar reembolso:', err.message);
    return { ok: false, reason: err.message };
  }
}

module.exports = { CREDIT_PACKAGES, isEnabled, createCheckout, handleWebhook, refundPayment };
