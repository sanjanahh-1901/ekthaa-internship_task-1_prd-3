let meetupId   = null;
let meetupData = null;
let activeSection = 'registered';
let msgTargetId   = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  setupNav();

  meetupId = new URLSearchParams(window.location.search).get('id');
  if (!meetupId) { window.location.href = '/dashboard.html'; return; }

  /* Set admin links eagerly so they're ready */
  document.getElementById('edit-btn')?.setAttribute('href', `/admin-create.html?edit=${meetupId}`);
  document.getElementById('analytics-btn')?.setAttribute('href', `/admin-analytics.html?id=${meetupId}`);

  await reload();
});

async function reload() {
  try {
    meetupData = await apiFetch(`/meetups/${meetupId}`);
    renderBanner();
    renderInfo();
    renderRegSection();
    renderCheckinSection();
    renderAttendees();
    if (AppState.isAdmin()) document.getElementById('admin-bar').style.display = 'flex';
    if (typeof loadScrapbook === 'function') loadScrapbook();
  } catch (err) { toast(err.message, 'err'); }
}

/* ── Banner ─────────────────────────────────────────────────────────────── */
function renderBanner() {
  const el = document.getElementById('banner-wrap');
  el.innerHTML = meetupData.banner
    ? `<img src="${esc(meetupData.banner)}" class="detail-banner" alt="${esc(meetupData.title)}">`
    : `<div class="detail-banner-ph">🎯</div>`;
}

/* ── Info ────────────────────────────────────────────────────────────────── */
function renderInfo() {
  const m = meetupData;
  document.title = `${m.title} – Converge`;
  document.getElementById('m-title').textContent = m.title;
  document.getElementById('m-date').textContent  = fmtDate(m.date);
  document.getElementById('m-time').textContent  = `${fmtTime(m.start_time)} – ${fmtTime(m.end_time)}`;
  document.getElementById('m-venue').textContent  = m.venue_name;
  document.getElementById('m-org').textContent    = m.organizer_name || '–';
  document.getElementById('m-desc').textContent   = m.description || 'No description provided.';
  document.getElementById('m-cap').textContent    = `${m.total_registered} / ${m.capacity_limit} registered`;
  document.getElementById('m-cin').textContent    = `✅ ${m.total_checkins} checked in`;
  const mapBtn = document.getElementById('m-map');
  if (mapBtn) { mapBtn.href = m.google_maps_link || '#'; mapBtn.style.display = m.google_maps_link ? 'inline-flex' : 'none'; }
}

/* ── Registration section ────────────────────────────────────────────────── */
function renderRegSection() {
  const me   = AppState.getUser();
  const reg  = meetupData.registered_members?.find(r => r.id == me.id);
  const now  = new Date();
  const dl   = new Date(meetupData.registration_deadline);
  const full = meetupData.total_registered >= meetupData.capacity_limit;
  const el   = document.getElementById('reg-section');

  if (reg) {
    el.innerHTML = `
      <div class="reg-success">
        <div style="font-size:1.8rem">✅</div>
        <div style="color:var(--ok);font-weight:700;margin:.3rem 0">You're registered!</div>
        <span class="badge ${reg.status === 'checked_in' ? 'badge-green' : 'badge-purple'}">
          ${reg.status === 'checked_in' ? 'Checked In' : 'Registered'}
        </span>
      </div>`;
    return;
  }
  if (now > dl)   { el.innerHTML = `<p style="color:var(--txt3);text-align:center;font-size:.85rem">Registration deadline passed</p>`; return; }
  if (full)       { el.innerHTML = `<p style="color:var(--txt3);text-align:center;font-size:.85rem">This meetup is at full capacity</p>`; return; }

  el.innerHTML = `
    <button class="btn btn-primary btn-full btn-lg" onclick="openRegModal()" id="reg-btn">
      🎟️ Register for this Meetup
    </button>
    <p style="text-align:center;font-size:.72rem;color:var(--txt3);margin-top:.5rem">
      Deadline: ${fmtDate(meetupData.registration_deadline)}
    </p>`;
}

