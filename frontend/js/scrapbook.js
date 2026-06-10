/* ============================================================
   scrapbook.js — Digital Scrapbook for Converge meetup pages
   Depends on: api.js (apiFetch, AppState, esc, toast, setBtn)
   Loaded after meetup.js; meetupId is already set.
   ============================================================ */

/* ── State ──────────────────────────────────────────────────── */
let sbData         = null;   // { items, windowInfo, settings, isAdmin }
let sbSelectedFile = null;   // File object from drop/pick
let sbCountdownTimer  = null;// setInterval handle
let sbActiveTab       = 'photos'; // 'photos' | 'videos'

/* ══════════════════════════════════════════════════════════════
   Entry point — called by meetup.js after meetupData is ready
═══════════════════════════════════════════════════════════════ */
async function loadScrapbook() {
  if (!meetupId) return;
  try {
    sbData = await apiFetch(`/scrapbook/${meetupId}`);
    renderScrapbookBadge();
    renderScrapbookBody();
  } catch (err) {
    const body = document.getElementById('scrapbook-body');
    if (body) body.innerHTML = `<div class="scrapbook-empty"><div class="scrapbook-empty-icon">⚠️</div><div class="scrapbook-empty-title">${esc(err.message)}</div></div>`;
  }
}

/* ── Window badge in the card header ────────────────────────── */
function renderScrapbookBadge() {
  const el = document.getElementById('scrapbook-window-badge');
  if (!el || !sbData) return;
  const { open, closeAt, adminSet } = sbData.windowInfo;

  let cls, dot, label;
  if (!adminSet) {
    cls = 'closed'; dot = ''; label = 'Window Not Set';
  } else if (!open) {
    cls = 'closed';  dot = ''; label = 'Upload Closed';
  } else {
    const minsLeft = Math.max(0, (new Date(closeAt) - new Date()) / 60000);
    if (minsLeft < 120) {
      cls = 'closing'; dot = '<span class="badge-dot"></span>'; label = 'Closing Soon';
    } else {
      cls = 'open';    dot = '<span class="badge-dot"></span>'; label = 'Open for Uploads';
    }
  }
  el.className = `scrapbook-window-badge ${cls}`;
  el.innerHTML = `${dot} ${label}`;
}

