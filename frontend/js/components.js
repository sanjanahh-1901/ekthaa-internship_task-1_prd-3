/**
 * components.js — Global UI components loaded on every page
 *  1. App Theme toggle  (Dark / Light / System)
 *  2. MeetBot AI Chatbot (rule-based, pulls live API data)
 *
 * Depends on api.js being loaded first.
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════════
     1.  T H E M E
  ══════════════════════════════════════════════════════════════════════════════ */
  const THEMES = ['dark', 'light', 'system'];
  const T_ICON  = { dark: '🌙', light: '🌤️', system: '💻' };
  const T_LABEL = { dark: 'Dark', light: 'Light', system: 'System' };

  function resolvedTheme(pref) {
    if (pref !== 'system') return pref;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(pref) {
    document.documentElement.setAttribute('data-theme', resolvedTheme(pref));
  }

  function currentPref() {
    return localStorage.getItem('meetup-theme') || 'dark';
  }

  function cycleTheme() {
    const next = THEMES[(THEMES.indexOf(currentPref()) + 1) % THEMES.length];
    localStorage.setItem('meetup-theme', next);
    applyTheme(next);
    updateThemeBtn(next);
    if (typeof toast === 'function') toast(`${T_ICON[next]} ${T_LABEL[next]} mode`, 'info');
  }

  function updateThemeBtn(pref) {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    btn.textContent = T_ICON[pref];
    btn.title = `Theme: ${T_LABEL[pref]} — click to cycle`;
  }

  function injectThemeButton() {
    const navRight = document.querySelector('.navbar-right');
    if (!navRight || document.getElementById('theme-toggle-btn')) return;

    const btn = document.createElement('button');
    btn.id        = 'theme-toggle-btn';
    btn.className = 'btn btn-ghost btn-sm';
    btn.style.cssText = 'width:36px;height:36px;padding:0;font-size:1rem;border-radius:10px;flex-shrink:0';
    btn.title     = '';
    btn.onclick   = cycleTheme;
    updateThemeBtn(currentPref());

    const userEl = document.getElementById('nav-user');
    navRight.insertBefore(btn, userEl || navRight.firstChild);
    updateThemeBtn(currentPref()); // re-set after insert
  }

  /* OS theme watcher */
  window.matchMedia('(prefers-color-scheme: light)')
    .addEventListener('change', () => { if (currentPref() === 'system') applyTheme('system'); });

  /* ═══════════════════════════════════════════════════════════════════════════
     2.  C H A T B O T
  ══════════════════════════════════════════════════════════════════════════════ */
  let chatOpen    = false;
  let chatReady   = false;

  function injectChatbot() {
    if (document.getElementById('chatbot-wrap')) return;

    document.body.insertAdjacentHTML('beforeend', `
      <div id="chatbot-wrap">

        <!-- Floating action button -->
        <button id="chatbot-fab" onclick="window.__toggleChat()" title="Chat with MeetBot">
          🤖
          <span id="chatbot-badge" style="display:none">1</span>
        </button>

        <!-- Chat panel -->
        <div id="chatbot-panel">
          <div id="chatbot-header">
            <div style="display:flex;align-items:center;gap:.65rem">
              <div id="chatbot-av">🤖</div>
              <div>
                <div style="font-weight:700;font-size:.88rem;color:var(--txt)">MeetBot</div>
                <div style="font-size:.68rem;color:var(--ok);display:flex;align-items:center;gap:.3rem">
                  <span style="width:6px;height:6px;background:var(--ok);border-radius:50%;display:inline-block"></span>
                  AI Assistant
                </div>
              </div>
            </div>
            <button class="modal-close" onclick="window.__toggleChat()">✕</button>
          </div>

          <div id="chatbot-messages"></div>

          <div id="chatbot-chips">
            <button onclick="window.__chatQ('What are upcoming events?')">📅 Upcoming</button>
            <button onclick="window.__chatQ('How do I check in?')">✅ Check-in</button>
            <button onclick="window.__chatQ('Networking tips')">🤝 Network</button>
            <button onclick="window.__chatQ('What can you do?')">💡 Help</button>
          </div>

          <div id="chatbot-footer">
            <input id="chatbot-inp" type="text" placeholder="Ask me anything…"
              onkeydown="if(event.key==='Enter'&&!event.shiftKey)window.__chatQ()">
            <button id="chatbot-send" onclick="window.__chatQ()">➤</button>
          </div>
        </div>
      </div>`);
  }

  function addMsg(html, from) {
    const box = document.getElementById('chatbot-messages');
    if (!box) return;
    const el      = document.createElement('div');
    el.className  = from === 'bot' ? 'cb-bot' : 'cb-user';
    el.innerHTML  = html;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }

  function showTyping() {
    const box = document.getElementById('chatbot-messages');
    if (!box || document.getElementById('cb-typing')) return;
    const el     = document.createElement('div');
    el.className = 'cb-bot cb-typing';
    el.id        = 'cb-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }
  function hideTyping() { document.getElementById('cb-typing')?.remove(); }

  /* ── Greeting (fires once on first open) ─────────────────────────────────── */
  function sendGreeting() {
    if (chatReady) return;
    chatReady = true;
    const u = (typeof AppState !== 'undefined') ? AppState.getUser() : null;
    addMsg(`👋 Hi <strong>${u?.name?.split(' ')[0] || 'there'}</strong>! I'm <strong>MeetBot</strong>.<br>
      I can help you find events, register, check in, and network. What can I do for you?`, 'bot');
  }

  /* ── Toggle panel ────────────────────────────────────────────────────────── */
  window.__toggleChat = function () {
    chatOpen = !chatOpen;
    const panel = document.getElementById('chatbot-panel');
    const badge = document.getElementById('chatbot-badge');
    if (panel) panel.classList.toggle('cb-open', chatOpen);
    if (badge) badge.style.display = 'none';
    if (chatOpen) sendGreeting();
  };

  /* ── Send message ────────────────────────────────────────────────────────── */
  window.__chatQ = async function (prefill) {
    const inp = document.getElementById('chatbot-inp');
    const msg = (prefill || (inp?.value ?? '')).trim();
    if (!msg) return;
    if (inp) inp.value = '';

    addMsg(esc(msg), 'user');
    showTyping();

    const delay = 550 + Math.random() * 500;
    await new Promise(r => setTimeout(r, delay));
    hideTyping();

    const reply = await buildReply(msg.toLowerCase());
    addMsg(reply, 'bot');
  };

  /* ── Reply engine ────────────────────────────────────────────────────────── */
  async function buildReply(m) {

    /* Greetings */
    if (/^(hi|hello|hey|howdy|yo\b|sup\b|good (morning|evening|afternoon|night))/.test(m)) {
      const u = (typeof AppState !== 'undefined') ? AppState.getUser() : null;
      return `Hey ${u?.name?.split(' ')[0] || 'there'}! 😊 What would you like to know?`;
    }

    /* Upcoming / events / meetups */
    if (m.includes('upcoming') || m.includes('next event') ||
        (m.includes('event') && !m.includes('what')) ||
        (m.includes('meetup') && !m.includes('hub') && !m.includes('what'))) {
      try {
        const list = await apiFetch('/meetups');
        const now  = new Date();
        const up   = list?.filter(x => new Date(`${x.date}T${x.start_time}`) > now).slice(0, 4);
        if (!up?.length)
          return `📅 No upcoming meetups right now. Check back soon, or ask an admin to create one!`;
        const rows = up.map(x =>
          `• <a href="/meetup.html?id=${x.id}" style="color:var(--a1)">${esc(x.title)}</a> — ` +
          `${new Date(x.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})} @ ${esc(x.venue_name)} ` +
          `<span style="color:var(--txt3)">(${x.total_registered}/${x.capacity_limit} spots)</span>`
        ).join('<br>');
        return `📅 <strong>${up.length} upcoming meetup(s):</strong><br><br>${rows}<br><br>` +
               `<a href="/dashboard.html" style="color:var(--a1)">View all on Dashboard →</a>`;
      } catch {
        return `📅 Head to the <a href="/dashboard.html" style="color:var(--a1)">Dashboard</a> to browse meetups!`;
      }
    }

    /* Today's events */
    if (m.includes('today') || m.includes('happening now')) {
      try {
        const list  = await apiFetch('/meetups');
        const today = new Date().toISOString().slice(0, 10);
        const todayEvt = list?.filter(x => x.date === today);
        if (!todayEvt?.length) return `📅 No meetups scheduled for today. Check the <a href="/dashboard.html" style="color:var(--a1)">Dashboard</a> for upcoming ones!`;
        const rows = todayEvt.map(x =>
          `• <a href="/meetup.html?id=${x.id}" style="color:var(--a1)">${esc(x.title)}</a> — ${fmtTime(x.start_time)}`
        ).join('<br>');
        return `🔥 <strong>Today's meetup(s):</strong><br><br>${rows}`;
      } catch {
        return `🔥 Check the <a href="/dashboard.html" style="color:var(--a1)">Dashboard</a> for today's events!`;
      }
    }

    /* Register */
    if (m.includes('register') || m.includes('sign up') || m.includes('join') || m.includes('rsvp')) {
      return `🎟️ <strong>How to register:</strong><br><br>
        1. Go to the <a href="/dashboard.html" style="color:var(--a1)">Dashboard</a><br>
        2. Click on any meetup card<br>
        3. Click <strong>"Register for this Meetup"</strong><br>
        4. Fill in 3 quick questions (why you're attending, what to learn, what you can contribute)<br>
        5. Done! You'll appear in the attendee list ✅<br><br>
        <em>Note: Registration closes at the deadline and when capacity is reached.</em>`;
    }

    /* Check-in */
    if (m.includes('check') || m.includes('checkin') || m.includes('attendance') || m.includes('attend')) {
      return `✅ <strong>How to check in:</strong><br><br>
        1. Make sure you're <strong>registered</strong> for the meetup<br>
        2. Visit the meetup page <strong>on the day of the event</strong><br>
        3. A green <em>"🟢 Meetup is Live!"</em> card appears at the start time<br>
        4. Click <strong>"Check In Now"</strong> — that's it!<br><br>
        <em>💡 The button only appears during the event window (start → end time).</em>`;
    }

    /* Networking / connect / message */
    if (m.includes('connect') || m.includes('network') || m.includes('message') ||
        m.includes('people') || m.includes('friend') || m.includes('suggest')) {
      return `🤝 <strong>Networking on Converge:</strong><br><br>
        • Open any meetup → click an attendee's name<br>
        • Tap <strong>"Connect"</strong> or <strong>"Message"</strong><br><br>
        💡 <strong>Connection Suggestions</strong> appear on the Dashboard — a curated list of people who share your profession or company!<br><br>
        <a href="/dashboard.html" style="color:var(--a1)">Go to Dashboard →</a>`;
    }

    /* Theme */
    if (m.includes('theme') || m.includes('dark mode') || m.includes('light mode') || m.includes('colour') || m.includes('color')) {
      return `🎨 Click the <strong>🌙 / 🌤️ / 💻</strong> button in the top-right corner to cycle through:<br><br>
        🌙 <strong>Dark</strong> — cosmic dark mode (default)<br>
        🌤️ <strong>Light</strong> — clean light mode<br>
        💻 <strong>System</strong> — follows your OS setting<br><br>
        Your preference is saved automatically!`;
    }

    /* Admin / create */
    if (m.includes('create') || m.includes('admin') || m.includes('organis') || m.includes('organiz') || m.includes('manage')) {
      const isAdmin = (typeof AppState !== 'undefined') && AppState.isAdmin();
      return isAdmin
        ? `⚙️ <strong>Admin tools available to you:</strong><br><br>
           • <a href="/admin-create.html" style="color:var(--a1)">✨ Create a Meetup</a><br>
           • Edit / Delete from any meetup's detail page<br>
           • <a href="/dashboard.html" style="color:var(--a1)">📊 Analytics</a> — check-in rate, CSV export<br>
           • View all registrations & form responses`
        : `⚙️ Only admins can create meetups. Contact the admin to request access.`;
    }

    /* Analytics / export */
    if (m.includes('analytic') || m.includes('stat') || m.includes('report') || m.includes('export') || m.includes('csv')) {
      const isAdmin = (typeof AppState !== 'undefined') && AppState.isAdmin();
      return isAdmin
        ? `📊 From any meetup detail page, click <strong>"📊 Analytics"</strong> to see:<br><br>
           • Total registrations & check-ins<br>
           • Attendance % with capacity info<br>
           • Most active members (all-time)<br>
           • Full meetup history table<br>
           • <strong>Export attendees / responses as CSV</strong>`
        : `📊 Analytics are admin-only. Ask your organiser for a report.`;
    }

    /* Help / features */
    if (m.includes('help') || m.includes('feature') || m.includes('what can') || m.includes('how to') || m === '?') {
      return `🤖 <strong>MeetBot can help with:</strong><br><br>
        📅 <em>"upcoming events"</em> — live meetup list<br>
        🎟️ <em>"how to register"</em> — join a meetup<br>
        ✅ <em>"how to check in"</em> — mark attendance<br>
        🤝 <em>"networking tips"</em> — connect with people<br>
        🎨 <em>"change theme"</em> — dark/light/system<br>
        📊 <em>"analytics"</em> — stats & CSV export<br><br>
        Just type naturally — I'll understand! 😊`;
    }

    /* Thanks / bye */
    if (/\b(thanks|thank you|thx|cheers|bye|goodbye|see you)\b/.test(m)) {
      return `😊 You're welcome! See you at the next meetup! 🎉`;
    }

    /* Fallback */
    const fallbacks = [
      `Hmm, I'm not sure about that. Try: <em>"upcoming events"</em>, <em>"how to register"</em>, or <em>"networking tips"</em> 🤔`,
      `I didn't quite catch that! Ask me about events, check-in, connections, or the app theme 😊`,
      `That's a tough one for me! I'm best at meetup navigation — try asking about events or registration 🤖`
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  /* ── Utility: safe HTML escape ───────────────────────────────────────────── */
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     3.  N O T I F I C A T I O N S
  ══════════════════════════════════════════════════════════════════════════════ */
  let dismissedTime = parseInt(localStorage.getItem('meetup-notif-dismissed') || '0');

  window.dismissAllNotifications = function() {
    localStorage.setItem('meetup-notif-dismissed', Date.now().toString());
    dismissedTime = Date.now();
    loadNotifications();
    if (typeof toast === 'function') toast('🔔 Notifications cleared', 'info');
  };

  window.acceptNotificationConnection = async function(connId) {
    try {
      await apiFetch(`/networking/connections/${connId}/accept`, { method: 'PUT' });
      if (typeof toast === 'function') toast('🤝 Connection request accepted!', 'ok');
      await loadNotifications();
      if (typeof reload === 'function') {
        await reload();
      }
    } catch (err) {
      if (typeof toast === 'function') toast(err.message, 'err');
    }
  };

  window.goToChat = async function(senderId) {
    try {
      const meetups = await apiFetch('/meetups');
      const me = AppState.getUser();
      // Find the first meetup where the user is registered
      const shared = meetups.find(m => {
        return m.registered_members?.some(r => r.id === me.id);
      });
      const meetupId = shared ? shared.id : 2;
      window.location.href = `/meetup.html?id=${meetupId}&openChat=${senderId}`;
    } catch (err) {
      window.location.href = `/meetup.html?id=2&openChat=${senderId}`;
    }
  };

  async function loadNotifications() {
    const badge = document.getElementById('notifications-badge');
    const list = document.getElementById('notifications-list');
    if (!badge || !list) return;

    try {
      const me = AppState.getUser();
      if (!me) return;

      const [connections, messages] = await Promise.all([
        apiFetch('/networking/connections').catch(() => []),
        apiFetch('/networking/recent-messages').catch(() => [])
      ]);

      const pendingRequests = connections.filter(c => c.status === 'pending' && c.requester_id !== me.id);
      
      const incomingMessages = messages.filter(m => {
        if (m.sender_id === me.id) return false;
        if (m.content.includes('"isSignal":true')) return false;

        let ts = m.sent_at;
        if (ts && !ts.endsWith('Z') && !ts.includes('+')) ts = ts.replace(' ', 'T') + 'Z';
        const msgTime = new Date(ts).getTime();
        return msgTime > dismissedTime;
      });

      const totalCount = pendingRequests.length + incomingMessages.length;

      if (totalCount > 0) {
        badge.style.display = 'flex';
        badge.textContent = totalCount;
      } else {
        badge.style.display = 'none';
      }

      if (totalCount === 0) {
        list.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--txt3); font-size:0.85rem;">🔔 No new notifications</div>`;
        return;
      }

      let html = '';

      for (const r of pendingRequests) {
        html += `
          <div class="notification-item" style="padding:0.6rem 0.8rem; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:0.4rem; transition: background 0.2s;">
            <div style="font-size:0.82rem; color:#fff; line-height:1.4;">
              🤝 <strong>${esc(r.name)}</strong> wants to connect.
            </div>
            <div style="display:flex; gap:0.5rem; align-items:center;">
              <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); acceptNotificationConnection(${r.id})" style="padding:0.2rem 0.5rem; font-size:0.75rem;">Accept</button>
            </div>
          </div>
        `;
      }

      for (const m of incomingMessages) {
        let displayContent = 'Sent you a message.';
        if (m.content.includes('"isEncrypted":true')) {
          displayContent = '🔒 Encrypted message received.';
        } else {
          displayContent = m.content.length > 40 ? m.content.slice(0, 40) + '...' : m.content;
        }

        html += `
          <div class="notification-item" style="padding:0.6rem 0.8rem; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:0.2rem; cursor:pointer;" onclick="goToChat(${m.sender_id})">
            <div style="font-size:0.82rem; color:#fff; line-height:1.4;">
              💬 New message from <strong>${esc(m.sender_name)}</strong>
            </div>
            <div style="font-size:0.75rem; color:var(--txt3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${esc(displayContent)}
            </div>
          </div>
        `;
      }

      list.innerHTML = html;
    } catch (err) {
      console.warn('Failed to load notifications:', err);
    }
  }

  function injectNotificationsButton() {
    const navRight = document.querySelector('.navbar-right');
    if (!navRight || document.getElementById('notifications-wrapper')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'notifications-wrapper';
    wrapper.style.cssText = 'position:relative; display:inline-block; flex-shrink:0;';

    wrapper.innerHTML = `
      <button id="notifications-btn" class="btn btn-ghost btn-sm" style="width:36px;height:36px;padding:0;font-size:1rem;border-radius:10px;display:flex;align-items:center;justify-content:center;position:relative" title="Notifications">
        🔔
        <span id="notifications-badge" style="display:none;position:absolute;top:2px;right:2px;min-width:14px;height:14px;background:var(--err);color:#fff;border-radius:50%;font-size:0.65rem;display:flex;align-items:center;justify-content:center;font-weight:bold;padding:1px;box-shadow:0 0 6px var(--err)"></span>
      </button>
      <div id="notifications-dropdown" class="notifications-dropdown-menu" style="display:none; position:absolute; right:0; top:42px; width:300px; background: rgba(8, 8, 17, 0.95); backdrop-filter: blur(24px); border: 1px solid var(--border); border-radius: var(--r-md); box-shadow: var(--sh-lg); z-index: 1000; padding: 0.5rem 0;">
        <div style="font-size:0.75rem; font-weight:700; color:var(--txt3); padding:0.4rem 0.8rem; border-bottom:1px solid var(--border); text-transform:uppercase; letter-spacing:0.05em; display:flex; justify-content:space-between; align-items:center;">
          <span>Notifications</span>
          <button id="notif-clear-btn" style="background:transparent; border:none; color:var(--a1); font-size:0.7rem; cursor:pointer; font-weight:600; padding:0;">Dismiss All</button>
        </div>
        <div id="notifications-list" style="max-height: 250px; overflow-y: auto;">
          <div style="text-align:center; padding:1.5rem; color:var(--txt3); font-size:0.85rem;">🔔 Loading notifications...</div>
        </div>
      </div>
    `;

    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      navRight.insertBefore(wrapper, themeBtn);
    } else {
      const userEl = document.getElementById('nav-user');
      navRight.insertBefore(wrapper, userEl || navRight.firstChild);
    }

    const btn = wrapper.querySelector('#notifications-btn');
    const dropdown = wrapper.querySelector('#notifications-dropdown');
    btn.onclick = (e) => {
      e.stopPropagation();
      const isVisible = dropdown.classList.contains('show');
      if (isVisible) {
        dropdown.classList.remove('show');
        setTimeout(() => { dropdown.style.display = 'none'; }, 200);
      } else {
        dropdown.style.display = 'block';
        setTimeout(() => { dropdown.classList.add('show'); }, 10);
        loadNotifications();
      }
    };

    const clearBtn = wrapper.querySelector('#notif-clear-btn');
    clearBtn.onclick = (e) => {
      e.stopPropagation();
      dismissAllNotifications();
    };
  }

  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('notifications-wrapper');
    const dropdown = document.getElementById('notifications-dropdown');
    if (wrap && dropdown && dropdown.classList.contains('show') && !wrap.contains(e.target)) {
      dropdown.classList.remove('show');
      setTimeout(() => { dropdown.style.display = 'none'; }, 200);
    }
  });

  /* ═══════════════════════════════════════════════════════════════════════════
     INIT  (runs after DOM is ready)
  ══════════════════════════════════════════════════════════════════════════════ */
  function init() {
    /* 1. Apply saved theme immediately (no flash) */
    applyTheme(currentPref());

    /* 2. Inject theme button into navbar */
    injectThemeButton();

    /* 3. Inject chatbot and notifications (logged-in users only) */
    const loggedIn = (typeof AppState !== 'undefined') && AppState.isLoggedIn();
    if (loggedIn) {
      injectChatbot();
      injectNotificationsButton();
      loadNotifications().catch(err => console.error(err));
      // Poll notifications every 10 seconds
      setInterval(loadNotifications, 10000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init(); // already loaded
  }

})();
