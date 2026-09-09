// ---------------------------------------------------------------------------
// Resume Integrity Analyzer v2
//
// Structured evidence-based analysis pipeline:
//   Resume → Section Detection → Entity Extraction → Timeline Construction
//   → Cross-Section Comparison → Red-Flag Rules → Evidence Collection
//   → Confidence/Severity Scoring → 4-Dimension Output
//
// 10 detection rules. Every flag is evidence-based.
// Confidence < 50 → not displayed. Never labels candidate as dishonest.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. SECTION DETECTION
// ---------------------------------------------------------------------------

function splitSections(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const sections = {
    header: [], contact: [], summary: [], experience: [],
    education: [], skills: [], projects: [], certifications: [],
    awards: [], publications: [], other: [],
  };

  const sectionMap = [
    { names: ['summary', 'objective', 'profile', 'about me', 'career objective', 'professional summary', 'career summary'], section: 'summary' },
    { names: ['experience', 'employment', 'work experience', 'work history', 'career history', 'professional experience', 'employment history'], section: 'experience' },
    { names: ['education', 'academic', 'qualification', 'degree', 'university', 'college', 'institute', 'school', 'educational background'], section: 'education' },
    { names: ['skill', 'skills', 'technologies', 'tools', 'software', 'proficiency', 'technical skills', 'core competencies'], section: 'skills' },
    { names: ['project', 'projects', 'key projects', 'personal projects'], section: 'projects' },
    { names: ['certification', 'certifications', 'certificate', 'licensed', 'license'], section: 'certifications' },
    { names: ['award', 'awards', 'achievement', 'achievements', 'honors', 'honour'], section: 'awards' },
    { names: ['publication', 'publications', 'papers', 'research'], section: 'publications' },
  ];

  let currentSection = 'header';
  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    let matched = false;
    for (const sm of sectionMap) {
      if (sm.names.some(n => lower === n || lower.startsWith(n + ':') || lower.startsWith(n + ' ') || lower.startsWith(n + '\t'))) {
        currentSection = sm.section;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (/@/.test(line) || /\b\d{10,}\b/.test(line) || /linkedin\.com|github\.com|email/i.test(line)) {
      sections.contact.push(line);
      continue;
    }
    sections[currentSection].push(line);
  }
  return sections;
}

function getAllText(sections) {
  return Object.values(sections).flat().join('\n');
}

// ---------------------------------------------------------------------------
// 2. DATE PARSING & NORMALIZATION
// ---------------------------------------------------------------------------

const MONTH_MAP = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function normalizeToYYYYMM(year, month) {
  return `${year}-${String(month || 1).padStart(2, '0')}`;
}

function parseMonthYear(str) {
  const m = str.trim().match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{4})$/i);
  if (m) return { year: parseInt(m[2]), month: MONTH_MAP[m[1].toLowerCase().substring(0, 3)] || 1 };
  return null;
}

function parseDateRange(rangeStr) {
  const trimmed = rangeStr.trim();
  const rangePattern = /^(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*)?(\d{4})\s*[-–—to]+\s*(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*)?(present|current|\d{4})?$/i;
  const m = trimmed.match(rangePattern);
  if (!m) return null;
  const startMonth = m[1] ? (MONTH_MAP[m[1].toLowerCase().substring(0, 3)] || null) : null;
  const startYear = parseInt(m[2]);
  const endMonth = m[3] ? (MONTH_MAP[m[3].toLowerCase().substring(0, 3)] || null) : null;
  let endYear;
  let endIsPresent = false;
  if (m[4]) {
    if (/present|current/i.test(m[4])) { endYear = new Date().getFullYear(); endIsPresent = true; }
    else endYear = parseInt(m[4]);
  } else {
    endYear = startYear;
  }
  return { startMonth, startYear, endMonth, endYear, endIsPresent };
}

function extractDateRanges(text) {
  const ranges = [];
  const patterns = [
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\s*[-–—to]+\s*(?:present|current|\d{4})/gi,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\s*[-–—]\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}/gi,
    /\b\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{4}\s*[-–—to]+\s*(?:present|current|\d{4})/gi,
    /\b\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{4}\s*[-–—]\s*\d{1,2}\s*[\/\-\.]\s*\d{4}/gi,
    /\b(19|20)\d{2}\s*[-–—to]+\s*(present|current|\d{4})/gi,
    /\b(19|20)\d{2}\s*[-–—]\s*(19|20)\d{2}/gi,
  ];
  const seen = new Set();
  for (const pattern of patterns) {
    let m;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((m = regex.exec(text)) !== null) {
      const parsed = parseDateRange(m[0]);
      if (parsed) {
        const startVal = parsed.startYear + (parsed.startMonth || 1) / 12;
        const endVal = parsed.endYear + (parsed.endMonth || 12) / 12;
        const key = `${normalizeToYYYYMM(parsed.startYear, parsed.startMonth)}-${normalizeToYYYYMM(parsed.endYear, parsed.endMonth)}`;
        if (!seen.has(key)) {
          seen.add(key);
          ranges.push({ ...parsed, raw: m[0].trim(), start: startVal, end: endVal });
        }
      }
    }
  }
  return ranges;
}

function extractAllYears(text) {
  return [...text.matchAll(/\b(19|20)\d{2}\b/g)].map(m => parseInt(m[0]));
}

function extractMonthYearDates(text) {
  return [...text.matchAll(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/gi)].map(m => m[0]);
}

// ---------------------------------------------------------------------------
// 3. ENTITY EXTRACTION
// ---------------------------------------------------------------------------

const SENIORITY_KEYWORDS = ['intern', 'trainee', 'junior', 'associate', 'assistant', 'staff', 'senior', 'lead', 'principal', 'manager', 'director', 'head', 'chief', 'vp', 'vice president', 'architect', 'consultant', 'freelance', 'contract', 'part-time', 'full-time'];

const TEAM_LEADERSHIP_KEYWORDS = ['team', 'lead', 'manage', 'managed', 'leading', 'supervise', 'supervised', 'oversee', 'oversaw', 'mentor', 'mentoring', 'coach', 'direct report', 'report to', 'reporting to'];

const SENIOR_RESPONSIBILITY_KEYWORDS = ['architect', 'architecture', 'strategy', 'strategic', 'enterprise', 'organization', 'organizational', 'cross-functional', 'executive', 'board', 'budget', 'revenue', 'profit', 'p&l', 'stakeholder', 'roadmap', 'vision', 'direction'];