/* ── Main body renderer ─────────────────────────────────────── */
function renderScrapbookBody() {
  const body = document.getElementById('scrapbook-body');
  if (!body || !sbData) return;

  const { items, windowInfo, isAdmin } = sbData;
  const { open, closeAt } = windowInfo;

  /* Stop any previous countdown */
  if (sbCountdownTimer) { clearInterval(sbCountdownTimer); sbCountdownTimer = null; }

  let html = '';

  /* ── Admin settings row ── */
  if (isAdmin) {
    /* Pre-fill the datetime input with current close time in local timezone ISO format */
    let currentClose = '';
    if (sbData.settings?.upload_close_at) {
      const d = new Date(sbData.settings.upload_close_at);
      const tzOffset = d.getTimezoneOffset() * 60000;
      currentClose = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
    }
    let currentGraceClose = '';
    if (sbData.settings?.disappearing_close_at) {
      const d = new Date(sbData.settings.disappearing_close_at);
      const tzOffset = d.getTimezoneOffset() * 60000;
      currentGraceClose = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
    }
    html += `
      <div class="scrapbook-settings-row" style="display:flex;flex-direction:column;gap:.6rem;align-items:stretch">
        <div style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">
          <label style="margin:0">⏰ Upload window closes at:</label>
          <input type="datetime-local" id="sb-close-input" class="scrapbook-window-select"
                 value="${currentClose}"
                 style="padding:.35rem .6rem;border-radius:var(--r-sm)">
          <button class="btn btn-primary btn-sm" onclick="saveScrapbookSettings()">Set Window</button>
          ${sbData.settings?.upload_close_at
            ? `<button class="btn btn-ghost btn-sm" onclick="clearScrapbookWindow()" title="Remove window — disables uploads">✕ Clear</button>`
            : ''}
        </div>
        <div style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,0.05);padding-top:.6rem">
          <label style="margin:0">⏳ Grace period window closes at:</label>
          <input type="datetime-local" id="sb-grace-close-input" class="scrapbook-window-select"
                 value="${currentGraceClose}"
                 style="padding:.35rem .6rem;border-radius:var(--r-sm)">
          <button class="btn btn-primary btn-sm" onclick="saveGracePeriodWindow()">Set Grace Window</button>
          ${sbData.settings?.disappearing_close_at
            ? `<button class="btn btn-ghost btn-sm" onclick="clearGracePeriodWindow()" title="Remove grace window — immediately deletes removed items">✕ Clear</button>`
            : ''}
          <span style="font-size:.72rem;color:var(--txt3);margin-left:auto">${items.length} item${items.length !== 1 ? 's' : ''}</span>
        </div>
      </div>`;
  }

  /* ── Countdown ── (shown while window is open AND admin has set a time) */
  if (open && windowInfo.adminSet) {
    html += `<div class="scrapbook-countdown" id="sb-countdown">
      <span style="color:var(--txt3)">⏳ Upload window closes in</span>
      <span class="cd-num" id="sb-cd-h">--</span>
      <span class="cd-colon">h</span>
      <span class="cd-num" id="sb-cd-m">--</span>
      <span class="cd-colon">m</span>
      <span class="cd-num" id="sb-cd-s">--</span>
      <span class="cd-colon">s</span>
    </div>`;
  }

  /* ── Grace Period Countdown ── (shown while grace window is open) */
  const graceWindow = sbData.graceWindowInfo;
  if (graceWindow && graceWindow.open && graceWindow.adminSet) {
    html += `<div class="scrapbook-countdown grace-countdown" id="sb-grace-countdown" style="margin-top:.5rem;background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.15)">
      <span style="color:var(--txt3)">⏳ Removed media disappears in</span>
      <span class="cd-num" id="sb-grace-cd-h">--</span>
      <span class="cd-colon">h</span>
      <span class="cd-num" id="sb-grace-cd-m">--</span>
      <span class="cd-colon">m</span>
      <span class="cd-num" id="sb-grace-cd-s">--</span>
      <span class="cd-colon">s</span>
    </div>`;
  }

  /* Admin info when no close time is set yet */
  if (isAdmin && !windowInfo.adminSet) {
    html += `<div style="font-size:.78rem;color:var(--txt3);text-align:center;padding:.6rem .5rem 1rem">
      ☝️ Set an upload window close time above to allow attendees to add photos.
    </div>`;
  }

  /* ── Upload panel — only if window open AND user is checked-in ── */
  const me     = AppState.getUser();
  const myReg  = meetupData?.registered_members?.find(r => r.id == me?.id);
  const canUpload = open && (isAdmin || myReg?.status === 'checked_in');

  if (open && !canUpload) {
    html += `<div style="font-size:.78rem;color:var(--txt3);text-align:center;padding:.5rem .5rem 1rem;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:var(--r-md);margin-bottom:1rem">
      ℹ️ Only checked-in attendees can add to the scrapbook.
    </div>`;
  }

  if (canUpload) {
    html += `
      <div class="scrapbook-upload-panel" id="sb-upload-panel">
        <!-- Drop zone -->
        <div class="scrapbook-drop-zone" id="sb-drop-zone"
             onclick="document.getElementById('sb-file-input').click()"
             ondragover="event.preventDefault();this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="sbHandleDrop(event)">
          <div class="dz-icon">📷🎬</div>
          <div class="dz-text">Drop a photo, GIF, or short video here</div>
          <div class="dz-sub">or click to browse · max 50 MB · JPEG, PNG, GIF, WebP, MP4, WebM, MOV</div>
          <div class="dz-filename" id="sb-filename"></div>
        </div>
        <input type="file" id="sb-file-input" accept="image/*,image/gif,video/mp4,video/webm,video/quicktime" style="display:none" onchange="sbHandleFile(this.files[0])">

        <!-- Caption -->
        <div class="form-group" style="margin-bottom:.75rem">
          <input type="text" id="sb-caption" class="form-control" maxlength="300"
                 placeholder="Add a caption… (optional)" style="font-size:.83rem">
        </div>

        <!-- Upload button -->
        <button class="btn btn-primary btn-full" id="sb-upload-btn" onclick="submitScrapbookUpload()">
          📸 Add to Scrapbook
        </button>
      </div>`;
  }

  /* ── Gallery ── */
  const visible = isAdmin ? items : items.filter(i => {
    if (i.status !== 'removed') return true;
    if (i.disappear_at && new Date(i.disappear_at) > new Date()) return true;
    return false;
  });
  if (!visible.length) {
    html += `
      <div class="scrapbook-empty">
        <div class="scrapbook-empty-icon">🖼️</div>
        <div class="scrapbook-empty-title">No memories yet</div>
        <div class="scrapbook-empty-sub">${open ? 'Be the first to add a photo or video!' : 'The upload window has closed.'}</div>
      </div>`;
  } else {
    const photos = visible.filter(i => i.media_type !== 'video');
    const videos = visible.filter(i => i.media_type === 'video');

    // Side-by-side subheader tabs
    html += `
      <div class="scrapbook-tabs">
        <div class="scrapbook-tab ${sbActiveTab === 'photos' ? 'active' : ''}" onclick="switchScrapbookTab('photos')">
          📸 Photos (${photos.length})
        </div>
        <div class="scrapbook-tab ${sbActiveTab === 'videos' ? 'active' : ''}" onclick="switchScrapbookTab('videos')">
          🎥 Videos (${videos.length})
        </div>
      </div>
    `;

    // Photos Container
    html += `<div id="sb-photos-container" class="sb-tab-content" style="display: ${sbActiveTab === 'photos' ? 'block' : 'none'}">`;
    if (photos.length === 0) {
      html += `<div class="scrapbook-section-empty">No photos shared yet.</div>`;
    } else {
      html += `<div class="scrapbook-grid" id="sb-photos-grid">` + photos.map(item => sbTileHTML(item, isAdmin)).join('') + `</div>`;
    }
    html += `</div>`;

    // Videos Container
    html += `<div id="sb-videos-container" class="sb-tab-content" style="display: ${sbActiveTab === 'videos' ? 'block' : 'none'}">`;
    if (videos.length === 0) {
      html += `<div class="scrapbook-section-empty">No videos shared yet.</div>`;
    } else {
      html += `<div class="scrapbook-grid" id="sb-videos-grid">` + videos.map(item => sbTileHTML(item, isAdmin)).join('') + `</div>`;
    }
    html += `</div>`;
  }

  body.innerHTML = html;

  /* Start countdowns if windows are open */
  startWindowCountdowns(
    open && windowInfo.adminSet ? closeAt : null,
    graceWindow && graceWindow.open && graceWindow.adminSet ? graceWindow.closeAt : null
  );

  /* Start individual tile countdowns if there are disappearing items */
  startTileCountdowns();
}

