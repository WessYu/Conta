function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw Object.assign(new Error(`Configure ${name} no arquivo .env para conectar bancos reais.`), { status: 503 });
  }
  return value;
}

function belvoBaseUrl() {
  return process.env.BELVO_ENV === 'sandbox' ? 'https://sandbox.belvo.com' : 'https://api.belvo.com';
}

function basicAuth() {
  const id = requireEnv('BELVO_SECRET_ID');
  const password = requireEnv('BELVO_SECRET_PASSWORD');
  return `Basic ${Buffer.from(`${id}:${password}`).toString('base64')}`;
}

function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
}

export function getBankStatus() {
  return {
    provider: 'belvo_open_finance_brazil',
    environment: process.env.BELVO_ENV === 'sandbox' ? 'sandbox' : 'production',
    ready: Boolean(process.env.BELVO_SECRET_ID && process.env.BELVO_SECRET_PASSWORD),
    callbackBaseUrl: publicBaseUrl(),
    requiredUserData: ['CPF', 'nome completo']
  };
}

export async function createBelvoWidgetSession({ documentNumber, fullName, externalId, accessMode = 'single' }) {
  const cleanDocument = String(documentNumber || '').replace(/\D/g, '');
  const name = String(fullName || '').trim();

  if (cleanDocument.length !== 11) {
    throw Object.assign(new Error('Informe um CPF valido para iniciar o consentimento Open Finance.'), { status: 422 });
  }

  if (name.length < 3) {
    throw Object.assign(new Error('Informe o nome completo usado no banco.'), { status: 422 });
  }

  const appUrl = publicBaseUrl();
  const payload = {
    id: requireEnv('BELVO_SECRET_ID'),
    password: requireEnv('BELVO_SECRET_PASSWORD'),
    scopes: 'read_institutions,write_links,read_consents,write_consents,write_consent_callback,delete_consents',
    stale_in: process.env.BELVO_STALE_IN || '300d',
    fetch_resources: ['ACCOUNTS', 'TRANSACTIONS', 'OWNERS', 'BILLS'],
    widget: {
      purpose:
        process.env.BELVO_PURPOSE ||
        'Planejamento financeiro pessoal, categorizacao de gastos e calculo de limite seguro para gastar.',
      openfinance_feature: 'consent_link_creation',
      callback_urls: {
        success: `${appUrl}/bank-connected`,
        exit: `${appUrl}/bank-exit`,
        event: `${appUrl}/api/webhooks/belvo`
      },
      consent: {
        terms_and_conditions_url: process.env.TERMS_URL || `${appUrl}/terms`,
        permissions: ['REGISTER', 'ACCOUNTS', 'CREDIT_CARDS', 'CREDIT_OPERATIONS'],
        identification_info: [
          {
            type: 'CPF',
            number: cleanDocument,
            name
          }
        ]
      },
      branding: {
        company_icon: process.env.COMPANY_ICON_URL || `${appUrl}/icons/icon.svg`,
        company_logo: process.env.COMPANY_LOGO_URL || `${appUrl}/icons/icon.svg`,
        company_name: process.env.COMPANY_NAME || 'Conta',
        company_terms_url: process.env.TERMS_URL || `${appUrl}/terms`,
        overlay_background_color: '#000000',
        social_proof: false
      },
      theme: []
    }
  };

  const response = await fetch(`${belvoBaseUrl()}/api/token/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const token = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(token.detail || token.message || 'Belvo recusou a criacao do consentimento.'), {
      status: response.status,
      details: token
    });
  }

  const id = externalId || `conta_${Date.now()}`;
  const widgetUrl = new URL('https://widget.belvo.io/');
  widgetUrl.searchParams.set('access_token', token.access);
  widgetUrl.searchParams.set('locale', 'pt');
  widgetUrl.searchParams.set('access_mode', accessMode);
  widgetUrl.searchParams.set('external_id', id);

  return {
    provider: 'belvo_open_finance_brazil',
    accessTokenExpiresInMinutes: 10,
    externalId: id,
    widgetUrl: widgetUrl.toString()
  };
}

async function belvoGet(pathname, params) {
  const url = new URL(`${belvoBaseUrl()}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: basicAuth()
    }
  });
  const payload = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(payload.detail || payload.message || 'Belvo recusou a sincronizacao.'), {
      status: response.status,
      details: payload
    });
  }
  return payload;
}

export async function fetchBelvoLinkData(linkId) {
  if (!linkId) {
    throw Object.assign(new Error('Informe o link_id retornado pela Belvo.'), { status: 422 });
  }

  const [accounts, transactions, bills] = await Promise.all([
    belvoGet('/api/accounts/', { link: linkId }),
    belvoGet('/api/transactions/', { link: linkId }),
    belvoGet('/api/bills/', { link: linkId })
  ]);

  return { accounts, transactions, bills };
}
