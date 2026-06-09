'use strict';
// Envio de e-mails via Resend (https://resend.com).
// Configure as variáveis de ambiente:
//   RESEND_API_KEY  — chave da API (obrigatório para enviar e-mails)
//   EMAIL_FROM      — remetente, ex: noreply@seudominio.com
//                     (sem domínio verificado, use: onboarding@resend.dev)

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM     = process.env.EMAIL_FROM || 'onboarding@resend.dev';

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.warn('[EMAIL] RESEND_API_KEY não configurado — e-mail não enviado para', to);
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const { fetch } = await import('node-fetch').catch(() => ({ fetch: global.fetch }));
    const fetchFn = typeof fetch === 'function' ? fetch : global.fetch;

    const res = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Tower Defense on the Space <${EMAIL_FROM}>`,
        reply_to: 'leandrosilva212010@gmail.com',
        to, subject, html,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[EMAIL] Resend rejeitou o envio:', data);
      return { ok: false, reason: data.message || 'resend_error' };
    }
    console.log(`[EMAIL] Enviado para ${to} — id: ${data.id}`);
    return { ok: true, id: data.id };
  } catch (err) {
    console.error('[EMAIL] Erro ao enviar e-mail:', err.message);
    return { ok: false, reason: err.message };
  }
}

module.exports = { sendEmail, isConfigured: () => !!RESEND_API_KEY };
