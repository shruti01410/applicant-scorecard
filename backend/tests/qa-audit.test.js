const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const rv = require('../resumeValidation');
const jd = require('../jdValidation');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Synthetic buffer helpers
// ---------------------------------------------------------------------------

function fakePdf(text) {
  return Buffer.from('%PDF-1.4\n' + (text || ''), 'utf8');
}

function fakeDocx() {
  return Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
}

function fakeDoc() {
  return Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
}

function oversizedBuffer() {
  return Buffer.alloc(11 * 1024 * 1024, 0x41);
}

// ---------------------------------------------------------------------------
// Genuine resume texts (21 cases)
// ---------------------------------------------------------------------------

const EXPERIENCED_RESUME = `Sai Kumar
Email: sai.kumar@gmail.com | Phone: +91-9876543210 | LinkedIn: linkedin.com/in/saikumar

Professional Summary
Data scientist with 6+ years of experience in analytics and machine learning.

Experience
Senior Data Scientist — Acme Corp, Jan 2020–Present
- Built recommendation engine serving 2M daily users
- Led a team of 3 junior analysts

Data Analyst — TechStart, Jun 2017–Dec 2019
- Automated ETL pipelines reducing processing time by 40%

Education
B.Tech in Computer Science — IIT Bombay, 2017

Skills
Python, SQL, TensorFlow, PyTorch, Spark, AWS, Git

Certifications
AWS Certified Machine Learning Specialty

Projects
Customer Churn Predictor — end-to-end ML pipeline using XGBoost

Achievements
Best Paper Award at KDD 2021`;

const FRESHER_RESUME = `Priya Sharma
Email: priya.sharma@outlook.com | Phone: +91-9988776655

Objective
Motivated computer science graduate seeking a software engineering role.

Education
B.Tech in Computer Science — NIT Trichy, 2024
CGPA: 8.9/10

Skills
Java, C++, JavaScript, React, Node.js, MySQL, Git

Projects
- Student Portal: full-stack web app using React + Express + MongoDB
- Quiz App: real-time multiplayer quiz platform with WebSocket

Certifications
freeCodeCamp Responsive Web Design Certification

Achievements
- Won college hackathon 2023
- Active contributor on GitHub`;

const STUDENT_RESUME = `Amit Patel
amit.patel@student.edu | +91-9123456789 | github.com/amitp

Summary
Computer science student with strong foundations in algorithms and web development.

Education
B.Sc. Computer Science — Delhi University (2022–2025)

Skills
HTML, CSS, JavaScript, Python, React, Django, PostgreSQL

Projects
- E-commerce Website: built a full-stack Django application
- Personal Blog: Jekyll-based static site deployed on GitHub Pages

Certifications
Google IT Support Professional Certificate`;

const MINIMAL_RESUME = `John Doe
Email: john@example.com | Phone: 555-1234567

Summary
Experienced professional with strong communication skills.

Skills
Microsoft Office, Google Suite, Slack, Zoom

Experience
Administrative Assistant — ABC Corp, 2020–Present
- Managed schedules and correspondence for 5 executives
- Coordinated travel arrangements and expense reports

Education
Bachelor of Arts in Communications — State University, 2019`;

const TECHNICAL_RESUME = `Rajesh Singh
rajesh.singh@outlook.com | +91-876543210 | github.com/rajeshs

Summary
Full-stack developer with 4 years of experience building scalable web applications.

Experience
Software Engineer — TechCorp, Mar 2021–Present
- Developed microservices architecture handling 10M+ daily requests
- Mentored 2 junior developers

Software Developer — StartupXYZ, Jul 2019–Feb 2021
- Built real-time chat application using WebSocket and Redis
- Implemented CI/CD pipeline reducing deployment time by 60%

Education
B.Tech in Information Technology — VJTI Mumbai, 2019

Skills
JavaScript, TypeScript, React, Node.js, PostgreSQL, Redis, Docker, Kubernetes

Projects
- CodeCollab: real-time collaborative code editor with 500+ users
- DevTrack: developer productivity dashboard

Certifications
AWS Certified Solutions Architect – Associate`;

