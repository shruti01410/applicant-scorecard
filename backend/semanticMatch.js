/*
 * Lightweight semantic matching — curated synonym families used as a
 * FALLBACK when a JD requirement is not named verbatim on the resume.
 *
 * Design note: this is NOT an embedding/cosine model (none exists in this
 * repo). It implements the "structured + rules" tier of the matching story:
 * a deterministic family of semantically equivalent expressions (Eightfold's
 * own guidance says structured features matter precisely because embeddings
 * alone are not interpretable). Every hit is reported as "semantic/partial"
 * so recruiters verify in the interview — never treated as a verbatim match.
 */

const FAMILIES = [
  {
    name: 'business intelligence',
    terms: ['business intelligence', 'bi reporting', 'bi dashboards', 'reporting dashboards'],
    equivalents: [
      'power bi reporting', 'business intelligence reporting', 'bi reports', 'bi reporting',
      'bi dashboards', 'business intelligence dashboards', 'power bi dashboards',
      'executive dashboards', 'reporting dashboards', 'analytics dashboards',
      'kpi dashboards', 'management dashboards', 'business analytics dashboards',
    ],
  },
  {
    name: 'dashboard development',
    terms: ['dashboard', 'dashboards', 'dashboard development', 'building dashboards', 'creating dashboards', 'bi dashboards'],
    equivalents: [
      'dashboards', 'reporting dashboards', 'visual dashboards', 'executive dashboards',
      'kpi dashboards', 'power bi reports', 'report development', 'report builder',
      'interactive reports', 'reporting packs', 'analytics dashboards',
    ],
  },
  {
    name: 'data analytics',
    terms: ['data analytics', 'data analysis', 'analytics', 'analysing data', 'analyzing data', 'data insights'],
    equivalents: [
      'data analytics', 'data analysis', 'analytics', 'insights', 'metrics analysis',
      'kpi analysis', 'trend analysis', 'data insights', 'business analytics',
      'analytical reports', 'analysing data', 'analyzing data',
    ],
  },
  {
    name: 'spreadsheet analysis',
    terms: ['microsoft excel', 'excel', 'advanced excel', 'excel spreadsheets'],
    equivalents: [
      'spreadsheet software', 'spreadsheets', 'excel spreadsheets', 'advanced excel',
      'pivot tables', 'vlookup', 'financial modeling', 'reconciliation spreadsheets',
      'budget trackers', 'excel reporting', 'excel macros', 'excel dashboards',
    ],
  },
  {
    name: 'data engineering',
    terms: ['data engineering', 'etl', 'etl development', 'data pipelines', 'data integration'],
    equivalents: [
      'etl pipelines', 'data pipelines', 'data ingestion', 'data integration',
      'extract transform load', 'data flows', 'pipeline development', 'data warehousing',
      'etl jobs', 'data transformation',
    ],
  },
  {
    name: 'cloud platform',
    terms: ['cloud', 'cloud computing', 'cloud platform', 'cloud infrastructure'],
    equivalents: [
      'aws', 'amazon web services', 'azure', 'google cloud', 'gcp', 'cloud infrastructure',
      'cloud services', 'cloud deployment', 'saas', 'paas', 'iaas', 'serverless',
    ],
  },
  {
    name: 'machine learning',
    terms: ['machine learning', 'ml models', 'predictive modeling', 'predictive modelling'],
    equivalents: [
      'machine learning models', 'ml models', 'predictive models', 'predictive analytics',
      'model training', 'model building', 'ai models', 'mlops', 'trained models',
    ],
  },
  {
    name: 'stakeholder communication',
    terms: ['stakeholder communication', 'stakeholder management', 'client communication', 'stakeholder reporting'],
    equivalents: [
      'stakeholders', 'cross-functional teams', 'client presentations', 'presentations to management',
      'executive reporting', 'management reporting', 'working with clients', 'presented to stakeholders',
    ],
  },
  {
    name: 'collaboration',
    terms: ['collaboration', 'teamwork', 'team collaboration', 'cross-functional collaboration'],
    equivalents: [
      'collaborated with', 'worked with cross-functional', 'cross-functional teams',
      'team collaboration', 'peer collaboration', 'cross-team', 'partnered with',
    ],
  },
  {
    name: 'project management',
    terms: ['project management', 'project management skills', 'program management', 'project coordination'],
    equivalents: [
      'project coordination', 'project delivery', 'delivered projects', 'stakeholder management',
      'timeline management', 'sprint planning', 'project planning', 'delivered on time',
    ],
  },
  {
    name: 'report writing',
    terms: ['report writing', 'report generation', 'reporting', 'mis reporting'],
    equivalents: [
      'report generation', 'management reports', 'monthly reports', 'daily reports',
      'reporting packs', 'board packs', 'written reports', 'report preparation',
    ],
  },
];

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[^a-z0-9+#.\-\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensOf(s) {
  return normalize(s).split(' ').map((w) => w.replace(/[.!?]+$/, '')).filter(Boolean);
}

