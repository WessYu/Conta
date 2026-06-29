const app = document.querySelector('#app');
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

const state = {
  user: null,
  authMode: 'login',
  loading: true,
  tab: 'home',
  summary: null,
  transactions: [],
  bills: [],
  status: null,
  sheet: null,
  search: '',
  toast: null,
  installPrompt: null
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => undefined));
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.installPrompt = event;
  render();
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function icon(value) {
  return `<span class="icon-glyph" aria-hidden="true">${value}</span>`;
}

function money(value) {
  return currency.format(Number(value || 0));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function localDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : new Date();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Falha na API');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function showToast(text, tone = 'ok') {
  state.toast = { text, tone };
  render();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 4200);
}

async function boot() {
  try {
    const { user } = await api('/api/auth/me');
    state.user = user;
    if (user) await loadData();
  } catch {
    state.user = null;
  }
  state.loading = false;
  render();
}

async function loadData() {
  const [summary, transactions, bills, status] = await Promise.all([
    api('/api/summary'),
    api('/api/transactions'),
    api('/api/bills'),
    api('/api/integrations/status')
  ]);
  state.summary = summary;
  state.transactions = transactions;
  state.bills = bills;
  state.status = status;
}

function render() {
  if (state.loading) {
    app.className = 'phone-frame loading';
    app.innerHTML = '<div class="loader-mark"></div>';
    return;
  }
  app.className = 'phone-frame';
  app.innerHTML = state.user ? appTemplate() : authTemplate();
}

function authTemplate() {
  const isLogin = state.authMode === 'login';
  return `
    <section class="auth-screen">
      <div class="brand-block">
        <span>Conta</span>
        <h1>Planejamento financeiro real.</h1>
        <p>Comece vazio. O app so mostra numeros depois que voce adicionar ou importar seus proprios dados.</p>
      </div>
      <form class="auth-card" id="auth-form">
        <div class="segmented">
          <button type="button" class="${isLogin ? 'selected' : ''}" data-auth-mode="login">Entrar</button>
          <button type="button" class="${!isLogin ? 'selected' : ''}" data-auth-mode="register">Criar</button>
        </div>
        ${!isLogin ? '<label>Nome<input name="name" autocomplete="name" required /></label>' : ''}
        <label>Email<input name="email" type="email" autocomplete="email" required /></label>
        <label>Senha<input name="password" type="password" minlength="8" required /></label>
        <button class="submit-action" type="submit">${icon('→')} ${isLogin ? 'Entrar' : 'Criar conta vazia'}</button>
      </form>
      <div class="auth-footnote">Sem dados demonstrativos. Persistencia pelo backend.</div>
      ${toastTemplate()}
    </section>
  `;
}

function appTemplate() {
  return `
    ${headerTemplate()}
    <div class="scroll-area">
      ${state.tab === 'home' ? homeTemplate() : ''}
      ${state.tab === 'moves' ? movesTemplate() : ''}
      ${state.tab === 'bills' ? billsTemplate() : ''}
      ${state.tab === 'connect' ? connectTemplate() : ''}
    </div>
    ${bottomNavTemplate()}
    ${state.sheet ? sheetTemplate() : ''}
    ${toastTemplate()}
  `;
}

function headerTemplate() {
  return `
    <header class="topbar">
      <button class="identity-pill" type="button" data-action="logout">${escapeHtml(state.user.name)} ${icon('⌄')}</button>
      <label class="search-field compact">${icon('/')}<input value="${escapeHtml(state.search)}" data-input="search" placeholder="Buscar" /></label>
      <div class="tool-pill two">
        <button type="button" data-action="install">${icon('↓')}</button>
        <button type="button" data-action="open-account">${icon('+')}</button>
      </div>
    </header>
  `;
}