const CERTIFICATE_TEXT = `CERTIFICATE OF COMPLETION
This is to certify that John Doe has successfully completed the course
"Introduction to Data Science" on 15 March 2024.
Course Duration: 8 weeks
Certificate ID: DS-2024-001`;

const OFFER_LETTER_TEXT = `OFFER LETTER
Date: 01 June 2024
Dear Priya,
We are pleased to inform you that you have been selected for the position
of Software Engineer at TechCorp Pvt. Ltd.
Annual CTC: 12,00,000 per annum
Joining Date: 15 July 2024
Please confirm your acceptance by replying to this letter.`;

const MARKSHEET_TEXT = `SEMESTER 4 MARKSHEET
Roll No: 2022CS045
Student Name: Rahul Verma
Subject Code | Subject Name                    | Marks Obtained
CS401       | Data Structures                  | 85
CS402       | Operating Systems                | 78
CS403       | Database Management Systems       | 90
Total Marks: 253 / 300
CGPA: 8.43`;

const COVER_LETTER_TEXT = `Dear Hiring Manager,
I am writing to apply for the position of Marketing Analyst at your company.
With my background in analytics and digital marketing, I believe I would be
a strong addition to your team. I am excited to bring my skills in data
analysis and consumer insights to your organization.

Enclosed is my resume for your review. Thank you for your consideration.

Sincerely,
Anjali Mehta`;

const RANDOM_DOC = `Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor
incididunt ut labore et dolore magna aliquaUt enim ad minim veniam quis nostrud
exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat`;

const LOW_TEXT = `Name: X
Phone: 1234567890
Skills: Java`;

const CERTIFICATE_AS_RESUME = `CERTIFICATE OF COMPLETION
This is to certify that John Doe has successfully completed the course
"Introduction to Data Science" on 15 March 2024.
Course Duration: 8 weeks
Certificate ID: DS-2024-001`;

const RESUME_AS_JD = `RESUME
Sai Kumar
Career Objective: Seeking a challenging role in data science.
Experience: 6+ years in analytics at Acme Corp.
Education: B.Tech in Computer Science
References available upon request.
Skills: python, sql, machine learning`;

const MIXED_CONTENT = `Job Title: Software Engineer
Responsibilities:
- Develop and maintain web applications
- Participate in code reviews

Experience
Software Developer — ABC Corp, 2020–Present

Education
B.Tech in Computer Science

Skills: JavaScript, React, Node.js`;

// ---------------------------------------------------------------------------
// JD texts (21 cases)
// ---------------------------------------------------------------------------

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

const JD_MINIMAL = `Position: Marketing Coordinator
Summary: Entry-level marketing role with growth opportunities.
Requirements: Bachelor's degree in Marketing or related field.
Experience: 1+ years in marketing or advertising.
Location: Remote`;

const JD_DETAILED = `Job Title: Senior Software Engineer
Job Summary: We are looking for a Senior Software Engineer to join our core platform team.

Responsibilities:
- Design and implement scalable backend services
- Lead technical architecture decisions
- Mentor junior engineers and conduct code reviews
- Collaborate with product managers to define technical requirements

Requirements:
- 5+ years of professional software development experience
- Strong proficiency in JavaScript/TypeScript, React, Node.js
- Experience with cloud platforms (AWS, GCP, or Azure)
- Bachelor's degree in Computer Science or equivalent experience

Skills: JavaScript, TypeScript, React, Node.js, PostgreSQL, Redis, Docker, Kubernetes
Employment Type: Full-time
Location: Bangalore / Remote
Salary: 25-35 LPA
Notice Period: Immediate to 30 days`;

const JD_STARTUP = `Role: Full Stack Developer
About the Role: Join our fast-paced startup building the next generation of fintech solutions.
You will own entire features from conception to deployment.

What You'll Do:
- Build responsive web applications using React and Node.js
- Design and implement RESTful APIs
- Work closely with designers and product managers
- Participate in on-call rotations

What You'll Need:
- 3+ years of full-stack development experience
- Proficiency in JavaScript/TypeScript
- Experience with SQL and NoSQL databases
- Strong problem-solving skills

Location: Mumbai (Hybrid)
Employment Type: Full-time, Permanent
Salary: 15-22 LPA`;

