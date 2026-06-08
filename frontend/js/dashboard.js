/* ═══════════════════════════════════════════════════════════════
   Dashboard – Converge
   Handles: communities, meetup filter tabs, connection suggestions
═══════════════════════════════════════════════════════════════ */

let allMeetups      = [];
let allCommunities  = [];
let activeFilter    = 'all';
let activeCat       = 'All';
let commVisible     = true;
let suggestVisible  = true;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  setupNav();
  await Promise.all([loadCommunities(), loadMeetups(), loadSuggestions()]);
});

/* ══════════════════════════════════════════════════════════════
   COMMUNITIES
══════════════════════════════════════════════════════════════ */
async function loadCommunities() {
  try {
    allCommunities = await apiFetch('/communities') || [];
    renderCommunities();
  } catch {
    document.getElementById('community-grid').innerHTML =
      `<div style="grid-column:1/-1;color:var(--txt3);font-size:.85rem;padding:1rem">
         Could not load communities.
       </div>`;
  }
}

function filterCommunities(cat) {
  activeCat = cat;
  document.querySelectorAll('.cat-pill').forEach(p =>
    p.classList.toggle('active', p.dataset.cat === cat));
  renderCommunities();
}

function renderCommunities() {
  const grid = document.getElementById('community-grid');
  let list = allCommunities;

  if (activeCat === 'joined') {
    list = list.filter(c => c.is_joined);
  } else if (activeCat !== 'All') {
    list = list.filter(c => c.category === activeCat);
  }

  if (!list.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--txt3)">
      <div style="font-size:1.8rem;margin-bottom:.5rem">🏘️</div>
      <div style="font-size:.88rem;font-weight:600;color:var(--txt2)">No communities in this category</div>
      ${activeCat === 'joined' ? '<div style="font-size:.78rem;margin-top:.3rem">Join a community below!</div>' : ''}
    </div>`;
    return;
  }

  grid.innerHTML = list.map((c, i) => communityCard(c, i)).join('');
}

function communityCard(c, i) {
  const joined = !!c.is_joined;
  const memberTxt = c.member_count === 1 ? '1 member' : `${c.member_count} members`;

  return `
    <div class="community-card ${joined ? 'joined' : ''} fade-up"
         style="animation-delay:${i * 0.04}s" id="comm-card-${c.id}">
      <div class="comm-top">
        <div class="comm-icon">${esc(c.icon)}</div>
        <div class="comm-info">
          <div class="comm-name">${esc(c.name)}</div>
          <div class="comm-cat">${esc(c.category)}</div>
        </div>
      </div>
      <div class="comm-desc">${esc(c.description)}</div>
      <div class="comm-footer">
        <span class="comm-members">👥 ${memberTxt}</span>
        ${joined
          ? `<button class="btn btn-ghost btn-sm" style="font-size:.72rem"
                     onclick="leaveComm(${c.id}, this)">✓ Joined</button>`
          : `<button class="btn btn-primary btn-sm" style="font-size:.72rem"
                     onclick="joinComm(${c.id}, this)">+ Join</button>`}
      </div>
    </div>`;
}

async function joinComm(id, btn) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:11px;height:11px;border-width:1.5px"></span>';
  try {
    const res = await apiFetch(`/communities/${id}/join`, { method: 'POST' });
    // Update local data
    const c = allCommunities.find(x => x.id === id);
    if (c) { c.is_joined = 1; c.member_count = res.community.member_count; }
    renderCommunities();
    toast(`🎉 Joined ${res.community.name}!`, 'ok');
  } catch (err) {
    toast(err.message, 'err');
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

async function leaveComm(id, btn) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:11px;height:11px;border-width:1.5px"></span>';
  try {
    const res = await apiFetch(`/communities/${id}/leave`, { method: 'DELETE' });
    const c = allCommunities.find(x => x.id === id);
    if (c) { c.is_joined = 0; c.member_count = res.community.member_count; }
    renderCommunities();
    toast('Left community', 'info');
  } catch (err) {
    toast(err.message, 'err');
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

function toggleCommunities() {
  commVisible = !commVisible;
  const grid   = document.getElementById('community-grid');
  const cats   = document.getElementById('cat-strip');
  const toggle = document.getElementById('comm-toggle');
  [grid, cats].forEach(el => { if (el) el.style.display = commVisible ? '' : 'none'; });
  if (toggle) toggle.textContent = commVisible ? 'Hide' : 'Show';
}

/* ══════════════════════════════════════════════════════════════
   MEETUPS
══════════════════════════════════════════════════════════════ */
function setFilter(f) {
  activeFilter = f;
  document.querySelectorAll('.filter-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.filter === f));
  renderGrid();
}

function applyFilter(meetups, f) {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);
  switch (f) {
    case 'upcoming': return meetups.filter(m => new Date(`${m.date}T${m.start_time}`) > now);
    case 'today':    return meetups.filter(m => m.date === today);
    case 'past':     return meetups.filter(m => new Date(`${m.date}T${m.end_time}`) < now);
    default:         return meetups;
  }
}

async function loadMeetups() {
  const grid    = document.getElementById('meetup-grid');
  const loading = document.getElementById('loading');
  try {
    allMeetups = await apiFetch('/meetups') || [];
    if (loading) loading.style.display = 'none';
    renderGrid();
  } catch (err) {
    if (loading) loading.style.display = 'none';
    grid.innerHTML = emptyState('⚠️', 'Could not load meetups', err.message);
  }
}

function renderGrid() {
  const grid     = document.getElementById('meetup-grid');
  const countLbl = document.getElementById('count-label');
  const filtered = applyFilter(allMeetups, activeFilter);

  if (countLbl) {
    countLbl.innerHTML = `Showing <strong>${filtered.length}</strong> of ${allMeetups.length}`;
  }

  if (!filtered.length) {
    const msgs = {
      all:      ['📅', 'No meetups yet',        'Check back soon!'],
      upcoming: ['📅', 'No upcoming meetups',   'All current events are in the past.'],
      today:    ['🔥', 'Nothing happening today','Check upcoming events for future meetups.'],
      past:     ['🕐', 'No past meetups',        'Your history will appear here.']
    };
    const [icon, title, sub] = msgs[activeFilter] || msgs.all;
    grid.innerHTML = emptyState(icon, title, sub);
    return;
  }
  grid.innerHTML = filtered.map((m, i) => meetupCard(m, i)).join('');
}

function meetupCard(m, i) {
  const now      = new Date();
  const start    = new Date(`${m.date}T${m.start_time}`);
  const end      = new Date(`${m.date}T${m.end_time}`);
  const deadline = new Date(m.registration_deadline);
  const isFull   = m.total_registered >= m.capacity_limit;
  const isPast   = now > end;
  const isLive   = now >= start && now <= end;

  let badge = '';
  if (isLive)             badge = '<span class="badge badge-green" style="animation:pulseGlow 1.5s infinite">🔴 Live</span>';
  else if (isPast)        badge = '<span class="badge badge-gray">Past</span>';
  else if (isFull)        badge = '<span class="badge badge-red">Full</span>';
  else if (now > deadline) badge = '<span class="badge badge-yellow">Closed</span>';
  else                    badge = '<span class="badge badge-green">Open</span>';

  const banner = m.banner
    ? `<img src="${esc(m.banner)}" alt="${esc(m.title)}" class="meetup-img" loading="lazy">`
    : `<div class="meetup-img-placeholder">🎯</div>`;

  return `
    <a href="/meetup.html?id=${m.id}" class="meetup-card fade-up" style="animation-delay:${i * 0.05}s">
      ${banner}
      <div class="meetup-card-body">
        <div class="meetup-date-chip">📅 ${fmtDate(m.date)} &bull; ${fmtTime(m.start_time)}</div>
        <div class="meetup-card-title">${esc(m.title)}</div>
        <div class="meetup-venue">📍 ${esc(m.venue_name)}</div>
        <div class="meetup-card-footer">
          <div style="display:flex;gap:.4rem">${badge}</div>
          <div style="display:flex;gap:.85rem">
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

/* ══════════════════════════════════════════════════════════════
   PEOPLE SUGGESTIONS  (bottom)
══════════════════════════════════════════════════════════════ */
async function loadSuggestions() {
  const sec    = document.getElementById('suggestions-section');
  const scroll = document.getElementById('people-scroll');
  if (!sec || !scroll) return;
  try {
    const people = await apiFetch('/networking/suggestions');
    if (!people?.length) { sec.style.display = 'none'; return; }
    sec.style.display = 'block';
    scroll.innerHTML  = people.map(p => personCard(p)).join('');
  } catch {
    sec.style.display = 'none';
  }
}

function personCard(p) {
  const av   = p.profile_picture
    ? `<img src="${esc(p.profile_picture)}" alt="${esc(p.name)}">`
    : initials(p.name);
  const meta = [p.profession, p.company].filter(Boolean).join(' @ ');
  return `
    <div class="person-card">
      <div class="person-av">${av}</div>
      <div class="person-name" title="${esc(p.name)}">${esc(p.name)}</div>
      <div class="person-meta" title="${esc(meta)}">${esc(meta) || 'Community member'}</div>
      ${p.looking_for
        ? `<div style="font-size:.62rem;color:var(--a1);margin-bottom:.65rem;overflow:hidden;
                       text-overflow:ellipsis;white-space:nowrap" title="${esc(p.looking_for)}">
             🔍 ${esc(p.looking_for)}
           </div>`
        : ''}
      <button class="btn btn-outline btn-sm btn-full"
              style="font-size:.7rem;padding:.32rem 0"
              onclick="quickConnect(${p.id}, this)">
        🤝 Connect
      </button>
    </div>`;
}

async function quickConnect(uid, btn) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span>';
  try {
    await apiFetch('/networking/connections/request', {
      method: 'POST', body: JSON.stringify({ receiver_id: uid })
    });
    btn.innerHTML = '✅ Sent';
    btn.className = 'btn btn-success btn-sm btn-full';
    btn.style.fontSize = '.7rem';
    toast('🤝 Connection request sent!', 'ok');
  } catch (err) {
    toast(err.message, 'err');
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

function toggleSuggestions() {
  suggestVisible = !suggestVisible;
  const scroll = document.getElementById('people-scroll');
  const toggle = document.getElementById('suggest-toggle');
  if (scroll) scroll.style.display = suggestVisible ? 'flex' : 'none';
  if (toggle) toggle.textContent   = suggestVisible ? 'Hide' : 'Show';
}