const JUNIOR_TASK_KEYWORDS = ['data entry', 'spreadsheet', 'administrative', 'filing', 'typing', 'receiving', 'sorting', 'basic', 'routine', 'clerical', 'assist with', 'help with'];

const FREELANCE_CONTRACT_KEYWORDS = ['freelance', 'freelancing', 'contract', 'consulting', 'consultant', 'part-time', 'part time', 'side project', 'personal project', 'own project', 'independent'];

const EDUCATION_KEYWORDS = ['b\\.?com', 'm\\.?com', 'bba', 'mba', 'b\\.?tech', 'm\\.?tech', 'degree', 'university', 'college', 'school', 'diploma', 'b\\.?sc', 'm\\.?sc', 'b\\.?a', 'm\\.?a', 'b\\.?arch', 'm\\.?arch', 'phd', 'ph\\.?d', 'doctorate', 'master', 'bachelor'];

const EMPLOYER_KEYWORDS = ['pvt', 'ltd', 'inc', 'llc', 'corp', 'technolog', 'services', 'solutions', 'systems', 'group', 'enterprises', 'labs', 'software', 'digital', 'tech', 'company', 'organization', 'firm'];

const VAGUE_EMPLOYER_PATTERNS = ['a leading company', 'a reputed organization', 'a top firm', 'a well-known company', 'major corporation', 'well-established company', 'prominent company', 'leading organization', 'a leading firm', 'a知名 company'];

const STRONG_CLAIM_PATTERNS = [
  /\bexpert\b/i, /\bmaster\b/i, /\bworld-class\b/i, /\bleading expert\b/i,
  /\bled\b/i, /\barchitected\b/i, /\bdesigned and built\b/i, /\bowned\b/i,
  /\bmanaged\b/i, /\bdelivered\b/i, /\bgenerated\b/i, /\bincreased\b/i,
  /\breduced\b/i, /\bsaved\b/i, /\boptimized\b/i, /\btransformed\b/i,
  /\b(\d+)\+?\s*years\b/i, /\bresponsible for\b/i,
];

function extractEntities(sections) {
  const allText = getAllText(sections);
  const entities = {
    employers: [],
    designations: [],
    education: [],
    dateRanges: [],
    skills: [],
    claims: [],
    vagueEmployers: [],
    vagueDates: [],
  };

  // Extract employers from experience section
  const expLines = sections.experience;
  for (let i = 0; i < expLines.length; i++) {
    const line = expLines[i];
    const lower = line.toLowerCase();
    if (EMPLOYER_KEYWORDS.some(k => lower.includes(k)) || /\b(pvt|ltd|inc|llc|corp)\b/i.test(line)) {
      entities.employers.push({ name: line.trim(), lineIndex: i, section: 'experience' });
    }
  }

  // Extract designations from experience and summary
  const designationPatterns = [
    /\b(intern|trainee|junior|associate|assistant|staff|senior|lead|principal|manager|director|head|chief|vp|vice president|architect|consultant|engineer|analyst|scientist|developer|designer|officer|coordinator|specialist|executive|developer|programmer)\b/gi,
  ];
  for (const section of [sections.experience, sections.summary]) {
    for (const line of section) {
      for (const pattern of designationPatterns) {
        let m;
        const regex = new RegExp(pattern.source, pattern.flags);
        while ((m = regex.exec(line)) !== null) {
          entities.designations.push({ title: m[0].toLowerCase(), context: line.trim(), section: section === sections.experience ? 'experience' : 'summary' });
        }
      }
    }
  }

  // Extract education
  for (const line of sections.education) {
    for (const kw of EDUCATION_KEYWORDS) {
      if (new RegExp(kw, 'i').test(line)) {
        const hasInstitution = /(university|college|institute|school|academy|iit|nit|iim)/i.test(line);
        entities.education.push({ text: line.trim(), hasInstitution, hasDegree: true });
        break;
      }
    }
  }

  // Extract all date ranges
  entities.dateRanges = extractDateRanges(allText);

  // Extract skills
  entities.skills = sections.skills.join(' ').split(/[,;\n]+/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 60);

  // Extract strong claims
  for (const pattern of STRONG_CLAIM_PATTERNS) {
    let m;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((m = regex.exec(allText)) !== null) {
      const start = Math.max(0, m.index - 40);
      const end = Math.min(allText.length, m.index + m[0].length + 40);
      entities.claims.push({ claim: m[0], context: allText.substring(start, end).replace(/\s+/g, ' ').trim() });
    }
  }

  // Detect vague employers
  const lowerAll = allText.toLowerCase();
  for (const pat of VAGUE_EMPLOYER_PATTERNS) {
    if (lowerAll.includes(pat)) entities.vagueEmployers.push(pat);
  }

  // Detect vague dates (year-only without month precision)
  const yearOnlyRanges = [...allText.matchAll(/\b(19|20)\d{2}\s*[-–—]\s*(19|20)\d{2}\b/gi)];
  const yearOnlyPresent = [...allText.matchAll(/\b(19|20)\d{2}\s*[-–—]\s*(present|current)\b/gi)];
  entities.vagueDates = [...yearOnlyRanges, ...yearOnlyPresent].map(r => r[0].trim());

  return entities;
}

// ---------------------------------------------------------------------------
// 4. TIMELINE CONSTRUCTION
// ---------------------------------------------------------------------------

