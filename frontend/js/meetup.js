let meetupId   = null;
let meetupData = null;
let activeSection = 'registered';
let msgTargetId   = null;
let myConnections = [];
let peerPublicKey = null;
let e2eSharedKey = null;

// E2EE Calling States
let localStream = null;
let peerConnection = null;
let activeCallRoom = null;
let activeCallPartnerId = null;
let callRole = null; // 'caller' | 'receiver'
let callTimerInterval = null;
let callDurationSeconds = 0;
let isCallActive = false;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  setupNav();

  meetupId = new URLSearchParams(window.location.search).get('id');
  if (!meetupId) { window.location.href = '/dashboard.html'; return; }

  /* Set admin links eagerly so they're ready */
  document.getElementById('edit-btn')?.setAttribute('href', `/admin-create.html?edit=${meetupId}`);
  document.getElementById('analytics-btn')?.setAttribute('href', `/admin-analytics.html?id=${meetupId}`);

  await reload();
  startBackgroundMessagePoll();

  const openChatUserId = new URLSearchParams(window.location.search).get('openChat');
  if (openChatUserId) {
    try {
      const u = await apiFetch(`/users/${openChatUserId}`);
      if (u) {
        openMsg(u.id, u.name);
      }
    } catch (err) {
      console.warn('Failed to auto-open chat:', err);
    }
  }
});