const JD_UNSUPPORTED_EXT = `Job Title: Data Analyst
Summary: Analyze business data and create reports.
Requirements: SQL, Excel, Python.
Experience: 2+ years.
Location: Pune`;

const JD_BLANK_TEXT = '';

const JD_NEAR_BLANK = 'Job posting';

const JD_GIBBERISH = `Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor
incididunt ut labore et dolore magna aliquaUt enim ad minim veniam quis nostrud
exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat`;

const JD_RESUME_CONTENT = `RESUME
Sai Kumar
Career Objective: Seeking a challenging role in data science.
Experience: 6+ years in analytics at Acme Corp.
Education: B.Tech in Computer Science
References available upon request.
Skills: python, sql, machine learning`;

const JD_SINGLE_SIGNAL = `We are hiring a Software Engineer to join our team in Bangalore.`;

const exactlyTwoSignals = `Position: Marketing Coordinator
Summary: Entry-level marketing role with growth opportunities.`;

const JD_WHITESPACE_VARIANT = `Job Title:  BUSINESS  Development Manager\r\n\r\nJob Summary:\tWe are hiring a BD Manager for a staffing agency in Indore.\n\nResponsibilities:\n• Own end-to-end recruitment mandates: sourcing, interviews, offers.\n• Build and maintain client accounts.\nRequirements:\n- 5+ years experience in staffing / business development.\n- Bachelor's degree required.\nSkills: consultative sales, negotiation, CRM, cold outreach\nEmployment Type:  Full-Time, On    Site\nLocation: Indore, MP\nSalary budget: 8–12 LPA\n\n\n`;

const JD_SPECIAL_CHARS = `Job Title: Senior Developer (C++/Java)
Job Summary: We need a developer with expertise in C++ and Java.
Responsibilities:
- Design high-performance systems
- Optimize critical paths
Requirements:
- 5+ years C++ or Java experience
- BS/MS in Computer Science
Skills: C++, Java, multithreading, STL
Location: Hyderabad`;

const JD_LONG_DESCRIPTION = `Job Title: Software Architect
Job Summary: Lead the technical vision for our enterprise platform.
Responsibilities:
${Array.from({length: 50}, (_, i) => `- Responsibility ${i+1}: Design and implement scalable solutions for the platform`).join('\n')}
Requirements:
${Array.from({length: 20}, (_, i) => `- Requirement ${i+1}: Strong experience in distributed systems`).join('\n')}
Skills: Java, Spring Boot, Microservices, AWS, Docker, Kubernetes
Location: Remote`;

// ---------------------------------------------------------------------------
// RESUME VALIDATION: 21 TEST CASES
// ---------------------------------------------------------------------------

test('R1. experienced resume is accepted (high confidence)', () => {
  const { score, matched } = rv.calculateResumeConfidence(EXPERIENCED_RESUME);
  assert.ok(score >= 60, `score ${score} should be >= 60`);
  assert.ok(matched.length >= 5, `should detect ≥5 sections, got ${matched.length}`);
});

test('R2. fresher resume is accepted', () => {
  const { score, matched } = rv.calculateResumeConfidence(FRESHER_RESUME);
  assert.ok(score >= 60, `score ${score} should be >= 60`);
  assert.ok(matched.length >= 5, `should detect ≥5 sections, got ${matched.length}`);
});

test('R3. student resume is accepted', () => {
  const { score, matched } = rv.calculateResumeConfidence(STUDENT_RESUME);
  assert.ok(score >= 60, `score ${score} should be >= 60`);
  assert.ok(matched.length >= 4, `should detect ≥4 sections, got ${matched.length}`);
});

test('R4. minimal resume with basic sections is accepted', () => {
  const { score, matched } = rv.calculateResumeConfidence(MINIMAL_RESUME);
  assert.ok(score >= 60, `score ${score} should be >= 60`);
  assert.ok(matched.length >= 4, `should detect ≥4 sections, got ${matched.length}`);
});

