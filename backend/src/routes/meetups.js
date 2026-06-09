const express   = require('express');
const router    = express.Router();
const path      = require('path');
const multer    = require('multer');
const db        = require('../db');
const auth      = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

const UPLOADS_DIR = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'uploads')
  : path.join(__dirname, '../../../uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) =>
    cb(null, path.join(UPLOADS_DIR, 'banners')),
  filename: (_req, file, cb) =>
    cb(null, `banner_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── POST /api/meetups  (admin) ─────────────────────────────────────────────────
router.post('/', auth, adminOnly, upload.single('banner'), (req, res) => {
  const { title, description, date, start_time, end_time,
          venue_name, google_maps_link, capacity_limit, registration_deadline } = req.body;

  if (!title || !date || !start_time || !end_time || !venue_name || !capacity_limit || !registration_deadline) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const banner = req.file ? `/uploads/banners/${req.file.filename}` : null;
  const result = db.prepare(
    `INSERT INTO meetups
       (title,banner,description,date,start_time,end_time,venue_name,google_maps_link,capacity_limit,registration_deadline,organizer_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(title, banner, description||null, date, start_time, end_time,
        venue_name, google_maps_link||null, parseInt(capacity_limit), registration_deadline, req.user.id);

  res.status(201).json(db.prepare('SELECT * FROM meetups WHERE id=?').get(result.lastInsertRowid));
});

// ── GET /api/meetups ───────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const meetups = db.prepare(`
    SELECT m.*,
           u.name AS organizer_name,
           (SELECT COUNT(*) FROM registrations WHERE meetup_id=m.id) AS total_registered,
           (SELECT COUNT(*) FROM registrations WHERE meetup_id=m.id AND status='checked_in') AS total_checkins
    FROM meetups m
    LEFT JOIN users u ON m.organizer_id = u.id
    ORDER BY m.date DESC, m.start_time DESC
  `).all();
  res.json(meetups);
});

// ── GET /api/meetups/:id ───────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const meetup = db.prepare(`
    SELECT m.*,
           u.name AS organizer_name,
           (SELECT COUNT(*) FROM registrations WHERE meetup_id=m.id) AS total_registered,
           (SELECT COUNT(*) FROM registrations WHERE meetup_id=m.id AND status='checked_in') AS total_checkins
    FROM meetups m
    LEFT JOIN users u ON m.organizer_id = u.id
    WHERE m.id=?
  `).get(req.params.id);

  if (!meetup) return res.status(404).json({ error: 'Meetup not found' });

  const registered_members = db.prepare(`
    SELECT u.id,u.name,u.profession,u.company,u.profile_picture,u.looking_for,
           r.status, r.registered_at
    FROM registrations r
    JOIN users u ON r.user_id=u.id
    WHERE r.meetup_id=?
    ORDER BY r.registered_at ASC
  `).all(req.params.id);

  const checked_in_members = registered_members.filter(r => r.status === 'checked_in');
  res.json({ ...meetup, registered_members, checked_in_members });
});

// ── PUT /api/meetups/:id  (admin) ──────────────────────────────────────────────
router.put('/:id', auth, adminOnly, upload.single('banner'), (req, res) => {
  const existing = db.prepare('SELECT * FROM meetups WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Meetup not found' });

  const { title, description, date, start_time, end_time,
          venue_name, google_maps_link, capacity_limit, registration_deadline } = req.body;
  const banner = req.file ? `/uploads/banners/${req.file.filename}` : existing.banner;

  db.prepare(`
    UPDATE meetups SET
      title=?,banner=?,description=?,date=?,start_time=?,end_time=?,
      venue_name=?,google_maps_link=?,capacity_limit=?,registration_deadline=?
    WHERE id=?
  `).run(
    title||existing.title, banner, description||existing.description,
    date||existing.date, start_time||existing.start_time, end_time||existing.end_time,
    venue_name||existing.venue_name, google_maps_link||existing.google_maps_link,
    capacity_limit ? parseInt(capacity_limit) : existing.capacity_limit,
    registration_deadline||existing.registration_deadline,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM meetups WHERE id=?').get(req.params.id));
});

// ── DELETE /api/meetups/:id  (admin) ──────────────────────────────────────────
router.delete('/:id', auth, adminOnly, (req, res) => {
  if (!db.prepare('SELECT id FROM meetups WHERE id=?').get(req.params.id)) {
    return res.status(404).json({ error: 'Meetup not found' });
  }
  db.prepare('DELETE FROM registrations WHERE meetup_id=?').run(req.params.id);
  db.prepare('DELETE FROM scrapbook_settings WHERE meetup_id=?').run(req.params.id);
  db.prepare('DELETE FROM scrapbook_items WHERE meetup_id=?').run(req.params.id);
  db.prepare('DELETE FROM meetups WHERE id=?').run(req.params.id);
  res.json({ message: 'Meetup deleted successfully' });
});

module.exports = router;