async function reload() {
  try {
    meetupData = await apiFetch(`/meetups/${meetupId}`);
    try {
      myConnections = await apiFetch('/networking/connections');
    } catch (err) {
      console.warn('Failed to load connections:', err);
    }
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

    const conn = myConnections.find(c => c.other_user_id == uid);
    let connButtons = '';
    
    if (me.id != uid) {
      if (!conn) {
        connButtons = `<button class="btn btn-outline btn-sm" onclick="sendConnect(${uid})">🤝 Connect</button>`;
      } else if (conn.status === 'pending') {
        if (conn.requester_id == me.id) {
          connButtons = `<button class="btn btn-outline btn-sm" disabled style="opacity:0.6; cursor:not-allowed">⏳ Request Sent</button>`;
        } else {
          connButtons = `<button class="btn btn-primary btn-sm" onclick="acceptConnect(${conn.id})">✅ Accept Connection</button>`;
        }
      } else if (conn.status === 'accepted') {
        connButtons = `
          <button class="btn btn-outline btn-sm" disabled style="opacity:0.8; color:var(--ok); border-color:var(--ok); cursor:default">🤝 Connected</button>
          <button class="btn btn-ghost btn-sm" onclick="openMsg(${uid}, '${esc(u.name)}')">💬 Message</button>
        `;
      }
    } else {
      connButtons = `<p style="color:var(--txt3);font-size:.85rem">This is you!</p>`;
    }

    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:1.25rem;margin-bottom:1.25rem">
        <div style="width:72px;height:72px;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">${av}</div>
        <div>
          <div style="font-size:1.15rem;font-weight:700">${esc(u.name)}</div>
          <div style="color:var(--txt2);font-size:.85rem">${esc(u.profession || '')}${u.company ? ' @ ' + esc(u.company) : ''}</div>
          ${u.looking_for ? `<span class="badge badge-purple" style="margin-top:.4rem">🔍 ${esc(u.looking_for)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap">
        ${connButtons}
      </div>`;
  } catch (err) { body.innerHTML = `<div class="empty-state"><div class="empty-title">${esc(err.message)}</div></div>`; }
}
function closeProfile() { document.getElementById('profile-modal').classList.remove('active'); }

async function sendConnect(uid) {
  try {
    await apiFetch('/networking/connections/request', { method:'POST', body: JSON.stringify({ receiver_id: uid }) });
    toast('🤝 Connection request sent!', 'ok');
    await reload();
    await openProfile(uid);
  } catch (err) { toast(err.message, 'err'); }
}

async function acceptConnect(connId) {
  try {
    await apiFetch(`/networking/connections/${connId}/accept`, { method:'PUT' });
    toast('🤝 Connection request accepted!', 'ok');
    const conn = myConnections.find(c => c.id === connId);
    await reload();
    if (conn) {
      await openProfile(conn.other_user_id);
    } else {
      closeProfile();
    }
  } catch (err) { toast(err.message, 'err'); }
}

/* ── Message modal (with E2EE & Calling integration) ─────────────────────── */
async function openMsg(uid, name) {
  msgTargetId = uid;
  document.getElementById('msg-title').textContent = `Message ${name}`;
  closeProfile();
  document.getElementById('msg-modal').classList.add('active');

  const statusEl = document.getElementById('msg-e2e-status');
  if (statusEl) {
    statusEl.style.background = 'rgba(255, 255, 255, 0.05)';
    statusEl.style.color = 'var(--txt2)';
    statusEl.textContent = '🔒 Connecting secure chat...';
  }

  peerPublicKey = null;
  e2eSharedKey = null;

  try {
    const u = await apiFetch(`/users/${uid}`);
    peerPublicKey = u.public_key ? JSON.parse(u.public_key) : null;
    const me = AppState.getUser();
    const myPrivKeyJwk = localStorage.getItem(`e2e_priv_${me.id}`);

    if (peerPublicKey && myPrivKeyJwk) {
      try {
        e2eSharedKey = await deriveSharedKey(JSON.parse(myPrivKeyJwk), peerPublicKey);
        if (statusEl) {
          statusEl.style.background = 'rgba(16,185,129,.12)';
          statusEl.style.color = 'var(--ok)';
          statusEl.innerHTML = '🔒 End-to-End Encrypted Secure Chat';
        }
      } catch (err) {
        console.error('E2EE Key derivation failed:', err);
      }
    }

    if (!e2eSharedKey && statusEl) {
      statusEl.style.background = 'rgba(245,158,11,.12)';
      statusEl.style.color = 'var(--warn)';
      statusEl.innerHTML = '⚠️ Unencrypted Legacy Chat (Recipient is not E2EE active)';
    }
  } catch (err) {
    console.warn('Failed to load recipient profile for E2EE:', err);
  }

  loadMsgs();
}

function closeMsg() {
  document.getElementById('msg-modal').classList.remove('active');
  msgTargetId = null;
  peerPublicKey = null;
  e2eSharedKey = null;
}

async function loadMsgs() {
  const list = document.getElementById('msg-list');
  if (!msgTargetId) return;
  try {
    const msgs = await apiFetch(`/networking/messages/${msgTargetId}`);
    const me   = AppState.getUser();
    if (!msgs?.length) { 
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">💬</div><div class="empty-title">No messages yet</div></div>`; 
      return; 
    }

    // Map messages with decryption
    const messageRows = [];
    for (const m of msgs) {
      // Ignore background RTC signaling messages
      if (m.content.includes('"isSignal":true')) continue;

      let decryptedContent = m.content;
      let e2eIcon = '';

      if (m.content.includes('"isEncrypted":true')) {
        try {
          const payload = JSON.parse(m.content);
          if (e2eSharedKey) {
            decryptedContent = await decryptMessage(payload.ciphertext, payload.iv, e2eSharedKey);
            e2eIcon = ' <span style="font-size:0.6rem; opacity:0.5; cursor:help" title="End-to-End Encrypted">🔒</span>';
          } else {
            decryptedContent = '⚠️ [Encrypted message - Key not set]';
          }
        } catch (err) {
          decryptedContent = '⚠️ [Decryption error]';
        }
      }

      const isMe = m.sender_id === me.id;
      
      // Determine if content is media base64 Data URL
      let renderHtml = '';
      if (decryptedContent.startsWith('data:image/')) {
        renderHtml = `<img src="${decryptedContent}" style="max-width:100%; max-height:200px; border-radius:8px; display:block; cursor:zoom-in; border: 1px solid rgba(255,255,255,0.05);" onclick="window.open(this.src)">`;
      } else if (decryptedContent.startsWith('data:video/')) {
        renderHtml = `<video src="${decryptedContent}" controls style="max-width:100%; max-height:200px; border-radius:8px; display:block; border: 1px solid rgba(255,255,255,0.05);"></video>`;
      } else {
        renderHtml = esc(decryptedContent);
      }

      messageRows.push(`
        <div style="display:flex; justify-content:${isMe ? 'flex-end' : 'flex-start'}; margin-bottom:.65rem">
          <div style="max-width:78%; padding:.55rem .85rem; border-radius:12px; background:${isMe ? 'var(--grad)' : 'rgba(255,255,255,.07)'}; font-size:.85rem; color:#fff">
            <div>${renderHtml}</div>
            <div style="text-align:right; font-size:0.6rem; opacity:0.5; margin-top:0.2rem;">
              ${(() => {
                let ts = m.sent_at;
                if (ts && !ts.endsWith('Z') && !ts.includes('+')) ts = ts.replace(' ', 'T') + 'Z';
                return new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
              })()}
              ${e2eIcon}
            </div>
          </div>
        </div>
      `);
    }

    if (messageRows.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">💬</div><div class="empty-title">No conversation history yet</div></div>`;
    } else {
      list.innerHTML = messageRows.join('');
    }
    list.scrollTop = list.scrollHeight;
  } catch (err) { 
    console.error('Failed to load messages:', err);
  }
}

async function sendMsg() {
  const inp = document.getElementById('msg-input');
  const txt = inp.value.trim();
  if (!txt || !msgTargetId) return;
  inp.value = '';

  try {
    let finalContent = txt;
    if (e2eSharedKey) {
      const enc = await encryptMessage(txt, e2eSharedKey);
      finalContent = JSON.stringify({ isEncrypted: true, ciphertext: enc.ciphertext, iv: enc.iv });
    }
    await apiFetch('/networking/messages', { 
      method: 'POST', 
      body: JSON.stringify({ receiver_id: msgTargetId, content: finalContent }) 
    });
    await loadMsgs();
  } catch (err) { 
    toast('Send failed: ' + err.message, 'err'); 
  }
}

function triggerAttachment() {
  document.getElementById('chat-attachment-input').click();
}

async function handleChatAttachment(file) {
  if (!file || !msgTargetId) return;
  if (file.size > 8 * 1024 * 1024) { 
    toast('File too large (maximum size is 8 MB)', 'err'); 
    return; 
  }

  toast('📎 Encrypting and uploading file...', 'info');

  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    try {
      let finalContent = dataUrl;
      if (e2eSharedKey) {
        const enc = await encryptMessage(dataUrl, e2eSharedKey);
        finalContent = JSON.stringify({ isEncrypted: true, ciphertext: enc.ciphertext, iv: enc.iv });
      } else {
        toast('E2EE secure key exchange is required to send media attachments.', 'err');
        return;
      }
      await apiFetch('/networking/messages', {
        method: 'POST',
        body: JSON.stringify({ receiver_id: msgTargetId, content: finalContent })
      });
      await loadMsgs();
      toast('📎 File sent securely!', 'ok');
    } catch (err) {
      toast('Attachment upload failed: ' + err.message, 'err');
    }
  };
  reader.readAsDataURL(file);
}