test('R5. technical resume with many skills is accepted', () => {
  const { score, matched } = rv.calculateResumeConfidence(TECHNICAL_RESUME);
  assert.ok(score >= 60, `score ${score} should be >= 60`);
  assert.ok(matched.length >= 6, `should detect ≥6 sections, got ${matched.length}`);
});

test('R6. blank document is rejected', async () => {
  const buf = fakePdf('');
  const result = await rv.validateResume(buf, 'blank.pdf', { threshold: 60 });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'blank');
});

test('R7. certificate is rejected (negative signal)', () => {
  const { score, negFlags } = rv.calculateResumeConfidence(CERTIFICATE_TEXT);
  assert.ok(score < 60, `score ${score} should be < 60 for certificate`);
  assert.ok(negFlags.includes('certificate'), 'should flag as certificate');
});

test('R8. offer letter is rejected (negative signal)', () => {
  const { score, negFlags } = rv.calculateResumeConfidence(OFFER_LETTER_TEXT);
  assert.ok(score < 60, `score ${score} should be < 60 for offer letter`);
  assert.ok(negFlags.includes('offer_letter'), 'should flag as offer letter');
});

test('R9. marksheet is rejected (negative signal)', () => {
  const { score, negFlags } = rv.calculateResumeConfidence(MARKSHEET_TEXT);
  assert.ok(score < 60, `score ${score} should be < 60 for marksheet`);
  assert.ok(negFlags.includes('marksheet'), 'should flag as marksheet');
});

test('R10. cover letter is rejected (negative signal)', () => {
  const { score, negFlags } = rv.calculateResumeConfidence(COVER_LETTER_TEXT);
  assert.ok(score < 60, `score ${score} should be < 60 for cover letter`);
  assert.ok(negFlags.includes('cover_letter'), 'should flag as cover letter');
});

test('R11. random document is rejected (low section count)', () => {
  const { score, matched } = rv.calculateResumeConfidence(RANDOM_DOC);
  assert.ok(score < 60, `score ${score} should be < 60 for random doc`);
  assert.ok(matched.length < 3, `should detect <3 sections, got ${matched.length}`);
});

test('R12. renamed certificate (resume.pdf with certificate content) is rejected by content', () => {
  const { score, negFlags } = rv.calculateResumeConfidence(CERTIFICATE_TEXT);
  assert.ok(score < 60, `score ${score} should be < 60 even if named "resume.pdf"`);
  assert.ok(negFlags.length > 0, 'should have negative flags');
});

test('R13. corrupted/unreadable file is rejected', async () => {
  const buf = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const result = await rv.validateResume(buf, 'corrupt.pdf', { threshold: 60 });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'blank');
});

test('R14. unsupported file type (.txt) is rejected at file level', () => {
  const result = rv.validateResumeFile({ originalname: 'resume.txt', size: 1000, buffer: Buffer.from('text') });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'file_type');
});

test('R15. oversized file (>10MB) is rejected at file level', () => {
  const buf = oversizedBuffer();
  const result = rv.validateResumeFile({ originalname: 'resume.pdf', size: buf.length, buffer: buf });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'too_large');
});

test('R16. valid .doc file is accepted at file level', () => {
  const buf = fakeDoc();
  const result = rv.validateResumeFile({ originalname: 'resume.doc', size: buf.length, buffer: buf });
  assert.equal(result.ok, true);
});

test('R17. valid .docx file is accepted at file level', () => {
  const buf = fakeDocx();
  const result = rv.validateResumeFile({ originalname: 'resume.docx', size: buf.length, buffer: buf });
  assert.equal(result.ok, true);
});

test('R18. .pdf that is actually a DOC (mime mismatch) is rejected', () => {
  const buf = fakeDoc();
  const result = rv.validateResumeFile({ originalname: 'resume.pdf', size: buf.length, buffer: buf });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'mime_mismatch');
});

test('R19. low text content (<15 words) is detected as unreadable', () => {
  assert.equal(rv.isReadable(LOW_TEXT), false, 'should return false for very short text');
  assert.equal(rv.isReadable(''), false, 'should return false for empty string');
  assert.equal(rv.isReadable(null), false, 'should return false for null');
});