function buildTimeline(sections) {
  const allText = getAllText(sections);
  const dateRanges = extractDateRanges(allText);

  const timeline = {
    employment: [],
    education: [],
    all: [],
  };

  // Employment periods
  const empKeywords = ['experience', 'employed', 'employer', 'company', 'pvt', 'ltd', 'inc', 'intern', 'engineer', 'analyst', 'manager', 'developer', 'consultant', 'worked', 'position', 'role'];
  const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hasEmpKw = empKeywords.some(k => line.toLowerCase().includes(k));
    const ranges = extractDateRanges(line);
    if (ranges.length > 0 && hasEmpKw) {
      for (const r of ranges) {
        const context = lines.slice(Math.max(0, i - 2), i + 1).filter(l => l.length > 3).join(' ').trim();
        const lowerCtx = context.toLowerCase();
        const isFreelance = FREELANCE_CONTRACT_KEYWORDS.some(k => lowerCtx.includes(k));
        const isPartTime = /part[- ]?time/i.test(context);
        const isInternship = /intern/i.test(context);
        const isContract = /contract|consulting|freelance/i.test(context);
        timeline.employment.push({
          ...r,
          context,
          section: 'experience',
          isFreelance, isPartTime, isInternship, isContract,
          explainable: isFreelance || isPartTime || isInternship || isContract,
        });
      }
    }
  }

  // Standalone date ranges (fill in gaps)
  for (const r of dateRanges) {
    const alreadyCovered = timeline.employment.some(e => e.start === r.start && e.end === r.end);
    if (!alreadyCovered) {
      timeline.employment.push({ ...r, context: '', section: 'experience', explainable: false });
    }
  }

  // Education periods
  const eduKeywords = ['b\\.?com', 'm\\.?com', 'bba', 'mba', 'b\\.?tech', 'm\\.?tech', 'degree', 'university', 'college', 'school', 'diploma', 'b\\.?sc', 'm\\.?sc', 'b\\.?a', 'm\\.?a', 'phd', 'master', 'bachelor'];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hasEduKw = eduKeywords.some(k => new RegExp(k, 'i').test(line));
    const years = extractAllYears(line);
    if (hasEduKw && years.length > 0) {
      const startYear = years[0];
      const endYear = years.length > 1 ? years[1] : startYear;
      timeline.education.push({ startYear, endYear, start: startYear, end: endYear, raw: line, section: 'education' });
    }
  }

  // Combined sorted timeline
  timeline.all = [...timeline.employment, ...timeline.education].sort((a, b) => a.start - b.start);

  return timeline;
}

// ---------------------------------------------------------------------------
// 5. CROSS-SECTION COMPARISON
// ---------------------------------------------------------------------------

function compareSections(sections, entities, timeline) {
  const allText = getAllText(sections);
  const summaryText = sections.summary.join(' ');
  const expText = sections.experience.join(' ');
  const eduText = sections.education.join(' ');

  const contradictions = [];

  // Duration claims vs timeline
  const durationClaims = [...allText.matchAll(/(\d+)\s*\+?\s*(?:years?|yr)/gi)].map(c => parseInt(c[1]));
  const maxClaimed = durationClaims.length > 0 ? Math.max(...durationClaims) : 0;

  const empRanges = timeline.employment.filter(e => e.section === 'experience');
  const uniqueEmploymentYears = computeUniqueDuration(empRanges);

  if (maxClaimed >= 3 && uniqueEmploymentYears > 0 && maxClaimed > uniqueEmploymentYears + 1.5) {
    contradictions.push({
      type: 'duration_mismatch',
      claimed: maxClaimed,
      calculated: uniqueEmploymentYears,
      severity: maxClaimed > uniqueEmploymentYears + 3 ? 'high' : 'medium',
    });
  }

  // Designation contradictions between summary and experience
  const summarySenior = /senior|lead|manager|director|chief|head|architect/i.test(summaryText);
  const expHasIntern = /intern/i.test(expText);
  const expHasJuniorTasks = JUNIOR_TASK_KEYWORDS.some(k => expText.toLowerCase().includes(k));
  if (summarySenior && expHasIntern && expHasJuniorTasks) {
    contradictions.push({
      type: 'seniority_contradiction',
      summary: 'Senior-level titles in summary',
      experience: 'Intern-level and administrative tasks in experience',
      severity: 'medium',
    });
  }

  // Employer name contradictions
  const summaryEmployers = [...summaryText.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Pvt|Ltd|Inc|LLC|Corp|Technologies|Services|Solutions|Systems|Group)\b)/g)];
  const expEmployers = [...expText.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Pvt|Ltd|Inc|LLC|Corp|Technologies|Services|Solutions|Systems|Group)\b)/g)];
  if (summaryEmployers.length > 0 && expEmployers.length > 0) {
    const summaryNames = new Set(summaryEmployers.map(e => e[1].toLowerCase()));
    const expNames = new Set(expEmployers.map(e => e[1].toLowerCase()));
    const mismatched = [...summaryNames].filter(n => !expNames.has(n));
    if (mismatched.length > 0 && summaryNames.size > 0) {
      contradictions.push({
        type: 'employer_mismatch',
        summary: [...summaryNames].join(', '),
        experience: [...expNames].join(', '),
        severity: 'medium',
      });
    }
  }

  return contradictions;
}

function computeUniqueDuration(periods) {
  if (periods.length === 0) return 0;
  const sorted = [...periods].sort((a, b) => a.start - b.start);
  let mergedStart = sorted[0].start;
  let mergedEnd = sorted[0].end;
  let totalMonths = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start <= mergedEnd) {
      mergedEnd = Math.max(mergedEnd, sorted[i].end);
    } else {
      totalMonths += (mergedEnd - mergedStart) * 12;
      mergedStart = sorted[i].start;
      mergedEnd = sorted[i].end;
    }
  }
  totalMonths += (mergedEnd - mergedStart) * 12;
  return Math.round(totalMonths / 12 * 10) / 10;
}

// ---------------------------------------------------------------------------
// 6. RED FLAG RULES (10 rules)
// ---------------------------------------------------------------------------

function makeFlag({ flagType, status, severity, confidence, evidence, analysis, explanation, verificationRequired }) {
  return {
    flag_type: flagType,
    status: status || 'detected',
    severity,
    confidence: Math.round(confidence),
    evidence: evidence || [],
    analysis: analysis || '',
    explanation: explanation || '',
    verification_required: verificationRequired !== false,
  };
}

function snippet(text, maxLen = 100) {
  const t = text.trim();
  return t.length > maxLen ? t.substring(0, maxLen) + '...' : t;
}

