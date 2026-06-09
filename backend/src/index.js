require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

// ── Ensure upload directories exist ───────────────────────────────────────────
['uploads/banners', 'uploads/profiles', 'uploads/scrapbook'].forEach(dir => {
  fs.mkdirSync(path.join(__dirname, '../../', dir), { recursive: true });
});

// ── Initialize DB (runs migrations + seed) ────────────────────────────────────
require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static assets ──────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));
app.use(express.static(path.join(__dirname, '../../frontend')));

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/meetups',    require('./routes/meetups'));
app.use('/api/meetups',    require('./routes/registrations'));
app.use('/api/meetups',    require('./routes/analytics'));
app.use('/api/networking', require('./routes/networking'));
app.use('/api/communities', require('./routes/communities'));
app.use('/api/scrapbook',   require('./routes/scrapbook'));


// ── Catch-all: serve frontend for unknown paths ────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../../frontend/index.html'));
  } else {
    res.status(404).json({ error: 'API route not found' });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Converge running at  http://localhost:${PORT}`);
  console.log(`📦 API available at        http://localhost:${PORT}/api`);
  console.log(`🔑 Admin login:            admin@meetup.com / admin123\n`);
});
