const express   = require('express');
const router    = express.Router();
const db        = require('../db');
const auth      = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

// ── POST /api/meetups/:id/register ────────────────────────────────────────────
router.post('/:id/register', auth, (req, res) => {
  const meetupId = req.params.id;
  const meetup   = db.prepare('SELECT * FROM meetups WHERE id=?').get(meetupId);
  if (!meetup) return res.status(404).json({ error: 'Meetup not found' });

  if (new Date() > new Date(meetup.registration_deadline)) {
    return res.status(400).json({ error: 'Registration deadline has passed' });
  }

  const count = db.prepare('SELECT COUNT(*) AS cnt FROM registrations WHERE meetup_id=?').get(meetupId).cnt;
  if (count >= meetup.capacity_limit) {
    return res.status(400).json({ error: 'This meetup is at full capacity' });
  }

  if (db.prepare('SELECT id FROM registrations WHERE user_id=? AND meetup_id=?').get(req.user.id, meetupId)) {
    return res.status(400).json({ error: 'You are already registered for this meetup' });
  }

  const { why_attend, what_to_learn, what_to_contribute } = req.body;
  db.prepare(
    `INSERT INTO registrations (user_id,meetup_id,why_attend,what_to_learn,what_to_contribute)
     VALUES (?,?,?,?,?)`
  ).run(req.user.id, meetupId, why_attend||null, what_to_learn||null, what_to_contribute||null);

  res.status(201).json({ message: 'Successfully registered for this meetup!' });
});

// ── GET /api/meetups/:id/registrations  (admin) ───────────────────────────────
router.get('/:id/registrations', auth, adminOnly, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*,u.name,u.email,u.profession,u.company,u.profile_picture
    FROM registrations r
    JOIN users u ON r.user_id=u.id
    WHERE r.meetup_id=?
    ORDER BY r.registered_at ASC
  `).all(req.params.id);
  res.json(rows);
});

// ── POST /api/meetups/:id/checkin ─────────────────────────────────────────────
router.post('/:id/checkin', auth, (req, res) => {
  const meetupId = req.params.id;
  const meetup   = db.prepare('SELECT * FROM meetups WHERE id=?').get(meetupId);
  if (!meetup) return res.status(404).json({ error: 'Meetup not found' });

  const now       = new Date();
  const startDT   = new Date(`${meetup.date}T${meetup.start_time}`);
  if (now < startDT) {
    return res.status(400).json({ error: 'Check-in is not available until the meetup starts' });
  }

  const reg = db.prepare('SELECT * FROM registrations WHERE user_id=? AND meetup_id=?').get(req.user.id, meetupId);
  if (!reg)                        return res.status(400).json({ error: 'You are not registered for this meetup' });
  if (reg.status === 'checked_in') return res.status(400).json({ error: 'You are already checked in' });

  db.prepare("UPDATE registrations SET status='checked_in', checkin_time=? WHERE user_id=? AND meetup_id=?")
    .run(now.toISOString(), req.user.id, meetupId);

  res.json({ message: 'Checked in successfully! Welcome! 🎊' });
});

// ── GET /api/meetups/:id/attendees ────────────────────────────────────────────
router.get('/:id/attendees', (req, res) => {
  const attendees = db.prepare(`
    SELECT u.id,u.name,u.profession,u.company,u.profile_picture,r.checkin_time
    FROM registrations r
    JOIN users u ON r.user_id=u.id
    WHERE r.meetup_id=? AND r.status='checked_in'
    ORDER BY r.checkin_time ASC
  `).all(req.params.id);
  res.json({ count: attendees.length, attendees });
});

module.exports = router;
