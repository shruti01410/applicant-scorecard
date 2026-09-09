// ---------------------------------------------------------------------------
// Strict JD upload validation + deduplication service.
//
// One reusable entry point used by BOTH the JD Creation flow and the
// Add Candidate flow:
//
//   validateAndResolveJD(input, { db })
//     -> { status: 'invalid', error }                  (reject)
//     -> { status: 'duplicate', jd }                   (reuse existing)
//     -> { status: 'new', hash, text, title, client }  (create)
//
// Uniqueness is enforced by content fingerprint (SHA-256 of normalized
// text), never by filename. The database UNIQUE index on jd_hash is the
// final protection, including simultaneous uploads.
// ---------------------------------------------------------------------------

const crypto = require('crypto');
const SUPPORTED_EXT = new Set(['.pdf', '.docx']);

// JD-content signals. A valid JD just needs a couple of these; no field is
// mandatory (a valid JD can lack Education, Employment Type, etc.).
const JD_SIGNALS = [
  { name: 'title',            re: /\b(job\s*title|position|designation|role\b|job description)\b/i },
  { name: 'summary',          re: /\b(summary|overview|about\s+the\s+role|about this|job\s+summary|the\s+opportunity|role overview|position summary)\b/i },
  { name: 'responsibilities', re: /\b(responsibilit\w+|duties|what you'?ll do|key accountabilit\w+|as a .* you will)\b/i },
  { name: 'requirements',     re: /\b(requirements?|qualifications?|what you'?ll need|must have|required skills|essential criteria|preferred qualifications)\b/i },
  { name: 'skills',           re: /\b(skills?|competencies?|proficien\w+\s+in|expertise in|knowledge of)\b/i },
  { name: 'experience',       re: /\b(experience|\d+\s*\+?\s*(?:to\s*\d+\s*)?years?|experienced in)\b/i },
  { name: 'education',        re: /\b(education|degree|bachelor|master'?s|graduate|post\s*graduate|b\.?\s*tech|m\.?\s*ba|m\.?\s*com|b\.?\s*com|m\.?\s*sc|ph\.?\s*d)\b/i },
  { name: 'employmentType',   re: /\b(employment\s+type|full[\s-]*time|part[\s-]*time|permanent|contract\b|work\s+from\s+home|remote|hybrid|on[\s-]?site|notice\s+period)\b/i },
  { name: 'location',         re: /\b(location|based in|work\s+location|city\b|office\s+address|working\s+hours?)\b/i },
  { name: 'budget',           re: /\b(ctc|in-hand|salary\s+range|budget\b|compensation)\b/i },
];

const RESUME_MARKERS = [
  /\bcurriculum\s*vitae\b/i,
  /\bcv\b/i,
  /\bresume\b/i,
  /\bcareer\s+objective\b/i,
  /\breferences\s+(?:available\s+upon\s+request|furnished\s+upon\s+request)\b/i,
];

const ERROR_MESSAGES = {
  invalid: 'This document doesn\'t appear to be a valid Job Description. Please upload a valid JD containing role details, responsibilities, requirements, or qualifications.',
  blank:   'Blank document cannot be uploaded. Please upload a valid Job Description.',
  duplicate: 'This JD already exists.',
};

function checkBlank(text) {
  const norm = (text || '').trim();
  if (norm.length === 0) return { blank: true };
  // Nearly-blank: a few words or garbage extracted from an image-only/scanned doc.
  return { blank: norm.length < 40 };
}

function looksLikeResume(text) {
  return RESUME_MARKERS.some((re) => re.test(text));
}

// Score how JD-like a piece of text is. Returns matched signal categories.
function evaluateSignals(text) {
  const found = [];
  for (const s of JD_SIGNALS) {
    if (s.re.test(text)) found.push(s.name);
  }
  return found;
}

// Level 1 + Level 2 validation.
function validateJDText(text) {
  const t = String(text || '');
  const { blank } = checkBlank(t);
  if (blank) return { valid: false, reason: 'blank', message: ERROR_MESSAGES.blank };
  if (looksLikeResume(t)) return { valid: false, reason: 'not-a-jd', message: ERROR_MESSAGES.invalid };
  const found = evaluateSignals(t);
  if (found.length < 2) return { valid: false, reason: 'not-a-jd', message: ERROR_MESSAGES.invalid };
  return { valid: true, signals: found };
}

// Deterministic normalization for fingerprinting. Keeps meaningful words,
// discards formatting-level noise (bullets, dashes, line breaks, spacing,
// case) so "the same JD with formatting changes" still hashes identically.
function normalizeJDText(text) {
  return String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\r\n\t\f\v]+/g, ' ')
    .replace(/[•·▪◦-]{1,}/g, ' ')
    .replace(/[\u2013\u2014\u2015]/g, ' ')
    .replace(/[^a-z0-9.,;:()/&+%#@'" ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function hashJD(text) {
  return sha256(normalizeJDText(text));
}

// Race-aware insert/update helper: tries the write, and if the UNIQUE index
// on jd_hash already decided, falls back to returning the existing JD.
function insertJD(db, { title, client, company_id, description_text, file_path, hash }, { estimated } = {}) {
  try {
    const info = db.prepare(
      'INSERT INTO job_descriptions (title, client, company_id, description_text, requirements, file_path, jd_hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(title, client || null, company_id || null, description_text, JSON.stringify(extractRequirements(description_text)), file_path || null, hash);
    return { inserted: true, id: Number(info.lastInsertRowid) };
  } catch (e) {
    if (/UNIQUE constraint failed/i.test(String(e.message))) {
      const existing = db.prepare('SELECT * FROM job_descriptions WHERE jd_hash = ?').get(hash);
      if (existing) return { inserted: false, existing };
    }
    throw e;
  }
}

// Kept local to this module; mirrors the old extractKeywords behaviour.
function extractRequirements(descriptionText) {
  const { extractKeywords } = require('./capabilityMatch');
  try { return extractKeywords(descriptionText); } catch (e) { return []; }
}

function resolveExisting(db, hash) {
  return db.prepare('SELECT * FROM job_descriptions WHERE jd_hash = ?').get(hash) || null;
}

// ---------------------------------------------------------------------------
// Main entry point. `input` is one of:
//   { buffer, originalname }              -> file upload (PDF/DOCX)
//   { descriptionText }                   -> pasted JD text
//   { buffer, originalname, ... }         -> file + overrides (title/client)
// ---------------------------------------------------------------------------
async function validateAndResolveJD(input, { db }) {
  const originalname = input.originalname || '';
  const ext = originalname.toLowerCase().split('.').pop();
  let text = (input.descriptionText || '').trim();

  if (input.buffer && !input.descriptionText) {
    if (ext !== 'pdf' && ext !== 'docx') {
      return { status: 'invalid', error: `Unsupported file type (.${ext || 'unknown'}). Only PDF/DOCX accepted (10MB max).`, reason: 'file-type' };
    }
    const { extractText } = require('./fileTextExtract');
    text = await extractText(input.buffer, input.originalname);
  }

  if (!text || !text.trim()) {
    return { status: 'invalid', error: ERROR_MESSAGES.blank, reason: 'blank' };
  }

  const validation = validateJDText(text);
  if (!validation.valid) {
    return { status: 'invalid', error: validation.message, reason: validation.reason };
  }

  const hash = hashJD(text);
  const existing = resolveExisting(db, hash);
  if (existing) {
    return { status: 'duplicate', jd: existing, hash };
  }

  return { status: 'new', hash, text, title: input.title, client: input.client };
}

function createFromResolved(db, resolved, extra) {
  const insert = insertJD(db, {
    title: resolved.title || extra.title,
    client: resolved.client != null ? resolved.client : extra.client,
    company_id: extra.company_id,
    description_text: resolved.text,
    file_path: extra.file_path,
    hash: resolved.hash,
  });
  if (insert.inserted) {
    return { id: insert.id, created: true };
  }
  return { id: Number(insert.existing.id), created: false, existing: insert.existing };
}

module.exports = {
  JD_SIGNALS,
  ERROR_MESSAGES,
  validateJDText,
  normalizeJDText,
  sha256,
  hashJD,
  validateAndResolveJD,
  insertJD,
  resolveExisting,
  createFromResolved,
  SUPPORTED_EXT,
};