# Product Requirement Document (PRD) - QR Code-Based Attendance System

| Field | Details |
| :--- | :--- |
| **Feature Name** | QR Code Attendee Check-In & Digital Member Pass |
| **Status** | Implemented |
| **Target Audience** | Meetup Attendees & Community Admins |
| **Author** | Antigravity AI Code Assistant |

---

## 1. Executive Summary & Objective

Managing attendance at large community events is often a slow, manual process prone to check-in queues and duplicate entries. The **QR Code Attendance System** replaces manual check-ins with a scan-based verification mechanism. 
Every registered user has a unique, persistent digital pass containing their user identity. Event organizers can scan this pass using their device's webcam to instantly check attendees in, providing real-time database updates, visual confirmation, and pleasant sound indicators.

---

## 2. User Journeys

### A. The Attendee Check-In Experience
1. **Registration**: User registers for a meetup by submitting answers to the onboarding questions.
2. **Accessing Pass**: Once registered, the user accesses their persistent **Digital Member Pass** from the registration card on the meetup details page.
3. **Check-In**: At the event, the attendee displays the QR code on their mobile device to the organizer's camera.

### B. The Admin Curation Experience
1. **Opening Scanner**: Admin views the meetup page and clicks the `"📷 Scan QR Code"` button.
2. **Scanning**: Admin grants camera access, selects the preferred camera input, and scans incoming attendees' screens.
3. **Instant Action**: The scanner automatically validates the pass, plays a chime on success (or buzzer on error), displays the attendee's name/picture on screen, registers check-in, and resumes scanning automatically after 2 seconds.

---

## 3. Functional Requirements

### A. Unique Digital Member Pass
- Every user has a unique, persistent digital pass structured as a cosmic glassmorphism card.
- **Card UI Elements**:
  - Converge branding with gradient styling.
  - Attendee Name & Professional Meta (e.g. "Designer @ Pixels").
  - Perforated ticket boundary (dashed line with round circular punch notches on both sides).
  - Dynamic QR Code containing the validation payload:
    ```json
    {"userId": 4, "name": "Attendee Name", "type": "converge-user-pass"}
    ```
  - Simulated card barcode at the bottom for high-fidelity ticket styling.

### B. Dynamic QR Code Generator
- QR codes are generated client-side dynamically using the free, secure public API: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=...`
- The payload is URI-encoded to ensure correct parsing.

### C. Live Webcam Scanner (Admin Only)
- Admin-only access. The camera interface is embedded in a modal.
- Includes a drop-down select element to switch between multiple video capture inputs (e.g., front vs. back cameras on a phone).
- Features a **laser beam scanning animation** (horizontal crimson bar moving vertically in loop) to signal scanner activity.

### D. Audio-Visual Verification & Feedback
- **Feedback Overlay**: An overlay appears directly inside the scanner window during scanning:
  - **Valid Check-In**: Green cosmic glow card, displaying `"✅ Checked In"` along with the attendee's name.
  - **Invalid/Error Scan**: Red cosmic glow card, displaying `"❌ Failed"` along with the error reason (e.g., "Not registered for this meetup", "Already checked in").
- **Browser-Synthesized Sounds**: Uses the HTML5 Web Audio API to trigger instant sound indicators without relying on external static files:
  - **Success Sound**: Double happy chime (D5 followed by A5).
  - **Error Sound**: Sawtooth wave buzzer chime.
- **Automated Resume**: The overlay displays for exactly 2 seconds before automatically closing to resume scanning for the next attendee (hands-free operation).
- **Background Synchronization**: While scanning, the attendee listings, registration metrics, and checked-in counts on the page update dynamically in the background without refreshing the page.

---

## 4. Technical Architecture

### A. Database Integrations
Reuses the existing sqlite schema `registrations` table's check-in capabilities:
```sql
CREATE TABLE IF NOT EXISTS registrations (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL,
  meetup_id           INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'registered', -- checked_in | registered
  checkin_time        DATETIME,
  ...
);
```

### B. API Reference

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/meetups/:id/admin-checkin` | Admin Only | Validates user ID, checks registration status, marks check-in, and returns attendee name |

### C. Library Integration
- Incorporates the `html5-qrcode` library for robust camera handling, barcode decoding, and stream management.
- Script source: `https://unpkg.com/html5-qrcode` loaded globally.
- Instantiated via custom JS controls in `meetup.js` to ensure the webcam process can be cleanly stopped when the modal is closed, preventing camera privacy light leaks.
