/**
 * db.js — SQLite via node-sqlite3-wasm (pure WebAssembly, no native compilation).
 *
 * Exposes a thin shim that matches the better-sqlite3 API so every route
 * file works without any changes:
 *   db.prepare(sql).get(...params)   → first matching row | undefined
 *   db.prepare(sql).all(...params)   → array of rows
 *   db.prepare(sql).run(...params)   → { changes, lastInsertRowid }
 *   db.exec(sql)                     → multi-statement execute (no params)
 *   db.pragma(str)                   → PRAGMA convenience wrapper
 */
const { Database } = require('node-sqlite3-wasm');
const path         = require('path');
const bcrypt       = require('bcryptjs');

const DB_PATH = path.join(__dirname, '../../meetup.db');
const raw     = new Database(DB_PATH);

/* WAL mode + FK enforcement */
raw.run('PRAGMA journal_mode = WAL');
raw.run('PRAGMA foreign_keys = ON');

/* ─── arg helper ─────────────────────────────────────────────────────────────
 * Converts better-sqlite3-style spread args into a plain array for
 * node-sqlite3-wasm's bindParameters argument.
 *
 * Examples:
 *   .get(id)               → args=[id]          → [id]
 *   .get(a, b)             → args=[a, b]         → [a, b]
 *   .run(...valuesArray)   → args=valuesArray     → valuesArray
 * ─────────────────────────────────────────────────────────────────────────── */
function toParams(args) {
  if (!args || args.length === 0) return undefined;
  // Flatten one level: handles both .get(a,b) and .run(...arr)
  const flat = [];
  for (const a of args) {
    if (Array.isArray(a)) flat.push(...a);
    else flat.push(a);
  }
  return flat.length ? flat : undefined;
}

/* ─── better-sqlite3-compatible wrapper ────────────────────────────────────── */
const db = {
  pragma(str) {
    raw.run(`PRAGMA ${str}`);
  },

  exec(sql) {
    raw.exec(sql);
  },

  prepare(sql) {
    return {
      get(...args) {
        return raw.get(sql, toParams(args)) ?? undefined;
      },
      all(...args) {
        return raw.all(sql, toParams(args)) ?? [];
      },
      run(...args) {
        /* node-sqlite3-wasm returns { changes, lastInsertRowid } — same as better-sqlite3 */
        return raw.run(sql, toParams(args));
      }
    };
  }
};

/* ─── Schema ──────────────────────────────────────────────────────────────── */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    email             TEXT UNIQUE NOT NULL,
    password_hash     TEXT NOT NULL,
    role              TEXT NOT NULL DEFAULT 'member',
    profession        TEXT,
    company           TEXT,
    profile_picture   TEXT,
    looking_for       TEXT,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS meetups (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    title                 TEXT NOT NULL,
    banner                TEXT,
    description           TEXT,
    date                  TEXT NOT NULL,
    start_time            TEXT NOT NULL,
    end_time              TEXT NOT NULL,
    venue_name            TEXT NOT NULL,
    google_maps_link      TEXT,
    capacity_limit        INTEGER NOT NULL,
    registration_deadline DATETIME NOT NULL,
    organizer_id          INTEGER NOT NULL,
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organizer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS registrations (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL,
    meetup_id           INTEGER NOT NULL,
    why_attend          TEXT,
    what_to_learn       TEXT,
    what_to_contribute  TEXT,
    status              TEXT NOT NULL DEFAULT 'registered',
    checkin_time        DATETIME,
    registered_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, meetup_id),
    FOREIGN KEY (user_id)   REFERENCES users(id),
    FOREIGN KEY (meetup_id) REFERENCES meetups(id)
  );

  CREATE TABLE IF NOT EXISTS connections (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL,
    receiver_id  INTEGER NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(requester_id, receiver_id),
    FOREIGN KEY (requester_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id)  REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id   INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    content     TEXT NOT NULL,
    sent_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id)   REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS communities (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    icon        TEXT DEFAULT '🌐',
    category    TEXT DEFAULT 'General',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS community_members (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    community_id INTEGER NOT NULL,
    joined_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, community_id),
    FOREIGN KEY (user_id)      REFERENCES users(id),
    FOREIGN KEY (community_id) REFERENCES communities(id)
  );
`);

/* ─── Seed admin user ────────────────────────────────────────────────────── */
const admin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@meetup.com');
if (!admin) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    `INSERT INTO users (name, email, password_hash, role, profession, company)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('Admin User', 'admin@meetup.com', hash, 'admin', 'Community Manager', 'Meetup Hub');
  console.log('✅  Seeded admin: admin@meetup.com / admin123');
}

/* ─── Seed communities ───────────────────────────────────────────────────── */
const SEED_COMMUNITIES = [
  { name: 'AI & Machine Learning', description: 'Explore the frontier of artificial intelligence, deep learning, LLMs, and real-world ML applications.', icon: '🤖', category: 'Technology' },
  { name: 'Web Development',       description: 'Frontend, backend, fullstack — share projects, frameworks, and modern web techniques.', icon: '🌐', category: 'Technology' },
  { name: 'Mobile Development',    description: 'iOS, Android, Flutter, React Native — build the apps people love.', icon: '📱', category: 'Technology' },
  { name: 'Cybersecurity',         description: 'Ethical hacking, threat intelligence, zero-trust, and keeping systems safe.', icon: '🔐', category: 'Technology' },
  { name: 'Cloud & DevOps',        description: 'AWS, GCP, Azure, Kubernetes, CI/CD pipelines and the culture of DevOps.', icon: '☁️', category: 'Infrastructure' },
  { name: 'UI/UX Design',          description: 'Human-centred design, Figma, accessibility, and crafting delightful experiences.', icon: '🎨', category: 'Design' },
  { name: 'Data Science',          description: 'Statistics, analytics, visualisation, and turning raw data into decisions.', icon: '📊', category: 'Data' },
  { name: 'Startup & Entrepreneurship', description: 'Founders, makers, investors — ideas, funding, scaling, and startup culture.', icon: '🚀', category: 'Business' },
  { name: 'Open Source',           description: 'Contribute to open-source projects, find collaborators, and give back to the ecosystem.', icon: '🛠️', category: 'Community' },
  { name: 'Women in Tech',         description: 'A supportive space celebrating and empowering women in technology and STEM fields.', icon: '💜', category: 'Community' },
];
for (const c of SEED_COMMUNITIES) {
  const exists = db.prepare('SELECT id FROM communities WHERE name=?').get(c.name);
  if (!exists) {
    db.prepare('INSERT INTO communities (name,description,icon,category) VALUES (?,?,?,?)').run(c.name, c.description, c.icon, c.category);
  }
}
console.log('✅  Communities seeded');

module.exports = db;
