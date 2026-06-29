import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'store.json');

const emptyStore = {
  users: [],
  sessions: [],
  accounts: [],
  transactions: [],
  bills: [],
  budgets: [],
  goals: [],
  integrations: {
    bankLinks: [],
    paymentIntents: []
  },
  webhooks: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createEmptyStore() {
  return clone(emptyStore);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function onlyUserOwned(items) {
  return normalizeArray(items).filter((item) => typeof item.userId === 'string' && item.userId.length > 0);
}

export function normalizeStore(data = {}) {
  return {
    ...createEmptyStore(),
    ...data,
    users: normalizeArray(data.users),
    sessions: normalizeArray(data.sessions),
    accounts: onlyUserOwned(data.accounts),
    transactions: onlyUserOwned(data.transactions),
    bills: onlyUserOwned(data.bills),
    budgets: onlyUserOwned(data.budgets),
    goals: onlyUserOwned(data.goals),
    webhooks: normalizeArray(data.webhooks),
    integrations: {
      bankLinks: normalizeArray(data.integrations?.bankLinks),
      paymentIntents: normalizeArray(data.integrations?.paymentIntents)
    }
  };
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(createEmptyStore(), null, 2), 'utf8');
  }
}

export async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(dataFile, 'utf8');
  return normalizeStore(JSON.parse(raw || '{}'));
}

export async function writeStore(data) {
  await ensureStore();
  const tempFile = `${dataFile}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(normalizeStore(data), null, 2), 'utf8');
  await fs.rename(tempFile, dataFile);
  return data;
}

export function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getUserFinancialStore(store, user) {
  const settings = user.settings || {};
  return {
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      currency: settings.currency || 'BRL',
      monthlySafeReserve: Number(settings.monthlySafeReserve || 0),
      payday: Number(settings.payday || 1)
    },
    accounts: store.accounts.filter((account) => account.userId === user.id),
    transactions: store.transactions.filter((transaction) => transaction.userId === user.id),
    bills: store.bills.filter((bill) => bill.userId === user.id),
    budgets: store.budgets.filter((budget) => budget.userId === user.id),
    goals: store.goals.filter((goal) => goal.userId === user.id),
    integrations: store.integrations
  };
}
