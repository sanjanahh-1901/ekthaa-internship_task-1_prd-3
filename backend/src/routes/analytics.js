const express   = require('express');
const router    = express.Router();
const db        = require('../db');
const auth      = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

// Simple inline CSV helper – no external dependency needed
function toCSV(rows, fields) {
  const header = fields.join(',');
  const body   = rows.map(row =>
    fields.map(f => {
      const v = row[f] !== null && row[f] !== undefined ? String(row[f]) : '';
      return `"${v.replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [header, ...body].join('\r\n');
}

// ── GET /api/meetups/:id/analytics  (admin) ───────────────────────────────────
router.get('/:id/analytics', auth, adminOnly, (req, res) => {
  const meetupId = req.params.id;
  const meetup   = db.prepare('SELECT * FROM meetups WHERE id=?').get(meetupId);
  if (!meetup) return res.status(404).json({ error: 'Meetup not found' });

  const totalRegistrations = db.prepare(
    'SELECT COUNT(*) AS cnt FROM registrations WHERE meetup_id=?'
  ).get(meetupId).cnt;

  const totalCheckins = db.prepare(
    "SELECT COUNT(*) AS cnt FROM registrations WHERE meetup_id=? AND status='checked_in'"
  ).get(meetupId).cnt;

  const attendancePct = totalRegistrations > 0
    ? parseFloat(((totalCheckins / totalRegistrations) * 100).toFixed(1))
    : 0;

  // Most active members (across ALL meetups by check-in count)
  const mostActive = db.prepare(`
    SELECT u.id,u.name,u.profession,u.company,u.profile_picture,
           COUNT(r.id) AS meetups_attended
    FROM registrations r
    JOIN users u ON r.user_id=u.id
    WHERE r.status='checked_in'
    GROUP BY u.id
    ORDER BY meetups_attended DESC
    LIMIT 5
  `).all();

  // Full meetup history (all meetups)
  const history = db.prepare(`
    SELECT m.id, m.title, m.date,
           (SELECT COUNT(*) FROM registrations WHERE meetup_id=m.id) AS registrations,
           (SELECT COUNT(*) FROM registrations WHERE meetup_id=m.id AND status='checked_in') AS checkins
    FROM meetups m
    ORDER BY m.date DESC
  `).all();

  res.json({
    meetup_id:            +meetupId,
    meetup_title:         meetup.title,
    total_registrations:  totalRegistrations,
    total_checkins:       totalCheckins,
    attendance_percentage: attendancePct,
    capacity_limit:       meetup.capacity_limit,
    most_active_members:  mostActive,
    meetup_history:       history
  });
});

// ── GET /api/meetups/:id/export/attendees  (admin) ────────────────────────────
router.get('/:id/export/attendees', auth, adminOnly, (req, res) => {
  const rows = db.prepare(`
    SELECT u.name,u.email,u.profession,u.company,r.status,r.checkin_time,r.registered_at
    FROM registrations r
    JOIN users u ON r.user_id=u.id
    WHERE r.meetup_id=?
    ORDER BY r.registered_at ASC
  `).all(req.params.id);

  const csv = toCSV(rows, ['name','email','profession','company','status','checkin_time','registered_at']);
  res.header('Content-Type', 'text/csv');
  res.header('Content-Disposition', `attachment; filename="attendees_meetup_${req.params.id}.csv"`);
  res.send(csv);
});

// ── GET /api/meetups/:id/export/responses  (admin) ────────────────────────────
router.get('/:id/export/responses', auth, adminOnly, (req, res) => {
  const rows = db.prepare(`
    SELECT u.name,u.email,r.why_attend,r.what_to_learn,r.what_to_contribute,r.status
    FROM registrations r
    JOIN users u ON r.user_id=u.id
    WHERE r.meetup_id=?
    ORDER BY r.registered_at ASC
  `).all(req.params.id);

  const csv = toCSV(rows, ['name','email','why_attend','what_to_learn','what_to_contribute','status']);
  res.header('Content-Type', 'text/csv');
  res.header('Content-Disposition', `attachment; filename="responses_meetup_${req.params.id}.csv"`);
  res.send(csv);
});

module.exports = router;
