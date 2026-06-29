const app = document.querySelector('#app');
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const fallbackStore = {
  profile: { id: 'user_wess', name: 'Wess', currency: 'BRL', monthlySafeReserve: 650, payday: 5 },
  totalBalance: 8281.37,
  income: 8650,
  expenses: 3518.8,
  scheduledTotal: 1664.75,
  safeReserve: 650,
  availableToSpend: 5966.62,
  dailyLimit: 2983.31,
  daysLeft: 2,
  accounts: [
    { id: 'acc_nubank', name: 'Principal', institution: 'Nubank', type: 'checking', balance: 4210.9, color: '#ffffff' },
    { id: 'acc_picpay', name: 'Carteira', institution: 'PicPay', type: 'wallet', balance: 870.47, color: '#cfcfcf' },
    { id: 'acc_santander', name: 'Reserva', institution: 'Santander', type: 'savings', balance: 3200, color: '#9b9b9b' }
  ],
  upcomingBills: [
    { id: 'bill_picpay', title: 'PicPay', amount: 689.47, dueDate: '2026-07-01', category: 'Carteira', status: 'scheduled', accountId: 'acc_picpay' },
    { id: 'bill_santander', title: 'Santander', amount: 845.38, dueDate: '2026-07-01', category: 'Cartao', status: 'scheduled', accountId: 'acc_santander' },
    { id: 'bill_internet', title: 'Internet', amount: 129.9, dueDate: '2026-07-08', category: 'Casa', status: 'scheduled', accountId: 'acc_nubank' }
  ],
  budgets: [
    { id: 'budget_food', category: 'Comida', limit: 1200, spent: 786.3, percent: 66, remaining: 413.7 },
    { id: 'budget_home', category: 'Casa', limit: 2600, spent: 2300, percent: 88, remaining: 300 },
    { id: 'budget_mobility', category: 'Mobilidade', limit: 500, spent: 312.8, percent: 63, remaining: 187.2 },
    { id: 'budget_free', category: 'Livre', limit: 1800, spent: 420, percent: 23, remaining: 1380 }
  ],
  goals: [{ id: 'goal_reserve', title: 'Reserva de emergencia', target: 12000, current: 3200, dueDate: '2026-12-31' }],
  integrations: {
    bank: { status: 'backend_required', provider: 'Belvo Open Finance Brasil', lastSync: null, institutions: ['Nubank', 'PicPay', 'Santander'] },
    applePay: { status: 'backend_required', merchantReady: false },
    googlePay: { status: 'backend_required', merchantReady: false }
  },
  cashflow: [
    { year: 2023, spent: 0 },
    { year: 2024, spent: 0 },
    { year: 2025, spent: 0 },
    { year: 2026, spent: 3518.8 }
  ]
};

const fallbackTransactions = [
  { id: 'tx_1', title: 'Salario', category: 'Ganhos', amount: 7200, type: 'income', accountId: 'acc_nubank', date: '2026-06-05', recurring: true },
  { id: 'tx_2', title: 'Freela identidade visual', category: 'Ganhos', amount: 1450, type: 'income', accountId: 'acc_nubank', date: '2026-06-18', recurring: false },
  { id: 'tx_3', title: 'Aluguel', category: 'Casa', amount: 2300, type: 'expense', accountId: 'acc_nubank', date: '2026-06-07', recurring: true },
  { id: 'tx_4', title: 'Mercado', category: 'Comida', amount: 786.3, type: 'expense', accountId: 'acc_nubank', date: '2026-06-14', recurring: false },
  { id: 'tx_5', title: 'Transporte', category: 'Mobilidade', amount: 312.8, type: 'expense', accountId: 'acc_picpay', date: '2026-06-21', recurring: false },
  { id: 'tx_6', title: 'Assinaturas', category: 'Digital', amount: 119.7, type: 'expense', accountId: 'acc_nubank', date: '2026-06-24', recurring: true }
];

