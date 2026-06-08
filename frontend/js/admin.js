document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'create')    initCreatePage();
  if (page === 'analytics') initAnalyticsPage();
});

/* ══════════════════════════════════════════════════════════════════
   CREATE / EDIT MEETUP
═══════════════════════════════════════════════════════════════════ */
function initCreatePage() {
  if (!requireAdmin()) return;
  setupNav();

  const editId = new URLSearchParams(window.location.search).get('edit');
  if (editId) prefillForm(editId);

  initBannerUpload();
  initMeetupForm(editId);
}

async function prefillForm(id) {
  try {
    const m = await apiFetch(`/meetups/${id}`);
    document.getElementById('page-title').textContent   = 'Edit Meetup';
    document.getElementById('submit-btn').textContent   = '💾 Update Meetup';
    document.getElementById('f-title').value       = m.title || '';
    document.getElementById('f-desc').value        = m.description || '';
    document.getElementById('f-date').value        = m.date || '';
    document.getElementById('f-start').value       = m.start_time || '';
    document.getElementById('f-end').value         = m.end_time || '';
    document.getElementById('f-venue').value       = m.venue_name || '';
    document.getElementById('f-maps').value        = m.google_maps_link || '';
    document.getElementById('f-cap').value         = m.capacity_limit || '';
    document.getElementById('f-deadline').value    = m.registration_deadline ? m.registration_deadline.slice(0,16) : '';
    if (m.banner) {
      document.getElementById('banner-preview').innerHTML =
        `<img src="${esc(m.banner)}" style="max-width:100%;max-height:180px;border-radius:8px;object-fit:cover">`;
      document.getElementById('banner-area').classList.add('has-file');
    }
  } catch (err) { toast(err.message, 'err'); }
}

function initBannerUpload() {
  const input = document.getElementById('banner-input');
  const area  = document.getElementById('banner-area');

  area.addEventListener('click', () => input.click());
  area.addEventListener('dragover',  e => { e.preventDefault(); area.style.borderColor = 'var(--a1)'; });
  area.addEventListener('dragleave', () => area.style.borderColor = '');
  area.addEventListener('drop', e => {
    e.preventDefault(); area.style.borderColor = '';
    const f = e.dataTransfer.files[0];
    if (f) previewBanner(f);
  });
  input.addEventListener('change', e => { if (e.target.files[0]) previewBanner(e.target.files[0]); });
}

function previewBanner(file) {
  if (!file.type.startsWith('image/')) { toast('Please select an image file', 'err'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('banner-preview').innerHTML =
      `<img src="${e.target.result}" style="max-width:100%;max-height:200px;border-radius:8px;object-fit:cover">`;
    document.getElementById('banner-area').classList.add('has-file');
  };
  reader.readAsDataURL(file);
}

function initMeetupForm(editId) {
  document.getElementById('meetup-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    setBtn(btn, true);

    const fd = new FormData();
    fd.append('title',                 document.getElementById('f-title').value);
    fd.append('description',           document.getElementById('f-desc').value);
    fd.append('date',                  document.getElementById('f-date').value);
    fd.append('start_time',            document.getElementById('f-start').value);
    fd.append('end_time',              document.getElementById('f-end').value);
    fd.append('venue_name',            document.getElementById('f-venue').value);
    fd.append('google_maps_link',      document.getElementById('f-maps').value);
    fd.append('capacity_limit',        document.getElementById('f-cap').value);
    fd.append('registration_deadline', document.getElementById('f-deadline').value);

    const bannerFile = document.getElementById('banner-input').files[0];
    if (bannerFile) fd.append('banner', bannerFile);

    try {
      const url    = editId ? `/api/meetups/${editId}` : '/api/meetups';
      const method = editId ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method, headers: { Authorization: `Bearer ${AppState.getToken()}` }, body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      toast(editId ? '✅ Meetup updated!' : '🎉 Meetup created!', 'ok');
      setTimeout(() => window.location.href = `/meetup.html?id=${data.id}`, 1100);
    } catch (err) {
      toast(err.message, 'err');
      setBtn(btn, false, editId ? '💾 Update Meetup' : '✨ Create Meetup');
    }
  });
}

/* ══════════════════════════════════════════════════════════════════
   ANALYTICS
═══════════════════════════════════════════════════════════════════ */
async function initAnalyticsPage() {
  if (!requireAdmin()) return;
  setupNav();

  const meetupId = new URLSearchParams(window.location.search).get('id');
  if (!meetupId) { window.location.href = '/dashboard.html'; return; }

  try {
    const d = await apiFetch(`/meetups/${meetupId}/analytics`);
    document.getElementById('analytics-title').textContent = d.meetup_title;

    document.getElementById('s-reg').textContent  = d.total_registrations;
    document.getElementById('s-cin').textContent  = d.total_checkins;
    document.getElementById('s-pct').textContent  = d.attendance_percentage + '%';
    document.getElementById('s-cap').textContent  = d.capacity_limit;

    /* Most active */
    const activEl = document.getElementById('active-list');
    activEl.innerHTML = d.most_active_members.length
      ? d.most_active_members.map(m => `
          <div class="attendee-item" style="cursor:default">
            <div class="a-avatar">${initials(m.name)}</div>
            <div class="a-info">
              <div class="a-name">${esc(m.name)}</div>
              <div class="a-meta">${esc(m.profession || '')}${m.company ? ' @ ' + esc(m.company) : ''}</div>
            </div>
            <span class="badge badge-purple">${m.meetups_attended}</span>
          </div>`).join('')
      : `<div class="empty-state"><div class="empty-icon">🏆</div><div class="empty-title">No check-in data yet</div></div>`;

    /* History table */
    document.getElementById('history-body').innerHTML = d.meetup_history.map(h => `
      <tr>
        <td><a href="/meetup.html?id=${h.id}" style="color:var(--a1);text-decoration:none">${esc(h.title)}</a></td>
        <td>${fmtDate(h.date)}</td>
        <td>${h.registrations}</td>
        <td>${h.checkins}</td>
        <td>${h.registrations > 0 ? ((h.checkins/h.registrations)*100).toFixed(1) + '%' : '0%'}</td>
      </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--txt3);padding:2rem">No history yet</td></tr>`;

    /* Export buttons */
    document.getElementById('exp-att').onclick  = () => exportCSV(meetupId, 'attendees');
    document.getElementById('exp-resp').onclick = () => exportCSV(meetupId, 'responses');

  } catch (err) { toast(err.message, 'err'); }
}

async function exportCSV(meetupId, type) {
  try {
    const res = await fetch(`/api/meetups/${meetupId}/export/${type}`, {
      headers: { Authorization: `Bearer ${AppState.getToken()}` }
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${type}_meetup_${meetupId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`📥 ${type === 'attendees' ? 'Attendees' : 'Responses'} exported!`, 'ok');
  } catch (err) { toast(err.message, 'err'); }
}
