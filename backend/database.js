const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new DatabaseSync(process.env.SQLITE_PATH || path.join(__dirname, 'scorecard.db'));

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'employee')),
    name TEXT NOT NULL,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS parameters (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    weightage INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scorecards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL UNIQUE,
    applicant_name TEXT,
    email TEXT,
    client TEXT,
    position TEXT,
    jd_shared INTEGER DEFAULT 0,
    jd_shared_date TEXT,
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scorecard_id INTEGER NOT NULL,
    parameter_id INTEGER NOT NULL,
    score INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
    UNIQUE(scorecard_id, parameter_id),
    FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE,
    FOREIGN KEY (parameter_id) REFERENCES parameters(id)
  );

  CREATE TABLE IF NOT EXISTS scorecard_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scorecard_id INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'manual' CHECK(source IN ('manual', 'numerology_suggested')),
    FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS numerology_archetypes (
    number INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    summary TEXT NOT NULL,
    tags TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS numerology_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dimension TEXT NOT NULL DEFAULT 'candidate',
    date_of_birth TEXT NOT NULL,
    life_path_number INTEGER NOT NULL,
    birth_number INTEGER NOT NULL,
    expression_number INTEGER,
    full_name TEXT,
    archetype_number INTEGER NOT NULL REFERENCES numerology_archetypes(number),
    narrative_snapshot TEXT,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, dimension)
  );

  CREATE TABLE IF NOT EXISTS company_numerology_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    founded_year INTEGER NOT NULL,
    brand_name TEXT NOT NULL,
    founder_name TEXT NOT NULL,
    founded_number INTEGER NOT NULL,
    brand_number INTEGER NOT NULL,
    founder_number INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS job_descriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    client TEXT,
    description_text TEXT NOT NULL,
    requirements TEXT,
    file_path TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    jd_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jd_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jd_id INTEGER NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'EXTRACTED' CHECK(source IN ('EXTRACTED','USER_ADDED')),
    mode TEXT NOT NULL DEFAULT 'required' CHECK(mode IN ('required','preferred')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS org_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS jd_requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jd_id INTEGER NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
    requirement_text TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    importance TEXT NOT NULL DEFAULT 'required' CHECK(importance IN ('required','preferred')),
    skill_term TEXT,
    min_experience_years INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS parameter_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scorecard_id INTEGER NOT NULL,
    parameter_id INTEGER NOT NULL,
    score INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
    confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence >= 0 AND confidence <= 1),
    evidence_items TEXT NOT NULL DEFAULT '[]',
    source TEXT DEFAULT 'auto' CHECK(source IN ('auto','manual')),
    reason TEXT,
    jd_match_pct REAL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(scorecard_id, parameter_id),
    FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE,
    FOREIGN KEY (parameter_id) REFERENCES parameters(id)
  );

  CREATE TABLE IF NOT EXISTS must_have_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scorecard_id INTEGER NOT NULL,
    jd_id INTEGER,
    requirement_text TEXT NOT NULL,
    met INTEGER NOT NULL DEFAULT 0,
    evidence TEXT,
    severity TEXT DEFAULT 'critical' CHECK(severity IN ('critical','important','nice_to_have')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS company_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    industry TEXT,
    description TEXT,
    founded_year INTEGER,
    headquarters TEXT,
    core_values TEXT,
    technology_stack TEXT,
    required_competencies TEXT,
    preferred_competencies TEXT,
    work_environment TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jd_weight_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jd_id INTEGER NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
    parameter_id INTEGER NOT NULL REFERENCES parameters(id),
    weightage REAL NOT NULL,
    UNIQUE(jd_id, parameter_id)
  );
