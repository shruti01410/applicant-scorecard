const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'scorecard.db'));

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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS org_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
} catch (e) {}

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
  ];
  archetypes.forEach(a => insertArch.run(...a));
}

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

module.exports = db;
module.exports.makeUsername = makeUsername;