test('R20. structure bonus gives +10 for ≥5 sections', () => {
  const result = rv.calculateResumeConfidence(EXPERIENCED_RESUME);
  assert.ok(result.matched.length >= 5, 'should detect ≥5 sections');
  assert.ok(result.score >= 70, `score ${result.score} should include structure bonus`);
});

test('R21. structure bonus gives +5 for 4 sections', () => {
  const text = `John Doe
Phone: 555-1234567

Skills
Microsoft Office, Google Suite, Slack, Zoom

Experience
Administrative Assistant — ABC Corp, 2020–Present
- Managed schedules and correspondence for 5 executives

Education
Bachelor of Arts in Communications — State University, 2019`;
  const { score, matched } = rv.calculateResumeConfidence(text);
  assert.ok(matched.length >= 4 && matched.length < 5, `should detect exactly 4 sections, got ${matched.length}`);
  assert.ok(score >= 60, `score ${score} should be >= 60 with 4-section bonus`);
});

// ---------------------------------------------------------------------------
// JD VALIDATION: 21 TEST CASES
// ---------------------------------------------------------------------------

test('J1. valid JD is accepted and created', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: JD_TEXT, title: 'BD Manager' }, { db });
  assert.equal(result.status, 'new');
  const insert = jd.insertJD(db, { title: result.title, description_text: result.text, hash: result.hash });
  assert.equal(insert.inserted, true);
});

test('J2. duplicate JD text is detected as duplicate', async () => {
  const db = makeDb();
  const first = await jd.validateAndResolveJD({ descriptionText: JD_TEXT }, { db });
  const insert = jd.insertJD(db, { title: 'First', description_text: first.text, hash: first.hash });
  const second = await jd.validateAndResolveJD({ descriptionText: JD_TEXT }, { db });
  assert.equal(second.status, 'duplicate');
  assert.equal(second.jd.id, insert.id);
});

test('J3. duplicate detection is content-based, not filename-based', async () => {
  const db = makeDb();
  const first = await jd.validateAndResolveJD({ descriptionText: JD_TEXT, title: 'jd_a.pdf' }, { db });
  const insert = jd.insertJD(db, { title: 'jd_a.pdf', description_text: first.text, hash: first.hash });
  const second = await jd.validateAndResolveJD({ descriptionText: JD_TEXT, title: 'jd_b_12092026.docx' }, { db });
  assert.equal(second.status, 'duplicate');
  assert.equal(second.jd.id, insert.id);
});

test('J4. Add Candidate flow reuses existing JD id', async () => {
  const db = makeDb();
  const resolved = await jd.validateAndResolveJD({ descriptionText: JD_TEXT }, { db });
  const first = jd.insertJD(db, { title: 'JD A', description_text: resolved.text, hash: resolved.hash });
  assert.equal(first.inserted, true);
  const second = jd.insertJD(db, { title: 'JD B', description_text: JD_TEXT, hash: jd.hashJD(JD_TEXT) });
  assert.equal(second.inserted, false);
  assert.equal(second.existing.id, first.id);
});

test('J5. blank text is rejected', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: '' }, { db });
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'blank');
});

test('J6. near-blank text (<40 chars) is rejected as blank', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: JD_NEAR_BLANK }, { db });
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'blank');
});

test('J7. random/gibberish text is rejected as not-a-jd', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: JD_GIBBERISH }, { db });
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'not-a-jd');
});

test('J8. resume content is rejected as not-a-jd', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: JD_RESUME_CONTENT }, { db });
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'not-a-jd');
});

test('J9. whitespace/line-break/bullet differences hash identically', async () => {
  const db = makeDb();
  assert.equal(jd.hashJD(JD_WHITESPACE_VARIANT), jd.hashJD(JD_TEXT));
  const first = await jd.validateAndResolveJD({ descriptionText: JD_TEXT }, { db });
  const insert = jd.insertJD(db, { title: 'T', description_text: first.text, hash: first.hash });
  const second = await jd.validateAndResolveJD({ descriptionText: JD_WHITESPACE_VARIANT }, { db });
  assert.equal(second.status, 'duplicate');
  assert.equal(second.jd.id, insert.id);
});