function switchScrapbookTab(tab) {
  if (tab !== 'photos' && tab !== 'videos') return;
  sbActiveTab = tab;

  // Toggle active tab header classes
  const tabs = document.querySelectorAll('.scrapbook-tab');
  tabs.forEach(t => t.classList.remove('active'));
  const activeIdx = tab === 'photos' ? 0 : 1;
  if (tabs[activeIdx]) tabs[activeIdx].classList.add('active');

  // Toggle grid container visibility
  const photosCont = document.getElementById('sb-photos-container');
  const videosCont = document.getElementById('sb-videos-container');
  if (photosCont) photosCont.style.display = tab === 'photos' ? 'block' : 'none';
  if (videosCont) videosCont.style.display = tab === 'videos' ? 'block' : 'none';
}

/* ── Single tile HTML ────────────────────────────────────────── */
function sbTileHTML(item, isAdmin) {
  const isSticker = item.media_type === 'sticker';
  const isVideo   = item.media_type === 'video';
  const isRemoved = item.status === 'removed';
  let inner = '';

  if (isSticker) {
    inner = `<span class="sticker-emoji">${esc(item.file_path)}</span>`;
  } else if (isVideo) {
    inner = `
      <video class="scrapbook-tile-video" src="${esc(item.file_path)}"
             muted playsinline loop preload="metadata"
             onmouseenter="this.play()" onmouseleave="this.pause();this.currentTime=0"></video>
      <span class="scrapbook-video-play-badge">▶</span>`;
  } else {
    inner = `<img src="${esc(item.file_path)}" alt="Scrapbook photo" loading="lazy">`;
  }

  const overlay = `
    <div class="scrapbook-tile-overlay">
      <div class="scrapbook-tile-uploader">${isVideo ? '🎬' : '📷'} ${esc(item.uploader_name)}</div>
      ${item.caption ? `<div class="scrapbook-tile-caption">${esc(item.caption)}</div>` : ''}
    </div>`;

  const adminActions = isAdmin ? `
    <div class="scrapbook-admin-actions">
      <button class="scrapbook-admin-btn keep"   title="Keep permanently"
              onclick="event.stopPropagation();adminCurateItem(${item.id},'kept')">✅</button>
      <button class="scrapbook-admin-btn remove" title="Remove from gallery"
              onclick="event.stopPropagation();adminCurateItem(${item.id},'removed')">🗑</button>
    </div>` : '';

  const ribbon = (isAdmin && item.status !== 'pending') ? `
    <span class="scrapbook-status-ribbon ${item.status}">${item.status === 'kept' ? '✓ Kept' : '✗ Removed'}</span>` : '';

  const isDisappearing = item.status === 'removed' && item.disappear_at && new Date(item.disappear_at) > new Date();
  let disappearBadge = '';
  if (isDisappearing) {
    const adminClass = isAdmin ? 'admin-disappear' : '';
    disappearBadge = `<span class="scrapbook-disappear-badge ${adminClass}" data-disappear-at="${item.disappear_at}">⏳ --</span>`;
  }

  return `
    <div class="scrapbook-tile ${isSticker ? 'sticker-tile' : ''} ${isVideo ? 'video-tile' : ''} ${isRemoved ? 'removed-tile' : ''}"
         onclick="openScrapbookPreview(${item.id})"
         data-item-id="${item.id}">
      ${inner}
      ${overlay}
      ${adminActions}
      ${ribbon}
      ${disappearBadge}
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   UPLOAD LOGIC
═══════════════════════════════════════════════════════════════ */
function sbHandleDrop(e) {
  e.preventDefault();
  document.getElementById('sb-drop-zone')?.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (file) sbHandleFile(file);
}

function sbHandleFile(file) {
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) { toast('File too large (max 50 MB)', 'err'); return; }
  sbSelectedFile    = file;
  const dz = document.getElementById('sb-drop-zone');
  if (dz) {
    dz.classList.add('has-file');
    const fn = document.getElementById('sb-filename');
    const isVideo = file.type.startsWith('video/');
    if (fn) fn.textContent = `${isVideo ? '🎬' : '✅'} ${file.name}`;
  }
}

async function submitScrapbookUpload() {
  if (!sbSelectedFile) {
    toast('Please pick a photo, GIF, or video first.', 'err'); return;
  }
  const btn     = document.getElementById('sb-upload-btn');
  const caption = document.getElementById('sb-caption')?.value.trim() || '';
  setBtn(btn, true);

  try {
    const fd = new FormData();
    fd.append('file', sbSelectedFile);
    fd.append('caption', caption);
    const mt = sbSelectedFile.type.startsWith('video/') ? 'video'
             : sbSelectedFile.type === 'image/gif'      ? 'gif' : 'photo';
    fd.append('media_type', mt);
    await apiFetch(`/scrapbook/${meetupId}/upload`, { method: 'POST', body: fd });
    toast('✨ Added to the scrapbook!', 'ok');
    sbSelectedFile = null;
    await loadScrapbook();
  } catch (err) {
    toast(err.message, 'err');
    setBtn(btn, false);
  }
}

/* ══════════════════════════════════════════════════════════════
   ADMIN CURATION
═══════════════════════════════════════════════════════════════ */
async function adminCurateItem(itemId, status) {
  if (status === 'removed') {
    const graceWindow = sbData.graceWindowInfo;
    const confirmMsg = graceWindow && graceWindow.open
      ? `Remove this item? Standard attendees will still see it until the grace period window closes (${new Date(graceWindow.closeAt).toLocaleString()}).`
      : 'Remove this item? It will be permanently deleted from everywhere immediately.';
    if (!confirm(confirmMsg)) return;
  }
  try {
    const res = await apiFetch(`/scrapbook/${meetupId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    if (res.deleted) {
      toast('🗑 Item permanently deleted from everywhere', 'info');
    } else {
      toast(status === 'kept' ? '✅ Item marked as kept' : '🗑 Item marked as removed', status === 'kept' ? 'ok' : 'info');
    }
    await loadScrapbook();
  } catch (err) { toast(err.message, 'err'); }
}

