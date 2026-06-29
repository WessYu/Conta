import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.js';
import { calculateSummary, buildSpendingPlan } from './finance.js';
import { createId, getUserFinancialStore, readStore, writeStore } from './store.js';
import { createBelvoWidgetSession, fetchBelvoLinkData, getBankStatus } from './integrations.js';
import { createPaymentIntent, getPaymentsStatus } from './payments.js';
import {
  authenticateRequest,
  clearSessionCookie,
  createSession,
  destroySession,
  loginUser,
  publicUser,
  registerUser,
  requireAuthenticatedUser,
  sessionCookie
} from './auth.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const port = Number(process.env.PORT || 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'https://wessyu.github.io';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function baseHeaders(extraHeaders = {}) {
  return {
    'Access-Control-Allow-Origin': frontendOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    Vary: 'Origin',
    ...extraHeaders
  };
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...baseHeaders(extraHeaders)
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
  return Number(number.toFixed(2));
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
    category: assertString(body.category || 'Sem categoria', 'category', 2),
    amount: assertNumber(body.amount, 'amount', true),
    type: assertEnum(body.type, 'type', ['income', 'expense']),
    accountId: assertString(body.accountId, 'accountId', 2),
    date: assertDate(body.date, 'date'),
    recurring: Boolean(body.recurring),
    notes: typeof body.notes === 'string' ? body.notes.trim() : ''
  };
}

function validateAccount(body) {
  return {
    name: assertString(body.name, 'name', 2),
    institution: assertString(body.institution, 'institution', 2),
    type: assertEnum(body.type, 'type', ['checking', 'savings', 'wallet', 'credit']),
    balance: assertNumber(body.balance || 0, 'balance'),
    color: typeof body.color === 'string' ? body.color : '#ffffff'
  };
}

function validateBill(body) {
  return {
    title: assertString(body.title, 'title', 2),
    amount: assertNumber(body.amount, 'amount', true),
    dueDate: assertDate(body.dueDate, 'dueDate'),
    category: assertString(body.category || 'Conta', 'category', 2),
    accountId: assertString(body.accountId, 'accountId', 2),
    status: body.status ? assertEnum(body.status, 'status', ['scheduled', 'paid']) : 'scheduled'
  };
}

function getBelvoResults(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function asAmount(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value.replace(',', '.'));
  if (typeof value?.amount === 'number') return value.amount;
  if (typeof value?.current === 'number') return value.current;
  if (typeof value?.available === 'number') return value.available;
  return 0;
}

function belvoDate(value) {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
}

function bankAccountType(account) {
  const raw = String(account.type || account.category || account.product_type || '').toLowerCase();
  if (raw.includes('credit') || raw.includes('cart')) return 'credit';
  if (raw.includes('saving') || raw.includes('poup')) return 'savings';
  if (raw.includes('wallet') || raw.includes('payment')) return 'wallet';
  return 'checking';
}