// RULE 1: Missing / unclear dates
function rule1_MissingDates(text, sections, entities, timeline) {
  const flags = [];
  const yearMentions = extractAllYears(text);
  const monthYearDates = extractMonthYearDates(text);
  const dateRanges = entities.dateRanges;
  const hasYear = yearMentions.length > 0;
  const hasDateRange = dateRanges.length > 0;
  const hasMonthYear = monthYearDates.length > 0;

  if (!hasYear) {
    flags.push(makeFlag({
      flagType: 'missing_dates',
      severity: 'high', confidence: 95,
      evidence: [{ source: 'Full Resume', text: 'No year references found' }],
      analysis: 'No year references detected anywhere in the resume.',
      explanation: 'Without any dates, it is impossible to verify employment or education timeline, duration, or sequence.',
    }));
  } else if (!hasDateRange && !hasMonthYear) {
    flags.push(makeFlag({
      flagType: 'missing_dates',
      severity: 'medium', confidence: 72,
      evidence: [{ source: 'Full Resume', text: `Years found: ${yearMentions.slice(0, 5).join(', ')} — but no date ranges parsed` }],
      analysis: 'Years are present but no month/year ranges or date ranges could be parsed.',
      explanation: 'Timeline cannot be established precisely. Employment durations and sequences are unverifiable.',
    }));
  } else if (hasMonthYear && dateRanges.length === 0 && yearMentions.length >= 3) {
    flags.push(makeFlag({
      flagType: 'missing_dates',
      severity: 'low', confidence: 60,
      evidence: [{ source: 'Full Resume', text: `Year-only dates: ${yearMentions.slice(0, 4).join(', ')}` }],
      analysis: 'Only year-only dates found (no month precision). Timeline lacks precision.',
      explanation: 'Some date precision is missing, which may obscure short gaps or role durations.',
    }));
  }

  // Check individual employment entries for missing dates
  const empLines = sections.experience;
  let entriesWithoutDates = 0;
  for (const line of empLines) {
    const hasDate = /\b(19|20)\d{2}\b/.test(line) || /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(line);
    const hasEmpKw = EMPLOYER_KEYWORDS.some(k => line.toLowerCase().includes(k));
    if (hasEmpKw && !hasDate) entriesWithoutDates++;
  }
  if (entriesWithoutDates >= 2) {
    flags.push(makeFlag({
      flagType: 'missing_dates',
      severity: 'medium', confidence: 68,
      evidence: [{ source: 'Experience', text: `${entriesWithoutDates} employment entries lack date information` }],
      analysis: `${entriesWithoutDates} employer/role mentions have no associated date ranges.`,
      explanation: 'Employment entries without dates cannot be placed on a timeline or verified for duration.',
    }));
  }

  return flags;
}

// RULE 2: Overlapping timelines
function rule2_OverlappingTimelines(text, sections, entities, timeline) {
  const flags = [];
  const periods = timeline.employment;

  if (periods.length < 2) return flags;

  const overlaps = [];
  for (let i = 0; i < periods.length; i++) {
    for (let j = i + 1; j < periods.length; j++) {
      const a = periods[i];
      const b = periods[j];
      const aStart = a.start || 0;
      const aEnd = a.end || aStart;
      const bStart = b.start || 0;
      const bEnd = b.end || bStart;

      if (Math.max(aStart, bStart) < Math.min(aEnd, bEnd)) {
        const overlapStart = Math.max(aStart, bStart);
        const overlapEnd = Math.min(aEnd, bEnd);
        const overlapMonths = Math.round((overlapEnd - overlapStart) * 12);

        // Check explainability
        const eitherExplainable = a.explainable || b.explainable;
        const eitherIsEducation = a.section === 'education' || b.section === 'education';

        overlaps.push({
          a: { raw: a.raw || a.context || `Period starting ${a.startYear || aStart}`, context: a.context || '', explainable: a.explainable },
          b: { raw: b.raw || b.context || `Period starting ${b.startYear || bStart}`, context: b.context || '', explainable: b.explainable },
          overlapMonths,
          eitherExplainable,
          eitherIsEducation,
        });
      }
    }
  }

  if (overlaps.length > 0) {
    for (const o of overlaps) {
      let severity = 'medium';
      let confidence = 75;

      if (o.eitherExplainable) {
        // One of the roles is freelance/contract/part-time/intern — explainable
        confidence = 55;
        severity = 'low';
      }
      if (o.eitherIsEducation && o.overlapMonths <= 12) {
        // Education overlapping with employment is common
        confidence = 50;
        severity = 'low';
      }
      if (o.overlapMonths > 12 && !o.eitherExplainable) {
        severity = 'high';
        confidence = 85;
      }

      const evidenceItems = [
        { source: 'Experience', text: o.a.raw },
        { source: 'Experience', text: o.b.raw },
      ];

      const analysisParts = [`The two periods overlap for approximately ${o.overlapMonths} month(s).`];
      if (o.eitherExplainable) {
        analysisParts.push('One role appears to be freelance, contract, part-time, or internship — concurrent employment may be legitimate.');
      }

      flags.push(makeFlag({
        flagType: 'timeline_overlap',
        severity,
        confidence,
        evidence: evidenceItems,
        analysis: analysisParts.join(' '),
        explanation: o.eitherExplainable
          ? 'The overlap may be explainable by concurrent or non-full-time work arrangements.'
          : 'The resume does not indicate whether either role was part-time, freelance, contract-based, or otherwise concurrent. Further verification may be appropriate.',
      }));
    }
  }

  return flags;
}

// RULE 3: Internal contradictions
function rule3_InternalContradictions(text, sections, entities, timeline, contradictions) {
  const flags = [];

  for (const c of contradictions) {
    if (c.type === 'duration_mismatch') {
      flags.push(makeFlag({
        flagType: 'duration_mismatch',
        severity: c.severity === 'high' ? 'high' : 'medium',
        confidence: c.severity === 'high' ? 88 : 75,
        evidence: [
          { source: 'Summary/Experience', text: `Claimed: "${c.claimed}+ years"` },
          { source: 'Timeline Analysis', text: `Calculated from employment dates: ~${c.calculated} years (unique employment periods, no double-counting)` },
        ],
        analysis: `The resume claims ${c.claimed}+ years of experience, but the unique employment timeline derived from listed dates covers approximately ${c.calculated} years.`,
        explanation: 'The claimed experience duration does not reconcile with the individual employment dates. This could indicate inflated claims, inclusion of overlapping/parallel roles, or counting non-employment periods.',
      }));
    }
    if (c.type === 'seniority_contradiction') {
      flags.push(makeFlag({
        flagType: 'designation_mismatch',
        severity: 'medium',
        confidence: 78,
        evidence: [
          { source: 'Summary', text: c.summary },
          { source: 'Experience', text: c.experience },
        ],
        analysis: 'The summary contains senior-level titles (Senior, Manager, Director) but the experience section describes intern-level or administrative tasks.',
        explanation: 'The claimed seniority level is not supported by the responsibilities described. This could indicate title inflation or a mismatch between stated and actual role scope.',
      }));
    }
    if (c.type === 'employer_mismatch') {
      flags.push(makeFlag({
        flagType: 'employer_mismatch',
        severity: 'medium',
        confidence: 70,
        evidence: [
          { source: 'Summary', text: `Employers mentioned: ${c.summary}` },
          { source: 'Experience', text: `Employers mentioned: ${c.experience}` },
        ],
        analysis: 'The summary references employers not found in the experience section, or vice versa.',
        explanation: 'Inconsistent employer information across sections makes it difficult to verify employment history. This could be a minor formatting difference or a material inconsistency.',
      }));
    }
  }

  return flags;
}

