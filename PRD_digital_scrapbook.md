# Product Requirement Document (PRD) - Digital Scrapbook

| Field | Details |
| :--- | :--- |
| **Feature Name** | Digital Event Scrapbook |
| **Status** | Implemented |
| **Target Audience** | Checked-in Meetup Attendees & Community Admins |
| **Author** | Antigravity AI Code Assistant |

---

## 1. Executive Summary & Objective

In community meetups, capturing memories and facilitating interactive networking is essential. The **Digital Event Scrapbook** allows checked-in attendees to upload photos, GIFs, and short videos directly to a shared event gallery during a designated upload window. It enables community members to share their perspectives, preserves memories, and serves as an interactive memory wall.

---

## 2. User Personas & Use Cases

### A. The Attendee (Uploader/Viewer)
* **Objective**: Wants to capture and share event moments, view photos/videos uploaded by peers, and revisit the scrapbook after the event.
* **Requirements**:
  - Secure drag-and-drop file upload.
  - Optional captioning to describe the media.
  - Video playbacks on hover.
  - Access to full-screen slideshow/preview views.

### B. The Community Organizer / Admin (Moderator)
* **Objective**: Needs full control over the scrapbook content to ensure community safety, and manage the event timeline.
* **Requirements**:
  - Set and toggle the upload close window.
  - Moderate items (mark as `kept` or `removed`).
  - Permanently hard-delete items, removing their files from the server's disk space.

---

## 3. Functional Requirements

### A. Upload Window Control (Admin Only)
- Admins can specify a datetime (`upload_close_at`) using a custom dashboard control.
- If no close date is configured, the upload window defaults to closed.
- Real-time countdown clock displays the hours, minutes, and seconds remaining for uploads.
- Clear indicators: "Open for Uploads" (with pulsing light indicator), "Closing Soon" (under 2 hours), and "Upload Closed".

### B. Media Upload Constraints
- Only **checked-in attendees** (or administrators) can upload media.
- Supported mime-types:
  - **Images**: JPEG, PNG, GIF, WebP
  - **Videos**: MP4, WebM, MOV
- Maximum file size: **50 MB** (to support high-resolution pictures and short video clips).
- Best-effort server cleanup deletes invalid or rejected files from disk.

### C. Aesthetic Curation & Gallery Layout
- Beautiful **Masonry-style photo/video grid** displaying all shared memories.
- Media hover animations:
  - Text caption overlays containing the uploader's name.
  - Videos auto-play in muted loop on hover, resetting to the start on mouse exit.
- Fullscreen preview overlay for all files:
  - Plays video clips with audio controls.
  - Displays high-resolution photos.
  - Esc key keyboard support to close preview.

### D. Admin Moderation & Curation Actions
- Inline moderation buttons visible *only to admins* on hover over media tiles:
  - **Check (Keep)**: Explicitly marks the post as curated (`kept`).
  - **Trash (Remove)**: Hides the post from normal attendees (`removed`).
  - **Delete (Hard Delete)**: Removes the database entry and deletes the physical file from the disk.
- Non-admin attendees cannot see items marked as `removed`.

---

## 4. Technical Architecture

### A. Database Schema
```sql
CREATE TABLE IF NOT EXISTS scrapbook_settings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  meetup_id        INTEGER NOT NULL UNIQUE,
  upload_close_at  TEXT,
  enabled          INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (meetup_id) REFERENCES meetups(id)
);

CREATE TABLE IF NOT EXISTS scrapbook_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  meetup_id    INTEGER NOT NULL,
  uploader_id  INTEGER NOT NULL,
  file_path    TEXT NOT NULL,
  media_type   TEXT NOT NULL DEFAULT 'photo',
  caption      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  uploaded_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meetup_id)   REFERENCES meetups(id),
  FOREIGN KEY (uploader_id) REFERENCES users(id)
);
```

### B. API Reference

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/scrapbook/:meetupId` | Checked-in User | Fetches gallery items, window state, and settings |
| **POST** | `/api/scrapbook/:meetupId/upload` | Checked-in User | Uploads media file + caption (Max 50MB) |
| **PATCH** | `/api/scrapbook/:meetupId/items/:itemId` | Admin | Set status (`pending` \| `kept` \| `removed`) |
| **DELETE** | `/api/scrapbook/:meetupId/items/:itemId` | Admin | Hard-deletes file from DB and filesystem |
| **GET** | `/api/scrapbook/:meetupId/settings` | Admin | Retrieves specific scrapbook configs |
| **PUT** | `/api/scrapbook/:meetupId/settings` | Admin | Updates close timestamp & enable toggle |