function importBelvoData(store, user, data, linkId) {
  const rawAccounts = getBelvoResults(data.accounts);
  const rawTransactions = getBelvoResults(data.transactions);
  const rawBills = getBelvoResults(data.bills);
  const accountMap = new Map();
  const imported = { accounts: 0, transactions: 0, bills: 0 };

  for (const raw of rawAccounts) {
    const externalId = String(raw.id || raw.internal_identification || raw.number || createId('bank_acc'));
    const existing = store.accounts.find(
      (account) => account.userId === user.id && account.source === 'belvo' && account.externalId === externalId
    );
    const bankName = raw.institution?.name || raw.institution || raw.bank_product_name || 'Banco conectado';
    const account = existing || { id: createId('acc'), userId: user.id };

    account.name = raw.name || raw.number || raw.agency || 'Conta conectada';
    account.institution = String(bankName);
    account.type = bankAccountType(raw);
    account.balance = Number(asAmount(raw.balance || raw.current_balance || raw.available_balance || 0).toFixed(2));
    account.color = '#ffffff';
    account.source = 'belvo';
    account.externalId = externalId;
    account.linkId = linkId;
    account.updatedAt = new Date().toISOString();

    if (!existing) {
      store.accounts.push(account);
      imported.accounts += 1;
    }
    accountMap.set(externalId, account.id);
  }

  for (const raw of rawTransactions) {
    const externalId = String(raw.id || raw.internal_identification || raw.reference || createId('bank_tx'));
    const existing = store.transactions.find(
      (transaction) => transaction.userId === user.id && transaction.source === 'belvo' && transaction.externalId === externalId
    );
    const rawAmount = asAmount(raw.amount || raw.value || raw.local_amount || 0);
    const absoluteAmount = Math.abs(rawAmount);
    if (!absoluteAmount) continue;

    const externalAccountId = String(raw.account?.id || raw.account || raw.account_id || '');
    const accountId = accountMap.get(externalAccountId) || store.accounts.find((account) => account.userId === user.id)?.id;
    if (!accountId) continue;

    const merchant = raw.merchant?.name || raw.merchant_name;
    const title = raw.description || raw.reference || merchant || 'Movimento bancario';
    const transaction = existing || { id: createId('tx'), userId: user.id };

    transaction.title = String(title).slice(0, 96);
    transaction.category = raw.category || raw.subcategory || 'Banco';
    transaction.amount = Number(absoluteAmount.toFixed(2));
    transaction.type = rawAmount < 0 || raw.type === 'OUTFLOW' ? 'expense' : 'income';
    transaction.accountId = accountId;
    transaction.date = belvoDate(raw.value_date || raw.accounting_date || raw.created_at || raw.collected_at);
    transaction.recurring = false;
    transaction.source = 'belvo';
    transaction.externalId = externalId;
    transaction.linkId = linkId;
    transaction.updatedAt = new Date().toISOString();

    if (!existing) {
      store.transactions.push(transaction);
      imported.transactions += 1;
    }
  }

  for (const raw of rawBills) {
    const externalId = String(raw.id || raw.bill_id || raw.reference || createId('bank_bill'));
    const existing = store.bills.find((bill) => bill.userId === user.id && bill.source === 'belvo' && bill.externalId === externalId);
    const amount = Math.abs(asAmount(raw.amount || raw.total_amount || raw.minimum_amount || 0));
    if (!amount) continue;

    const accountId = store.accounts.find((account) => account.userId === user.id && account.linkId === linkId)?.id;
    if (!accountId) continue;

    const bill = existing || { id: createId('bill'), userId: user.id };
    bill.title = raw.name || raw.description || 'Fatura conectada';
    bill.amount = Number(amount.toFixed(2));
    bill.dueDate = belvoDate(raw.due_date || raw.payment_due_date || raw.date);
    bill.category = 'Banco';
    bill.status = raw.status === 'PAID' ? 'paid' : 'scheduled';
    bill.accountId = accountId;
    bill.source = 'belvo';
    bill.externalId = externalId;
    bill.linkId = linkId;
    bill.updatedAt = new Date().toISOString();

    if (!existing) {
      store.bills.push(bill);
      imported.bills += 1;
    }
  }

  return imported;
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

  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    const store = await readStore();
    sendJson(response, 200, { user: publicUser(authenticateRequest(request, store)) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/register') {
    const store = await readStore();
    const user = registerUser(store, await readBody(request));
    const token = createSession(store, user);
    await writeStore(store);
    sendJson(response, 201, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(token) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const store = await readStore();
    const user = loginUser(store, await readBody(request));
    const token = createSession(store, user);
    await writeStore(store);
    sendJson(response, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(token) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const store = await readStore();
    destroySession(store, request);
    await writeStore(store);
    sendJson(response, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/summary') {
    const store = await readStore();
    const user = requireAuthenticatedUser(request, store);
    sendJson(response, 200, calculateSummary(getUserFinancialStore(store, user)));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/spending-plan') {
    const store = await readStore();
    const user = requireAuthenticatedUser(request, store);
    sendJson(response, 200, buildSpendingPlan(getUserFinancialStore(store, user)));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/transactions') {
    const store = await readStore();
    const user = requireAuthenticatedUser(request, store);
    sendJson(response, 200, store.transactions.filter((item) => item.userId === user.id).sort((a, b) => b.date.localeCompare(a.date)));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/transactions') {
    const payload = validateTransaction(await readBody(request));
    const store = await readStore();
    const user = requireAuthenticatedUser(request, store);
    const account = store.accounts.find((item) => item.id === payload.accountId && item.userId === user.id);
    if (!account) throw Object.assign(new Error('Conta nao encontrada para este usuario.'), { status: 404 });

    const transaction = { id: createId('tx'), userId: user.id, source: 'manual', ...payload, createdAt: new Date().toISOString() };
    store.transactions.unshift(transaction);
    account.balance = Number((account.balance + (payload.type === 'income' ? payload.amount : -payload.amount)).toFixed(2));
    await writeStore(store);
    sendJson(response, 201, transaction);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/accounts') {
    const store = await readStore();
    const user = requireAuthenticatedUser(request, store);
    sendJson(response, 200, store.accounts.filter((account) => account.userId === user.id));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/accounts') {
    const payload = validateAccount(await readBody(request));
    const store = await readStore();
    const user = requireAuthenticatedUser(request, store);
    const account = { id: createId('acc'), userId: user.id, source: 'manual', ...payload, createdAt: new Date().toISOString() };
    store.accounts.push(account);
    await writeStore(store);
    sendJson(response, 201, account);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/bills') {
    const store = await readStore();
    const user = requireAuthenticatedUser(request, store);
    sendJson(response, 200, store.bills.filter((bill) => bill.userId === user.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/bills') {
    const payload = validateBill(await readBody(request));
    const store = await readStore();
    const user = requireAuthenticatedUser(request, store);
    const account = store.accounts.find((item) => item.id === payload.accountId && item.userId === user.id);
    if (!account) throw Object.assign(new Error('Conta nao encontrada para este usuario.'), { status: 404 });

    const bill = { id: createId('bill'), userId: user.id, source: 'manual', ...payload, createdAt: new Date().toISOString() };
    store.bills.push(bill);
    await writeStore(store);
    sendJson(response, 201, bill);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/integrations/status') {
    sendJson(response, 200, { bank: getBankStatus(), payments: getPaymentsStatus() });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/integrations/bank/connect') {
    const store = await readStore();
    const user = requireAuthenticatedUser(request, store);
    const body = await readBody(request);
    const session = await createBelvoWidgetSession({
      documentNumber: body.documentNumber,
      fullName: body.fullName,
      externalId: user.id,
      accessMode: body.accessMode || 'single'
    });
    sendJson(response, 200, session);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/integrations/bank/sync') {
    const store = await readStore();
    const user = requireAuthenticatedUser(request, store);
    const body = await readBody(request);
    const linkId = assertString(body.linkId, 'linkId', 4);
    const data = await fetchBelvoLinkData(linkId);
    const imported = importBelvoData(store, user, data, linkId);
    store.integrations.bankLinks.unshift({ linkId, userId: user.id, syncedAt: new Date().toISOString(), imported });
    store.integrations.bankLinks = store.integrations.bankLinks.slice(0, 20);
    await writeStore(store);
    sendJson(response, 200, { ok: true, provider: 'belvo_open_finance_brazil', linkId, imported });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/payments/intent') {
    const store = await readStore();
    const user = requireAuthenticatedUser(request, store);
    const body = await readBody(request);
    const intent = await createPaymentIntent({
      amount: assertNumber(body.amount, 'amount', true),
      currency: body.currency || 'brl',
      description: body.description || 'Conta Apple Pay / Google Pay'
    });
    store.integrations.paymentIntents.unshift({ userId: user.id, createdAt: new Date().toISOString(), ...intent });
    store.integrations.paymentIntents = store.integrations.paymentIntents.slice(0, 30);
    await writeStore(store);
    sendJson(response, 200, intent);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/webhooks/belvo') {
    const body = await readBody(request);
    const store = await readStore();
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
