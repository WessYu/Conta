import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'store.json');

let pool;
let postgresReady = false;

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

function usePostgres() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!usePostgres()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
  }
  return pool;
}

async function ensurePostgresStore() {
  const db = getPool();
  if (!db) return;
  if (postgresReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS conta_store (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(
    `INSERT INTO conta_store (id, data)
     VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(createEmptyStore())]
  );

  postgresReady = true;
}

async function readPostgresStore() {
  await ensurePostgresStore();
  const result = await getPool().query('SELECT data FROM conta_store WHERE id = 1');
  return normalizeStore(result.rows[0]?.data || createEmptyStore());
}

async function writePostgresStore(data) {
  await ensurePostgresStore();
  const normalized = normalizeStore(data);
  await getPool().query(
    `UPDATE conta_store
     SET data = $1::jsonb, updated_at = NOW()
     WHERE id = 1`,
    [JSON.stringify(normalized)]
  );
  return normalized;
}

async function ensureFileStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(createEmptyStore(), null, 2), 'utf8');
  }
}

async function readFileStore() {
  await ensureFileStore();
  const raw = await fs.readFile(dataFile, 'utf8');
  return normalizeStore(JSON.parse(raw || '{}'));
}

async function writeFileStore(data) {
  await ensureFileStore();
  const tempFile = `${dataFile}.tmp`;
  const normalized = normalizeStore(data);
  await fs.writeFile(tempFile, JSON.stringify(normalized, null, 2), 'utf8');
  await fs.rename(tempFile, dataFile);
  return normalized;
}

export async function readStore() {
  return usePostgres() ? readPostgresStore() : readFileStore();
}

export async function writeStore(data) {
  return usePostgres() ? writePostgresStore(data) : writeFileStore(data);
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
