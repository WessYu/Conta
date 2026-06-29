function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw Object.assign(new Error(`Configure ${name} no arquivo .env para usar pagamentos reais.`), { status: 503 });
  }
  return value;
}

export function getPaymentsStatus() {
  return {
    provider: 'stripe',
    ready: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY),
    publishableKeyConfigured: Boolean(process.env.STRIPE_PUBLISHABLE_KEY),
    productionChecklist: [
      'Conta Stripe ativa',
      'Dominio HTTPS validado',
      'Apple Pay habilitado no dominio',
      'Google Pay habilitado no Stripe/Google Pay Console'
    ]
  };
}

export async function createPaymentIntent({ amount, currency = 'brl', description = 'Conta wallet connection' }) {
  const secretKey = requireEnv('STRIPE_SECRET_KEY');
  const publishableKey = requireEnv('STRIPE_PUBLISHABLE_KEY');
  const amountInCents = Math.round(Number(amount) * 100);

  if (!Number.isFinite(amountInCents) || amountInCents < 50) {
    throw Object.assign(new Error('Valor minimo para pagamento real e R$ 0,50.'), { status: 422 });
  }

  const params = new URLSearchParams();
  params.set('amount', String(amountInCents));
  params.set('currency', currency.toLowerCase());
  params.set('description', description);
  params.set('automatic_payment_methods[enabled]', 'true');

  const response = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });

  const payload = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(payload.error?.message || 'Stripe recusou a criacao do pagamento.'), {
      status: response.status,
      details: payload
    });
  }

  return {
    provider: 'stripe',
    publishableKey,
    clientSecret: payload.client_secret,
    paymentIntentId: payload.id,
    amount: amountInCents,
    currency: payload.currency,
    status: payload.status
  };
}