function homeTemplate() {
  const summary = state.summary;
  return `
    <section class="balance-panel hero-panel">
      <span>Saldo total</span>
      <strong>${money(summary.totalBalance)}</strong>
      <div class="chart">${cashflowBars(summary.cashflow)}</div>
    </section>
    <section class="metric-grid">
      ${metricTemplate('↓', 'Entradas', money(summary.income))}
      ${metricTemplate('↑', 'Saidas', money(summary.expenses))}
      ${metricTemplate('□', 'Hoje', money(summary.dailyLimit))}
      ${metricTemplate('✓', 'Reserva', money(summary.safeReserve))}
    </section>
    <section class="smart-plan">
      <div>
        <span class="eyebrow">Pode gastar no mes</span>
        <h2>${money(summary.availableToSpend)}</h2>
        <p>Calculado a partir de saldo, contas futuras e reserva.</p>
      </div>
      <button class="round-action" type="button" data-action="open-transaction">${icon('+')}</button>
    </section>
    ${summary.accounts.length ? accountsTemplate() : emptyTemplate()}
    <section>
      <div class="section-heading"><h2>Recentes</h2><span>${state.transactions.length}</span></div>
      <div class="list">${transactionsList(state.transactions.slice(0, 5))}</div>
    </section>
  `;
}

function emptyTemplate() {
  return `
    <section class="empty-state">
      <span>${icon('◇')}</span>
      <h2>Seu app esta vazio</h2>
      <p>Adicione uma conta manualmente ou use a conexao real para importar dados autorizados.</p>
      <button class="primary-action" type="button" data-action="open-account">Adicionar conta</button>
      <button class="ghost-action" type="button" data-tab="connect">Conectar instituicao</button>
    </section>
  `;
}

function accountsTemplate() {
  return `
    <section>
      <div class="section-heading"><h2>Contas</h2><span>${state.summary.accounts.length}</span></div>
      <div class="account-strip">
        ${state.summary.accounts.map((account) => `
          <article class="account-chip">
            <span>${escapeHtml(account.institution)}${account.source === 'belvo' ? ' · conectado' : ''}</span>
            <strong>${money(account.balance)}</strong>
            <small>${escapeHtml(account.name)}</small>
          </article>`).join('')}
      </div>
    </section>
  `;
}

function cashflowBars(items = []) {
  const max = Math.max(1, ...items.map((item) => Number(item.spent || 0)));
  return items.map((item) => `
    <div class="chart-year">
      <i style="height:${12 + (Number(item.spent || 0) / max) * 96}px"></i>
      <small>${item.year}</small>
    </div>`).join('');
}

function metricTemplate(symbol, label, value) {
  return `<article class="metric"><span>${icon(symbol)}</span><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></article>`;
}

function movesTemplate() {
  return `
    <section class="page-title"><span>Fluxo</span><h1>Entradas e saidas</h1></section>
    <button class="primary-action" type="button" data-action="open-transaction">${icon('+')} Novo lancamento</button>
    <div class="list tall">${transactionsList(filteredTransactions())}</div>
  `;
}

function billsTemplate() {
  return `
    <section class="page-title"><span>Contas</span><h1>Agenda financeira</h1></section>
    <button class="primary-action" type="button" data-action="open-bill">${icon('+')} Nova conta</button>
    <div class="stack-card separated tall">${billsList(state.bills)}</div>
  `;
}

function connectTemplate() {
  const ready = Boolean(state.status?.bank?.ready);
  const payReady = Boolean(state.status?.payments?.ready);
  return `
    <section class="page-title"><span>Conexoes reais</span><h1>Instituicoes</h1></section>
    <section class="integration-status ${ready ? 'ready' : ''}">
      <strong>${ready ? 'Open Finance configurado' : 'Configure as chaves no servidor'}</strong>
      <p>${ready ? 'A sessao real pode ser iniciada pelo provedor configurado.' : 'Preencha BELVO_SECRET_ID e BELVO_SECRET_PASSWORD no .env.'}</p>
    </section>
    <form class="connect-form" id="bank-form">
      <div>
        <strong>Abrir consentimento</strong>
        <small>O retorno vem pela API autorizada do provedor, sem senha do banco dentro do app.</small>
      </div>
      <button class="primary-action" type="submit">${icon('▦')} Conectar banco</button>
    </form>
    <form class="connect-form" id="sync-form">
      <div>
        <strong>Importar dados aprovados</strong>
        <small>Informe o link_id retornado pelo provedor para salvar contas e movimentos.</small>
      </div>
      <label>link_id<input name="linkId" autocomplete="off" required /></label>
      <button class="primary-action" type="submit">${icon('↻')} Sincronizar</button>
    </form>
    <section class="integration-status ${payReady ? 'ready' : ''}">
      <strong>${payReady ? 'Carteiras digitais configuradas' : 'Stripe nao configurado'}</strong>
      <p>Apple Pay e Google Pay usam PaymentIntent real quando as chaves Stripe existem.</p>
    </section>
  `;
}

