document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  setupNav();
  await loadMeetups();
});

async function loadMeetups() {
  const grid    = document.getElementById('meetup-grid');
  const loading = document.getElementById('loading');

  try {
    const meetups = await apiFetch('/meetups');
    if (loading) loading.style.display = 'none';

    if (!meetups?.length) {
      grid.innerHTML = emptyState('📅', 'No meetups yet', 'Check back later for upcoming events.');
      return;
    }
    grid.innerHTML = meetups.map((m, i) => meetupCard(m, i)).join('');
  } catch (err) {
    if (loading) loading.style.display = 'none';
    grid.innerHTML = emptyState('⚠️', 'Could not load meetups', err.message);
  }
}

function meetupCard(m, i) {
  const now      = new Date();
  const start    = new Date(`${m.date}T${m.start_time}`);
  const end      = new Date(`${m.date}T${m.end_time}`);
  const deadline = new Date(m.registration_deadline);
  const isFull   = m.total_registered >= m.capacity_limit;
  const isPast   = now > end;

  let badge = '';
  if (isPast)           badge = '<span class="badge badge-gray">Past</span>';
  else if (isFull)      badge = '<span class="badge badge-red">Full</span>';
  else if (now > deadline) badge = '<span class="badge badge-yellow">Closed</span>';
  else                  badge = '<span class="badge badge-green">Open</span>';

  const banner = m.banner
    ? `<img src="${esc(m.banner)}" alt="${esc(m.title)}" class="meetup-img" loading="lazy">`
    : `<div class="meetup-img-placeholder">🎯</div>`;

  return `
    <a href="/meetup.html?id=${m.id}" class="meetup-card fade-up" style="animation-delay:${i * 0.06}s">
      ${banner}
      <div class="meetup-card-body">
        <div class="meetup-date-chip">📅 ${fmtDate(m.date)} &bull; ${fmtTime(m.start_time)}</div>
        <div class="meetup-card-title">${esc(m.title)}</div>
        <div class="meetup-venue">📍 ${esc(m.venue_name)}</div>
        <div class="meetup-card-footer">
          <div style="display:flex;gap:.5rem;align-items:center">${badge}</div>
          <div style="display:flex;gap:.9rem">
            <span class="card-stat">👥 ${m.total_registered}/${m.capacity_limit}</span>
            <span class="card-stat">✅ ${m.total_checkins}</span>
          </div>
        </div>
      </div>
    </a>`;
}

function emptyState(icon, title, sub) {
  return `<div class="empty-state" style="grid-column:1/-1">
    <div class="empty-icon">${icon}</div>
    <div class="empty-title">${esc(title)}</div>
    <div class="empty-sub">${esc(sub)}</div>
  </div>`;
}
