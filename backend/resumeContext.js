/*
 * Resume context extraction — pure helpers shared by capabilityMatch.js and
 * sopAutoRate.js. Assigns each resume sentence to a section (Professional
 * Experience / Skills / Projects / Education / ...) and computes a recency
 * label so "mentioned" vs "demonstrated in a current role" can be told apart.
 * No DB access, no external APIs.
 */

const CURRENT_YEAR = new Date().getFullYear();

const SECTION_RULES = [
  { re: /^(summary|profile|objective|career (summary|overview)|about(\s*me)?|introduction)[\s:]*$/i, label: 'Summary' },
  { re: /^((professional|work|employment|relevant|recent) )?(experience|employment|employment history|work history|career history)[\s:]*$/i, label: 'Professional Experience' },
  { re: /^(core|technical|professional|key|it|additional)?\s*(skills|competencies|competences|strengths|skills summary)[\s:]*$/i, label: 'Skills' },
  { re: /^(academic|personal|key|major|freelance|side|open source)?\s*(projects|project work|project experience)[\s:]*$/i, label: 'Projects' },
  { re: /^(internship|internships|internship experience|trainee|traineeship|apprenticeship)[\s:]*$/i, label: 'Internship' },
  { re: /^(education|educational background|academic background|qualification|qualifications|academics|academic details)[\s:]*$/i, label: 'Education' },
  { re: /^(certification|certifications|licenses?|credentials|courses?|certifications and courses|trainings?)[\s:]*$/i, label: 'Certifications' },
  { re: /^(achievement|achievements|award|awards|honors?|accomplishment|accomplishments|recognition|recognitions)[\s:]*$/i, label: 'Achievements' },
  { re: /^(languages?|interests?|hobbies?|additional (information|skills?|details)|personal (details|information)|declaration|strengths and weaknesses)[\s:]*$/i, label: 'Other' },
];

function matchHeading(line) {
  for (const rule of SECTION_RULES) {
    if (rule.re.test(line)) return rule.label;
  }
  return null;
}

function normalizeForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[^a-z0-9+#.\-\s/]/g, ' ')
    .replace(/\.+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split resume text into sentences (on `.!?` or newlines). Used for section
 * attribution and semantic matching.
 */
function splitSentences(text) {
  const t = String(text || '');
  if (!t.trim()) return [];
  return t
    .split(/[.!?]+\s*|[\r\n]+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 3);
}

/**
 * Segment a resume into labeled sections. Returns [{ label, sentences }]
 * in document order. Lines that look like a section heading open a new block;
 * everything before the first heading belongs to "Summary".
 */
function buildResumeSections(resumeText) {
  const lines = String(resumeText || '').split(/\r?\n/);
  const blocks = [];
  let cur = { label: 'Summary', sentences: [] };
  const flush = () => {
    if (cur.sentences.length) blocks.push({ label: cur.label, sentences: [...cur.sentences] });
  };
  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line) continue;
    const heading = matchHeading(line);
    if (heading) {
      flush();
      cur = { label: heading, sentences: [] };
      continue;
    }
    const sents = line
      .split(/[.!?]+\s*/)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter((s) => s.length > 3);
    if (!sents.length) continue;
    // "Experience:" style inline heading occupying most of a short line.
    if (line.length < 40 && /(experience|work history|internship|projects?|skills?|education|certification|qualification)\s*:/i.test(line)) {
      flush();
      cur = { label: inlineSectionLabel(line), sentences: [] };
    }
    for (const s of sents) cur.sentences.push(s);
  }
  flush();
  return blocks;
}

function inlineSectionLabel(line) {
  const t = line.toLowerCase();
  if (/experience|work history/.test(t)) return 'Professional Experience';
  if (/internship/.test(t)) return 'Internship';
  if (/projects?/.test(t)) return 'Projects';
  if (/skills?/.test(t)) return 'Skills';
  if (/education|qualification/.test(t)) return 'Education';
  if (/certification/.test(t)) return 'Certifications';
  return 'Summary';
}

/**
 * Map a resume sentence back to the section it came from.
 * Tolerant string matching handles the different sentence boundaries used
 * by callers (line-based vs punctuation-based splits).
 */
function labelForSentence(sentence, sections) {
  if (!sentence || !sections || !sections.length) return 'Other';
  const target = normalizeForMatch(sentence);
  if (!target) return 'Other';
  let best = 'Other';
  let bestScore = 0;
  for (const sec of sections) {
    for (const s of sec.sentences) {
      const norm = normalizeForMatch(s);
      if (!norm) continue;
      let score = 0;
      if (target === norm) score = 3;
      else if (target.includes(norm) || norm.includes(target)) score = 2;
      else if (target.slice(0, 24) === norm.slice(0, 24)) score = 1;
      if (score > bestScore) {
        bestScore = score;
        best = sec.label;
      }
    }
  }
  return best;
}

/**
 * Recency of a sentence/claim: current (present/current or within last 2
 * years), recent (within the last 4 years), stale (older), unknown (no
 * evidence of timing).
 */
function recencyFor(sentence) {
  const s = ' ' + String(sentence || '').toLowerCase() + ' ';
  const years = (s.match(/\b(19\d\d|20\d\d)\b/g) || []).map((m) => parseInt(m, 10));
  const maxYear = years.length ? Math.max(...years) : null;
  if (/present|current|\bnow\b/.test(s) || (maxYear != null && maxYear >= CURRENT_YEAR - 1)) {
    return { label: 'current', year: maxYear };
  }
  if (maxYear != null && maxYear >= CURRENT_YEAR - 4) return { label: 'recent', year: maxYear };
  if (maxYear != null) return { label: 'stale', year: maxYear };
  return { label: 'unknown', year: null };
}

module.exports = {
  CURRENT_YEAR,
  matchHeading,
  splitSentences,
  buildResumeSections,
  labelForSentence,
  recencyFor,
};