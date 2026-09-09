// ---------------------------------------------------------------------------
// Resume-only upload validation service.
//
// Validates that uploaded files are genuine resumes/CVs (not certificates,
// offer letters, mark sheets, cover letters, or random documents).
//
// Two-phase approach:
//   1. File-level validation (extension, MIME sniff, size, empty check)
//   2. Content-level validation (section detection → confidence score + negative signals)
//
//   validateResume(buffer, originalname, opts)
//     -> { valid: true,  confidenceScore, reason: null }
//     -> { valid: false, confidenceScore, reason: '...' }
// ---------------------------------------------------------------------------

const path = require('path');
const { extractText } = require('./fileTextExtract');

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const DEFAULT_THRESHOLD = 60;
const RESUME_THRESHOLD = Number(process.env.RESUME_CONFIDENCE_THRESHOLD) || DEFAULT_THRESHOLD;

const SUPPORTED_EXT = new Set(['.pdf', '.doc', '.docx']);

const FRIENDLY_MESSAGES = {
  file_type:     'This file type isn\'t supported. Please upload a CV or resume in PDF, DOC, or DOCX format.',
  mime_mismatch: 'This file doesn\'t appear to be a resume. Please upload a valid CV or resume in PDF, DOC, or DOCX format.',
  too_large:     'File is larger than the 10 MB limit. Please compress or choose a smaller file.',
  blank:         'This file doesn\'t appear to be a resume. Please upload a valid CV or resume in PDF, DOC, or DOCX format.',
  low_confidence:'This file doesn\'t appear to be a resume. Please upload a valid CV or resume in PDF, DOC, or DOCX format.',
};

// ---------------------------------------------------------------------------
// Positive-signal section definitions (max total ≈ 100)
// ---------------------------------------------------------------------------

const SECTIONS = [
  {
    key: 'contact',
    label: 'Contact information',
    points: 10,
    test: (t) =>
      /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(t) ||     // email
      /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/.test(t) || // phone
      /\blinkedin\.com\b/i.test(t) ||
      /\bgitlab\.com\b/i.test(t) ||
      /\bgithub\.com\b/i.test(t),
  },
  {
    key: 'summary',
    label: 'Summary / Objective',
    points: 10,
    test: (t) =>
      /\b(?:professional\s+)?summary\b/i.test(t) ||
      /\b(?:career\s+)?objective\b/i.test(t) ||
      /\bprofile\s+summary\b/i.test(t) ||
      /\babout\s+me\b/i.test(t),
  },
  {
    key: 'education',
    label: 'Education',
    points: 15,
    test: (t) =>
      /\beducation(?:al)?\s*(?:background|qualification)?\b/i.test(t) ||
      /\buniversity\b/i.test(t) ||
      /\bcollege\b/i.test(t) ||
      /\binstitute\b/i.test(t) ||
      /\bb\.?\s*tech\b/i.test(t) ||
      /\bb\.?\s*e\.?\b/i.test(t) ||
      /\bmaster'?s?\b/i.test(t) ||
      /\bmba\b/i.test(t) ||
      /\bbachelor'?s?\b/i.test(t) ||
      /\bgraduated\b/i.test(t) ||
      /\bschool\b/i.test(t) ||
      /\bdegree\b/i.test(t),
  },
  {
    key: 'skills',
    label: 'Skills',
    points: 15,
    test: (t) =>
      /\b(?:technical\s+)?skills?\b/i.test(t) ||
      /\btechnologies\b/i.test(t) ||
      /\btools\b/i.test(t) ||
      /\bproficient\s+in\b/i.test(t) ||
      /\bexpertise\s+in\b/i.test(t) ||
      /\blanguages?\s*[:–—]/i.test(t) ||
      /\bprogramming\s+languages?\b/i.test(t),
  },
  {
    key: 'experience',
    label: 'Experience / Internship',
    points: 15,
    test: (t) =>
      /\b(?:work\s+)?experience\b/i.test(t) ||
      /\bprofessional\s+experience\b/i.test(t) ||
      /\bemployment\b/i.test(t) ||
      /\bintern(?:ship|ed)?\b/i.test(t) ||
      /\bworked\s+(?:at|as)\b/i.test(t) ||
      /\bfreelance\b/i.test(t) ||
      /\bjob\s+profile\b/i.test(t) ||
      /\bpositions?\s+held\b/i.test(t) ||
      /\bcareer\b/i.test(t),
  },
  {
    key: 'projects',
    label: 'Projects',
    points: 10,
    test: (t) =>
      /\bprojects?\b/i.test(t) ||
      /\bproject\s+work\b/i.test(t) ||
      /\bacademic\s+projects?\b/i.test(t) ||
      /\bbuilt\b/i.test(t) ||
      /\bdeveloped\b/i.test(t),
  },
  {
    key: 'certifications',
    label: 'Certifications',
    points: 10,
    test: (t) =>
      /\bcertifications?\b/i.test(t) ||
      /\bcertified\b/i.test(t),
  },
  {
    key: 'achievements',
    label: 'Achievements / Activities',
    points: 5,
    test: (t) =>
      /\bachievements?\b/i.test(t) ||
      /\bawards?\b/i.test(t) ||
      /\bhonours?\b/i.test(t) ||
      /\bhonors?\b/i.test(t) ||
      /\bextra[-\s]curricular\b/i.test(t) ||
      /\bvolunteer\b/i.test(t),
  },
  {
    key: 'role_entries',
    label: 'Multiple role entries',
    points: 10,
    test: (t) => {
      const dateRanges = t.match(/\b(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|present|current|now)\b/gi) || [];
      const yearMentions = t.match(/\b(19|20)\d{2}\b/g) || [];
      return dateRanges.length >= 2 || yearMentions.length >= 4;
    },
  },
];

