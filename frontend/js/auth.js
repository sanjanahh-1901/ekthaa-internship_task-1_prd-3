document.addEventListener('DOMContentLoaded', () => {
  if (AppState.isLoggedIn()) { window.location.href = '/dashboard.html'; return; }
  initTabs();
  initLoginForm();
  initRegisterForm();
});

/* ── Tab switching ────────────────────────────────────────────────────────── */
function initTabs() {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      document.getElementById('login-form').style.display    = isLogin ? 'block' : 'none';
      document.getElementById('register-form').style.display = isLogin ? 'none'  : 'block';
    });
  });
}

function showErr(formEl, msg) {
  const a = formEl.querySelector('.alert');
  if (!a) return;
  a.textContent = msg;
  a.classList.add('show');
  setTimeout(() => a.classList.remove('show'), 5000);
}

/* ── Login ───────────────────────────────────────────────────────────────── */
function initLoginForm() {
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    setBtn(btn, true);
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email:    document.getElementById('l-email').value.trim(),
          password: document.getElementById('l-pass').value
        })
      });
      if (data) { AppState.setAuth(data.token, data.user); window.location.href = '/dashboard.html'; }
    } catch (err) { showErr(form, err.message); setBtn(btn, false); }
  });
}

/* ── Register ────────────────────────────────────────────────────────────── */
function initRegisterForm() {
  const form = document.getElementById('register-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn  = form.querySelector('button[type=submit]');
    const pass = document.getElementById('r-pass').value;
    const conf = document.getElementById('r-conf').value;
    if (pass !== conf) { showErr(form, 'Passwords do not match'); return; }

    setBtn(btn, true);
    try {
      const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name:          document.getElementById('r-name').value.trim(),
          email:         document.getElementById('r-email').value.trim(),
          password:      pass,
          profession:    document.getElementById('r-profession').value.trim(),
          company:       document.getElementById('r-company').value.trim(),
          looking_for:   document.getElementById('r-looking').value.trim()
        })
      });
      if (data) { AppState.setAuth(data.token, data.user); window.location.href = '/dashboard.html'; }
    } catch (err) { showErr(form, err.message); setBtn(btn, false); }
  });
}
