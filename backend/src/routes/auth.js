const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const auth    = require('../middleware/auth');

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// ── POST /api/auth/register ────────────────────────────────────────────────────
router.post('/register', (req, res) => {
  const { name, email, password, profession, company, looking_for } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(400).json({ error: 'Email is already registered' });
  }

  const hash   = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    `INSERT INTO users (name, email, password_hash, profession, company, looking_for)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(name, email, hash, profession || null, company || null, looking_for || null);

  const user  = db.prepare('SELECT id,name,email,role,profession,company,profile_picture,looking_for FROM users WHERE id=?').get(result.lastInsertRowid);
  const token = signToken(user);
  res.status(201).json({ user, token });
});

// ── POST /api/auth/login ───────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const { password_hash, ...safeUser } = user;
  res.json({ user: safeUser, token: signToken(user) });
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────────
router.get('/me', auth, (req, res) => {
  const user = db.prepare(
    'SELECT id,name,email,role,profession,company,profile_picture,looking_for,created_at FROM users WHERE id=?'
  ).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