/* ── E2EE Signaling & Background Polling ────────────────────────────────── */
let bgMessagePollInterval = null;
let lastCallInviteTimeSeen = 0;
let lastOfferReceivedRoom = null;

function startBackgroundMessagePoll() {
  if (bgMessagePollInterval) clearInterval(bgMessagePollInterval);
  
  bgMessagePollInterval = setInterval(async () => {
    const me = AppState.getUser();
    if (!me) return;

    // 1. If chat is active, reload messages
    if (document.getElementById('msg-modal').classList.contains('active')) {
      await loadMsgs();
    }

    // 2. Poll for call signals
    try {
      const recent = await apiFetch('/networking/recent-messages');
      if (recent && recent.length > 0) {
        for (const m of recent) {
          if (m.content.includes('"isSignal":true')) {
            try {
              const signal = JSON.parse(m.content);
              let ts = m.sent_at;
              if (ts && !ts.endsWith('Z') && !ts.includes('+')) {
                ts = ts.replace(' ', 'T') + 'Z';
              }
              const msgTime = new Date(ts).getTime();
              // Check that signal is fresh (within 15 seconds)
              if (Math.abs(Date.now() - msgTime) < 15000) {
                await handleCallSignal(signal, m.sender_id, m.sender_name);
              }
            } catch (err) {
              console.error('Failed to parse signal message:', err);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Background signal poll error:', err);
    }
  }, 3000);
}

async function handleCallSignal(signal, senderId, senderName) {
  const me = AppState.getUser();
  if (!me) return;

  if (signal.type === 'call_invite' && !isCallActive) {
    // Incoming call! Show modal if not ringing/on call
    const inviteTime = new Date().getTime();
    if (inviteTime - lastCallInviteTimeSeen < 10000) return; // Prevent double ring prompts
    lastCallInviteTimeSeen = inviteTime;

    activeCallRoom = signal.room;
    activeCallPartnerId = senderId;
    callRole = 'receiver';

    document.getElementById('incoming-caller-name').textContent = `${senderName} is calling...`;
    document.getElementById('incoming-call-modal').classList.add('active');
  } 
  else if (signal.type === 'call_accept' && isCallActive && callRole === 'caller' && signal.room === activeCallRoom) {
    document.getElementById('call-status').textContent = 'E2EE Call Connected';
    startCallTimer();
    // Initialize WebRTC offer creation
    await setupWebRTCPeer(true);
  }
  else if (signal.type === 'call_decline' && activeCallRoom === signal.room) {
    toast('📞 Call declined by recipient', 'info');
    cleanupCall();
  }
  else if (signal.type === 'call_end' && activeCallRoom === signal.room) {
    toast('📞 Call hung up', 'info');
    cleanupCall();
  }
  else if (signal.type === 'webrtc_offer' && isCallActive && callRole === 'receiver' && signal.room === activeCallRoom && lastOfferReceivedRoom !== signal.room) {
    lastOfferReceivedRoom = signal.room;
    await setupWebRTCPeer(false);
    await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    // Send answer signal
    await sendSignal('webrtc_answer', { sdp: answer.sdp });
    startCallTimer();
  }
  else if (signal.type === 'webrtc_answer' && isCallActive && callRole === 'caller' && signal.room === activeCallRoom) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
  }
  else if (signal.type === 'webrtc_ice' && isCallActive && signal.room === activeCallRoom && peerConnection) {
    try {
      if (signal.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      console.warn('Error adding ICE candidate:', err);
    }
  }
}

// Send background signaling message
async function sendSignal(type, data = {}) {
  if (!activeCallPartnerId || !activeCallRoom) return;
  const signalPayload = {
    isSignal: true,
    type,
    room: activeCallRoom,
    ...data
  };
  try {
    await apiFetch('/networking/messages', {
      method: 'POST',
      body: JSON.stringify({
        receiver_id: activeCallPartnerId,
        content: JSON.stringify(signalPayload)
      })
    });
  } catch (err) {
    console.error('Failed to send signal:', type, err);
  }
}

/* ── WebRTC / E2EE Voice & Video Call Flow ───────────────────────────────── */
function startCallClick() {
  if (!msgTargetId) return;
  startCall(msgTargetId);
}

async function startCall(partnerId) {
  closeMsg();
  
  isCallActive = true;
  callRole = 'caller';
  activeCallPartnerId = partnerId;
  activeCallRoom = `room_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  
  const partner = myConnections.find(c => c.other_user_id === partnerId);
  const name = partner ? partner.name : 'Attendee';

  document.getElementById('call-status').textContent = `Calling ${name}...`;
  document.getElementById('call-avatar-initials').textContent = initials(name);
  document.getElementById('call-modal').classList.add('active');

  // Trigger media streams
  await initLocalMedia();

  // Send call invite signal
  await sendSignal('call_invite', { senderName: AppState.getUser().name });
  
  // Connect countdown display for waiting
  document.getElementById('call-duration').textContent = 'Ringing...';
}

async function acceptIncomingCall() {
  document.getElementById('incoming-call-modal').classList.remove('active');
  isCallActive = true;
  
  document.getElementById('call-status').textContent = 'Connecting Secure Chat Call...';
  
  const partner = myConnections.find(c => c.other_user_id === activeCallPartnerId);
  const name = partner ? partner.name : 'Attendee';
  document.getElementById('call-avatar-initials').textContent = initials(name);
  document.getElementById('call-modal').classList.add('active');

  // Initialize media streams
  await initLocalMedia();

  // Send accept signal
  await sendSignal('call_accept');
}

async function declineIncomingCall() {
  document.getElementById('incoming-call-modal').classList.remove('active');
  await sendSignal('call_decline');
  cleanupCall();
}

async function initLocalMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const localVideo = document.getElementById('local-video');
    if (localVideo) localVideo.srcObject = localStream;
  } catch (err) {
    console.warn('Camera/mic access denied, initializing E2EE visual fallback calling module:', err);
    // Continue with animated fallback visual state
    document.getElementById('call-duration').textContent = 'E2EE Audio Only (Glow Mode)';
  }
}

async function setupWebRTCPeer(isCaller) {
  if (peerConnection) return;
  
  const config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };
  
  peerConnection = new RTCPeerConnection(config);

  // Add tracks
  if (localStream) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  // ICE Candidates signaling
  peerConnection.onicecandidate = async (e) => {
    if (e.candidate) {
      await sendSignal('webrtc_ice', { candidate: e.candidate });
    }
  };

  // Remote Stream received
  peerConnection.ontrack = (e) => {
    const remoteVideo = document.getElementById('remote-video');
    if (remoteVideo) {
      remoteVideo.srcObject = e.streams[0];
      // Hide calling avatar fallback once remote stream starts streaming!
      document.getElementById('call-fallback-ui').style.display = 'none';
    }
  };

  if (isCaller) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await sendSignal('webrtc_offer', { sdp: offer.sdp });
  }
}

function startCallTimer() {
  if (callTimerInterval) clearInterval(callTimerInterval);
  callDurationSeconds = 0;
  
  callTimerInterval = setInterval(() => {
    callDurationSeconds++;
    const mins = Math.floor(callDurationSeconds / 60);
    const secs = callDurationSeconds % 60;
    const pad = n => String(n).padStart(2, '0');
    
    const label = document.getElementById('call-duration');
    if (label) {
      label.textContent = `🔒 E2EE Connected • ${pad(mins)}:${pad(secs)}`;
    }
  }, 1000);
}

function toggleCallMute() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      document.getElementById('call-mute-btn').classList.toggle('btn-danger', !audioTrack.enabled);
      document.getElementById('call-mute-btn').innerHTML = audioTrack.enabled ? '🎙️' : '🔇';
      toast(audioTrack.enabled ? '🎙️ Microphone Unmuted' : '🔇 Microphone Muted', 'info');
    }
  }
}

function toggleCallVideo() {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      document.getElementById('call-video-btn').classList.toggle('btn-danger', !videoTrack.enabled);
      document.getElementById('call-video-btn').innerHTML = videoTrack.enabled ? '📹' : '❌📹';
      toast(videoTrack.enabled ? '📹 Video Camera Active' : '❌📹 Video Camera Paused', 'info');
    }
  }
}

async function endCall() {
  if (isCallActive) {
    await sendSignal('call_end');
  }
  cleanupCall();
}

function cleanupCall() {
  if (callTimerInterval) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
  }
  
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  // Reset video DOM elements
  const localVideo = document.getElementById('local-video');
  const remoteVideo = document.getElementById('remote-video');
  if (localVideo) localVideo.srcObject = null;
  if (remoteVideo) remoteVideo.srcObject = null;
  
  // Hide overlays
  document.getElementById('call-modal').classList.remove('active');
  document.getElementById('incoming-call-modal').classList.remove('active');
  document.getElementById('call-fallback-ui').style.display = 'flex';
  
  isCallActive = false;
  activeCallRoom = null;
  activeCallPartnerId = null;
  callRole = null;
  lastOfferReceivedRoom = null;
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
        let msg = err.message || String(err);
        if (err.name === 'NotAllowedError' || msg.includes('Permission denied') || msg.includes('PermissionDismissedError') || msg.includes('NotAllowedError')) {
          msg = 'Camera access denied. Please grant camera permission in your browser settings, and make sure you are accessing the app via http://localhost:3000.';
        } else {
          msg = 'Camera start failed: ' + msg;
        }
        toast('📷 ' + msg, 'err');
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
    let msg = err.message || String(err);
    if (err.name === 'NotAllowedError' || msg.includes('Permission denied') || msg.includes('PermissionDismissedError') || msg.includes('NotAllowedError')) {
      msg = '📷 Camera access denied. Please grant camera permission in your browser or address bar settings, and ensure you are using http://localhost:3000 (browsers block camera access on non-localhost HTTP).';
    } else if (err.name === 'NotFoundError' || msg.includes('Requested device not found')) {
      msg = '📷 No camera found on this device. Please connect or enable a webcam.';
    } else if (err.name === 'NotReadableError' || msg.includes('Could not start video source')) {
      msg = '📷 Camera is already in use by another tab or application. Please close it and try again.';
    }
    toast(msg, 'err');
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
