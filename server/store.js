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
  return JSON.parse(raw);
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
