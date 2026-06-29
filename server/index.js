import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.js';
import { calculateSummary, buildSpendingPlan } from './finance.js';
import { createId, readStore, writeStore } from './store.js';
import { createBelvoWidgetSession, fetchBelvoLinkData, getBankStatus } from './integrations.js';
import { createPaymentIntent, getPaymentsStatus } from './payments.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const port = Number(process.env.PORT || 4000);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(Object.assign(new Error('Payload muito grande'), { status: 413 }));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('JSON invalido'), { status: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function assertString(value, field, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min) {
    throw Object.assign(new Error(`Campo ${field} invalido`), { status: 422 });
  }
  return value.trim();
}

function assertNumber(value, field, positive = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || (positive && number <= 0)) {
    throw Object.assign(new Error(`Campo ${field} invalido`), { status: 422 });
  }
  return number;
}

function assertDate(value, field) {
  const date = assertString(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw Object.assign(new Error(`Campo ${field} invalido`), { status: 422 });
  }
  return date;
}

function assertEnum(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw Object.assign(new Error(`Campo ${field} invalido`), { status: 422 });
  }
  return value;
}

function validateTransaction(body) {
  return {
    title: assertString(body.title, 'title', 2),
    category: assertString(body.category, 'category', 2),
    amount: assertNumber(body.amount, 'amount', true),
    type: assertEnum(body.type, 'type', ['income', 'expense']),
    accountId: assertString(body.accountId, 'accountId', 2),
    date: assertDate(body.date, 'date'),
    recurring: Boolean(body.recurring)
  };
}

function validateAccount(body) {
  return {
    name: assertString(body.name, 'name', 2),
    institution: assertString(body.institution, 'institution', 2),
    type: assertEnum(body.type, 'type', ['checking', 'savings', 'wallet', 'credit']),
    balance: assertNumber(body.balance, 'balance'),
    color: typeof body.color === 'string' ? body.color : '#ffffff'
  };
}

function validateBill(body) {
  return {
    title: assertString(body.title, 'title', 2),
    amount: assertNumber(body.amount, 'amount', true),
    dueDate: assertDate(body.dueDate, 'dueDate'),
    category: assertString(body.category, 'category', 2),
    accountId: assertString(body.accountId, 'accountId', 2),
    status: body.status ? assertEnum(body.status, 'status', ['scheduled', 'paid']) : 'scheduled'
  };
}

async function handleApi(request, response, url) {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true, name: 'Conta API' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/summary') {
    sendJson(response, 200, calculateSummary(await readStore()));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/transactions') {
    const store = await readStore();
    sendJson(response, 200, store.transactions.sort((a, b) => b.date.localeCompare(a.date)));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/transactions') {
    const payload = validateTransaction(await readBody(request));
    const store = await readStore();
    const transaction = { id: createId('tx'), ...payload };
    store.transactions.unshift(transaction);

    const account = store.accounts.find((item) => item.id === payload.accountId);
    if (account) {
      account.balance = Number((account.balance + (payload.type === 'income' ? payload.amount : -payload.amount)).toFixed(2));
    }

    await writeStore(store);
    sendJson(response, 201, transaction);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/accounts') {
    const store = await readStore();
    sendJson(response, 200, store.accounts);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/accounts') {
    const payload = validateAccount(await readBody(request));
    const store = await readStore();
    const account = { id: createId('acc'), ...payload };
    store.accounts.push(account);
    await writeStore(store);
    sendJson(response, 201, account);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/bills') {
    const store = await readStore();
    sendJson(response, 200, store.bills);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/bills') {
    const payload = validateBill(await readBody(request));
    const store = await readStore();
    const bill = { id: createId('bill'), ...payload };
    store.bills.push(bill);
    await writeStore(store);
    sendJson(response, 201, bill);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/spending-plan') {
    sendJson(response, 200, buildSpendingPlan(await readStore()));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/integrations/status') {
    sendJson(response, 200, {
      bank: getBankStatus(),
      payments: getPaymentsStatus()
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/integrations/bank/connect') {
    const body = await readBody(request);
    sendJson(
      response,
      200,
      await createBelvoWidgetSession({
        documentNumber: body.documentNumber,
        fullName: body.fullName,
        externalId: body.externalId,
        accessMode: body.accessMode
      })
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/integrations/bank/sync') {
    const body = await readBody(request);
    const linkId = assertString(body.linkId, 'linkId', 4);
    sendJson(response, 200, await fetchBelvoLinkData(linkId));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/payments/intent') {
    const body = await readBody(request);
    sendJson(
      response,
      200,
      await createPaymentIntent({
        amount: assertNumber(body.amount, 'amount', true),
        currency: body.currency || 'brl',
        description: body.description || 'Conta Apple Pay / Google Pay'
      })
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/webhooks/belvo') {
    const body = await readBody(request);
    const store = await readStore();
    store.webhooks = store.webhooks || [];
    store.webhooks.unshift({ id: createId('webhook'), provider: 'belvo', receivedAt: new Date().toISOString(), body });
    store.webhooks = store.webhooks.slice(0, 50);
    await writeStore(store);
    sendJson(response, 200, { received: true });
    return;
  }

  sendJson(response, 404, { error: 'Rota nao encontrada' });
}

async function sendStatic(response, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const baseDir = requested === 'index.html' ? rootDir : publicDir;
  const filePath = path.normalize(path.join(baseDir, requested === 'index.html' ? requested : requested.replace(/^public[\\/]/, '')));

  if (!filePath.startsWith(baseDir)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const extension = path.extname(filePath);
    response.writeHead(200, {
      'Content-Type': mimeTypes[extension] || 'application/octet-stream',
      'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=3600'
    });
    response.end(file);
  } catch {
    const fallback = await fs.readFile(path.join(rootDir, 'index.html'));
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(fallback);
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }

    await sendStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message || 'Erro interno' });
  }
});

server.listen(port, () => {
  console.log(`Conta rodando em http://localhost:${port}`);
});
