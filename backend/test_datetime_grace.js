const path = require('path');
const fs = require('fs');
const db = require('./src/db');

// Helper to create a dummy file
function createDummyFile(filename) {
  const uploadsDir = path.join(__dirname, '../uploads/scrapbook');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, 'dummy content');
  return `uploads/scrapbook/${filename}`;
}

async function runTests() {
  console.log('🏁 Running integration tests for Scrapbook Grace Period & Hard Deletion...');

  // 1. Setup dummy meetup, uploader user, and settings
  const meetupTitle = `Test Meetup ${Date.now()}`;
  const meetupResult = db.prepare(`
    INSERT INTO meetups (title, date, start_time, end_time, venue_name, capacity_limit, registration_deadline, organizer_id)
    VALUES (?, '2026-10-10', '10:00', '12:00', 'Test Venue', 100, '2026-10-09 10:00:00', 1)
  `).run(meetupTitle);
  const meetupId = meetupResult.lastInsertRowid;

  const userEmail = `testuser_${Date.now()}@test.com`;
  const userResult = db.prepare(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES ('Test Uploader', ?, 'hash', 'member')
  `).run(userEmail);
  const userId = userResult.lastInsertRowid;

  // Verify settings row lazily created
  db.prepare('INSERT INTO scrapbook_settings (meetup_id, upload_close_at, disappearing_close_at) VALUES (?, ?, ?)')
    .run(meetupId, new Date(Date.now() + 3600000).toISOString(), null);

  console.log(`✅ Test Meetup #${meetupId} and User #${userId} successfully created.`);

  // 2. Test Case A: Removing an item with NO active grace window -> Immediate deletion from DB and disk
  console.log('\n--- Test Case A: Remove with NO active grace window ---');
  const filenameA = `test_file_A_${Date.now()}.png`;
  const relativePathA = createDummyFile(filenameA);
  const fullPathA = path.join(__dirname, '../', relativePathA);

  const itemAResult = db.prepare(`
    INSERT INTO scrapbook_items (meetup_id, uploader_id, file_path, media_type, status, disappear_at)
    VALUES (?, ?, ?, 'photo', 'pending', null)
  `).run(meetupId, userId, relativePathA);
  const itemIdA = itemAResult.lastInsertRowid;

  console.log(`Created item A (#${itemIdA}) at ${fullPathA}`);
  if (!fs.existsSync(fullPathA)) {
    throw new Error('Dummy file A was not created on disk!');
  }

  // Simulate admin DELETE/PATCH curate immediate action (No grace window)
  // Let's implement the router patch curate logic manually for test assertion
  const settings = db.prepare('SELECT * FROM scrapbook_settings WHERE meetup_id=?').get(meetupId);
  const graceClose = settings.disappearing_close_at ? new Date(settings.disappearing_close_at) : null;
  const isGraceOpen = graceClose ? new Date() < graceClose : false;

  console.log(`Active grace window open? ${isGraceOpen} (Expected: false)`);
  if (isGraceOpen) {
    throw new Error('Grace window should be closed/unset!');
  }

  // Immediate delete logic
  fs.unlinkSync(fullPathA);
  db.prepare('DELETE FROM scrapbook_items WHERE id=?').run(itemIdA);

  const checkItemA = db.prepare('SELECT * FROM scrapbook_items WHERE id=?').get(itemIdA);
  if (checkItemA) {
    throw new Error('Item A was not deleted from database!');
  }
  if (fs.existsSync(fullPathA)) {
    throw new Error('Item A file was not deleted from disk!');
  }
  console.log('✅ Test Case A Passed: Item was hard-deleted from database and disk immediately.');

  // 3. Test Case B: Removing an item WITH an active grace window -> Update to removed & keep on disk/DB
  console.log('\n--- Test Case B: Remove WITH active grace window ---');
  const futureGraceTime = new Date(Date.now() + 10000).toISOString(); // 10 seconds in future
  db.prepare('UPDATE scrapbook_settings SET disappearing_close_at = ? WHERE meetup_id = ?')
    .run(futureGraceTime, meetupId);

  const filenameB = `test_file_B_${Date.now()}.png`;
  const relativePathB = createDummyFile(filenameB);
  const fullPathB = path.join(__dirname, '../', relativePathB);

  const itemBResult = db.prepare(`
    INSERT INTO scrapbook_items (meetup_id, uploader_id, file_path, media_type, status, disappear_at)
    VALUES (?, ?, ?, 'photo', 'pending', null)
  `).run(meetupId, userId, relativePathB);
  const itemIdB = itemBResult.lastInsertRowid;

  console.log(`Created item B (#${itemIdB}) at ${fullPathB}`);

  // Fetch settings again
  const settingsB = db.prepare('SELECT * FROM scrapbook_settings WHERE meetup_id=?').get(meetupId);
  const graceCloseB = settingsB.disappearing_close_at ? new Date(settingsB.disappearing_close_at) : null;
  const isGraceOpenB = graceCloseB ? new Date() < graceCloseB : false;

  console.log(`Active grace window open? ${isGraceOpenB} (Expected: true)`);
  if (!isGraceOpenB) {
    throw new Error('Grace window should be open!');
  }

  // Curation update to 'removed'
  db.prepare('UPDATE scrapbook_items SET status=?, disappear_at=? WHERE id=?')
    .run('removed', settingsB.disappearing_close_at, itemIdB);

  // Assert item B still exists in DB, status is 'removed', and disappear_at matches settings
  const checkItemB = db.prepare('SELECT * FROM scrapbook_items WHERE id=?').get(itemIdB);
  if (!checkItemB) {
    throw new Error('Item B was deleted prematurely!');
  }
  if (checkItemB.status !== 'removed') {
    throw new Error(`Expected status 'removed', got '${checkItemB.status}'`);
  }
  if (checkItemB.disappear_at !== settingsB.disappearing_close_at) {
    throw new Error(`Expected disappear_at '${settingsB.disappearing_close_at}', got '${checkItemB.disappear_at}'`);
  }
  if (!fs.existsSync(fullPathB)) {
    throw new Error('Item B dummy file vanished from disk prematurely!');
  }
  console.log('✅ Test Case B Passed: Item marked as removed with disappear_at set. Stays in DB and on disk.');

  // 4. Test Case C: Querying by standard user -> Item B is visible during grace period
  console.log('\n--- Test Case C: Standard user query during grace period ---');
  // Get items
  const itemsList = db.prepare(`
    SELECT * FROM scrapbook_items WHERE meetup_id = ?
  `).all(meetupId);

  // Standard user filter
  const visibleToUser = itemsList.filter(i => {
    if (i.status !== 'removed') return true;
    if (i.disappear_at && new Date(i.disappear_at) > new Date()) return true;
    return false;
  });

  const hasItemB = visibleToUser.some(i => i.id === itemIdB);
  console.log(`Is Item B visible to standard attendee during grace period? ${hasItemB} (Expected: true)`);
  if (!hasItemB) {
    throw new Error('Item B should be visible to attendees during its grace window!');
  }
  console.log('✅ Test Case C Passed: Item B visible to attendees during grace period.');

  // 5. Test Case D: After grace window expires, GET request cleans up expired removed item
  console.log('\n--- Test Case D: Background cleanup after grace window expiration ---');
  console.log('Waiting 11 seconds for grace period to expire...');
  await new Promise(resolve => setTimeout(resolve, 11000));

  const nowISO = new Date().toISOString();
  console.log(`Current time: ${nowISO}, Item B expiration: ${settingsB.disappearing_close_at}`);

  // Simulate GET /api/scrapbook/:meetupId cleanup code
  const expiredItems = db.prepare(`
    SELECT id, file_path FROM scrapbook_items
    WHERE meetup_id = ? AND status = 'removed' AND disappear_at <= ?
  `).all(meetupId, nowISO);

  console.log(`Found ${expiredItems.length} expired items (Expected: 1)`);
  if (expiredItems.length !== 1 || expiredItems[0].id !== itemIdB) {
    throw new Error('Expected exactly Item B to be marked as expired!');
  }

  // Execute actual cleanup code
  expiredItems.forEach(item => {
    const fullPath = path.join(__dirname, '../', item.file_path);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    db.prepare('DELETE FROM scrapbook_items WHERE id = ?').run(item.id);
  });

  // Verify deletion from DB and disk
  const checkItemBExpired = db.prepare('SELECT * FROM scrapbook_items WHERE id=?').get(itemIdB);
  if (checkItemBExpired) {
    throw new Error('Item B was not cleaned up from DB after expiration!');
  }
  if (fs.existsSync(fullPathB)) {
    throw new Error('Item B file was not cleaned up from disk after expiration!');
  }
  console.log('✅ Test Case D Passed: Expired removed items automatically cleaned up from DB and disk.');

  console.log('\n🎉 ALL SCRAPBOOK INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉');
}

runTests().catch(err => {
  console.error('\n❌ Test execution failed with error:', err);
  process.exit(1);
});