function hasPhrase(text, phrase) {
  const ts = tokensOf(text);
  const ps = tokensOf(phrase);
  if (!ps.length || ps.length > ts.length) return false;
  for (let i = 0; i + ps.length <= ts.length; i++) {
    let ok = true;
    for (let j = 0; j < ps.length; j++) {
      if (ts[i + j] !== ps[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

const STOP_WORDS = new Set(['with', 'and', 'for', 'the', 'skills', 'experience', 'strong', 'solid', 'knowledge', 'expert', 'working', 'building', 'required', 'mandatory']);

function wordOverlap(rt) {
  const set = new Set(rt);
  let best = 0;
  for (const fam of FAMILIES) {
    const sig = new Set(fam.terms.flatMap((t) => tokensOf(t)).filter((w) => w.length > 3 && !STOP_WORDS.has(w)));
    if (!sig.size) continue;
    let hits = 0;
    for (const w of sig) if (set.has(w)) hits++;
    const ratio = hits / sig.size;
    if (ratio > best) best = ratio;
  }
  return best;
}

/**
 * All semantic families a JD requirement could belong to. Direct phrase
 * containment against family terms wins; otherwise a significant-word
 * overlap heuristic (>=50%).
 */
function familiesFor(requirement) {
  const req = normalize(requirement);
  if (!req) return [];
  const rt = tokensOf(requirement);
  const direct = [];
  for (const fam of FAMILIES) {
    for (const t of fam.terms) {
      if (hasPhrase(req, t) || hasPhrase(t, req)) { direct.push(fam); break; }
    }
  }
  if (direct.length) return direct;
  if (wordOverlap(rt) >= 0.5) {
    const byOverlap = [];
    for (const fam of FAMILIES) {
      const sig = new Set(fam.terms.flatMap((t) => tokensOf(t)).filter((w) => w.length > 3 && !STOP_WORDS.has(w)));
      if (!sig.size) continue;
      const hits = [...sig].filter((w) => rt.includes(w)).length;
      if (hits / sig.size >= 0.5) byOverlap.push(fam);
    }
    return byOverlap;
  }
  return [];
}

/**
 * Find the semantic family a JD requirement belongs to (first match only,
 * for display/tests).
 */
function findFamily(requirement) {
  const families = familiesFor(requirement);
  return families.length ? families[0] : null;
}

/**
 * Search resume sentences for a semantically equivalent expression of the
 * requirement across every matching family. Returns null when nothing
 * equivalent is present (never invents evidence).
 */
function matchInSentences(requirement, resumeSentences) {
  const families = familiesFor(requirement);
  if (!families.length || !Array.isArray(resumeSentences)) return null;
  for (const sentence of resumeSentences) {
    const s = normalize(sentence);
    if (!s) continue;
    for (const fam of families) {
      for (const eq of fam.equivalents) {
        if (hasPhrase(s, eq)) {
          return { family: fam.name, equivalent: eq, sentence };
        }
      }
    }
  }
  return null;
}

/**
 * Convenience wrapper: join sentences into a single blob and match.
 */
function matchInText(requirement, resumeText) {
  return matchInSentences(requirement, splitSentences(resumeText));
}

function splitSentences(text) {
  const t = String(text || '');
  if (!t.trim()) return [];
  return t
    .split(/[.!?]+\s*|[\r\n]+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 3);
}

module.exports = {
  FAMILIES,
  findFamily,
  matchInSentences,
  matchInText,
};