// ---------------------------------------------------------------------------
// Negative-signal patterns (document-type markers)
// ---------------------------------------------------------------------------

const NEGATIVE_DOCS = [
  {
    key: 'certificate',
    patterns: /\b(?:certificate\s+of\s+completion|this\s+(?:certificate|is\s+to\s+certify)|is\s+hereby\s+awarded|completion\s+certificate|has\s+successfully\s+completed|course\s+completion)\b/i,
    penalty: 40,
  },
  {
    key: 'offer_letter',
    patterns: /\b(?:offer\s+letter|appointment\s+letter|appointment\s+order|annual\s+ctc|ctc\s+per\s+annum|joining\s+date|date\s+of\s+joining|we\s+are\s+pleased\s+to\s+inform|letter\s+of\s+appointment)\b/i,
    penalty: 40,
  },
  {
    key: 'marksheet',
    patterns: /\b(?:marks\s+obtained|marksheet|mark\s*sheet|grade\s+card|semester\s+\d|roll\s*no|roll\s*number|registration\s+number|gpa\s*[:.]\s*\d|subject\s+code)\b/i,
    penalty: 40,
  },
  {
    key: 'invoice',
    patterns: /\b(?:invoice|bill\s*(?:no|#)|amount\s*(?:due|payable)|gst\s*no|payment\s+terms|due\s+date)\b/i,
    penalty: 40,
  },
  {
    key: 'id_document',
    patterns: /\b(?:pan\s*card|aadhaar|aadhar|passport\s+no|voter\s+id|driving\s+licence|affidavit|agreement)\b/i,
    penalty: 40,
  },
  {
    key: 'cover_letter',
    patterns: /\b(?:dear\s+(?:hiring\s+manager|recruiter|sir|madam)|i\s+am\s+writing\s+to\s+(?:apply|express)|enclosed\s+(?:is|herewith)|please\s+find\s+(?:enclosed|attached)|thank\s+you\s+for\s+(?:your|the)\s+(?:consideration|time)|sincerely|best\s+regards|yours\s+faithfully|i\s+am\s+excited\s+to\s+apply)\b/i,
    penalty: 35,
  },
];

// ---------------------------------------------------------------------------
// File-level helpers
// ---------------------------------------------------------------------------

function isPdf(buf) {
  const head = buf.toString('latin1', 0, Math.min(buf.length, 1024));
  return head.includes('%PDF');
}

function isDocx(buf) {
  // DOCX is a ZIP archive starting with PK\x03\x04
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

function isDoc(buf) {
  // Legacy .doc (OLE2 Compound Document) magic: D0 CF 11 E0 A1 B1 1A E1
  return buf.length >= 8 &&
    buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0 &&
    buf[4] === 0xa1 && buf[5] === 0xb1 && buf[6] === 0x1a && buf[7] === 0xe1;
}

function sniffType(buffer) {
  if (isPdf(buffer))  return 'pdf';
  if (isDocx(buffer)) return 'docx';
  if (isDoc(buffer))  return 'doc';
  return null;
}

// ---------------------------------------------------------------------------
// Content-level helpers
// ---------------------------------------------------------------------------

function isReadable(text) {
  if (!text || !text.trim()) return false;
  const s = text.trim();
  const letters = s.replace(/[^a-zA-Z]/g, '').length;
  return letters / s.length >= 0.05 && s.split(/\s+/).length >= 15;
}

function extractResumeTextSafe(buffer, originalname) {
  try {
    return extractText(buffer, originalname) || '';
  } catch (e) {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

function detectSections(text) {
  const found = [];
  for (const sec of SECTIONS) {
    if (sec.test(text)) found.push({ key: sec.key, label: sec.label, points: sec.points });
  }
  return found;
}

function detectNegativeSignals(text) {
  const found = [];
  for (const neg of NEGATIVE_DOCS) {
    if (neg.patterns.test(text)) found.push({ key: neg.key, penalty: neg.penalty });
  }
  return found;
}

function calculateResumeConfidence(text) {
  if (!text || !text.trim()) return { score: 0, matched: [], negFlags: [] };

  const sections = detectSections(text);
  const negFlags = detectNegativeSignals(text);

  let positive = sections.reduce((a, s) => a + s.points, 0);

  // Structure bonus: ≥5 distinct section types → +10, ≥4 → +5
  const sectionCount = sections.length;
  if (sectionCount >= 5) positive += 10;
  else if (sectionCount >= 4) positive += 5;

  const negative = negFlags.reduce((a, n) => a + n.penalty, 0);
  const score = Math.max(0, Math.min(100, positive - negative));

  return {
    score,
    matched: sections.map((s) => s.label),
    negFlags: negFlags.map((n) => n.key),
  };
}

// ---------------------------------------------------------------------------
// File-level validation
// ---------------------------------------------------------------------------

function validateResumeFile({ originalname, mimetype, size, buffer }) {
  const ext = path.extname(originalname || '').toLowerCase();

  if (!SUPPORTED_EXT.has(ext)) {
    return { ok: false, reason: 'file_type' };
  }

  if (size != null && size > MAX_SIZE) {
    return { ok: false, reason: 'too_large' };
  }

  if (!buffer || buffer.length === 0) {
    return { ok: false, reason: 'blank' };
  }

  const sniffed = sniffType(buffer);
  if (sniffed && sniffed !== ext.replace('.', '')) {
    return { ok: false, reason: 'mime_mismatch' };
  }

  return { ok: true, ext };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function validateResume(buffer, originalname, opts = {}) {
  const threshold = opts.threshold ?? RESUME_THRESHOLD;

  // 1. File-level checks
  const fileCheck = validateResumeFile({ originalname, size: buffer ? buffer.length : 0, buffer });
  if (!fileCheck.ok) {
    return { valid: false, confidenceScore: 0, reason: fileCheck.reason, message: FRIENDLY_MESSAGES[fileCheck.reason] };
  }

  // 2. Extract text
  const text = await extractResumeTextSafe(buffer, originalname);

  // 3. Readability check (corrupted / binary fallback / scanned image-only)
  if (!isReadable(text)) {
    return { valid: false, confidenceScore: 0, reason: 'blank', message: FRIENDLY_MESSAGES.blank };
  }

  // 4. Confidence scoring
  const { score, matched, negFlags } = calculateResumeConfidence(text);

  if (score < threshold) {
    return { valid: false, confidenceScore: score, reason: 'low_confidence', message: FRIENDLY_MESSAGES.low_confidence, matched, negFlags };
  }

  return { valid: true, confidenceScore: score, reason: null, matched, negFlags };
}

// ---------------------------------------------------------------------------
// Logging helper (call on rejection from routes)
// ---------------------------------------------------------------------------

function logRejection({ originalname, size }, { confidenceScore, reason }) {
  const ext = path.extname(originalname || '').toLowerCase();
  console.log(`[resume-validation] REJECTED | ${new Date().toISOString()} | ext=${ext} size=${size || '?'} score=${confidenceScore} reason=${reason}`);
}

module.exports = {
  SUPPORTED_EXT,
  MAX_SIZE,
  RESUME_THRESHOLD,
  SECTIONS,
  NEGATIVE_DOCS,
  FRIENDLY_MESSAGES,
  sniffType,
  isReadable,
  detectSections,
  detectNegativeSignals,
  calculateResumeConfidence,
  validateResumeFile,
  validateResume,
  logRejection,
};