async function saveScrapbookSettings() {
  const input = document.getElementById('sb-close-input');
  if (!input || !input.value) { toast('Please pick a close date & time first.', 'err'); return; }
  const closeAt = new Date(input.value).toISOString();
  try {
    await apiFetch(`/scrapbook/${meetupId}/settings`, {
      method: 'PUT',
      body: JSON.stringify({
        upload_close_at: closeAt,
        disappearing_close_at: sbData.settings?.disappearing_close_at || null
      })
    });
    toast('⏰ Upload window saved!', 'ok');
    await loadScrapbook();
  } catch (err) { toast(err.message, 'err'); }
}

async function clearScrapbookWindow() {
  if (!confirm('Clear the upload window? Attendees will no longer be able to upload.')) return;
  try {
    await apiFetch(`/scrapbook/${meetupId}/settings`, {
      method: 'PUT',
      body: JSON.stringify({
        upload_close_at: null,
        disappearing_close_at: sbData.settings?.disappearing_close_at || null
      })
    });
    toast('Upload window cleared.', 'info');
    await loadScrapbook();
  } catch (err) { toast(err.message, 'err'); }
}

async function saveGracePeriodWindow() {
  const input = document.getElementById('sb-grace-close-input');
  if (!input || !input.value) { toast('Please pick a date & time first.', 'err'); return; }
  const closeAt = new Date(input.value).toISOString();
  try {
    await apiFetch(`/scrapbook/${meetupId}/settings`, {
      method: 'PUT',
      body: JSON.stringify({
        upload_close_at: sbData.settings?.upload_close_at || null,
        disappearing_close_at: closeAt
      })
    });
    toast('⏳ Grace period window saved!', 'ok');
    await loadScrapbook();
  } catch (err) { toast(err.message, 'err'); }
}

