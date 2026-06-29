const DAY_MS = 24 * 60 * 60 * 1000;

export function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

export function getMonthRange(reference = new Date()) {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export function toDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function calculateSummary(store) {
  const now = new Date();
  const { start, end } = getMonthRange(now);
  const totalBalance = store.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const monthTransactions = store.transactions.filter((transaction) => {
    const date = toDate(transaction.date);
    return date >= start && date <= end;
  });

  const income = monthTransactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const expenses = monthTransactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

  const upcomingBills = store.bills
    .filter((bill) => bill.status !== 'paid' && toDate(bill.dueDate) >= new Date(now.toDateString()))
    .sort((a, b) => toDate(a.dueDate) - toDate(b.dueDate));

  const scheduledTotal = upcomingBills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
  const safeReserve = Number(store.profile.monthlySafeReserve || 0);
  const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
  const available = Math.max(0, totalBalance - scheduledTotal - safeReserve);
  const dailyLimit = available / daysLeft;

  const budgetHealth = store.budgets.map((budget) => ({
    ...budget,
    percent: Math.min(100, Math.round((Number(budget.spent || 0) / Number(budget.limit || 1)) * 100)),
    remaining: money(Number(budget.limit || 0) - Number(budget.spent || 0))
  }));

  const yearly = [2023, 2024, 2025, 2026].map((year) => {
    const spent = store.transactions
      .filter((transaction) => transaction.type === 'expense' && transaction.date.startsWith(String(year)))
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    return { year, spent: money(spent) };
  });

  return {
    profile: store.profile,
    totalBalance: money(totalBalance),
    income: money(income),
    expenses: money(expenses),
    scheduledTotal: money(scheduledTotal),
    safeReserve: money(safeReserve),
    availableToSpend: money(available),
    dailyLimit: money(dailyLimit),
    daysLeft,
    accounts: store.accounts,
    upcomingBills: upcomingBills.slice(0, 5),
    budgets: budgetHealth,
    goals: store.goals,
    integrations: store.integrations,
    cashflow: yearly
  };
}

export function buildSpendingPlan(store) {
  const summary = calculateSummary(store);
  const fixedBills = summary.upcomingBills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
  const budgetRoom = summary.budgets.reduce((sum, budget) => sum + Math.max(0, budget.remaining), 0);

  return {
    safeToday: summary.dailyLimit,
    safeMonth: summary.availableToSpend,
    fixedBills: money(fixedBills),
    budgetRoom: money(budgetRoom),
    recommendation:
      summary.dailyLimit < 80
        ? 'Modo economico: segure gastos livres ate as proximas entradas.'
        : 'Ritmo saudavel: voce pode gastar sem comprometer contas e reserva.',
    rules: [
      'Contas agendadas saem primeiro do saldo disponivel.',
      'Reserva minima mensal fica protegida.',
      'Limite diario considera os dias restantes do mes.'
    ]
  };
}
