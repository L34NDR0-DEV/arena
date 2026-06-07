'use strict';
// Integração com Mercado Pago Checkout Pro (PIX + cartão).
// Sem MP_ACCESS_TOKEN configurado, os pacotes ficam "desabilitados" e o
// restante do jogo continua funcionando normalmente — não é um requisito
// para rodar o servidor.
const db = require('./db');

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const PUBLIC_URL      = (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');

const CREDIT_PACKAGES = {
  pack_5:  { id: 'pack_5',  credits: 250,  priceCents: 500,  label: 'R$ 5,00',  bonus: null   },
  pack_10: { id: 'pack_10', credits: 550,  priceCents: 1000, label: 'R$ 10,00', bonus: '+10%' },
  pack_20: { id: 'pack_20', credits: 1200, priceCents: 2000, label: 'R$ 20,00', bonus: '+20%' },
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

  const result = await mp.preference.create({
    body: {
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
      auto_return: 'approved',
      notification_url: `${PUBLIC_URL}/api/payments/webhook`,
    },
  });

  db.setOrderPreference.run(result.id, orderId);
  return { checkoutUrl: result.init_point, orderId };
}

// Processa notificações do Mercado Pago. Nunca confia no payload da
// notificação por si só — sempre confirma consultando a API de pagamentos
// pelo ID, que é a defesa central contra notificações forjadas.
async function handleWebhook(query, body) {
  const mp = getMp();
  if (!mp) return { ok: false, reason: 'payments_disabled' };

  const paymentId = (query && (query['data.id'] || query.id))
                 || (body && body.data && body.data.id)
                 || null;
  const type = (query && query.type) || (body && body.type);
  if (type !== 'payment' || !paymentId) return { ok: false, reason: 'ignored' };

  let payment;
  try { payment = await mp.payment.get({ id: paymentId }); }
  catch (err) { return { ok: false, reason: 'payment_lookup_failed' }; }

  const orderId = Number(payment.external_reference);
  if (!Number.isInteger(orderId)) return { ok: false, reason: 'missing_external_reference' };

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

  return { ok: true, credited: result };
}

module.exports = { CREDIT_PACKAGES, isEnabled, createCheckout, handleWebhook };
