const { test } = require('node:test');
const assert = require('node:assert/strict');
const rv = require('../resumeValidation');

// ---------------------------------------------------------------------------
// Helper: build a minimal PDF buffer (just enough for sniffType)
// ---------------------------------------------------------------------------
function fakePdf(text) {
  return Buffer.from('%PDF-1.4\n' + (text || ''), 'utf8');
}

function fakeDocx() {
  // Minimal DOCX-like ZIP header (PK\x03\x04) — won't parse as real DOCX,
  // but tests the mime-sniff path. For content tests we call calculateResumeConfidence directly.
  return Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
}

function fakeDoc() {
  // Legacy .doc OLE magic
  return Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
}

function oversizedBuffer() {
  return Buffer.alloc(11 * 1024 * 1024, 0x41); // 11 MB
}

// ---------------------------------------------------------------------------
// Genuine resume texts
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

// ---------------------------------------------------------------------------
// Negative-signal texts
// ---------------------------------------------------------------------------

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

const BLANK_TEXT = '';

const LOW_TEXT = `Name: X
Phone: 1234567890
Skills: Java`;

// ---------------------------------------------------------------------------
// File-level tests
// ---------------------------------------------------------------------------

test('1. a genuine experienced resume is accepted', async () => {
  const { score, matched } = rv.calculateResumeConfidence(EXPERIENCED_RESUME);
  assert.ok(score >= 60, `score ${score} should be >= 60`);
  assert.ok(matched.length >= 5, `should detect ≥5 sections, got ${matched.length}`);
});

test('2. a genuine fresher resume is accepted', async () => {
  const { score, matched } = rv.calculateResumeConfidence(FRESHER_RESUME);
  assert.ok(score >= 60, `score ${score} should be >= 60`);
  assert.ok(matched.length >= 5, `should detect ≥5 sections, got ${matched.length}`);
});

test('3. a student resume is accepted', async () => {
  const { score, matched } = rv.calculateResumeConfidence(STUDENT_RESUME);
  assert.ok(score >= 60, `score ${score} should be >= 60`);
  assert.ok(matched.length >= 4, `should detect ≥4 sections, got ${matched.length}`);
});

test('4. a blank document is rejected', async () => {
  const buf = fakePdf(BLANK_TEXT);
  const result = await rv.validateResume(buf, 'blank.pdf', { threshold: 60 });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'blank');
});

test('5. a certificate is rejected', async () => {
  const { score, negFlags } = rv.calculateResumeConfidence(CERTIFICATE_TEXT);
  assert.ok(score < 60, `score ${score} should be < 60 for certificate`);
  assert.ok(negFlags.includes('certificate'), 'should flag as certificate');
});

test('6. an offer letter is rejected', async () => {
  const { score, negFlags } = rv.calculateResumeConfidence(OFFER_LETTER_TEXT);
  assert.ok(score < 60, `score ${score} should be < 60 for offer letter`);
  assert.ok(negFlags.includes('offer_letter'), 'should flag as offer letter');
});

test('7. a marksheet is rejected', async () => {
  const { score, negFlags } = rv.calculateResumeConfidence(MARKSHEET_TEXT);
  assert.ok(score < 60, `score ${score} should be < 60 for marksheet`);
  assert.ok(negFlags.includes('marksheet'), 'should flag as marksheet');
});

test('8. a cover letter is rejected', async () => {
  const { score, negFlags } = rv.calculateResumeConfidence(COVER_LETTER_TEXT);
  assert.ok(score < 60, `score ${score} should be < 60 for cover letter`);
  assert.ok(negFlags.includes('cover_letter'), 'should flag as cover letter');
});

test('9. a random document is rejected', async () => {
  const { score, matched } = rv.calculateResumeConfidence(RANDOM_DOC);
  assert.ok(score < 60, `score ${score} should be < 60 for random doc`);
  assert.ok(matched.length < 3, `should detect <3 sections, got ${matched.length}`);
});

test('10. a renamed non-resume (resume.pdf with certificate content) is rejected by content', async () => {
  const { score, negFlags } = rv.calculateResumeConfidence(CERTIFICATE_TEXT);
  assert.ok(score < 60, `score ${score} should be < 60 even if named "resume.pdf"`);
  assert.ok(negFlags.length > 0, 'should have negative flags');
});

test('11. a corrupted/unreadable file is rejected', async () => {
  const buf = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const result = await rv.validateResume(buf, 'corrupt.pdf', { threshold: 60 });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'blank');
});

test('12. an unsupported file type (.txt) is rejected at file level', async () => {
  const result = await rv.validateResumeFile({ originalname: 'resume.txt', size: 1000, buffer: Buffer.from('text') });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'file_type');
});

test('13. an oversized file is rejected at file level', async () => {
  const buf = oversizedBuffer();
  const result = await rv.validateResumeFile({ originalname: 'resume.pdf', size: buf.length, buffer: buf });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'too_large');
});

test('14. a valid .doc file is accepted at file level', async () => {
  const buf = fakeDoc();
  const result = rv.validateResumeFile({ originalname: 'resume.doc', size: buf.length, buffer: buf });
  assert.equal(result.ok, true);
});

test('15. a valid .docx file is accepted at file level', async () => {
  const buf = fakeDocx();
  const result = rv.validateResumeFile({ originalname: 'resume.docx', size: buf.length, buffer: buf });
  assert.equal(result.ok, true);
});

test('16. a .pdf that is actually a DOC (mime mismatch) is rejected', async () => {
  const buf = fakeDoc();
  const result = rv.validateResumeFile({ originalname: 'resume.pdf', size: buf.length, buffer: buf });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'mime_mismatch');
});

test('17. low text content (<15 words) is detected as unreadable', () => {
  assert.equal(rv.isReadable(LOW_TEXT), false, 'should return false for very short text');
  assert.equal(rv.isReadable(''), false, 'should return false for empty string');
  assert.equal(rv.isReadable(null), false, 'should return false for null');
});

test('18. structure bonus gives +10 for ≥5 sections', () => {
  const result = rv.calculateResumeConfidence(EXPERIENCED_RESUME);
  assert.ok(result.matched.length >= 5, 'should detect ≥5 sections');
  assert.ok(result.score >= 70, `score ${result.score} should include structure bonus`);
});

test('19. FRIENDLY_MESSAGES covers all rejection reasons', () => {
  assert.ok(rv.FRIENDLY_MESSAGES.file_type, 'file_type message exists');
  assert.ok(rv.FRIENDLY_MESSAGES.mime_mismatch, 'mime_mismatch message exists');
  assert.ok(rv.FRIENDLY_MESSAGES.too_large, 'too_large message exists');
  assert.ok(rv.FRIENDLY_MESSAGES.blank, 'blank message exists');
  assert.ok(rv.FRIENDLY_MESSAGES.low_confidence, 'low_confidence message exists');
});

test('20. configuration threshold is read from env', () => {
  assert.equal(typeof rv.RESUME_THRESHOLD, 'number');
  assert.ok(rv.RESUME_THRESHOLD >= 1 && rv.RESUME_THRESHOLD <= 100);
});
