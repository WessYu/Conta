# Conta

App mobile-first de planejamento e gestao financeira real em PWA.

## O que ja esta no repo

- Interface preto e branco minimalista, feita para abrir no navegador do celular e instalar como app.
- Cadastro e login com sessao HTTP-only.
- App com dados vazios no primeiro acesso: sem seed, sem mock e sem modo demo.
- Cadastro manual de contas, entradas, saidas e contas a pagar.
- Calculo automatico de saldo total, entradas, saidas, limite seguro do mes e limite do dia.
- Persistencia real com Postgres quando `DATABASE_URL` existir.
- Fallback local em `server/data/store.json` apenas para teste local.
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

Para testar login, bancos e salvamento sem bloqueio de cookie no iPhone, prefira abrir direto o backend:

```txt
https://conta-api-wessyu.onrender.com
```

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

## Banco de dados para salvar de verdade

No Render, Supabase ou Neon, crie um Postgres e copie a connection string para:

```env
DATABASE_URL=postgresql://usuario:senha@host:5432/database
DATABASE_SSL=true
```

Sem `DATABASE_URL`, o app usa arquivo local de teste. Em hospedagem como Render, arquivo local pode perder dados em rebuild/restart, entao nao e ideal para usuarios reais.

O backend cria sozinho a tabela `conta_store` na primeira requisicao.

## Deploy do backend no Render

O arquivo `render.yaml` ja esta pronto. No Render:

1. New > Blueprint ou Web Service.
2. Conecte o repositorio `WessYu/Conta`.
3. Escolha o servico `conta-api-wessyu`.
4. Preencha `DATABASE_URL` com um Postgres real.
5. Preencha as secrets reais: `BELVO_SECRET_ID`, `BELVO_SECRET_PASSWORD`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`.
6. Deploy.

Variaveis principais:

```env
NODE_ENV=production
COOKIE_SECURE=true
FRONTEND_ORIGIN=https://wessyu.github.io
PUBLIC_BASE_URL=https://conta-api-wessyu.onrender.com
DATABASE_URL=
DATABASE_SSL=true
BELVO_ENV=sandbox
BELVO_SECRET_ID=
BELVO_SECRET_PASSWORD=
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

GitHub Pages roda apenas o frontend. O sistema de usuarios, persistencia, integracao bancaria e Stripe funcionam no backend Node hospedado no Render ou em outro host Node.
