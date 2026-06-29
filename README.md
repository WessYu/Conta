# Conta

App mobile-first de planejamento e gestao financeira em PWA, com frontend instalavel, backend Node puro e persistencia local em JSON.

## Rodar localmente

```bash
node server/index.js
```

Abra `http://localhost:4000` no navegador. No celular, use o IP da maquina na mesma rede, por exemplo `http://SEU-IP:4000`.

Se o seu npm estiver normal, `npm run dev` faz a mesma coisa.

## Instalar no celular

- iPhone: Safari > Compartilhar > Adicionar a Tela de Inicio.
- Android: Chrome > menu > Instalar app.

## Integracoes reais

O app nao usa modo demo. Se as chaves reais nao estiverem no `.env`, o backend retorna erro de configuracao.

Crie um `.env` a partir de `.env.example` e preencha:

- `BELVO_SECRET_ID` e `BELVO_SECRET_PASSWORD` para Open Finance Brasil via Belvo.
- `STRIPE_SECRET_KEY` e `STRIPE_PUBLISHABLE_KEY` para Apple Pay/Google Pay via Stripe.
- `PUBLIC_BASE_URL` com um dominio HTTPS real.
- `TERMS_URL`, `COMPANY_ICON_URL` e `COMPANY_LOGO_URL` publicos.

Rotas principais:

- `POST /api/integrations/bank/connect` cria uma sessao real do Hosted Widget Belvo.
- `POST /api/integrations/bank/sync` busca dados reais por `link_id`.
- `POST /api/payments/intent` cria PaymentIntent real no Stripe.
- `POST /api/webhooks/belvo` recebe eventos do consentimento bancario.

O app nunca deve armazenar credenciais bancarias do usuario diretamente.
