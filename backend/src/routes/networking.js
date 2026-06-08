const express = require('express');
// GET /api/networking/suggestions  ← new, defined below
const router  = express.Router();
const db      = require('../db');
const auth    = require('../middleware/auth');

// ── POST /api/networking/connections/request ──────────────────────────────────
router.post('/connections/request', auth, (req, res) => {
  const { receiver_id } = req.body;
  if (!receiver_id)            return res.status(400).json({ error: 'receiver_id is required' });
  if (+receiver_id === req.user.id) return res.status(400).json({ error: 'Cannot connect with yourself' });
  if (!db.prepare('SELECT id FROM users WHERE id=?').get(receiver_id)) {
    return res.status(404).json({ error: 'User not found' });
  }

  const existing = db.prepare(
    `SELECT id FROM connections
     WHERE (requester_id=? AND receiver_id=?) OR (requester_id=? AND receiver_id=?)`
  ).get(req.user.id, receiver_id, receiver_id, req.user.id);

  if (existing) return res.status(400).json({ error: 'Connection already exists or request is pending' });

  db.prepare('INSERT INTO connections (requester_id,receiver_id) VALUES (?,?)').run(req.user.id, receiver_id);
  res.status(201).json({ message: 'Connection request sent!' });
});

// ── PUT /api/networking/connections/:id/accept ────────────────────────────────
router.put('/connections/:id/accept', auth, (req, res) => {
  const conn = db.prepare('SELECT * FROM connections WHERE id=?').get(req.params.id);
  if (!conn)                          return res.status(404).json({ error: 'Connection not found' });
  if (conn.receiver_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

  db.prepare("UPDATE connections SET status='accepted' WHERE id=?").run(req.params.id);
  res.json({ message: 'Connection accepted!' });
});

// ── GET /api/networking/connections ──────────────────────────────────────────
router.get('/connections', auth, (req, res) => {
  const conns = db.prepare(`
    SELECT c.id, c.status, c.created_at,
           CASE WHEN c.requester_id=? THEN c.receiver_id ELSE c.requester_id END AS other_user_id,
           u.name, u.profession, u.company, u.profile_picture
    FROM connections c
    JOIN users u ON u.id = CASE WHEN c.requester_id=? THEN c.receiver_id ELSE c.requester_id END
    WHERE c.requester_id=? OR c.receiver_id=?
    ORDER BY c.created_at DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id);
  res.json(conns);
});

// ── POST /api/networking/messages ─────────────────────────────────────────────
router.post('/messages', auth, (req, res) => {
  const { receiver_id, content } = req.body;
  if (!receiver_id || !content) return res.status(400).json({ error: 'receiver_id and content are required' });

  const result = db.prepare(
    'INSERT INTO messages (sender_id,receiver_id,content) VALUES (?,?,?)'
  ).run(req.user.id, receiver_id, content.trim());

  res.status(201).json(db.prepare('SELECT * FROM messages WHERE id=?').get(result.lastInsertRowid));
});

// ── GET /api/networking/messages/:userId ──────────────────────────────────────
router.get('/messages/:userId', auth, (req, res) => {
  const messages = db.prepare(`
    SELECT m.*, s.name AS sender_name, s.profile_picture AS sender_picture
    FROM messages m
    JOIN users s ON m.sender_id=s.id
    WHERE (m.sender_id=? AND m.receiver_id=?) OR (m.sender_id=? AND m.receiver_id=?)
    ORDER BY m.sent_at ASC
  `).all(req.user.id, req.params.userId, req.params.userId, req.user.id);
  res.json(messages);
});

// ── GET /api/networking/suggestions ──────────────────────────────────────────
// Returns up to 8 users ranked by shared profession / company, excluding
// the caller and anyone already connected.
router.get('/suggestions', auth, (req, res) => {
  const me = db.prepare(
    'SELECT profession, company FROM users WHERE id=?'
  ).get(req.user.id);

  const suggestions = db.prepare(`
    SELECT u.id, u.name, u.profession, u.company,
           u.profile_picture, u.looking_for,
           CASE
             WHEN u.profession = ? THEN 3
             WHEN u.company    = ? THEN 2
             ELSE 1
           END AS relevance
    FROM users u
    WHERE u.id != ?
      AND u.id NOT IN (
            SELECT CASE
                     WHEN requester_id = ? THEN receiver_id
                     ELSE requester_id
                   END
            FROM connections
            WHERE requester_id = ? OR receiver_id = ?
          )
    ORDER BY relevance DESC, u.created_at DESC
    LIMIT 8
  `).all(
    me?.profession ?? null,
    me?.company    ?? null,
    req.user.id,
    req.user.id, req.user.id, req.user.id
  );

  res.json(suggestions);
});

module.exports = router;