// RULE 4: Incomplete employment history
function rule4_IncompleteHistory(text, sections, entities, timeline) {
  const flags = [];
  const empRanges = timeline.employment.filter(e => e.section === 'experience').sort((a, b) => a.start - b.start);

  if (empRanges.length === 0) return flags;

  // Check for gaps
  const gaps = [];
  for (let i = 1; i < empRanges.length; i++) {
    const prevEnd = empRanges[i - 1].end;
    const currStart = empRanges[i].start;
    const gapMonths = Math.round((currStart - prevEnd) * 12);
    if (gapMonths >= 6) {
      // Check if education covers this gap
      const gapStartYear = Math.floor(prevEnd);
      const gapEndYear = Math.floor(currStart);
      const coveredByEducation = timeline.education.some(e => e.startYear <= gapEndYear && e.endYear >= gapStartYear);
      gaps.push({ gapMonths, between: `${empRanges[i - 1].raw || empRanges[i - 1].startYear || '?'} and ${empRanges[i].raw || empRanges[i].startYear || '?'}`, coveredByEducation });
    }
  }

  const unexplainedGaps = gaps.filter(g => !g.coveredByEducation && g.gapMonths >= 6);
  const materialGaps = unexplainedGaps.filter(g => g.gapMonths >= 12);

  if (materialGaps.length > 0) {
    flags.push(makeFlag({
      flagType: 'incomplete_history',
      severity: 'medium',
      confidence: 72,
      evidence: materialGaps.slice(0, 3).map(g => ({ source: 'Experience Timeline', text: `Gap: ${g.between} (~${g.gapMonths} months)` })),
      analysis: `Material unexplained gaps (${materialGaps.length}) detected between employment periods. Education does not cover these periods.`,
      explanation: 'Large unexplained gaps in employment history may indicate omitted roles, career breaks, or selective presentation. This does not imply concealment — career breaks are common and legitimate.',
    }));
  }

  // Check if claimed experience far exceeds listed job count
  const allText = getAllText(sections);
  const durationClaims = [...allText.matchAll(/(\d+)\s*\+?\s*(?:years?|yr)/gi)].map(c => parseInt(c[1]));
  const maxClaimed = durationClaims.length > 0 ? Math.max(...durationClaims) : 0;
  if (maxClaimed >= 5 && empRanges.length <= 1) {
    flags.push(makeFlag({
      flagType: 'incomplete_history',
      severity: 'medium',
      confidence: 68,
      evidence: [
        { source: 'Summary', text: `Claimed: ${maxClaimed}+ years` },
        { source: 'Experience', text: `Only ${empRanges.length} employment period(s) found` },
      ],
      analysis: `The resume claims ${maxClaimed}+ years of experience but only ${empRanges.length} employment period(s) could be identified.`,
      explanation: 'Career duration cannot be reconciled with listed jobs. The history may be incomplete, or some roles may be omitted.',
    }));
  }

  return flags;
}

// RULE 5: Designation–responsibility mismatch
function rule5_DesignationMismatch(text, sections, entities, timeline) {
  const flags = [];
  const allText = getAllText(sections);
  const expText = sections.experience.join(' ');
  const lowerExp = expText.toLowerCase();

  const hasSeniorTitle = entities.designations.some(d => ['senior', 'lead', 'manager', 'director', 'chief', 'head', 'architect', 'principal'].includes(d.title));
  const hasIntern = /intern/i.test(allText);
  const hasJuniorTasks = JUNIOR_TASK_KEYWORDS.some(k => lowerExp.includes(k));
  const hasLeadership = TEAM_LEADERSHIP_KEYWORDS.some(k => lowerExp.includes(k));
  const hasSeniorResponsibility = SENIOR_RESPONSIBILITY_KEYWORDS.some(k => lowerExp.includes(k));

  // High confidence: senior title + intern + junior tasks
  if (hasSeniorTitle && hasIntern && hasJuniorTasks) {
    flags.push(makeFlag({
      flagType: 'designation_mismatch',
      severity: 'high',
      confidence: 88,
      evidence: [
        { source: 'Summary/Experience', text: 'Senior-level titles detected (Senior/Manager/Director/Architect)' },
        { source: 'Experience', text: 'Intern-level or administrative tasks described' },
      ],
      analysis: 'A senior designation is claimed but responsibilities include intern-level and administrative tasks. The claimed seniority is not supported by the responsibilities described.',
      explanation: 'This could indicate title inflation, a misrepresentation of role scope, or a mismatch between the title held and actual responsibilities performed.',
    }));
  }

  // Medium: senior title + junior role title + no leadership responsibilities
  if (hasSeniorTitle && !hasLeadership && !hasSeniorResponsibility) {
    const hasJuniorRole = entities.designations.some(d => ['assistant', 'associate', 'junior'].includes(d.title));
    if (hasJuniorRole) {
      flags.push(makeFlag({
        flagType: 'designation_mismatch',
        severity: 'medium',
        confidence: 68,
        evidence: [
          { source: 'Experience', text: 'Senior title appears alongside junior role references (Assistant/Associate)' },
          { source: 'Experience', text: 'No team leadership, budget, or strategic responsibilities detected' },
        ],
        analysis: 'A senior designation appears alongside junior-level role references without substantial senior-level responsibilities.',
        explanation: 'This could indicate a genuine role transition, dual roles, or inconsistency in how the candidate describes their positions.',
      }));
    }
  }

  // Manager without any management responsibilities
  if (entities.designations.some(d => d.title === 'manager') && !hasLeadership) {
    flags.push(makeFlag({
      flagType: 'designation_mismatch',
      severity: 'medium',
      confidence: 62,
      evidence: [
        { source: 'Experience', text: 'Manager title present' },
        { source: 'Experience', text: 'No team leadership, project management, or reporting responsibilities detected' },
      ],
      analysis: 'Manager designation is present but no team leadership, project management, budget, or reporting responsibilities are described.',
      explanation: 'The role scope does not appear to match the typical responsibilities of a manager position.',
    }));
  }

  return flags;
}

