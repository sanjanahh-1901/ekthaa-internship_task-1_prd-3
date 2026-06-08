# 🎯 Meetup Hub — Meetup Management & Attendance System

A full-stack web application for managing community meetups, registrations, check-ins, and attendee networking.

> **Ekthaa Internship Task 1 · PRD-3**

---

## ✨ Features

| Feature | Details |
|---|---|
| 🔐 Auth | JWT-based register & login |
| 📅 Meetup Management | Create, edit, delete meetups with banner upload |
| 🎟️ Registration | 3-question form per meetup, capacity & deadline enforcement |
| ✅ Check-In | Live check-in button appears only during the event window |
| 👥 Attendee Networking | Connect & message other attendees |
| 📊 Admin Analytics | Registrations, check-in rate, most active members |
| 📥 CSV Export | Export attendees or form responses as CSV |

---

## 🛠️ Tech Stack

### Backend
- **Node.js** + **Express.js** — REST API
- **SQLite** via `node-sqlite3-wasm` — zero-config file database (pure WebAssembly)
- **JWT** (`jsonwebtoken`) — stateless authentication
- **bcryptjs** — password hashing
- **multer** — file uploads (banners & profile pictures)

### Frontend
- **Vanilla HTML5 + CSS3 + JavaScript** — no frameworks
- **Google Fonts (Inter)** — typography
- **Glassmorphism dark theme** — CSS custom properties + `backdrop-filter`

---

## 🚀 Getting Started

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/ekthaa-meetup-hub.git
cd ekthaa-meetup-hub
```

### 2. Install dependencies
```bash
cd backend
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env and set your JWT_SECRET
```

### 4. Run the server
```bash
npm start
```

### 5. Open the app
Visit **http://localhost:3000**

---

## 🔑 Default Admin Credentials
```
Email:    admin@meetup.com
Password: admin123
```
> Change these in production!

---

## 📁 Project Structure
```
├── backend/
│   ├── src/
│   │   ├── index.js          # Express entry point
│   │   ├── db.js             # SQLite schema + seed
│   │   ├── middleware/       # auth.js, adminOnly.js
│   │   └── routes/           # auth, users, meetups, registrations, networking, analytics
│   ├── .env.example
│   └── package.json
│
└── frontend/
    ├── index.html            # Login / Register
    ├── dashboard.html        # Meetup listings
    ├── meetup.html           # Meetup detail + check-in
    ├── admin-create.html     # Create / Edit meetup
    ├── admin-analytics.html  # Analytics + CSV export
    ├── css/style.css
    └── js/                   # api.js, auth.js, dashboard.js, meetup.js, admin.js
```

---

## 📡 API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Login |
| GET | `/api/auth/me` | ✅ | Get current user |
| GET | `/api/meetups` | — | List all meetups |
| POST | `/api/meetups` | Admin | Create meetup |
| GET | `/api/meetups/:id` | — | Meetup detail |
| PUT | `/api/meetups/:id` | Admin | Update meetup |
| DELETE | `/api/meetups/:id` | Admin | Delete meetup |
| POST | `/api/meetups/:id/register` | ✅ | Register for meetup |
| POST | `/api/meetups/:id/checkin` | ✅ | Check in (during event) |
| GET | `/api/meetups/:id/attendees` | — | Live attendee list |
| GET | `/api/meetups/:id/analytics` | Admin | Stats |
| GET | `/api/meetups/:id/export/attendees` | Admin | CSV export |
| POST | `/api/networking/connections/request` | ✅ | Send connection |
| POST | `/api/networking/messages` | ✅ | Send message |

---

## 📄 License
MIT