/* ── Check-in section ───────────────────────────────────────────────────── */
function renderCheckinSection() {
  const me    = AppState.getUser();
  const reg   = meetupData.registered_members?.find(r => r.id == me.id);
  const now   = new Date();
  const start = new Date(`${meetupData.date}T${meetupData.start_time}`);
  const end   = new Date(`${meetupData.date}T${meetupData.end_time}`);
  const sec   = document.getElementById('checkin-section');
  if (!sec) return;

  if (reg && reg.status !== 'checked_in' && now >= start && now <= end) {
    sec.style.display = 'block';
  } else {
    sec.style.display = 'none';
  }
}

/* ── Attendees ────────────────────────────────────────────────────────────── */
function renderAttendees() {
  document.getElementById('reg-count').textContent   = meetupData.registered_members?.length  || 0;
  document.getElementById('cin-count').textContent   = meetupData.checked_in_members?.length  || 0;
  switchSection(activeSection);
}

function switchSection(sec) {
  activeSection = sec;
  document.querySelectorAll('.sec-tab').forEach(t => t.classList.toggle('active', t.dataset.sec === sec));
  const data = sec === 'registered' ? meetupData.registered_members : meetupData.checked_in_members;
  const list = document.getElementById('att-list');

  if (!data?.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">${sec === 'registered' ? '👥' : '✅'}</div><div class="empty-title">No ${sec === 'registered' ? 'registrations' : 'check-ins'} yet</div></div>`;
    return;
  }
  list.innerHTML = data.map(a => attendeeRow(a)).join('');
}

function attendeeRow(a) {
  const av = a.profile_picture
    ? `<img src="${esc(a.profile_picture)}" alt="${esc(a.name)}">`
    : initials(a.name);
  return `
    <div class="attendee-item" onclick="openProfile(${a.id})">
      <div class="a-avatar">${av}</div>
      <div class="a-info">
        <div class="a-name">${esc(a.name)}</div>
        <div class="a-meta">${esc(a.profession || '')}${a.company ? ' @ ' + esc(a.company) : ''}</div>
      </div>
      ${a.looking_for ? `<span class="badge badge-purple" style="flex-shrink:0;font-size:.62rem">🔍 ${esc(a.looking_for)}</span>` : ''}
    </div>`;
}

/* ── Register modal ──────────────────────────────────────────────────────── */
function openRegModal()  { document.getElementById('reg-modal').classList.add('active'); }
function closeRegModal() { document.getElementById('reg-modal').classList.remove('active'); }

async function submitReg() {
  const btn = document.getElementById('submit-reg');
  setBtn(btn, true);
  try {
    await apiFetch(`/meetups/${meetupId}/register`, {
      method: 'POST',
      body: JSON.stringify({
        why_attend:         document.getElementById('reg-why').value.trim(),
        what_to_learn:      document.getElementById('reg-learn').value.trim(),
        what_to_contribute: document.getElementById('reg-contrib').value.trim()
      })
    });
    closeRegModal();
    toast('🎉 Successfully registered!', 'ok');
    await reload();
  } catch (err) { toast(err.message, 'err'); setBtn(btn, false); }
}

/* ── Check-in ────────────────────────────────────────────────────────────── */
async function doCheckin() {
  const btn = document.getElementById('cin-btn');
  setBtn(btn, true);
  try {
    await apiFetch(`/meetups/${meetupId}/checkin`, { method: 'POST' });
    toast('🎊 Checked in! Welcome!', 'ok');
    await reload();
  } catch (err) { toast(err.message, 'err'); setBtn(btn, false); }
}