// RULE 6: Inflated experience
function rule6_InflatedExperience(text, sections, entities, timeline) {
  const flags = [];
  const allText = getAllText(sections);

  const durationClaims = [...allText.matchAll(/(\d+)\s*\+?\s*(?:years?|yr)/gi)].map(c => parseInt(c[1]));
  const maxClaimed = durationClaims.length > 0 ? Math.max(...durationClaims) : 0;

  const empRanges = timeline.employment.filter(e => e.section === 'experience');
  const uniqueEmploymentYears = computeUniqueDuration(empRanges);

  // Superlative claims with limited experience
  const superlativePatterns = ['expert', 'master', 'world-class', '10+ years', '15+ years', '20+ years', 'extensive experience', 'vast experience', 'deep expertise'];
  const hasSuperlative = superlativePatterns.some(p => allText.toLowerCase().includes(p));

  if (maxClaimed >= 4 && uniqueEmploymentYears > 0 && maxClaimed > uniqueEmploymentYears + 2) {
    flags.push(makeFlag({
      flagType: 'experience_inflation',
      severity: 'high',
      confidence: 88,
      evidence: [
        { source: 'Summary/Experience', text: `Claimed: "${maxClaimed}+ years"` },
        { source: 'Timeline Analysis', text: `Unique employment duration: ~${uniqueEmploymentYears} years` },
      ],
      analysis: `Claims "${maxClaimed}+ years" of experience but listed employment periods cover only ~${uniqueEmploymentYears} years (unique duration, no double-counting).`,
      explanation: 'The claimed experience is materially greater than what the resume evidence supports. This could indicate inflated claims or counting of overlapping/parallel roles.',
    }));
  } else if (maxClaimed >= 3 && uniqueEmploymentYears > 0 && maxClaimed > uniqueEmploymentYears + 1) {
    flags.push(makeFlag({
      flagType: 'experience_inflation',
      severity: 'medium',
      confidence: 70,
      evidence: [
        { source: 'Summary/Experience', text: `Claimed: "${maxClaimed} years"` },
        { source: 'Timeline Analysis', text: `Unique employment duration: ~${uniqueEmploymentYears} years` },
      ],
      analysis: `Claims "${maxClaimed} years" of experience but listed periods support only ~${uniqueEmploymentYears} years.`,
      explanation: 'Some inflation may be present. The claimed experience duration exceeds what can be verified from the listed employment dates.',
    }));
  }

  if (hasSuperlative && maxClaimed <= 2 && uniqueEmploymentYears <= 2) {
    flags.push(makeFlag({
      flagType: 'experience_inflation',
      severity: 'medium',
      confidence: 62,
      evidence: [
        { source: 'Summary/Experience', text: 'Superlative claims found (expert, world-class, extensive experience)' },
        { source: 'Timeline Analysis', text: `Only ~${uniqueEmploymentYears} years of supporting date evidence` },
      ],
      analysis: 'Superlative claims appear but the listed employment dates support only limited experience.',
      explanation: 'The tone of claims may exceed what the employment timeline supports.',
    }));
  }

  return flags;
}

// RULE 7: Unsupported claims
function rule7_UnsupportedClaims(text, sections, entities, timeline) {
  const flags = [];
  const expText = sections.experience.join(' ');
  const projText = sections.projects.join(' ');
  const awdText = sections.awards.join(' ');
  const certText = sections.certifications.join(' ');
  const evidenceText = (expText + ' ' + projText + ' ' + awdText + ' ' + certText).toLowerCase();

  const strongClaims = [
    { pattern: /\bled\b/i, context: 'leadership' },
    { pattern: /\barchitected\b/i, context: 'architecture' },
    { pattern: /\bmanaged\b.*\bteam\b/i, context: 'team management' },
    { pattern: /\b(\d+)\+?\s*projects?\b/i, context: 'project count' },
    { pattern: /\bgenerated\b.*\b(\d+%|revenue|growth)\b/i, context: 'revenue/growth' },
    { pattern: /\bincreased\b.*\b(\d+%|efficiency|performance)\b/i, context: 'performance improvement' },
    { pattern: /\breduced\b.*\b(\d+%|cost|time|effort)\b/i, context: 'cost/time reduction' },
    { pattern: /\boptimized\b/i, context: 'optimization' },
    { pattern: /\btransformed\b/i, context: 'transformation' },
    { pattern: /\bexpert\b/i, context: 'expertise' },
  ];

  let unsupportedCount = 0;
  const unsupportedExamples = [];

  for (const { pattern, context } of strongClaims) {
    const allMatches = [...allText.matchAll(new RegExp(pattern.source, pattern.flags))];
    if (allMatches.length > 0) {
      // Check if there's supporting evidence in experience/projects
      const claimText = allMatches[0][0].toLowerCase();
      const claimWords = claimText.split(/\s+/).filter(w => w.length > 3);
      const hasSupport = claimWords.some(w => evidenceText.includes(w));
      if (!hasSupport && evidenceText.length < 100) {
        unsupportedCount++;
        if (unsupportedExamples.length < 3) unsupportedExamples.push({ claim: allMatches[0][0], context });
      }
    }
  }

  if (unsupportedCount >= 2) {
    flags.push(makeFlag({
      flagType: 'unsupported_claims',
      severity: 'medium',
      confidence: 65,
      evidence: unsupportedExamples.map(e => ({ source: 'Full Resume', text: `Claim: "${e.claim}" (${e.context})` })),
      analysis: `${unsupportedCount} strong professional claims found without corresponding supporting evidence in experience, projects, or achievements.`,
      explanation: 'Strong claims should be supported by specific responsibilities, projects, measurable outcomes, or certifications. Unsupported claims may indicate resume padding.',
    }));
  }

  return flags;
}

