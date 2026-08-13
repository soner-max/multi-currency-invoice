const API_URL = 'http://localhost:3000/api';
let authToken = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user'));

document.addEventListener('DOMContentLoaded', () => {
  if (authToken && currentUser) {
    showDashboard();
  } else {
    showAuth();
  }
});

function switchTab(tab) {
  document.getElementById('auth-error').innerText = '';
  if (tab === 'login') {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('tab-login-btn').classList.add('active');
    document.getElementById('tab-register-btn').classList.remove('active');
  } else {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
    document.getElementById('tab-login-btn').classList.remove('active');
    document.getElementById('tab-register-btn').classList.add('active');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    authToken = data.token;
    currentUser = data.user;

    showDashboard();
  } catch (err) {
    document.getElementById('auth-error').innerText = err.message;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const baseCurrency = document.getElementById('reg-currency').value;

  try {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, baseCurrency })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    alert('Kayıt başarılı! Şimdi giriş yapabilirsiniz.');
    switchTab('login');
  } catch (err) {
    document.getElementById('auth-error').innerText = err.message;
  }
}

function handleLogout() {
  localStorage.clear();
  authToken = null;
  currentUser = null;
  showAuth();
}

function showAuth() {
  document.getElementById('auth-container').classList.remove('hidden');
  document.getElementById('dashboard-container').classList.add('hidden');
}

function showDashboard() {
  document.getElementById('auth-container').classList.add('hidden');
  document.getElementById('dashboard-container').classList.remove('hidden');
  document.getElementById('user-email-display').innerText = currentUser.email;

  loadMetrics();
  loadCustomersSelect();
  loadInvoices();
}

async function loadMetrics() {
  const res = await fetch(`${API_URL}/reports/dashboard`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const data = await res.json();

  document.getElementById('metric-count').innerText = data.summary.totalInvoiceCount;
  document.getElementById('metric-revenue').innerText = Number(data.summary.totalRevenue).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
  document.getElementById('metric-currency').innerText = data.userBaseCurrency;
}

async function loadCustomersSelect() {
  const res = await fetch(`${API_URL}/customers`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const customers = await res.json();

  const select = document.getElementById('inv-customer');
  select.innerHTML = '<option value="">Müşteri Seçin...</option>';
  customers.forEach(c => {
    select.innerHTML += `<option value="${c.Id}">${c.Name}</option>`;
  });
}

async function handleCreateCustomer(e) {
  e.preventDefault();
  const name = document.getElementById('cust-name').value;
  const taxNumber = document.getElementById('cust-tax').value;
  const email = document.getElementById('cust-email').value;

  const res = await fetch(`${API_URL}/customers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ name, taxNumber, email })
  });

  if (res.ok) {
    alert('Müşteri başarıyla eklendi.');
    document.getElementById('cust-name').value = '';
    document.getElementById('cust-tax').value = '';
    document.getElementById('cust-email').value = '';
    loadCustomersSelect();
  }
}

async function handleCreateInvoice(e) {
  e.preventDefault();
  const title = document.getElementById('inv-title').value;
  const amountOriginal = document.getElementById('inv-amount').value;
  const currencyOriginal = document.getElementById('inv-currency').value;
  const customerId = document.getElementById('inv-customer').value;

  const res = await fetch(`${API_URL}/invoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ title, amountOriginal, currencyOriginal, customerId })
  });

  if (res.ok) {
    document.getElementById('inv-title').value = '';
    document.getElementById('inv-amount').value = '';
    loadInvoices();
    loadMetrics();
  }
}

async function loadInvoices() {
  const res = await fetch(`${API_URL}/invoices`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const invoices = await res.json();

  const container = document.getElementById('invoices-grid');
  container.innerHTML = '';

  invoices.forEach(inv => {
    container.innerHTML += `
      <div class="invoice-card">
        <div class="header">
          <span>${inv.Title}</span>
          <small>${inv.CustomerName || 'Genel Müşteri'}</small>
        </div>
        <div class="amount-orig">${inv.AmountOriginal} ${inv.CurrencyOriginal}</div>
        <div class="amount-base">Hesaplanan: <strong>${Number(inv.AmountBase).toFixed(2)} TRY</strong> (Kur: ${inv.ExchangeRate})</div>
        <div class="footer">Tarih: ${new Date(inv.CreatedAt).toLocaleDateString('tr-TR')}</div>
      </div>
    `;
  });
}