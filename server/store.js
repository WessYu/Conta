import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'store.json');

const seed = {
  profile: {
    id: 'user_wess',
    name: 'Wess',
    currency: 'BRL',
    monthlySafeReserve: 650,
    payday: 5
  },
  accounts: [
    { id: 'acc_nubank', name: 'Principal', institution: 'Nubank', type: 'checking', balance: 4210.9, color: '#ffffff' },
    { id: 'acc_picpay', name: 'Carteira', institution: 'PicPay', type: 'wallet', balance: 870.47, color: '#cfcfcf' },
    { id: 'acc_santander', name: 'Reserva', institution: 'Santander', type: 'savings', balance: 3200, color: '#9b9b9b' }
  ],
  transactions: [
    { id: 'tx_1', title: 'Salario', category: 'Ganhos', amount: 7200, type: 'income', accountId: 'acc_nubank', date: '2026-06-05', recurring: true },
    { id: 'tx_2', title: 'Freela identidade visual', category: 'Ganhos', amount: 1450, type: 'income', accountId: 'acc_nubank', date: '2026-06-18', recurring: false },
    { id: 'tx_3', title: 'Aluguel', category: 'Casa', amount: 2300, type: 'expense', accountId: 'acc_nubank', date: '2026-06-07', recurring: true },
    { id: 'tx_4', title: 'Mercado', category: 'Comida', amount: 786.3, type: 'expense', accountId: 'acc_nubank', date: '2026-06-14', recurring: false },
    { id: 'tx_5', title: 'Transporte', category: 'Mobilidade', amount: 312.8, type: 'expense', accountId: 'acc_picpay', date: '2026-06-21', recurring: false },
    { id: 'tx_6', title: 'Assinaturas', category: 'Digital', amount: 119.7, type: 'expense', accountId: 'acc_nubank', date: '2026-06-24', recurring: true }
  ],
  bills: [
    { id: 'bill_picpay', title: 'PicPay', amount: 689.47, dueDate: '2026-07-01', category: 'Carteira', status: 'scheduled', accountId: 'acc_picpay' },
    { id: 'bill_santander', title: 'Santander', amount: 845.38, dueDate: '2026-07-01', category: 'Cartao', status: 'scheduled', accountId: 'acc_santander' },
    { id: 'bill_internet', title: 'Internet', amount: 129.9, dueDate: '2026-07-08', category: 'Casa', status: 'scheduled', accountId: 'acc_nubank' }
  ],
  budgets: [
    { id: 'budget_food', category: 'Comida', limit: 1200, spent: 786.3 },
    { id: 'budget_home', category: 'Casa', limit: 2600, spent: 2300 },
    { id: 'budget_mobility', category: 'Mobilidade', limit: 500, spent: 312.8 },
    { id: 'budget_free', category: 'Livre', limit: 1800, spent: 420 }
  ],
  goals: [
    { id: 'goal_reserve', title: 'Reserva de emergencia', target: 12000, current: 3200, dueDate: '2026-12-31' }
  ],
  integrations: {
    bank: {
      status: 'credentials_required',
      provider: 'Belvo Open Finance Brasil',
      lastSync: null,
      institutions: ['Nubank', 'PicPay', 'Santander']
    },
    applePay: { status: 'stripe_required', merchantReady: false },
    googlePay: { status: 'stripe_required', merchantReady: false }
  },
  webhooks: []
};

export const starterFinancialData = {
  profile: seed.profile,
  accounts: seed.accounts,
  transactions: seed.transactions,
  bills: seed.bills,
  budgets: seed.budgets,
  goals: seed.goals,
  integrations: seed.integrations
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeStore(data) {
  data.users = Array.isArray(data.users) ? data.users : [];
  data.sessions = Array.isArray(data.sessions) ? data.sessions : [];
  data.webhooks = Array.isArray(data.webhooks) ? data.webhooks : [];
  data.accounts = Array.isArray(data.accounts) ? data.accounts : [];
  data.transactions = Array.isArray(data.transactions) ? data.transactions : [];
  data.bills = Array.isArray(data.bills) ? data.bills : [];
  data.budgets = Array.isArray(data.budgets) ? data.budgets : [];
  data.goals = Array.isArray(data.goals) ? data.goals : [];
  data.integrations = data.integrations || clone(seed.integrations);
  return data;
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(seed, null, 2), 'utf8');
  }
}

export async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(dataFile, 'utf8');
  return normalizeStore(JSON.parse(raw));
}

export async function writeStore(data) {
  await ensureStore();
  const tempFile = `${dataFile}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tempFile, dataFile);
  return data;
}

export function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function seedUserFinancialData(store, user) {
  if (store.accounts.some((account) => account.userId === user.id)) return;

  const accountMap = new Map();
  for (const account of starterFinancialData.accounts) {
    const id = createId('acc');
    accountMap.set(account.id, id);
    store.accounts.push({ ...clone(account), id, userId: user.id });
  }

  for (const transaction of starterFinancialData.transactions) {
    store.transactions.push({
      ...clone(transaction),
      id: createId('tx'),
      accountId: accountMap.get(transaction.accountId) || transaction.accountId,
      userId: user.id
    });
  }

  for (const bill of starterFinancialData.bills) {
    store.bills.push({
      ...clone(bill),
      id: createId('bill'),
      accountId: accountMap.get(bill.accountId) || bill.accountId,
      userId: user.id
    });
  }

  for (const budget of starterFinancialData.budgets) {
    store.budgets.push({ ...clone(budget), id: createId('budget'), userId: user.id });
  }

  for (const goal of starterFinancialData.goals) {
    store.goals.push({ ...clone(goal), id: createId('goal'), userId: user.id });
  }
}

export function getUserFinancialStore(store, user) {
  return {
    profile: {
      ...clone(starterFinancialData.profile),
      id: user.id,
      name: user.name,
      email: user.email
    },
    accounts: store.accounts.filter((account) => account.userId === user.id),
    transactions: store.transactions.filter((transaction) => transaction.userId === user.id),
    bills: store.bills.filter((bill) => bill.userId === user.id),
    budgets: store.budgets.filter((budget) => budget.userId === user.id),
    goals: store.goals.filter((goal) => goal.userId === user.id),
    integrations: store.integrations
  };
}
