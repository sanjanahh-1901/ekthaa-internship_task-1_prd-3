const express = require('express');
const router  = express.Router();
const path    = require('path');
const multer  = require('multer');
const db      = require('../db');
const auth    = require('../middleware/auth');

const UPLOADS_DIR = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'uploads')
  : path.join(__dirname, '../../../uploads');

const storage = multer.diskStorage({
  destination: (req, _file, cb) =>
    cb(null, path.join(UPLOADS_DIR, 'profiles')),
  filename: (req, file, cb) =>
    cb(null, `user_${req.user.id}_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── GET /api/users/:id ─────────────────────────────────────────────────────────
router.get('/:id', auth, (req, res) => {
  const user = db.prepare(
    'SELECT id,name,email,role,profession,company,profile_picture,looking_for,created_at FROM users WHERE id=?'
  ).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ── PUT /api/users/me ──────────────────────────────────────────────────────────
router.put('/me', auth, upload.single('profile_picture'), (req, res) => {
  const { name, profession, company, looking_for } = req.body;
  const picture = req.file ? `/uploads/profiles/${req.file.filename}` : undefined;

  const fields = [];
  const values = [];
  if (name)                            { fields.push('name = ?');            values.push(name); }
  if (profession !== undefined)        { fields.push('profession = ?');       values.push(profession); }
  if (company !== undefined)           { fields.push('company = ?');          values.push(company); }
  if (looking_for !== undefined)       { fields.push('looking_for = ?');      values.push(looking_for); }
  if (picture)                         { fields.push('profile_picture = ?');  values.push(picture); }

  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.user.id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare(
    'SELECT id,name,email,role,profession,company,profile_picture,looking_for FROM users WHERE id=?'
  ).get(req.user.id);
  res.json(updated);
});

module.exports = router;