async function clearGracePeriodWindow() {
  if (!confirm('Clear grace window? Removed media will be deleted immediately.')) return;
  try {
    await apiFetch(`/scrapbook/${meetupId}/settings`, {
      method: 'PUT',
      body: JSON.stringify({
        upload_close_at: sbData.settings?.upload_close_at || null,
        disappearing_close_at: null
      })
    });
    toast('Grace window cleared.', 'info');
    await loadScrapbook();
  } catch (err) { toast(err.message, 'err'); }
}

/* ══════════════════════════════════════════════════════════════
   PREVIEW MODAL
═══════════════════════════════════════════════════════════════ */
function openScrapbookPreview(itemId) {
  if (!sbData) return;
  const item = sbData.items.find(i => i.id === itemId);
  if (!item) return;

  const overlay  = document.getElementById('scrapbook-preview-overlay');
  const img      = document.getElementById('scrapbook-preview-img');
  const vid      = document.getElementById('scrapbook-preview-video');
  const sticker  = document.getElementById('scrapbook-preview-sticker');
  const cap      = document.getElementById('scrapbook-preview-caption');
  const meta     = document.getElementById('scrapbook-preview-meta');

  /* Reset all */
  img.style.display = vid.style.display = sticker.style.display = 'none';
  vid.pause && vid.pause();
  vid.src = '';

  if (item.media_type === 'sticker') {
    sticker.style.display = 'block';
    sticker.textContent   = item.file_path;
  } else if (item.media_type === 'video') {
    vid.style.display = 'block';
    vid.src           = item.file_path;
    vid.controls      = true;
    vid.play().catch(() => {});
  } else {
    img.style.display = 'block';
    img.src           = item.file_path;
    img.alt           = item.caption || 'Scrapbook photo';
  }

  cap.textContent  = item.caption || '';
  meta.textContent = `by ${item.uploader_name} · ${new Date(item.uploaded_at).toLocaleString()}`;
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeScrapbookPreview() {
  const vid = document.getElementById('scrapbook-preview-video');
  if (vid) { vid.pause(); vid.src = ''; }
  document.getElementById('scrapbook-preview-overlay')?.classList.remove('active');
  document.body.style.overflow = '';
}

/* Keyboard close */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeScrapbookPreview();
});