const fallbackPlan = {
  safeToday: 2983.31,
  safeMonth: 5966.62,
  fixedBills: 1664.75,
  budgetRoom: 2280.9,
  recommendation: 'Ritmo saudavel: voce pode gastar sem comprometer contas e reserva.',
  rules: [
    'Contas agendadas saem primeiro do saldo disponivel.',
    'Reserva minima mensal fica protegida.',
    'Limite diario considera os dias restantes do mes.'
  ]
};

const state = {
  summary: null,
  transactions: [],
  plan: null,
  tab: 'home',
  query: '',
  searchOpen: false,
  sheetOpen: false,
  toast: null,
  installPrompt: null,
  bankForm: {
    fullName: '',
    documentNumber: ''
  },
  paymentAmount: '1.00',
  form: {
    title: '',
    category: 'Livre',
    amount: '',
    type: 'expense',
    accountId: '',
    date: new Date().toISOString().slice(0, 10),
    recurring: false
  }
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => undefined);
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.installPrompt = event;
  render();
});

function icon(value) {
  return `<span class="icon-glyph" aria-hidden="true">${value}</span>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  return currency.format(Number(value || 0));
}

function localDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Falha na API');
  return payload;
}

async function loadData() {
  let summary;
  let transactions;
  let plan;

  try {
    [summary, transactions, plan] = await Promise.all([
      api('api/summary'),
      api('api/transactions'),
      api('api/spending-plan')
    ]);
  } catch {
    summary = JSON.parse(localStorage.getItem('conta.summary') || JSON.stringify(fallbackStore));
    transactions = JSON.parse(localStorage.getItem('conta.transactions') || JSON.stringify(fallbackTransactions));
    plan = fallbackPlan;
  }

  state.summary = summary;
  state.transactions = transactions;
  state.plan = plan;
  state.form.accountId = state.form.accountId || summary.accounts[0]?.id || '';
  render();
}

function setToast(text, tone = 'ok') {
  state.toast = { text, tone };
  render();
  window.clearTimeout(setToast.timeout);
  setToast.timeout = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 4200);
}

function filteredTransactions() {
  const needle = state.query.trim().toLowerCase();
  if (!needle) return state.transactions;
  return state.transactions.filter((item) =>
    [item.title, item.category, item.type].some((value) => value.toLowerCase().includes(needle))
  );
}

function render() {
  if (!state.summary || !state.plan) {
    app.className = 'phone-frame loading';
    app.innerHTML = '<div class="loader-mark"></div>';
    return;
  }

  app.className = 'phone-frame';
  app.innerHTML = `
    ${headerTemplate()}
    <div class="scroll-area">
      ${state.tab === 'home' ? homeTemplate() : ''}
      ${state.tab === 'moves' ? movesTemplate() : ''}
      ${state.tab === 'bills' ? billsTemplate() : ''}
      ${state.tab === 'connect' ? connectTemplate() : ''}
    </div>
    ${bottomNavTemplate()}
    <button class="fab" type="button" data-action="open-sheet" aria-label="Adicionar lancamento">${icon('+')}</button>
    ${state.sheetOpen ? sheetTemplate() : ''}
    ${state.toast ? `<button class="toast ${state.toast.tone}" type="button" data-action="close-toast">${escapeHtml(state.toast.text)}</button>` : ''}
  `;
}

function headerTemplate() {
  const profile = state.summary.profile;
  return `
    <header class="topbar">
      <button class="identity-pill" type="button" aria-label="Perfil">
        ${escapeHtml(profile.name)} ${icon('⌄')}
      </button>
      ${
        state.searchOpen
          ? `<label class="search-field">${icon('/')}<input value="${escapeHtml(state.query)}" data-input="query" autofocus placeholder="Buscar" /></label>`
          : ''
      }
      <div class="tool-pill">
        <button type="button" data-action="toggle-search" aria-label="Buscar">${icon(state.searchOpen ? 'x' : '/')}</button>
        <button type="button" aria-label="Menu">${icon('≡')}</button>
        <button type="button" data-action="install" aria-label="Instalar">${icon('⚙')}</button>
      </div>
    </header>
  `;
}

function homeTemplate() {
  const transactions = filteredTransactions();
  return `
    ${balanceTemplate()}
    <section class="metric-grid" aria-label="Resumo do mes">
      ${metricTemplate('↓', 'Entradas', money(state.summary.income))}
      ${metricTemplate('↑', 'Saidas', money(state.summary.expenses))}
      ${metricTemplate('□', 'Por dia', money(state.plan.safeToday))}
      ${metricTemplate('✓', 'Reserva', money(state.summary.safeReserve))}
    </section>
    <section class="upcoming-section">
      <div class="section-heading">
        <h2>Upcoming</h2>
        <span>${state.summary.daysLeft} dias</span>
      </div>
      <div class="stack-card">
        ${state.summary.upcomingBills.slice(0, 2).map(billTemplate).join('')}
      </div>
    </section>
    <section class="smart-plan">
      <div>
        <span class="eyebrow">Pode gastar</span>
        <h2>${money(state.plan.safeMonth)}</h2>
        <p>${escapeHtml(state.plan.recommendation)}</p>
      </div>
      <button class="round-action" type="button" data-action="open-sheet" aria-label="Adicionar lancamento">${icon('+')}</button>
    </section>
    <section>
      <div class="section-heading">
        <h2>Recentes</h2>
        <span>${transactions.length}</span>
      </div>
      <div class="list">
        ${transactions.slice(0, 4).map(transactionTemplate).join('')}
      </div>
    </section>
  `;
}

function balanceTemplate() {
  const maxSpent = Math.max(1, ...state.summary.cashflow.map((item) => item.spent));
  return `
    <section class="balance-panel">
      <span>Spent all time</span>
      <strong>${money(state.summary.expenses)}</strong>
      <div class="chart" aria-label="Gastos por ano">
        ${state.summary.cashflow
          .map(
            (item) => `
              <div class="chart-year">
                <i style="height:${12 + (item.spent / maxSpent) * 96}px"></i>
                <small>${item.year}</small>
              </div>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

function metricTemplate(symbol, label, value) {
  return `
    <article class="metric">
      <span>${icon(symbol)}</span>
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function movesTemplate() {
  const transactions = filteredTransactions();
  return `
    <section class="page-title">
      <span>Movimentos</span>
      <h1>Entradas e saidas</h1>
    </section>
    <div class="account-strip">
      ${state.summary.accounts
        .map(
          (account) => `
            <article class="account-chip">
              <span>${escapeHtml(account.institution)}</span>
              <strong>${money(account.balance)}</strong>
            </article>
          `
        )
        .join('')}
    </div>
    <button class="primary-action" type="button" data-action="open-sheet">${icon('+')} Novo lancamento</button>
    <div class="list tall">
      ${transactions.map(transactionTemplate).join('')}
    </div>
  `;
}

function billsTemplate() {
  return `
    <section class="page-title">
      <span>Contas</span>
      <h1>Agenda e limites</h1>
    </section>
    <div class="stack-card separated">
      ${state.summary.upcomingBills.map(billTemplate).join('')}
    </div>
    <section class="budget-list">
      <div class="section-heading">
        <h2>Orcamentos</h2>
        <span>${state.summary.budgets.length}</span>
      </div>
      ${state.summary.budgets
        .map(
          (budget) => `
            <article class="budget-row">
              <div>
                <strong>${escapeHtml(budget.category)}</strong>
                <small>${money(budget.remaining)} livre</small>
              </div>
              <div class="progress"><i style="width:${budget.percent}%"></i></div>
              <span>${budget.percent}%</span>
            </article>
          `
        )
        .join('')}
    </section>
  `;
}

function connectTemplate() {
  return `
    <section class="page-title">
      <span>Conexoes</span>
      <h1>Bancos e carteiras</h1>
    </section>
    <form class="connect-form" id="bank-form">
      <div>
        <strong>Open Finance Brasil</strong>
        <small>Belvo cria o consentimento direto com seu banco.</small>
      </div>
      <label>
        Nome completo
        <input name="fullName" autocomplete="name" value="${escapeHtml(state.bankForm.fullName)}" required />
      </label>
      <label>
        CPF
        <input name="documentNumber" inputmode="numeric" autocomplete="off" value="${escapeHtml(state.bankForm.documentNumber)}" required />
      </label>
      <button class="primary-action" type="submit">${icon('▦')} Conectar banco real</button>
    </form>
    <form class="connect-form" id="payment-form">
      <div>
        <strong>Apple Pay e Google Pay</strong>
        <small>Stripe cria uma sessao real de pagamento com carteiras digitais.</small>
      </div>
      <label>
        Valor para validar carteira
        <input name="amount" type="number" min="0.50" step="0.01" inputmode="decimal" value="${escapeHtml(state.paymentAmount)}" required />
      </label>
      <button class="primary-action" type="submit">${icon('◉')} Criar pagamento real</button>
    </form>
    <section class="compliance-panel">
      ${icon('✓')}
      <div>
        <strong>Consentimento protegido</strong>
        <p>Bancos e carteiras ficam separados das suas credenciais.</p>
      </div>
    </section>
    <button class="primary-action" type="button" data-action="install">
      ${icon('↓')}
      ${state.installPrompt ? 'Baixar no celular' : 'Instalar pelo navegador'}
    </button>
  `;
}

function billTemplate(bill) {
  return `
    <article class="bill-row">
      <span class="row-icon">${icon(bill.category === 'Cartao' ? '▣' : '▤')}</span>
      <div>
        <strong>${escapeHtml(bill.title)}</strong>
        <small>${dateFormat.format(localDate(bill.dueDate))}</small>
      </div>
      <b>${money(bill.amount)}</b>
    </article>
  `;
}

function transactionTemplate(transaction) {
  const isIncome = transaction.type === 'income';
  return `
    <article class="transaction-row">
      <span class="row-icon ${isIncome ? 'income' : ''}">${icon(isIncome ? '↓' : '↑')}</span>
      <div>
        <strong>${escapeHtml(transaction.title)}</strong>
        <small>${escapeHtml(transaction.category)} · ${dateFormat.format(localDate(transaction.date))}</small>
      </div>
      <b class="${isIncome ? 'positive' : ''}">${isIncome ? '+' : '-'}${money(transaction.amount)}</b>
    </article>
  `;
}

function bottomNavTemplate() {
  const items = [
    ['home', 'Inicio', '✦'],
    ['moves', 'Fluxo', '↑'],
    ['bills', 'Contas', '□'],
    ['connect', 'Conectar', '▦']
  ];

  return `
    <nav class="bottom-nav" aria-label="Navegacao">
      ${items
        .map(
          ([id, label, symbol]) => `
            <button class="${state.tab === id ? 'active' : ''}" type="button" data-tab="${id}">
              ${icon(symbol)}
              <span>${label}</span>
            </button>
          `
        )
        .join('')}
    </nav>
  `;
}

function sheetTemplate() {
  return `
    <div class="sheet-backdrop" role="presentation">
      <form class="sheet" id="transaction-form">
        <div class="sheet-head">
          <h2>Novo lancamento</h2>
          <button type="button" data-action="close-sheet" aria-label="Fechar">${icon('x')}</button>
        </div>
        <div class="segmented">
          <button type="button" class="${state.form.type === 'expense' ? 'selected' : ''}" data-form-type="expense">Saida</button>
          <button type="button" class="${state.form.type === 'income' ? 'selected' : ''}" data-form-type="income">Entrada</button>
        </div>
        <label>
          Titulo
          <input required name="title" value="${escapeHtml(state.form.title)}" />
        </label>
        <label>
          Valor
          <input required min="0" step="0.01" type="number" inputmode="decimal" name="amount" value="${escapeHtml(state.form.amount)}" />
        </label>
        <div class="two-fields">
          <label>
            Categoria
            <input required name="category" value="${escapeHtml(state.form.category)}" />
          </label>
          <label>
            Data
            <input required type="date" name="date" value="${escapeHtml(state.form.date)}" />
          </label>
        </div>
        <label>
          Conta
          <select name="accountId">
            ${state.summary.accounts
              .map(
                (account) => `
                  <option value="${escapeHtml(account.id)}" ${account.id === state.form.accountId ? 'selected' : ''}>
                    ${escapeHtml(account.institution)} - ${escapeHtml(account.name)}
                  </option>
                `
              )
              .join('')}
          </select>
        </label>
        <label class="check-row">
          <input type="checkbox" name="recurring" ${state.form.recurring ? 'checked' : ''} />
          Recorrente
        </label>
        <button class="submit-action" type="submit">${icon('✓')} Salvar</button>
      </form>
    </div>
  `;
}

app.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  const tab = button.dataset.tab;
  if (tab) {
    state.tab = tab;
    render();
    return;
  }

  const action = button.dataset.action;
  if (!action) return;

  if (action === 'open-sheet') {
    state.sheetOpen = true;
    render();
  }

  if (action === 'close-sheet') {
    state.sheetOpen = false;
    render();
  }

  if (action === 'toggle-search') {
    state.searchOpen = !state.searchOpen;
    if (!state.searchOpen) state.query = '';
    render();
    const input = app.querySelector('[data-input="query"]');
    if (input) input.focus();
  }

  if (action === 'close-toast') {
    state.toast = null;
    render();
  }

  if (action === 'install') {
    if (!state.installPrompt) {
      setToast('No celular, use o menu do navegador para instalar.', 'warn');
      return;
    }
    await state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    render();
  }
});

app.addEventListener('input', (event) => {
  if (event.target.dataset.input === 'query') {
    state.query = event.target.value;
    render();
    const input = app.querySelector('[data-input="query"]');
    if (input) {
      input.focus();
      input.setSelectionRange(state.query.length, state.query.length);
    }
  }
});

app.addEventListener('click', (event) => {
  const typeButton = event.target.closest('[data-form-type]');
  if (!typeButton) return;
  state.form.type = typeButton.dataset.formType;
  render();
});

app.addEventListener('submit', async (event) => {
  if (event.target.id === 'bank-form') {
    event.preventDefault();
    const formData = new FormData(event.target);
    state.bankForm = {
      fullName: String(formData.get('fullName') || ''),
      documentNumber: String(formData.get('documentNumber') || '')
    };

    try {
      const response = await api('api/integrations/bank/connect', {
        method: 'POST',
        body: JSON.stringify(state.bankForm)
      });
      window.location.href = response.widgetUrl;
    } catch (error) {
      setToast(error.message, 'warn');
    }
    return;
  }

  if (event.target.id === 'payment-form') {
    event.preventDefault();
    const formData = new FormData(event.target);
    state.paymentAmount = String(formData.get('amount') || '1.00');

    try {
      const response = await api('api/payments/intent', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(state.paymentAmount), currency: 'brl' })
      });
      setToast(`PaymentIntent real criado: ${response.paymentIntentId}`, 'ok');
    } catch (error) {
      setToast(error.message, 'warn');
    }
    return;
  }

  if (event.target.id !== 'transaction-form') return;
  event.preventDefault();

  const formData = new FormData(event.target);
  const payload = {
    title: String(formData.get('title') || ''),
    category: String(formData.get('category') || ''),
    amount: Number(formData.get('amount')),
    type: state.form.type,
    accountId: String(formData.get('accountId') || ''),
    date: String(formData.get('date') || ''),
    recurring: formData.get('recurring') === 'on'
  };

  try {
    try {
      await api('api/transactions', { method: 'POST', body: JSON.stringify(payload) });
    } catch {
      const transaction = { id: `local_${Date.now()}`, ...payload };
      const multiplier = payload.type === 'income' ? 1 : -1;
      state.transactions.unshift(transaction);
      state.summary.totalBalance = Number((state.summary.totalBalance + payload.amount * multiplier).toFixed(2));
      localStorage.setItem('conta.summary', JSON.stringify(state.summary));
      localStorage.setItem('conta.transactions', JSON.stringify(state.transactions));
    }
    state.form = {
      title: '',
      category: 'Livre',
      amount: '',
      type: 'expense',
      accountId: payload.accountId,
      date: new Date().toISOString().slice(0, 10),
      recurring: false
    };
    state.sheetOpen = false;
    setToast('Lancamento salvo', 'ok');
    await loadData();
  } catch (error) {
    setToast(error.message, 'warn');
  }
});

loadData().catch((error) => setToast(error.message, 'warn'));
