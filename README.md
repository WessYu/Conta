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

## Links esperados

Frontend GitHub Pages:

```txt
https://wessyu.github.io/Conta/
```

Backend Render configurado no frontend:

```txt
https://conta-api-wessyu.onrender.com
```

O frontend em GitHub Pages chama essa API automaticamente quando estiver rodando em `github.io`.

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

## Deploy do backend no Render

O arquivo `render.yaml` ja esta pronto. No Render:

1. New > Blueprint.
2. Conecte o repositorio `WessYu/Conta`.
3. Escolha o servico `conta-api-wessyu`.
4. Preencha as secrets reais: `BELVO_SECRET_ID`, `BELVO_SECRET_PASSWORD`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`.
5. Deploy.

O blueprint ja define:

```env
NODE_ENV=production
COOKIE_SECURE=true
FRONTEND_ORIGIN=https://wessyu.github.io
PUBLIC_BASE_URL=https://conta-api-wessyu.onrender.com
```

## Variaveis reais

Para rodar manualmente fora do Render:

```env
PORT=4000
BELVO_ENV=production
BELVO_SECRET_ID=
BELVO_SECRET_PASSWORD=
PUBLIC_BASE_URL=https://seu-backend.com
TERMS_URL=https://seu-backend.com/terms
FRONTEND_ORIGIN=https://wessyu.github.io
COOKIE_SECURE=true
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

## Observacao importante

GitHub Pages roda apenas o frontend. O sistema de usuarios, banco de dados local do servidor, integracao bancaria e Stripe funcionam no backend Node hospedado no Render ou em outro host Node.