// RULE 8: Excessive keyword matching
function rule8_KeywordStuffing(text, sections, entities, timeline) {
  const flags = [];
  const skillsSection = sections.skills.join(' ');
  const expText = sections.experience.join(' ');
  const projText = sections.projects.join(' ');
  const eduText = sections.education.join(' ');

  const techSkills = ['python', 'javascript', 'react', 'node', 'java', 'c++', 'sql', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'tensorflow', 'spark', 'machine learning', 'deep learning', 'nlp', 'computer vision', 'blockchain', 'devops', 'ci/cd', 'microservices', 'graphql', 'flutter', 'swift', 'kotlin', 'go', 'rust', 'scala', 'tableau', 'power bi', 'salesforce', 'agile', 'scrum'];

  const lowerAll = text.toLowerCase();
  const skillsFound = techSkills.filter(s => lowerAll.includes(s));
  const lowerExp = expText.toLowerCase();
  const lowerProj = projText.toLowerCase();
  const lowerEdu = eduText.toLowerCase();

  // For each skill, check contextual evidence
  const skillAnalysis = skillsFound.map(skill => {
    const inExp = lowerExp.includes(skill);
    const inProj = lowerProj.includes(skill);
    const inEdu = lowerEdu.includes(skill);
    const inSkills = skillsSection.toLowerCase().includes(skill);
    const occurrences = (lowerAll.match(new RegExp(skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    return { skill, inExp, inProj, inEdu, inSkills, occurrences, hasContext: inExp || inProj || inEdu };
  });

  const unsupportedSkills = skillAnalysis.filter(s => !s.hasContext && s.inSkills);
  const supportedSkills = skillAnalysis.filter(s => s.hasContext);

  if (skillsFound.length >= 8 && unsupportedSkills.length >= 4) {
    flags.push(makeFlag({
      flagType: 'keyword_stuffing',
      severity: 'medium',
      confidence: 78,
      evidence: [
        { source: 'Skills', text: `Listed: ${skillsFound.join(', ')}` },
        { source: 'Experience/Projects', text: `Unsupported: ${unsupportedSkills.slice(0, 5).map(s => s.skill).join(', ')}` },
      ],
      analysis: `${skillsFound.length} technical skills found but only ${supportedSkills.length} have supporting evidence in experience/projects/education. ${unsupportedSkills.length} skills appear in the skills section without any contextual usage elsewhere.`,
      explanation: 'Skills listed without supporting context in experience, projects, or education may indicate keyword stuffing. Strong resumes demonstrate skills through usage evidence.',
    }));
  } else if (skillsFound.length >= 6 && unsupportedSkills.length >= 3) {
    flags.push(makeFlag({
      flagType: 'keyword_stuffing',
      severity: 'low',
      confidence: 62,
      evidence: [
        { source: 'Skills', text: `Listed: ${skillsFound.slice(0, 8).join(', ')}` },
        { source: 'Experience/Projects', text: `Unsupported: ${unsupportedSkills.slice(0, 5).map(s => s.skill).join(', ')}` },
      ],
      analysis: `${skillsFound.length} technical skills found, ${unsupportedSkills.length} without supporting evidence in experience or projects.`,
      explanation: 'Some skills lack contextual evidence. This may indicate keyword optimization rather than demonstrated proficiency.',
    }));
  }

  return flags;
}

// RULE 9: Unclear institutions/employers
function rule9_UnverifiableDetails(text, sections, entities, timeline) {
  const flags = [];

  // Education without institution
  const eduWithoutInstitution = entities.education.filter(e => e.hasDegree && !e.hasInstitution);
  if (eduWithoutInstitution.length > 0) {
    flags.push(makeFlag({
      flagType: 'unverifiable_details',
      severity: 'medium',
      confidence: 72,
      evidence: eduWithoutInstitution.slice(0, 3).map(e => ({ source: 'Education', text: snippet(e.text, 80) })),
      analysis: `${eduWithoutInstitution.length} education qualification(s) listed without identifying the institution name.`,
      explanation: 'Degrees or qualifications without institution names cannot be independently verified. This is common in some resume formats but reduces verifiability.',
    }));
  }

  // Vague employer descriptions
  if (entities.vagueEmployers.length > 0) {
    flags.push(makeFlag({
      flagType: 'unverifiable_details',
      severity: 'low',
      confidence: 65,
      evidence: entities.vagueEmployers.map(e => ({ source: 'Experience', text: `"${e}"` })),
      analysis: `Employer descriptions are unusually vague: ${entities.vagueEmployers.join(', ')} without naming the actual organization.`,
      explanation: 'Vague employer descriptions make it difficult to verify employment details. Named employers are preferred for verification.',
    }));
  }

  // Qualifications without any institution named
  const hasQualification = EDUCATION_KEYWORDS.some(k => new RegExp(k, 'i').test(text));
  const hasInstitution = /(university|college|institute|school|academy|iit|nit|iim)/i.test(text);
  if (hasQualification && !hasInstitution) {
    flags.push(makeFlag({
      flagType: 'unverifiable_details',
      severity: 'low',
      confidence: 60,
      evidence: [{ source: 'Education', text: 'Qualification type mentioned but no institution named anywhere in the resume' }],
      analysis: 'Qualifications are mentioned but no institution is named anywhere in the resume.',
      explanation: 'Cannot verify the credential without knowing the awarding institution.',
    }));
  }

  return flags;
}

// RULE 10: Concealment / minimisation pattern
function rule10_Concealment(text, sections, entities, timeline) {
  const flags = [];
  const allText = getAllText(sections);

  // Year-only dates without month precision
  const yearOnlyDates = extractAllYears(text);
  const monthYearDates = extractMonthYearDates(text);
  const dateRanges = entities.dateRanges;

  if (yearOnlyDates.length >= 4 && monthYearDates.length === 0 && dateRanges.length === 0) {
    flags.push(makeFlag({
      flagType: 'concealment_pattern',
      severity: 'low',
      confidence: 68,
      evidence: [{ source: 'Full Resume', text: `Year-only dates: ${yearOnlyDates.slice(0, 4).join(', ')} — no month precision` }],
      analysis: 'Only year-only dates are present (e.g., "2020", "2018") with no month/year ranges. Timeline lacks precision.',
      explanation: 'The exact start and end dates of roles cannot be established. This is common but reduces the ability to verify timeline accuracy.',
    }));
  }

  // Multiple "start year – present" ranges without month precision
  const vagueRanges = entities.vagueDates.filter(d => /present|current/i.test(d));
  if (vagueRanges.length >= 2 && monthYearDates.length === 0) {
    flags.push(makeFlag({
      flagType: 'concealment_pattern',
      severity: 'low',
      confidence: 63,
      evidence: vagueRanges.slice(0, 3).map(r => ({ source: 'Experience', text: r })),
      analysis: 'Multiple "start year – present" ranges without month precision. Exact start dates are obscured.',
      explanation: 'The exact start dates of current/recent roles are not specified, making it difficult to establish precise timeline.',
    }));
  }

  // Extremely broad date ranges (15+ years)
  const broadRanges = [...allText.matchAll(/\b(19|20)\d{2}\s*[-–—]\s*(19|20)\d{2}\b/gi)].filter(r => {
    const start = parseInt(r[1]);
    const end = parseInt(r[2]);
    return (end - start) >= 15;
  });
  if (broadRanges.length >= 1) {
    flags.push(makeFlag({
      flagType: 'concealment_pattern',
      severity: 'low',
      confidence: 60,
      evidence: broadRanges.slice(0, 2).map(r => ({ source: 'Experience/Education', text: r[0].trim() })),
      analysis: 'Extremely broad date ranges (15+ years) found that make chronology difficult to establish.',
      explanation: 'Very broad date ranges may obscure gaps or minimize the significance of individual roles within the period.',
    }));
  }

  return flags;
}

// ---------------------------------------------------------------------------
// 7. DIMENSION SCORING
// ---------------------------------------------------------------------------

function computeDimensions(flags, timeline, entities, text) {
  const allText = text || '';

  // Timeline Consistency: based on timeline-related flags
  const timelineFlags = flags.filter(f => ['timeline_overlap', 'duration_mismatch', 'missing_dates'].includes(f.flag_type));
  const timelinePenalty = timelineFlags.reduce((sum, f) => {
    if (f.severity === 'high') return sum + 25;
    if (f.severity === 'medium') return sum + 15;
    return sum + 8;
  }, 0);
  const timelineConsistency = Math.max(0, Math.min(100, 100 - timelinePenalty));

  // Information Consistency: based on contradiction flags
  const infoFlags = flags.filter(f => ['employer_mismatch', 'designation_mismatch', 'internal_contradiction'].includes(f.flag_type));
  const infoPenalty = infoFlags.reduce((sum, f) => {
    if (f.severity === 'high') return sum + 30;
    if (f.severity === 'medium') return sum + 18;
    return sum + 10;
  }, 0);
  const informationConsistency = Math.max(0, Math.min(100, 100 - infoPenalty));

  // Experience Credibility: based on inflation/incomplete/unsupported flags
  const credFlags = flags.filter(f => ['experience_inflation', 'incomplete_history', 'unsupported_claims'].includes(f.flag_type));
  const credPenalty = credFlags.reduce((sum, f) => {
    if (f.severity === 'high') return sum + 28;
    if (f.severity === 'medium') return sum + 16;
    return sum + 8;
  }, 0);
  const experienceCredibility = Math.max(0, Math.min(100, 100 - credPenalty));

  // Verification Readiness: based on unverifiable/concealment/keyword flags
  const verifFlags = flags.filter(f => ['unverifiable_details', 'concealment_pattern', 'keyword_stuffing'].includes(f.flag_type));
  const verifPenalty = verifFlags.reduce((sum, f) => {
    if (f.severity === 'high') return sum + 20;
    if (f.severity === 'medium') return sum + 12;
    return sum + 6;
  }, 0);
  const verificationReadiness = Math.max(0, Math.min(100, 100 - verifPenalty));

  return {
    timeline_consistency: timelineConsistency,
    information_consistency: informationConsistency,
    experience_credibility: experienceCredibility,
    verification_readiness: verificationReadiness,
  };
}

function computeOverallStatus(dimensions, flagCount) {
  const avg = (dimensions.timeline_consistency + dimensions.information_consistency + dimensions.experience_credibility + dimensions.verification_readiness) / 4;
  const highFlags = flagCount; // already filtered by confidence

  if (avg >= 90 && highFlags === 0) return 'No issues detected';
  if (avg >= 75 && highFlags <= 1) return 'Minor review recommended';
  if (avg >= 60) return 'Review recommended';
  return 'Significant review recommended';
}

// ---------------------------------------------------------------------------
// 8. MAIN ENTRY POINT
// ---------------------------------------------------------------------------

function analyzeResume(text) {
  if (!text || !text.trim()) {
    return {
      integrityStatus: 'No resume text to analyze',
      dimensions: { timeline_consistency: 0, information_consistency: 0, experience_credibility: 0, verification_readiness: 0 },
      overallStatus: 'No data',
      detectedFlags: [],
    };
  }

  const sections = splitSections(text);
  const allText = getAllText(sections);
  const entities = extractEntities(sections);
  const timeline = buildTimeline(sections);
  const contradictions = compareSections(sections, entities, timeline);

  // Run all 10 rules
  const allFlags = [];
  allFlags.push(...rule1_MissingDates(allText, sections, entities, timeline));
  allFlags.push(...rule2_OverlappingTimelines(allText, sections, entities, timeline));
  allFlags.push(...rule3_InternalContradictions(allText, sections, entities, timeline, contradictions));
  allFlags.push(...rule4_IncompleteHistory(allText, sections, entities, timeline));
  allFlags.push(...rule5_DesignationMismatch(allText, sections, entities, timeline));
  allFlags.push(...rule6_InflatedExperience(allText, sections, entities, timeline));
  allFlags.push(...rule7_UnsupportedClaims(allText, sections, entities, timeline));
  allFlags.push(...rule8_KeywordStuffing(allText, sections, entities, timeline));
  allFlags.push(...rule9_UnverifiableDetails(allText, sections, entities, timeline));
  allFlags.push(...rule10_Concealment(allText, sections, entities, timeline));

  // Filter: confidence >= 50, cap evidence at 5 items
  const filtered = allFlags
    .filter(f => f.confidence >= 50)
    .map(f => ({
      ...f,
      evidence: f.evidence.slice(0, 5),
    }));

  // Sort: severity first (high > medium > low), then confidence desc
  const sevOrder = { high: 0, medium: 1, low: 2 };
  filtered.sort((a, b) => {
    if (sevOrder[a.severity] !== sevOrder[b.severity]) return sevOrder[a.severity] - sevOrder[b.severity];
    return b.confidence - a.confidence;
  });

  // Compute dimensions
  const dimensions = computeDimensions(filtered, timeline, entities, allText);
  const overallStatus = computeOverallStatus(dimensions, filtered.length);

  return {
    integrityStatus: filtered.length === 0
      ? 'No significant red flags detected'
      : `${filtered.length} potential integrity issue(s) detected`,
    dimensions,
    overallStatus,
    detectedFlags: filtered,
  };
}

module.exports = { analyzeResume, splitSections, extractDateRanges, buildTimeline, extractEntities, computeUniqueDuration };
