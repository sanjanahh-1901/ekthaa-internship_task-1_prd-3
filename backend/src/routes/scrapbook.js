const express   = require('express');
const router    = express.Router();
const path      = require('path');
const fs        = require('fs');
const multer    = require('multer');
const db        = require('../db');
const auth      = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

/* ─── Multer storage ─────────────────────────────────────────────────────── */
const UPLOADS_DIR = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'uploads')
  : path.join(__dirname, '../../../uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) =>
    cb(null, path.join(UPLOADS_DIR, 'scrapbook')),
  filename: (_req, file, cb) =>
    cb(null, `scrapbook_${Date.now()}_${Math.random().toString(36).slice(2,8)}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },   // 50 MB (covers short videos)
  fileFilter: (_req, file, cb) => {
    const ok = /^(image\/(jpeg|jpg|png|gif|webp)|video\/(mp4|webm|quicktime|x-msvideo))$/i.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Only images, GIFs, and short videos (MP4/WebM/MOV) are allowed'));
  }
});

/* ─── Helpers ────────────────────────────────────────────────────────────── */
/**
 * Returns { open: bool, closeAt: ISO string | null } for a meetup's upload window.
 * The window close time is set explicitly by the admin (upload_close_at).
 * If not yet set, the window is treated as closed.
 */
function getWindowInfo(meetup, settings) {
  const closeAt = settings?.upload_close_at ? new Date(settings.upload_close_at) : null;
  const open    = closeAt ? new Date() < closeAt : false;
  return { open, closeAt: closeAt ? closeAt.toISOString() : null, adminSet: !!closeAt };
}

/** Ensure scrapbook_settings row exists for a meetup (lazy init). */
function ensureSettings(meetupId) {
  const row = db.prepare('SELECT * FROM scrapbook_settings WHERE meetup_id=?').get(meetupId);
  if (!row) {
    db.prepare('INSERT INTO scrapbook_settings (meetup_id) VALUES (?)').run(meetupId);
    return db.prepare('SELECT * FROM scrapbook_settings WHERE meetup_id=?').get(meetupId);
  }
  return row;
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/scrapbook/:meetupId
   Public (auth required) — returns gallery items + window status.
   Non-admins only see 'pending' and 'kept' items; 'removed' are hidden.
═══════════════════════════════════════════════════════════════════════════ */
router.get('/:meetupId', auth, (req, res) => {
  const meetup = db.prepare('SELECT * FROM meetups WHERE id=?').get(req.params.meetupId);
  if (!meetup) return res.status(404).json({ error: 'Meetup not found' });

  const settings   = ensureSettings(req.params.meetupId);
  const windowInfo = getWindowInfo(meetup, settings);
  const isAdmin    = req.user?.role === 'admin';

  const items = db.prepare(`
    SELECT s.*, u.name AS uploader_name, u.profile_picture AS uploader_pic
    FROM scrapbook_items s
    JOIN users u ON s.uploader_id = u.id
    WHERE s.meetup_id = ?
    ORDER BY s.uploaded_at DESC
  `).all(req.params.meetupId);

  const filtered = isAdmin ? items : items.filter(i => i.status !== 'removed');

  res.json({
    items:       filtered,
    windowInfo,
    settings,
    isAdmin
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/scrapbook/:meetupId/upload
   Auth + checked-in attendee only + window must be open.
   Accepts multipart/form-data: file, caption (opt), media_type (opt).
═══════════════════════════════════════════════════════════════════════════ */
router.post('/:meetupId/upload', auth, (req, res, next) => {
  /* Sticker uploads are JSON (no file) — skip multer for them */
  if (req.headers['content-type']?.includes('application/json')) return next();
  upload.single('file')(req, res, next);
}, (req, res) => {
  const meetup = db.prepare('SELECT * FROM meetups WHERE id=?').get(req.params.meetupId);
  if (!meetup) return res.status(404).json({ error: 'Meetup not found' });

  /* Check upload window */
  const settings   = ensureSettings(req.params.meetupId);
  const windowInfo = getWindowInfo(meetup, settings);
  if (!windowInfo.open) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(403).json({ error: 'Upload window has closed for this event.' });
  }

  /* Must be a checked-in attendee (admins can bypass) */
  if (req.user.role !== 'admin') {
    const reg = db.prepare(
      `SELECT status FROM registrations WHERE meetup_id=? AND user_id=?`
    ).get(req.params.meetupId, req.user.id);
    if (!reg || reg.status !== 'checked_in') {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: 'Only checked-in attendees can upload to the scrapbook.' });
    }
  }

  const caption   = (req.body.caption || '').trim().slice(0, 300) || null;
  const mediaType = req.body.media_type || 'photo';

  /* ── Sticker (emoji stored directly in file_path) ── */
  if (mediaType === 'sticker') {
    const emoji = (req.body.sticker_emoji || '').trim();
    if (!emoji) return res.status(400).json({ error: 'No sticker emoji provided.' });
    const result = db.prepare(
      `INSERT INTO scrapbook_items (meetup_id, uploader_id, file_path, media_type, caption)
       VALUES (?,?,?,?,?)`
    ).run(req.params.meetupId, req.user.id, emoji, 'sticker', caption);
    return res.status(201).json(db.prepare(`
      SELECT s.*, u.name AS uploader_name, u.profile_picture AS uploader_pic
      FROM scrapbook_items s JOIN users u ON s.uploader_id=u.id WHERE s.id=?
    `).get(result.lastInsertRowid));
  }

  /* ── File upload (photo / gif) ── */
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const filePath  = `/uploads/scrapbook/${req.file.filename}`;
  const finalType = ['photo', 'gif', 'video'].includes(mediaType) ? mediaType
    : req.file.mimetype.startsWith('video/') ? 'video' : 'photo';

  const result = db.prepare(
    `INSERT INTO scrapbook_items (meetup_id, uploader_id, file_path, media_type, caption)
     VALUES (?,?,?,?,?)`
  ).run(req.params.meetupId, req.user.id, filePath, finalType, caption);

  const item = db.prepare(`
    SELECT s.*, u.name AS uploader_name, u.profile_picture AS uploader_pic
    FROM scrapbook_items s JOIN users u ON s.uploader_id=u.id
    WHERE s.id=?
  `).get(result.lastInsertRowid);

  res.status(201).json(item);
});


/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/scrapbook/:meetupId/items/:itemId
   Admin only — set status: 'pending' | 'kept' | 'removed'
═══════════════════════════════════════════════════════════════════════════ */
router.patch('/:meetupId/items/:itemId', auth, adminOnly, (req, res) => {
  const { status } = req.body;
  if (!['pending', 'kept', 'removed'].includes(status)) {
    return res.status(400).json({ error: 'status must be pending, kept, or removed' });
  }
  const item = db.prepare('SELECT * FROM scrapbook_items WHERE id=? AND meetup_id=?')
    .get(req.params.itemId, req.params.meetupId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  db.prepare('UPDATE scrapbook_items SET status=? WHERE id=?').run(status, req.params.itemId);
  res.json({ ...item, status });
});

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/scrapbook/:meetupId/items/:itemId
   Admin only — hard delete (removes file from disk too).
═══════════════════════════════════════════════════════════════════════════ */
router.delete('/:meetupId/items/:itemId', auth, adminOnly, (req, res) => {
  const item = db.prepare('SELECT * FROM scrapbook_items WHERE id=? AND meetup_id=?')
    .get(req.params.itemId, req.params.meetupId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const fullPath = path.join(__dirname, '../../../', item.file_path);
  fs.unlink(fullPath, () => {}); /* best-effort file removal */

  db.prepare('DELETE FROM scrapbook_items WHERE id=?').run(req.params.itemId);
  res.json({ message: 'Item permanently deleted' });
});

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/scrapbook/:meetupId/settings   (admin)
   PUT /api/scrapbook/:meetupId/settings   (admin)
═══════════════════════════════════════════════════════════════════════════ */
router.get('/:meetupId/settings', auth, adminOnly, (req, res) => {
  const meetup = db.prepare('SELECT id FROM meetups WHERE id=?').get(req.params.meetupId);
  if (!meetup) return res.status(404).json({ error: 'Meetup not found' });
  res.json(ensureSettings(req.params.meetupId));
});

router.put('/:meetupId/settings', auth, adminOnly, (req, res) => {
  const meetup = db.prepare('SELECT id FROM meetups WHERE id=?').get(req.params.meetupId);
  if (!meetup) return res.status(404).json({ error: 'Meetup not found' });

  /* upload_close_at must be a valid future datetime or null to clear */
  let closeAt = null;
  if (req.body.upload_close_at) {
    const d = new Date(req.body.upload_close_at);
    if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid upload_close_at datetime' });
    closeAt = d.toISOString();
  }

  const enabled = req.body.enabled !== undefined ? (req.body.enabled ? 1 : 0) : 1;

  ensureSettings(req.params.meetupId);
  db.prepare(`UPDATE scrapbook_settings SET upload_close_at=?, enabled=? WHERE meetup_id=?`)
    .run(closeAt, enabled, req.params.meetupId);

  res.json(db.prepare('SELECT * FROM scrapbook_settings WHERE meetup_id=?').get(req.params.meetupId));
});

module.exports = router;