test('J10. simultaneous (race) inserts produce only one row', async () => {
  const db = makeDb();
  const a = jd.insertJD(db, { title: 'A', description_text: JD_TEXT, hash: jd.hashJD(JD_TEXT) });
  const b = jd.insertJD(db, { title: 'B', description_text: JD_TEXT, hash: jd.hashJD(JD_TEXT) });
  const count = db.prepare('SELECT COUNT(*) AS c FROM job_descriptions').get().c;
  assert.equal(count, 1);
  assert.equal(a.inserted, true);
  assert.equal(b.inserted, false);
  assert.equal(b.existing.id, a.id);
});

test('J11. slightly-different JD is treated as new', async () => {
  const db = makeDb();
  const edited = JD_TEXT.replace('8-12 LPA', '10-15 LPA').replace('Indore, MP', 'Pune, MH');
  assert.notEqual(jd.hashJD(edited), jd.hashJD(JD_TEXT));
  const first = await jd.validateAndResolveJD({ descriptionText: JD_TEXT }, { db });
  const insert = jd.insertJD(db, { title: 'Old', description_text: first.text, hash: first.hash });
  const second = await jd.validateAndResolveJD({ descriptionText: edited }, { db });
  assert.equal(second.status, 'new');
  const insert2 = jd.insertJD(db, { title: 'Edited', description_text: second.text, hash: second.hash });
  assert.equal(insert2.inserted, true);
  assert.notEqual(insert2.id, insert.id);
});

test('J12. unsupported file types are rejected before content check', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ buffer: Buffer.from('x'), originalname: 'job.txt' }, { db });
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'file-type');
});

test('J13. minimal JD with 2+ signals is accepted', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: JD_MINIMAL }, { db });
  assert.equal(result.status, 'new');
  assert.ok(result.text.length > 0, 'should have extracted text');
});

test('J14. detailed JD with many sections is accepted', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: JD_DETAILED }, { db });
  assert.equal(result.status, 'new');
});

test('J15. startup-style JD is accepted', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: JD_STARTUP }, { db });
  assert.equal(result.status, 'new');
});

test('J16. JD with only 1 signal is rejected', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: JD_SINGLE_SIGNAL }, { db });
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'not-a-jd');
});

test('J17. JD with exactly 2 signals is accepted', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: exactlyTwoSignals }, { db });
  assert.equal(result.status, 'new');
});

test('J18. JD with special characters is accepted', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: JD_SPECIAL_CHARS }, { db });
  assert.equal(result.status, 'new');
});

test('J19. JD with long description is accepted', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: JD_LONG_DESCRIPTION }, { db });
  assert.equal(result.status, 'new');
});

test('J20. blank DOCX file is rejected', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: '   ' }, { db });
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'blank');
});

test('J21. JD with HTML-like formatting in text is accepted', async () => {
  const db = makeDb();
  const htmlJd = `Job Title: Developer
Summary: We need a developer.
Responsibilities: Build things.
Requirements: 3+ years experience.
Skills: JavaScript, React`;
  const result = await jd.validateAndResolveJD({ descriptionText: htmlJd }, { db });
  assert.equal(result.status, 'new');
});

// ---------------------------------------------------------------------------
// CROSS-TYPE: Resume content uploaded as JD, JD content uploaded as Resume
// ---------------------------------------------------------------------------

test('X1. resume content uploaded as JD is rejected', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: RESUME_AS_JD }, { db });
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'not-a-jd');
});

test('X2. JD content uploaded as resume gets low confidence', () => {
  const simpleJd = `Position: Marketing Coordinator
Location: Remote
Salary: 5-8 LPA
Notice Period: 15 days`;
  const { score, matched } = rv.calculateResumeConfidence(simpleJd);
  assert.ok(score < 60, `score ${score} should be < 60 for simple JD content treated as resume`);
});

test('X3. mixed JD+resume content accepted as JD (has ≥2 JD signals)', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: MIXED_CONTENT }, { db });
  assert.equal(result.status, 'new');
});

test('X4. mixed JD+resume content gets moderate resume confidence', () => {
  const { score } = rv.calculateResumeConfidence(MIXED_CONTENT);
  assert.ok(score >= 40, `score ${score} should be >= 40 for mixed content (has experience, skills, education)`);
});