function filteredTransactions() {
  const term = state.search.trim().toLowerCase();
  if (!term) return state.transactions;
  return state.transactions.filter((item) => [item.title, item.category, item.type].some((value) => String(value).toLowerCase().includes(term)));
}

function transactionsList(items) {
  return items.length ? items.map(transactionTemplate).join('') : '<div class="inline-empty">Nenhum lancamento ainda.</div>';
}

function billsList(items) {
  return items.length ? items.map(billTemplate).join('') : '<div class="inline-empty">Nenhuma conta cadastrada.</div>';
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

function billTemplate(bill) {
  return `
    <article class="bill-row">
      <span class="row-icon">${icon(bill.status === 'paid' ? '✓' : '□')}</span>
      <div>
        <strong>${escapeHtml(bill.title)}</strong>
        <small>${dateFormat.format(localDate(bill.dueDate))} · ${escapeHtml(bill.category)}</small>
      </div>
      <b>${money(bill.amount)}</b>
    </article>
  `;
}

function bottomNavTemplate() {
  const items = [['home', 'Inicio', '✦'], ['moves', 'Fluxo', '↑'], ['bills', 'Contas', '□'], ['connect', 'Conectar', '▦']];
  return `<nav class="bottom-nav">${items.map(([id, label, symbol]) => `<button class="${state.tab === id ? 'active' : ''}" type="button" data-tab="${id}">${icon(symbol)}<span>${label}</span></button>`).join('')}</nav>`;
}

function accountOptions() {
  return state.summary.accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.institution)} - ${escapeHtml(account.name)}</option>`).join('');
}

function sheetTemplate() {
  if (state.sheet === 'account') return accountSheet();
  if (state.sheet === 'transaction') return transactionSheet();
  if (state.sheet === 'bill') return billSheet();
  return '';
}

function sheetShell(title, body, id) {
  return `<div class="sheet-backdrop"><form class="sheet" id="${id}"><div class="sheet-head"><h2>${title}</h2><button type="button" data-action="close-sheet">${icon('x')}</button></div>${body}</form></div>`;
}

function accountSheet() {
  return sheetShell('Nova conta', `
    <label>Instituicao<input name="institution" required /></label>
    <label>Nome da conta<input name="name" required /></label>
    <div class="two-fields">
      <label>Tipo<select name="type"><option value="checking">Corrente</option><option value="savings">Reserva</option><option value="wallet">Carteira</option><option value="credit">Credito</option></select></label>
      <label>Saldo<input name="balance" type="number" step="0.01" value="0" required /></label>
    </div>
    <button class="submit-action" type="submit">${icon('✓')} Salvar</button>`, 'account-form');
}

function transactionSheet() {
  if (!state.summary.accounts.length) return sheetShell('Adicione uma conta', `<p class="sheet-note">Lancamentos precisam estar ligados a uma conta.</p><button class="submit-action" type="button" data-action="switch-account-sheet">Adicionar conta</button>`, 'blocked-form');
  return sheetShell('Novo lancamento', `
    <div class="segmented"><button type="button" class="selected" data-kind="expense">Saida</button><button type="button" data-kind="income">Entrada</button></div>
    <input type="hidden" name="type" value="expense" />
    <label>Titulo<input name="title" required /></label>
    <label>Valor<input name="amount" type="number" min="0.01" step="0.01" required /></label>
    <div class="two-fields"><label>Categoria<input name="category" value="Livre" required /></label><label>Data<input name="date" type="date" value="${today()}" required /></label></div>
    <label>Conta<select name="accountId" required>${accountOptions()}</select></label>
    <label class="check-row"><input type="checkbox" name="recurring" /> Recorrente</label>
    <button class="submit-action" type="submit">${icon('✓')} Salvar</button>`, 'transaction-form');
}

function billSheet() {
  if (!state.summary.accounts.length) return sheetShell('Adicione uma conta', `<p class="sheet-note">Contas futuras precisam estar ligadas a uma conta.</p><button class="submit-action" type="button" data-action="switch-account-sheet">Adicionar conta</button>`, 'blocked-form');
  return sheetShell('Nova conta', `
    <label>Titulo<input name="title" required /></label>
    <label>Valor<input name="amount" type="number" min="0.01" step="0.01" required /></label>
    <div class="two-fields"><label>Categoria<input name="category" value="Conta" required /></label><label>Vencimento<input name="dueDate" type="date" value="${today()}" required /></label></div>
    <label>Conta<select name="accountId" required>${accountOptions()}</select></label>
    <button class="submit-action" type="submit">${icon('✓')} Salvar</button>`, 'bill-form');
}

function toastTemplate() {
  return state.toast ? `<button class="toast ${state.toast.tone}" type="button" data-action="close-toast">${escapeHtml(state.toast.text)}</button>` : '';
}

async function refreshAfterWrite(message) {
  await loadData();
  state.sheet = null;
  showToast(message, 'ok');
}

app.addEventListener('click', async (event) => {
  const modeButton = event.target.closest('[data-auth-mode]');
  if (modeButton) { state.authMode = modeButton.dataset.authMode; render(); return; }
  const tabButton = event.target.closest('[data-tab]');
  if (tabButton) { state.tab = tabButton.dataset.tab; render(); return; }
  const kindButton = event.target.closest('[data-kind]');
  if (kindButton) {
    const form = kindButton.closest('form');
    form.querySelectorAll('[data-kind]').forEach((button) => button.classList.remove('selected'));
    kindButton.classList.add('selected');
    form.querySelector('input[name="type"]').value = kindButton.dataset.kind;
    return;
  }
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.action;
  if (!action) return;
  if (action === 'open-account') state.sheet = 'account';
  if (action === 'open-transaction') state.sheet = 'transaction';
  if (action === 'open-bill') state.sheet = 'bill';
  if (action === 'close-sheet') state.sheet = null;
  if (action === 'switch-account-sheet') state.sheet = 'account';
  if (action === 'close-toast') state.toast = null;
  if (action === 'logout') {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    state.user = null;
    state.summary = null;
    state.transactions = [];
    state.bills = [];
  }
  if (action === 'install') {
    if (!state.installPrompt) { showToast('Use o menu do navegador para instalar.', 'warn'); return; }
    await state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
  }
  render();
});

app.addEventListener('input', (event) => {
  if (event.target.dataset.input === 'search') {
    state.search = event.target.value;
    render();
    const input = app.querySelector('[data-input="search"]');
    if (input) { input.focus(); input.setSelectionRange(state.search.length, state.search.length); }
  }
});

app.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    if (form.id === 'auth-form') {
      const endpoint = state.authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = state.authMode === 'login' ? { email: data.email, password: data.password } : data;
      const { user } = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      state.user = user;
      await loadData();
      showToast(state.authMode === 'login' ? 'Sessao iniciada' : 'Conta criada vazia');
      return;
    }
    if (form.id === 'account-form') {
      await api('/api/accounts', { method: 'POST', body: JSON.stringify({ ...data, balance: Number(data.balance) }) });
      await refreshAfterWrite('Conta salva');
      return;
    }
    if (form.id === 'transaction-form') {
      await api('/api/transactions', { method: 'POST', body: JSON.stringify({ ...data, amount: Number(data.amount), recurring: data.recurring === 'on' }) });
      await refreshAfterWrite('Lancamento salvo');
      return;
    }
    if (form.id === 'bill-form') {
      await api('/api/bills', { method: 'POST', body: JSON.stringify({ ...data, amount: Number(data.amount), status: 'scheduled' }) });
      await refreshAfterWrite('Conta agendada');
      return;
    }
    if (form.id === 'bank-form') {
      const response = await api('/api/integrations/bank/connect', { method: 'POST', body: '{}' });
      location.href = response.widgetUrl;
      return;
    }
    if (form.id === 'sync-form') {
      const response = await api('/api/integrations/bank/sync', { method: 'POST', body: JSON.stringify(data) });
      await loadData();
      showToast(`Importado: ${response.imported.accounts} contas, ${response.imported.transactions} movimentos`);
      return;
    }
  } catch (error) {
    if (error.status === 401) state.user = null;
    showToast(error.message, 'warn');
  }
});

boot();
