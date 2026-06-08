const express = require('express');
const router  = express.Router();
const db      = require('../db');
const auth    = require('../middleware/auth');

/* helper — fetch a community with member count + caller's join status */
function communityRow(id, userId) {
  return db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) AS member_count,
      (SELECT COUNT(*) FROM community_members WHERE community_id = c.id AND user_id = ?) AS is_joined
    FROM communities c WHERE c.id = ?
  `).get(userId ?? 0, id);
}

/* ── GET /api/communities  ─────────────────────────────────────────────────── */
router.get('/', (req, res) => {
  /* Optional auth — if a token is present decode it, else userId = 0 */
  let userId = 0;
  try {
    const hdr = req.headers.authorization || '';
    if (hdr.startsWith('Bearer ')) {
      const jwt = require('jsonwebtoken');
      const payload = jwt.verify(hdr.slice(7), process.env.JWT_SECRET);
      userId = payload.id;
    }
  } catch {}

  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) AS member_count,
      (SELECT COUNT(*) FROM community_members WHERE community_id = c.id AND user_id = ?)  AS is_joined
    FROM communities c
    ORDER BY c.category, c.name
  `).all(userId);

  res.json(rows);
});

/* ── GET /api/communities/mine  ────────────────────────────────────────────── */
router.get('/mine', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) AS member_count,
      1 AS is_joined
    FROM communities c
    JOIN community_members cm ON cm.community_id = c.id AND cm.user_id = ?
    ORDER BY cm.joined_at DESC
  `).all(req.user.id);
  res.json(rows);
});

/* ── POST /api/communities/:id/join  ───────────────────────────────────────── */
router.post('/:id/join', auth, (req, res) => {
  const c = db.prepare('SELECT id FROM communities WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Community not found' });

  const already = db.prepare(
    'SELECT id FROM community_members WHERE community_id=? AND user_id=?'
  ).get(req.params.id, req.user.id);
  if (already) return res.status(400).json({ error: 'Already a member' });

  db.prepare('INSERT INTO community_members (user_id,community_id) VALUES (?,?)').run(req.user.id, req.params.id);
  const updated = communityRow(req.params.id, req.user.id);
  res.status(201).json({ message: 'Joined successfully! 🎉', community: updated });
});

/* ── DELETE /api/communities/:id/leave  ────────────────────────────────────── */
router.delete('/:id/leave', auth, (req, res) => {
  const result = db.prepare(
    'DELETE FROM community_members WHERE community_id=? AND user_id=?'
  ).run(req.params.id, req.user.id);

  if (!result.changes) return res.status(400).json({ error: 'Not a member' });
  const updated = communityRow(req.params.id, req.user.id);
  res.json({ message: 'Left community', community: updated });
});

module.exports = router;