// ---------------------------------------------------------------------------
// RENAMED FILE: Content-based rejection despite filename change
// ---------------------------------------------------------------------------

test('N1. certificate renamed to resume.pdf is rejected by content', () => {
  const { score, negFlags } = rv.calculateResumeConfidence(CERTIFICATE_AS_RESUME);
  assert.ok(score < 60, `score ${score} should be < 60 for certificate disguised as resume`);
  assert.ok(negFlags.includes('certificate'), 'should detect certificate content');
});

test('N2. resume content uploaded as job-description.pdf gets rejected by JD validator', async () => {
  const db = makeDb();
  const result = await jd.validateAndResolveJD({ descriptionText: RESUME_AS_JD }, { db });
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'not-a-jd');
});

test('N3. genuine resume named job-description.pdf still passes resume validation', () => {
  const { score } = rv.calculateResumeConfidence(EXPERIENCED_RESUME);
  assert.ok(score >= 60, `score ${score} should be >= 60 for genuine resume regardless of filename`);
});

// ---------------------------------------------------------------------------
// FULL ADD CANDIDATE FLOW: Resume + JD combinations
// ---------------------------------------------------------------------------

test('F1. valid resume + valid JD: both pass content validation', async () => {
  const resumeResult = rv.calculateResumeConfidence(EXPERIENCED_RESUME);
  assert.ok(resumeResult.score >= 60, `resume score ${resumeResult.score} should be >= 60`);

  const db = makeDb();
  const jdResult = await jd.validateAndResolveJD({ descriptionText: JD_TEXT }, { db });
  assert.equal(jdResult.status, 'new', 'JD should be accepted');
});

test('F2. invalid resume (certificate) fails content validation', () => {
  const resumeResult = rv.calculateResumeConfidence(CERTIFICATE_TEXT);
  assert.ok(resumeResult.score < 60, `certificate score ${resumeResult.score} should be < 60`);
  assert.ok(resumeResult.negFlags.includes('certificate'), 'should flag as certificate');
});

test('F3. invalid JD blocks the flow', async () => {
  const db = makeDb();
  const jdResult = await jd.validateAndResolveJD({ descriptionText: JD_GIBBERISH }, { db });
  assert.equal(jdResult.status, 'invalid');
  assert.equal(jdResult.reason, 'not-a-jd');
});

test('F4. valid resume content passes, JD optional', () => {
  const resumeResult = rv.calculateResumeConfidence(EXPERIENCED_RESUME);
  assert.ok(resumeResult.score >= 60, `resume score ${resumeResult.score} should be >= 60`);
  // No JD uploaded — that's fine, JD is optional
});

test('F5. no resume + valid JD: resume skipped, JD passes', async () => {
  const db = makeDb();
  const jdResult = await jd.validateAndResolveJD({ descriptionText: JD_TEXT }, { db });
  assert.equal(jdResult.status, 'new', 'JD should be accepted');
  // No resume uploaded — that's fine, resume is optional
});

test('F6. duplicate JD in Add Candidate flow: second upload returns existing id', async () => {
  const db = makeDb();
  const first = await jd.validateAndResolveJD({ descriptionText: JD_TEXT, title: 'First' }, { db });
  const insert = jd.insertJD(db, { title: 'First', description_text: first.text, hash: first.hash });
  const second = await jd.validateAndResolveJD({ descriptionText: JD_TEXT, title: 'Second' }, { db });
  assert.equal(second.status, 'duplicate');
  assert.equal(second.jd.id, insert.id, 'should reuse existing JD id');
});

test('Destiny Momentum recovers missing expression from the candidate name', () => {
  const { computeNumoParameters } = require('../numerologyUtils');
  const profile = { life_path_number: 3, birth_number: 1, date_of_birth: '1990-01-01' };
  const destiny = computeNumoParameters(profile, { founded_number: 3 }, 'Alice').find(p => p.key === 'destiny');
  assert.equal(destiny.score, 5);
  assert.match(destiny.basis, /Expression 3 .* Company 3/);
  for (const expression_number of [null, 0, -1, 10]) {
    const result = computeNumoParameters({ ...profile, expression_number, numerology_name: 'Alice', full_name: 'Bob' }, { founded_number: 3 }).find(p => p.key === 'destiny');
    assert.equal(result.score, 5);
  }
  const missing = computeNumoParameters(profile, { founded_number: 3 }).find(p => p.key === 'destiny');
  assert.equal(missing.score, 3);
  assert.equal(missing.diff, null);
  assert.match(missing.basis, /unavailable/);
});

