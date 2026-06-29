# Conta

App mobile-first de planejamento e gestao financeira real em PWA.

## O que ja esta no repo

- Interface preto e branco minimalista, feita para abrir no navegador do celular e instalar como app.
- Cadastro e login com sessao HTTP-only.
- App com dados vazios no primeiro acesso: sem seed, sem mock e sem modo demo.
- Cadastro manual de contas, entradas, saidas e contas a pagar.
- Calculo automatico de saldo total, entradas, saidas, limite seguro do mes e limite do dia.
- Backend Node sem framework, salvando em `server/data/store.json`.
- Integracao bancaria real preparada via Belvo/Open Finance: cria consentimento, recebe `link_id`, importa contas, movimentos e faturas autorizadas.
- Apple Pay e Google Pay preparados via Stripe PaymentIntent quando as chaves reais forem configuradas.

## Rodar localmente

```bash
cp .env.example .env
npm install
npm run dev
```

Abra:

```bash
http://localhost:4000
```

## Instalar no celular

- iPhone: Safari > Compartilhar > Adicionar a Tela de Inicio.
- Android: Chrome > menu > Instalar app.

## Variaveis reais

Preencha o `.env` antes de usar integracoes:

```env
PORT=4000
BELVO_ENV=production
BELVO_SECRET_ID=
BELVO_SECRET_PASSWORD=
PUBLIC_BASE_URL=https://seu-dominio.com
TERMS_URL=https://seu-dominio.com/terms
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
```

## Rotas principais

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/summary`
- `POST /api/accounts`
- `POST /api/transactions`
- `POST /api/bills`
- `POST /api/integrations/bank/connect`
- `POST /api/integrations/bank/sync`
- `POST /api/payments/intent`

## Deploy

Para funcionar como app real com dados persistentes, use um host Node com disco persistente ou troque `server/store.js` por PostgreSQL/Supabase. Netlify estatico sozinho nao e suficiente para o backend real.