`);

try {
  const cols = db.prepare(`PRAGMA table_info(company_numerology_profiles)`).all().map(r => r.name);
  if (cols.length && !cols.includes('brand_name')) db.exec(`ALTER TABLE company_numerology_profiles ADD COLUMN brand_name TEXT NOT NULL DEFAULT ''`);
  if (cols.length && !cols.includes('founder_name')) db.exec(`ALTER TABLE company_numerology_profiles ADD COLUMN founder_name TEXT NOT NULL DEFAULT ''`);
  if (cols.length && !cols.includes('founded_number')) db.exec(`ALTER TABLE company_numerology_profiles ADD COLUMN founded_number INTEGER`);
  if (cols.length && !cols.includes('brand_number')) db.exec(`ALTER TABLE company_numerology_profiles ADD COLUMN brand_number INTEGER`);
  if (cols.length && !cols.includes('founder_number')) db.exec(`ALTER TABLE company_numerology_profiles ADD COLUMN founder_number INTEGER`);
} catch (e) {}

try {
  const uCols = db.prepare(`PRAGMA table_info(users)`).all().map(r => r.name);
  if (!uCols.includes('job_description_id')) db.exec(`ALTER TABLE users ADD COLUMN job_description_id INTEGER REFERENCES job_descriptions(id)`);
  if (!uCols.includes('resume_file_path')) db.exec(`ALTER TABLE users ADD COLUMN resume_file_path TEXT`);
  if (!uCols.includes('resume_text')) db.exec(`ALTER TABLE users ADD COLUMN resume_text TEXT`);
  if (!uCols.includes('capability_match_pct')) db.exec(`ALTER TABLE users ADD COLUMN capability_match_pct INTEGER`);
  if (!uCols.includes('capability_match_detail')) db.exec(`ALTER TABLE users ADD COLUMN capability_match_detail TEXT`);
  if (!uCols.includes('is_favorite')) db.exec(`ALTER TABLE users ADD COLUMN is_favorite INTEGER DEFAULT 0`);
  if (!uCols.includes('is_archived')) db.exec(`ALTER TABLE users ADD COLUMN is_archived INTEGER DEFAULT 0`);
  if (!uCols.includes('date_of_birth')) db.exec(`ALTER TABLE users ADD COLUMN date_of_birth TEXT`);
} catch (e) {}

try {
  const npCols = db.prepare(`PRAGMA table_info(numerology_profiles)`).all().map(r => r.name);
  if (!npCols.includes('expression_number')) db.exec(`ALTER TABLE numerology_profiles ADD COLUMN expression_number INTEGER`);
  if (!npCols.includes('full_name')) db.exec(`ALTER TABLE numerology_profiles ADD COLUMN full_name TEXT`);
  if (!npCols.includes('numerology_name')) db.exec(`ALTER TABLE numerology_profiles ADD COLUMN numerology_name TEXT`);
} catch (e) {}

try {
  const jdCols = db.prepare(`PRAGMA table_info(job_descriptions)`).all().map(r => r.name);
  if (!jdCols.includes('company_id')) db.exec(`ALTER TABLE job_descriptions ADD COLUMN company_id INTEGER REFERENCES company_numerology_profiles(id)`);
  if (!jdCols.includes('is_favorite')) db.exec(`ALTER TABLE job_descriptions ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0`);
  if (!jdCols.includes('is_archived')) db.exec(`ALTER TABLE job_descriptions ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`);
  if (!jdCols.includes('jd_hash')) db.exec(`ALTER TABLE job_descriptions ADD COLUMN jd_hash TEXT`);
} catch (e) {}

// ---- JD content fingerprint (jd_hash) migration ----
// Backfills hashes from normalized description_text, merges existing exact
// duplicates onto their canonical (lowest-id) JD, repoints employee links,
// then enforces uniqueness with a UNIQUE index. Never touches filenames.
try {
  const { hashJD } = require('./jdValidation');
  const needsHash = db.prepare("SELECT id, description_text FROM job_descriptions WHERE jd_hash IS NULL OR jd_hash = ''").all();
  const updHash = db.prepare('UPDATE job_descriptions SET jd_hash = ? WHERE id = ?');
  for (const jd of needsHash) {
    updHash.run(hashJD(jd.description_text), jd.id);
  }

  db.exec('BEGIN');
  try {
    const dups = db.prepare(
      "SELECT jd_hash, COUNT(*) AS c, MIN(id) AS keep_id FROM job_descriptions WHERE jd_hash IS NOT NULL AND jd_hash != '' GROUP BY jd_hash HAVING c > 1"
    ).all();
    let removed = 0;
    let repointed = 0;
    for (const d of dups) {
      const dupRows = db.prepare('SELECT id FROM job_descriptions WHERE jd_hash = ? AND id != ? ORDER BY id').all(d.jd_hash, d.keep_id);
      for (const r of dupRows) {
        const up = db.prepare('UPDATE users SET job_description_id = ? WHERE job_description_id = ?').run(d.keep_id, r.id);
        repointed += up.changes;
        db.prepare('DELETE FROM jd_keywords WHERE jd_id = ?').run(r.id);
        db.prepare('DELETE FROM job_descriptions WHERE id = ?').run(r.id);
        removed++;
      }
    }
    db.exec('COMMIT');
    if (removed > 0) console.log(`[jd_hash] merged ${removed} duplicate JD(s), repointed ${repointed} employee link(s)`);
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (ignored) {}
    console.error('[jd_hash] dedupe failed:', e.message);
  }

  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_jd_hash ON job_descriptions(jd_hash) WHERE jd_hash IS NOT NULL");
} catch (e) {
  console.error('[jd_hash] migration failed:', e.message);
}

try {
  const suCols = db.prepare(`PRAGMA table_info(scorecard_updates)`).all().map(r => r.name);
  if (!suCols.includes('source')) db.exec(`ALTER TABLE scorecard_updates ADD COLUMN source TEXT DEFAULT 'manual'`);
} catch (e) {}

try {
  const ws = db.prepare('SELECT value FROM org_settings WHERE key = ?').get('numerology_weights');
  if (!ws) db.prepare('INSERT INTO org_settings (key, value) VALUES (?, ?)').run('numerology_weights', JSON.stringify({ dob: 0.7, name: 0.3 }));
} catch (e) {}

function makeUsername(name) {
  const parts    = name.trim().toLowerCase().split(/\s+/);
  const base     = (parts[0][0] || '') + (parts[parts.length - 1] || '');
  let username   = base.replace(/[^a-z0-9]/g, '');
  const findUser = db.prepare('SELECT id FROM users WHERE username = ?');
  let counter    = 1;
  while (findUser.get(username)) {
    username = base.replace(/[^a-z0-9]/g, '') + counter++;
  }
  return username;
}

// ---- Seed 23 weighted parameters (weights sum to 100) ----
const paramCount = db.prepare('SELECT COUNT(*) AS count FROM parameters').get();
if (paramCount.count === 0) {
  const insertParam = db.prepare(
    'INSERT INTO parameters (id, name, description, weightage) VALUES (?, ?, ?, ?)'
  );
  const params = [
    [1,  'Communication',                    'Clarity, articulation and responsiveness', 5],
    [2,  'Technical Skills',                 'Depth of relevant technical/domain expertise', 7],
    [3,  'Problem Solving',                  'Approach to analysing and resolving issues', 6],
    [4,  'Attitude',                         'Overall disposition and engagement', 4],
    [5,  'Teamwork',                         'Collaboration and interpersonal dynamics', 4],
    [6,  'Adaptability',                     'Flexibility to changing requirements', 4],
    [7,  'Experience Relevance',             'Relevance of past roles to the position', 6],
    [8,  'Education & Certifications',       'Qualifications and credentials', 3],
    [9,  'Cultural Fit',                     'Alignment with team values and mission', 4],
    [10, 'Leadership Potential',             'Capacity to grow into leadership', 4],
    [11, 'Urgency / Availability',           'Notice period and start date feasibility', 4],
    [12, 'Growth Mindset',                   'Willingness to learn and improve', 4],
    [13, 'Reliability',                      'Dependability and consistency', 4],
    [14, 'Client-Specific Skills',           'Skills directly required by the client', 5],
    [15, 'Industry Knowledge',               'Familiarity with the industry', 3],
    [16, 'Salary Expectations',              'Compensation alignment', 3],
    [17, 'Interview Performance',            'Overall execution during interviews', 7],
    [18, 'Presentation Skills',              'Ability to present ideas effectively', 3],
    [19, 'Analytical Abilities',             'Data-driven reasoning and judgement', 4],
    [20, 'Initiative',                       'Proactiveness and self-direction', 4],
    [21, 'Professionalism',                  'Punctuality, poise and ethics', 4],
    [22, 'Schedule Flexibility',             'Availability for calls and shifts', 3],
    [23, 'Overall Impression',               'Hiring manager overall disposition', 5],
  ];
  params.forEach(p => insertParam.run(...p));
}

// ---- Seed numerology archetypes (1-9 + masters 11, 22) ----
const archCount = db.prepare('SELECT COUNT(*) AS count FROM numerology_archetypes').get();
if (archCount.count === 0) {
  const insertArch = db.prepare(
    'INSERT INTO numerology_archetypes (number, name, summary, tags) VALUES (?, ?, ?, ?)'
  );
  const archetypes = [
    [1, 'The Anchor',        'Steadies what is around it and sets direction.',                 '["Operator", "Reliability", "Follow-through"]'],
    [2, 'The Bridge',        'Connects people and finds the common thread.',                   '["Negotiation", "Diplomacy", "Listening"]'],
    [3, 'The Voice',         'Communicates clearly and brings energy to a room.',              '["Presentation", "Storytelling", "Persuasion"]'],
    [4, 'The Builder',       'Turns plans into reliable, repeatable process.',                 '["Process", "Consistency", "Execution"]'],
    [5, 'The Catalyst',      'Thrives on change and opens up new paths.',                      '["Adaptability", "Variety", "Exploration"]'],
    [6, 'The Steward',       'Looks after the team and the long-term picture.',                '["Care", "Mentoring", "Ownership"]'],
    [7, 'The Analyst',       'Goes deep, researches and seeks understanding.',                 '["Research", "Rigor", "Insight"]'],
    [8, 'The Achiever',      'Drives toward results, responsibility and titles.',              '["Delivery", "Ambition", "Impact"]'],
    [9, 'The Namer',         'Sees the whole, wraps things up and shares what was learned.',    '["Big-picture", "Community", "Closure"]'],
    [11, 'The Seer',         'Brings vision and insight, translating ideas into inspiration.', '["Vision", "Ideas", "Inspiration"]'],
    [22, 'The Architect',    'Turns vision into a buildable, long-lasting structure.',         '["Construction", "Scale", "Legacy"]'],
    [33, 'The Master Teacher', 'Shares what it has mastered and lifts others with it.',       '["Teaching", "Guidance", "Service"]'],
  ];
  archetypes.forEach(a => insertArch.run(...a));
}

// A life path can be master 33 (kept by lifePathNumber) — make sure the archetype exists
// even on databases that were seeded before 33 was added.
try {
  db.prepare('INSERT OR IGNORE INTO numerology_archetypes (number, name, summary, tags) VALUES (?, ?, ?, ?)').run(
    33, 'The Master Teacher', 'Shares what it has mastered and lifts others with it.', '["Teaching", "Guidance", "Service"]'
  );
} catch (e) {}

// ---- Seed users ----
const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get();
if (userCount.count === 0) {
  const insertUser = db.prepare(
    'INSERT INTO users (username, password, role, name, email) VALUES (?, ?, ?, ?, ?)'
  );
  const adminPass = bcrypt.hashSync('12345',    10);
  const empPass   = bcrypt.hashSync('12345',    10);

  insertUser.run('test123', adminPass, 'admin', 'Admin User', 'admin@scorecard.com');
  insertUser.run('Risha', bcrypt.hashSync('rishasinha', 10), 'admin', 'Risha Sinha', 'risha@scorecard.com');

  const employeeNames = [
    'Haroon Ali Khan',
    'Abigail Gonzales',
    'Tehreen Saba',
    'Mohammad Khalid',
    'Pratik Soni',
    'Salman Khan',
    'Dilshad Salim',
    'Riya Sharma',
    'Omar Farooq',
    'Nadia Hussain',
  ];

  employeeNames.forEach(name => {
    const username = makeUsername(name);
    const email    = username + '@scorecard.com';
    insertUser.run(username, empPass, 'employee', name, email);
  });
}

try {
  const hasRisha = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get('risha');
  if (!hasRisha) {
    db.prepare('INSERT INTO users (username, password, role, name, email) VALUES (?, ?, ?, ?, ?)').run('Risha', bcrypt.hashSync('rishasinha', 10), 'admin', 'Risha Sinha', 'risha@scorecard.com');
  }
} catch (e) {}

// ---- JD keyword backfill: seed jd_keywords from each JD's extracted entities.
// Idempotent — only seeds JDs that have no keyword rows yet, so an existing
// curated/edited keyword set is never clobbered. ----
try {
  const { extractStructured } = require('./capabilityMatch');
  const countKw = db.prepare('SELECT COUNT(*) AS c FROM jd_keywords WHERE jd_id = ?');
  const insertKw = db.prepare('INSERT INTO jd_keywords (jd_id, keyword, source, mode, is_active) VALUES (?, ?, ?, ?, 1)');
  const jds = db.prepare('SELECT id, description_text FROM job_descriptions').all();
  for (const jd of jds) {
    if (countKw.get(jd.id).c > 0) continue;
    const entities = extractStructured(jd.description_text, { jd: true });
    const seen = new Set();
    for (const e of entities) {
      const k = e.display.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      insertKw.run(jd.id, k, 'EXTRACTED', e.mode);
    }
  }
} catch (e) {}

module.exports = db;
module.exports.makeUsername = makeUsername;