/* ── Profile modal ───────────────────────────────────────────────────────── */
async function openProfile(uid) {
  const modal = document.getElementById('profile-modal');
  const body  = document.getElementById('profile-body');
  modal.classList.add('active');
  body.innerHTML = `<div style="text-align:center;padding:2rem"><span class="spinner" style="width:32px;height:32px;border-width:3px"></span></div>`;

  try {
    const u   = await apiFetch(`/users/${uid}`);
    const me  = AppState.getUser();
    const av  = u.profile_picture
      ? `<img src="${esc(u.profile_picture)}" alt="${esc(u.name)}" style="width:100%;height:100%;object-fit:cover">`
      : `<span style="font-size:1.8rem;font-weight:700">${initials(u.name)}</span>`;

    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:1.25rem;margin-bottom:1.25rem">
        <div style="width:72px;height:72px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">${av}</div>
        <div>
          <div style="font-size:1.15rem;font-weight:700">${esc(u.name)}</div>
          <div style="color:var(--txt2);font-size:.85rem">${esc(u.profession || '')}${u.company ? ' @ ' + esc(u.company) : ''}</div>
          ${u.looking_for ? `<span class="badge badge-purple" style="margin-top:.4rem">🔍 ${esc(u.looking_for)}</span>` : ''}
        </div>
      </div>
      ${me.id != uid ? `
        <div style="display:flex;gap:.75rem;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" onclick="sendConnect(${uid})">🤝 Connect</button>
          <button class="btn btn-ghost btn-sm" onclick="openMsg(${uid}, '${esc(u.name)}')">💬 Message</button>
        </div>` : `<p style="color:var(--txt3);font-size:.85rem">This is you!</p>`}`;
  } catch (err) { body.innerHTML = `<div class="empty-state"><div class="empty-title">${esc(err.message)}</div></div>`; }
}
function closeProfile() { document.getElementById('profile-modal').classList.remove('active'); }

async function sendConnect(uid) {
  try {
    await apiFetch('/networking/connections/request', { method:'POST', body: JSON.stringify({ receiver_id: uid }) });
    toast('🤝 Connection request sent!', 'ok');
  } catch (err) { toast(err.message, 'err'); }
}

/* ── Message modal ───────────────────────────────────────────────────────── */
function openMsg(uid, name) {
  msgTargetId = uid;
  document.getElementById('msg-title').textContent = `Message ${name}`;
  closeProfile();
  document.getElementById('msg-modal').classList.add('active');
  loadMsgs();
}
function closeMsg() { document.getElementById('msg-modal').classList.remove('active'); }

async function loadMsgs() {
  const list = document.getElementById('msg-list');
  if (!msgTargetId) return;
  try {
    const msgs = await apiFetch(`/networking/messages/${msgTargetId}`);
    const me   = AppState.getUser();
    if (!msgs?.length) { list.innerHTML = `<div class="empty-state"><div class="empty-icon">💬</div><div class="empty-title">No messages yet</div></div>`; return; }
    list.innerHTML = msgs.map(m => {
      const isMe = m.sender_id === me.id;
      return `<div style="display:flex;justify-content:${isMe?'flex-end':'flex-start'};margin-bottom:.6rem">
        <div style="max-width:78%;padding:.55rem .85rem;border-radius:12px;background:${isMe?'var(--grad)':'rgba(255,255,255,.07)'};font-size:.85rem;color:#fff">${esc(m.content)}</div>
      </div>`;
    }).join('');
    list.scrollTop = list.scrollHeight;
  } catch { list.innerHTML = ''; }
}

async function sendMsg() {
  const inp = document.getElementById('msg-input');
  const txt = inp.value.trim();
  if (!txt || !msgTargetId) return;
  inp.value = '';
  try {
    await apiFetch('/networking/messages', { method:'POST', body: JSON.stringify({ receiver_id: msgTargetId, content: txt }) });
    await loadMsgs();
  } catch (err) { toast(err.message, 'err'); }
}

/* ── Delete meetup (admin) ───────────────────────────────────────────────── */
async function deleteMeetup() {
  if (!confirm('Delete this meetup? This cannot be undone.')) return;
  try {
    await apiFetch(`/meetups/${meetupId}`, { method:'DELETE' });
    toast('Meetup deleted', 'info');
    setTimeout(() => window.location.href = '/dashboard.html', 1200);
  } catch (err) { toast(err.message, 'err'); }
}
