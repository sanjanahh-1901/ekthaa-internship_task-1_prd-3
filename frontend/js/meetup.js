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
        <span class="badge ${reg.status === 'checked_in' ? 'badge-green' : 'badge-purple'}" style="margin-bottom: 0.75rem;">
          ${reg.status === 'checked_in' ? 'Checked In' : 'Registered'}
        </span>
        <button class="btn btn-ghost btn-sm btn-full" style="margin-top:.75rem;font-size:.78rem;font-weight:600" onclick="openTicketModal()">
          🎟️ View Digital Pass
        </button>
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

/* ── Digital Pass Modal ─────────────────────────────────────────────────── */
function openTicketModal() {
  const me = AppState.getUser();
  if (!me) return;
  
  document.getElementById('ticket-user-name').textContent = me.name;
  document.getElementById('ticket-user-profession').textContent = 
    [me.profession, me.company].filter(Boolean).join(' @ ') || 'Community Member';
  
  // Payload for unique user pass
  const payload = JSON.stringify({
    userId: me.id,
    name: me.name,
    type: 'converge-user-pass'
  });
  
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payload)}`;
  document.getElementById('ticket-qr').src = qrUrl;
  
  document.getElementById('ticket-modal').classList.add('active');
}

function closeTicketModal() {
  document.getElementById('ticket-modal').classList.remove('active');
}

/* ── Admin QR Scanner ───────────────────────────────────────────────────── */
let html5QrScanner = null;
let scannerActive = false;

// Web Audio API Sound Synthesizer
function playCheckinSound(type) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    if (type === 'success') {
      // Play a happy double chime: D5 then A5
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.08); // A5
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.35);
    } else {
      // Play a low buzzer sound
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(130.81, audioCtx.currentTime); // C3
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.45);
    }
  } catch (err) {
    console.error('Failed to play check-in feedback sound:', err);
  }
}

async function openScanner() {
  if (scannerActive) return;
  
  const scannerModal = document.getElementById('scanner-modal');
  const cameraSelect = document.getElementById('camera-select');
  const feedback = document.getElementById('scanner-feedback');
  
  scannerModal.classList.add('active');
  feedback.classList.remove('active', 'success', 'error');
  cameraSelect.innerHTML = '<option value="">Loading cameras...</option>';
  
  try {
    // Request permissions and list cameras
    const devices = await Html5Qrcode.getCameras();
    if (!devices || devices.length === 0) {
      throw new Error('No cameras found on this device');
    }
    
    cameraSelect.innerHTML = devices.map(d => 
      `<option value="${d.id}">${esc(d.label || 'Camera ' + d.id)}</option>`
    ).join('');
    
    html5QrScanner = new Html5Qrcode("qr-reader");
    
    const startScanning = async (deviceId) => {
      try {
        await html5QrScanner.start(
          deviceId,
          {
            fps: 10,
            qrbox: { width: 220, height: 220 }
          },
          onQrScanSuccess,
          onQrScanFailure
        );
        scannerActive = true;
      } catch (err) {
        toast('Camera start failed: ' + err.message, 'err');
      }
    };
    
    // Start with the first camera
    await startScanning(devices[0].id);
    
    // Handle camera change
    cameraSelect.onchange = async () => {
      if (html5QrScanner && html5QrScanner.isScanning) {
        await html5QrScanner.stop();
      }
      await startScanning(cameraSelect.value);
    };
    
  } catch (err) {
    toast(err.message, 'err');
    closeScanner();
  }
}

async function closeScanner() {
  const scannerModal = document.getElementById('scanner-modal');
  scannerModal.classList.remove('active');
  
  if (html5QrScanner) {
    try {
      if (html5QrScanner.isScanning) {
        await html5QrScanner.stop();
      }
    } catch (err) {
      console.error('Error stopping scanner:', err);
    }
    html5QrScanner = null;
  }
  scannerActive = false;
}

let lastScanTime = 0;
async function onQrScanSuccess(decodedText) {
  const now = Date.now();
  // Prevent duplicate scanning in rapid succession (debounce 2.5 seconds)
  if (now - lastScanTime < 2500) return;
  lastScanTime = now;
  
  const feedback = document.getElementById('scanner-feedback');
  feedback.classList.remove('success', 'error');
  feedback.className = 'scanner-feedback-overlay active';
  feedback.querySelector('.feedback-message').textContent = 'Validating pass...';
  
  try {
    const data = JSON.parse(decodedText);
    if (data.type !== 'converge-user-pass' || !data.userId) {
      throw new Error('Invalid Digital Pass format');
    }
    
    // Call admin-checkin endpoint
    const res = await apiFetch(`/meetups/${meetupId}/admin-checkin`, {
      method: 'POST',
      body: JSON.stringify({ userId: data.userId })
    });
    
    // Play success chime
    playCheckinSound('success');
    
    // Show success overlay
    feedback.className = 'scanner-feedback-overlay active success';
    feedback.querySelector('.feedback-message').innerHTML = `
      <div style="font-size: 1.5rem; margin-bottom: 0.2rem;">✅ Checked In</div>
      <strong style="color:#fff">${esc(res.attendee?.name || 'Attendee')}</strong>
    `;
    toast(res.message, 'ok');
    
    // Dynamic background data reload
    await reload();
    
  } catch (err) {
    // Play buzzer sound
    playCheckinSound('error');
    
    // Show error overlay
    feedback.className = 'scanner-feedback-overlay active error';
    feedback.querySelector('.feedback-message').innerHTML = `
      <div style="font-size: 1.5rem; margin-bottom: 0.2rem;">❌ Failed</div>
      <span style="font-size: 0.85rem;">${esc(err.message)}</span>
    `;
    toast(err.message, 'err');
  }
  
  // Clear feedback after 2 seconds to allow next scan
  setTimeout(() => {
    if (scannerActive) {
      feedback.classList.remove('active', 'success', 'error');
    }
  }, 2000);
}

function onQrScanFailure(error) {
  // Silent failure for normal qr scanning ticks (no QR code in frame)
}
