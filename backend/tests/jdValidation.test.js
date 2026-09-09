const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const jd = require('../jdValidation');

const { hashJD, insertJD, validateAndResolveJD, validateJDText } = jd;

const JD_TEXT = `Job Title: Business Development Manager
Job Summary: We are hiring a BD Manager for a staffing agency in Indore.
Responsibilities:
- Own end-to-end recruitment mandates: sourcing, interviews, offers.
- Build and maintain client accounts.
Requirements:
- 5+ years experience in staffing / business development.
- Bachelor's degree required.
Skills: consultative sales, negotiation, CRM, cold outreach
Employment Type: Full-time, on-site
Location: Indore, MP
Salary budget: 8-12 LPA`;

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE job_descriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      client TEXT,
      description_text TEXT NOT NULL,
      requirements TEXT,
      file_path TEXT,
      company_id INTEGER,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      jd_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec("CREATE UNIQUE INDEX idx_jd_hash_test ON job_descriptions(jd_hash) WHERE jd_hash IS NOT NULL");
  return db;
}

test('1. a valid JD is accepted and created', async () => {
  const db = makeDb();
  const result = await validateAndResolveJD({ descriptionText: JD_TEXT, title: 'BD Manager' }, { db });
  assert.equal(result.status, 'new');
  const insert = insertJD(db, { title: result.title, description_text: result.text, hash: result.hash });
  assert.equal(insert.inserted, true);
});

test('2. uploading the same JD text again is reported as a duplicate', async () => {
  const db = makeDb();
  const first = await validateAndResolveJD({ descriptionText: JD_TEXT }, { db });
  const insert = insertJD(db, { title: 'First', description_text: first.text, hash: first.hash });
  const second = await validateAndResolveJD({ descriptionText: JD_TEXT }, { db });
  assert.equal(second.status, 'duplicate');
  assert.equal(second.jd.id, insert.id);
});

test('3. duplicate detection is content-based, never filename/title-based', async () => {
  const db = makeDb();
  const first = await validateAndResolveJD({ descriptionText: JD_TEXT, title: 'jd_a.pdf' }, { db });
  const insert = insertJD(db, { title: 'jd_a.pdf', description_text: first.text, hash: first.hash });
  const second = await validateAndResolveJD({ descriptionText: JD_TEXT, title: 'jd_b_12092026.docx' }, { db });
  assert.equal(second.status, 'duplicate');
  assert.equal(second.jd.id, insert.id);
});

test('4. Add Candidate flow reuses the existing JD id instead of creating a second row', async () => {
  const db = makeDb();
  const resolved = await validateAndResolveJD({ descriptionText: JD_TEXT }, { db });
  const first = insertJD(db, { title: 'JD A', description_text: resolved.text, hash: resolved.hash });
  assert.equal(first.inserted, true);
  const second = insertJD(db, { title: 'JD B', description_text: JD_TEXT, hash: hashJD(JD_TEXT) });
  assert.equal(second.inserted, false);
  assert.equal(second.existing.id, first.id);
});

test('5. a blank PDF (no extractable text) is rejected', async () => {
  const db = makeDb();
  const result = await validateAndResolveJD({ descriptionText: '' }, { db });
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'blank');
  assert.match(result.error, /Blank/i);
});

test('6. an empty DOCX is rejected as blank', async () => {
  const db = makeDb();
  const result = await validateAndResolveJD({ descriptionText: '   ' }, { db });
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'blank');
});

test('7. a random/gibberish document (non-empty) is rejected as not a JD', async () => {
  const db = makeDb();
  const result = await validateAndResolveJD({ descriptionText: 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua' }, { db });
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'not-a-jd');
});

test('8. a resume/CV upload is rejected as not a JD', async () => {
  const db = makeDb();
  const resume = `RESUME
Sai Kumar
Career Objective: Seeking a challenging role in data science.
Experience: 6+ years in analytics at Acme Corp.
Education: B.Tech in Computer Science
References available upon request.
Skills: python, sql, machine learning`;
  const result = await validateAndResolveJD({ descriptionText: resume }, { db });
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'not-a-jd');
});

test('9. whitespace/line-break/bullet/dash differences still hash as the same JD', async () => {
  const db = makeDb();
  const variant = `Job Title:  BUSINESS  Development Manager\r\n\r\nJob Summary:\tWe are hiring a BD Manager for a staffing agency in Indore.\n\nResponsibilities:\n\u2022 Own end-to-end recruitment mandates: sourcing, interviews, offers.\n\u2022 Build and maintain client accounts.\nRequirements:\n- 5+ years experience in staffing / business development.\n- Bachelor's degree required.\nSkills: consultative sales, negotiation, CRM, cold outreach\nEmployment Type:  Full-Time, On    Site\nLocation: Indore, MP\nSalary budget: 8\u201312 LPA\n\n\n`;
  assert.equal(hashJD(variant), hashJD(JD_TEXT));
  const first = await validateAndResolveJD({ descriptionText: JD_TEXT }, { db });
  const insert = insertJD(db, { title: 'T', description_text: first.text, hash: first.hash });
  const second = await validateAndResolveJD({ descriptionText: variant }, { db });
  assert.equal(second.status, 'duplicate');
  assert.equal(second.jd.id, insert.id);
});

test('10. simultaneous (race) inserts produce only one row; the loser reuses it', async () => {
  const db = makeDb();
  const a = insertJD(db, { title: 'A', description_text: JD_TEXT, hash: hashJD(JD_TEXT) });
  const b = insertJD(db, { title: 'B', description_text: JD_TEXT, hash: hashJD(JD_TEXT) });
  const count = db.prepare('SELECT COUNT(*) AS c FROM job_descriptions').get().c;
  assert.equal(count, 1);
  assert.equal(a.inserted, true);
  assert.equal(b.inserted, false);
  assert.equal(b.existing.id, a.id);
});

test('11. a slightly-different (edited) JD is treated as new and allowed', async () => {
  const db = makeDb();
  const edited = JD_TEXT.replace('8-12 LPA', '10-15 LPA').replace('Indore, MP', 'Pune, MH');
  assert.notEqual(hashJD(edited), hashJD(JD_TEXT));
  const first = await validateAndResolveJD({ descriptionText: JD_TEXT }, { db });
  const insert = insertJD(db, { title: 'Old', description_text: first.text, hash: first.hash });
  const second = await validateAndResolveJD({ descriptionText: edited }, { db });
  assert.equal(second.status, 'new');
  const insert2 = insertJD(db, { title: 'Edited', description_text: second.text, hash: second.hash });
  assert.equal(insert2.inserted, true);
  assert.notEqual(insert2.id, insert.id);
});

test('12. unsupported file types are rejected before any content check', async () => {
  const db = makeDb();
  const result = await validateAndResolveJD({ buffer: Buffer.from('x'), originalname: 'job.txt' }, { db });
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'file-type');
});