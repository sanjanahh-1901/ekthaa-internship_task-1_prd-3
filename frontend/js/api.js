/* ─── API base (same origin – Express serves both) ─── */
const API = '/api';

/* ─── Auth state ──────────────────────────────────────────────────────────── */
const AppState = {
  getToken : ()      => localStorage.getItem('token'),
  getUser  : ()      => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
  setAuth  : (t, u)  => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); },
  clearAuth: ()      => { localStorage.removeItem('token'); localStorage.removeItem('user'); },
  isAdmin  : ()      => AppState.getUser()?.role === 'admin',
  isLoggedIn: ()     => !!AppState.getToken()
};

function requireAuth() {
  if (!AppState.isLoggedIn()) { window.location.href = '/'; return false; }
  return true;
}
function requireAdmin() {
  if (!requireAuth()) return false;
  if (!AppState.isAdmin()) { window.location.href = '/dashboard.html'; return false; }
  return true;
}
function logout() {
  AppState.clearAuth();
  window.location.href = '/';
}

/* ─── Core fetch wrapper ──────────────────────────────────────────────────── */
async function apiFetch(endpoint, opts = {}) {
  const token   = AppState.getToken();
  const headers = { ...opts.headers };

  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API}${endpoint}`, { ...opts, headers });
  } catch {
    throw new Error('Cannot reach server. Is it running on port 3000?');
  }

  if (res.status === 401) { logout(); return null; }

  /* CSV download passthrough */
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/csv')) {
    const blob = await res.blob();
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    const cd   = res.headers.get('content-disposition') || '';
    a.download = cd.match(/filename="?([^"]+)"?/)?.[1] || 'export.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    return null;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

/* ─── Toast ──────────────────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'all .3s';
    el.style.opacity    = '0';
    el.style.transform  = 'translateX(16px)';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ─── Nav helper ─────────────────────────────────────────────────────────── */
function setupNav() {
  const u   = AppState.getUser();
  const el  = document.getElementById('nav-user');
  if (!el || !u) return;

  el.innerHTML = `
    <div class="user-chip" title="Click to logout" onclick="logout()">
      <div class="user-avatar">
        ${u.profile_picture
          ? `<img src="${u.profile_picture}" alt="${esc(u.name)}">`
          : initials(u.name)}
      </div>
      <span class="user-name">${esc(u.name)}</span>
    </div>`;

  /* Show/hide admin-only elements */
  document.querySelectorAll('.admin-only').forEach(
    el => (el.style.display = AppState.isAdmin() ? '' : 'none')
  );
}

/* ─── Utilities ──────────────────────────────────────────────────────────── */
function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
}
function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US',
    { weekday:'short', year:'numeric', month:'short', day:'numeric' });
}
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}
function setBtn(btn, loading, label) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Please wait…';
  } else {
    btn.disabled = false;
    btn.innerHTML = label || btn.dataset.orig || btn.textContent;
  }
}