/* ══════════════════════════════════════════════════════════════
   COUNTDOWN TIMER
═══════════════════════════════════════════════════════════════ */
function startWindowCountdowns(closeAtISO, graceCloseAtISO) {
  if (window.sbCountdownsInterval) clearInterval(window.sbCountdownsInterval);

  const tick = () => {
    const now = new Date();

    // 1. Upload Close countdown
    if (closeAtISO) {
      const diff = new Date(closeAtISO) - now;
      const cd = document.getElementById('sb-countdown');
      if (diff <= 0) {
        if (cd) cd.innerHTML = '<span style="color:var(--err)">Upload window has closed</span>';
        renderScrapbookBadge();
      } else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        const pad = n => String(n).padStart(2, '0');
        const hEl = document.getElementById('sb-cd-h');
        const mEl = document.getElementById('sb-cd-m');
        const sEl = document.getElementById('sb-cd-s');
        if (hEl) hEl.textContent = pad(h);
        if (mEl) mEl.textContent = pad(m);
        if (sEl) sEl.textContent = pad(s);
      }
    }

    // 2. Grace Period Close countdown
    if (graceCloseAtISO) {
      const diff = new Date(graceCloseAtISO) - now;
      const gcd = document.getElementById('sb-grace-countdown');
      if (diff <= 0) {
        if (gcd) gcd.innerHTML = '<span style="color:var(--err)">Grace window has expired</span>';
      } else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        const pad = n => String(n).padStart(2, '0');
        const hEl = document.getElementById('sb-grace-cd-h');
        const mEl = document.getElementById('sb-grace-cd-m');
        const sEl = document.getElementById('sb-grace-cd-s');
        if (hEl) hEl.textContent = pad(h);
        if (mEl) mEl.textContent = pad(m);
        if (sEl) sEl.textContent = pad(s);
      }
    }
  };

  tick();
  window.sbCountdownsInterval = setInterval(tick, 1000);
}



function startTileCountdowns() {
  if (window.sbTileCountdownInterval) clearInterval(window.sbTileCountdownInterval);

  const updateCountdowns = () => {
    const badges = document.querySelectorAll('.scrapbook-disappear-badge');
    if (badges.length === 0) {
      clearInterval(window.sbTileCountdownInterval);
      window.sbTileCountdownInterval = null;
      return;
    }

    const now = new Date();
    let expiredAny = false;
    badges.forEach(badge => {
      const disappearAtStr = badge.getAttribute('data-disappear-at');
      if (!disappearAtStr) return;
      const disappearAt = new Date(disappearAtStr);
      const diff = disappearAt - now;

      if (diff <= 0) {
        badge.textContent = 'Expired';
        expiredAny = true;
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        badge.textContent = `⏳ ${mins}m ${secs}s left`;
      }
    });

    if (expiredAny) {
      // Refresh the page data if any timer has run out
      loadScrapbook();
    }
  };

  updateCountdowns();
  window.sbTileCountdownInterval = setInterval(updateCountdowns, 1000);
}