test('Destiny Momentum varies by expression and preserves the existing formula', () => {
  const { computeNumoParameters } = require('../numerologyUtils');
  const profile = { life_path_number: 3, birth_number: 1, date_of_birth: '1990-01-01' };
  for (const [expression_number, score] of [[1, 3], [2, 4], [3, 5], [4, 4], [5, 3], [6, 2], [7, 2], [8, 2], [9, 2], [11, 5], [22, 5], [33, 4]]) {
    const result = computeNumoParameters({ ...profile, expression_number }, { founded_number: 3 }).find(p => p.key === 'destiny');
    assert.equal(result.score, score, `Expression ${expression_number}`);
  }
  const fallback = computeNumoParameters(profile, null, 'Alice').find(p => p.key === 'destiny');
  assert.equal(fallback.score, 4);
  assert.match(fallback.basis, /Life Path 3/);
});

test('Deep parameters endpoint uses the user name for a legacy profile', async () => {
  const express = require('express');
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER, name TEXT, email TEXT, role TEXT, date_of_birth TEXT, company_id INTEGER, job_description_id INTEGER);
    CREATE TABLE numerology_profiles (employee_id INTEGER, dimension TEXT, date_of_birth TEXT, life_path_number INTEGER, birth_number INTEGER, expression_number INTEGER, full_name TEXT, numerology_name TEXT);
    CREATE TABLE company_numerology_profiles (id INTEGER, founded_number INTEGER);
    INSERT INTO users VALUES (1, 'Alice', '', 'employee', '1990-01-01', 1, NULL);
    INSERT INTO numerology_profiles VALUES (1, 'candidate', '1990-01-01', 3, 1, NULL, NULL, NULL);
    INSERT INTO company_numerology_profiles VALUES (1, 3);
  `);
  const paths = ['./database', './middleware/auth', './routes/numerology'].map(p => require.resolve(`../${p.slice(2)}`));
  const cached = paths.map(p => require.cache[p]);
  const enabled = process.env.ENABLE_INNER_INTELLIGENCE;
  let server;
  try {
    require.cache[paths[0]] = { exports: db };
    require.cache[paths[1]] = { exports: { authenticate: (req, res, next) => next(), requireRole: () => (req, res, next) => next() } };
    delete require.cache[paths[2]];
    process.env.ENABLE_INNER_INTELLIGENCE = 'true';
    const app = express();
    app.use('/api/admin', require('../routes/numerology'));
    server = await new Promise(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/employees/1/numerology/numo-params`);
    assert.equal(response.status, 200);
    const body = await response.json();
    const destiny = body.params.find(p => p.key === 'destiny');
    assert.equal(destiny.score, 5);
    assert.match(destiny.basis, /Expression 3 .* Company 3/);
    assert.equal(db.prepare('SELECT expression_number FROM numerology_profiles').get().expression_number, null);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    db.close();
    paths.forEach((p, i) => {
      if (cached[i]) require.cache[p] = cached[i];
      else delete require.cache[p];
    });
    if (enabled === undefined) delete process.env.ENABLE_INNER_INTELLIGENCE;
    else process.env.ENABLE_INNER_INTELLIGENCE = enabled;
  }
});

test('resume integrity analyzer terminates on claims text (regression: infinite regex loop)', () => {
  const { analyzeResume } = require('../resumeIntegrityAnalyzer');
  const text = 'Data scientist with 6+ years doing Python, SQL and ML. Managed and delivered projects.';
  const started = Date.now();
  const result = analyzeResume(text);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 3000, `analyzeResume took ${elapsed}ms — likely infinite loop`);
  assert.ok(Array.isArray(result.detectedFlags));
});


