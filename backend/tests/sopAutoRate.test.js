const { test } = require('node:test');
const assert = require('node:assert/strict');
const { autoRateSopParameters } = require('../sopAutoRate');

const find = (arr, id) => arr.find((x) => x.parameter_id === id);
const rate = (jdText, resumeText, jobTitle) => autoRateSopParameters({ jdText, resumeText, jobTitle });

const DATA_JD = 'Data Analyst role. Required skills: Microsoft Excel, SQL, Python. Nice to have: Power BI.';
const DATA_RESUME = 'Worked as Data Analyst for 2 years. Built a Python project to automate data pipelines. Proficient in Microsoft Excel and SQL. B.Tech in Computer Science.';

test('sopA-01 determinism: identical inputs produce identical output', () => {
  const a = autoRateSopParameters({ jdText: DATA_JD, resumeText: DATA_RESUME, jobTitle: 'Data Analyst' });
  const b = autoRateSopParameters({ jdText: DATA_JD, resumeText: DATA_RESUME, jobTitle: 'Data Analyst' });
  assert.deepEqual(a, b);
});

test('sopA-02 engine returns exactly the 13 PERSON+ROLE SOP params, never DEAL', () => {
  const r = rate(DATA_JD, DATA_RESUME, 'Data Analyst');
  assert.equal(r.length, 13);
  const ids = r.map((x) => x.parameter_id).sort((x, y) => x - y);
  assert.deepEqual(ids, [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113]);
  assert.equal(ids.includes(114) || ids.includes(115) || ids.includes(116), false);
});

test('sopA-03 no JD and no resume: everything not_scored, nothing defaults to 50', () => {
  const r = rate('', '');
  assert.ok(r.length === 13);
  for (const s of r) {
    assert.equal(s.status, 'not_scored');
    assert.equal(s.score, null);
    assert.equal(s.confidence, null);
  }
});

test('sopA-04 technical competence: Σ(skill_depth × importance)/Σ(importance), matched skills only', () => {
  const t = find(rate(DATA_JD, DATA_RESUME, 'Data Analyst'), 111);
  assert.equal(t.status, 'active');
  assert.equal(t.score, 55);
  assert.equal(t.detail.matched, 4);
  assert.equal(t.detail.missing, 0);
  assert.deepEqual(t.gaps, []);
  const bySkill = Object.fromEntries(t.detail.skills.map((s) => [s.skill, s.depth]));
  assert.equal(bySkill['Python'], 90);
  assert.equal(bySkill['Microsoft Excel'], 25);
  assert.equal(bySkill['SQL'], 25);
  assert.equal(bySkill['Data Analysis'], 80);
  assert.ok(t.confidence >= 0 && t.confidence <= 1);
  assert.ok(t.evidence.length > 0);
});

test('sopA-05 missing required skill produces a named gap and lowers the score', () => {
  const full = find(rate(DATA_JD, DATA_RESUME, 'Data Analyst'), 111).score;
  const miss = find(rate('Data Analyst role. Required skills: Microsoft Excel, SQL, Python.', 'Worked as Data Analyst for 2 years. Built a Python project. Proficient in SQL.', 'Data Analyst'), 111);
  assert.ok(miss.score < full);
  assert.ok(miss.gaps.some((g) => g.includes('Microsoft Excel')));
  assert.equal(miss.detail.missing, 1);
});

test('sopA-06 mention-only context is not misread as deep skill use', () => {
  const t = find(rate('Data Analyst. Essential: Microsoft Excel, SQL.', 'Familiar with data analysis and reporting.', 'Data Analyst'), 111);
  const excel = t.detail.skills.find((s) => s.skill === 'Microsoft Excel');
  const sql = t.detail.skills.find((s) => s.skill === 'SQL');
  assert.equal(excel.depth, 0);
  assert.equal(sql.depth, 0);
  assert.equal(excel.level, 'none');
  assert.ok(t.gaps.some((g) => g.includes('Microsoft Excel')));
});

test('sopA-07 skill depth ladder: work/strong beats mention beats none', () => {
  const jd = 'Data Analyst role. Required skills: Python.';
  const py = (x) => x.detail.skills.find((s) => s.skill === 'Python');
  const mention = py(find(rate(jd, 'Proficient in Python.', 'Data Analyst'), 111));
  const project = py(find(rate(jd, 'Completed an academic Python project for data analysis.', 'Data Analyst'), 111));
  const work = py(find(rate(jd, 'Worked as Python Developer for 2 years.', 'Data Analyst'), 111));
  assert.equal(mention.depth, 25);
  assert.equal(project.depth, 60);
  assert.equal(work.depth, 80);
  assert.ok(mention.depth < project.depth && project.depth < work.depth);
});

test('sopA-08 qualifications formula: satisfied, partial, and missing required credentials', () => {
  const satisfied = find(rate('Analyst. Bachelor degree required.', 'B.Com in Commerce.', 'Analyst'), 113);
  assert.equal(satisfied.score, 80);

  const missingCert = find(rate('Accountant. CPA mandatory. Bachelors degree required.', 'B.Com degree. 5 years accounting experience.', 'Accountant'), 113);
  assert.equal(missingCert.score, 55);
  assert.ok(missingCert.gaps.some((g) => g.includes('CPA')));

  const reduced = find(rate('Python developer. Bachelor of Engineering required. PMP preferred.', 'Completed PMP certification. Worked as developer.', 'Developer'), 113);
  assert.equal(reduced.score, 40);
  assert.ok(reduced.gaps.some((g) => g.includes('B.E.')));
});

test('sopA-09 qualifications: JD silent on quals → not_scored (N/A for recruiter)', () => {
  const q = find(rate('Data Engineer. Mandatory: Python, SQL.', 'Built Python services. B.Tech.', 'Data Engineer'), 113);
  assert.equal(q.status, 'not_scored');
  assert.equal(q.score, null);
});

test('sopA-10 experience: 35 role + 25 responsibility + 20 industry + 10 seniority + 10 recency', () => {
  const e = find(rate(
    'Data Analyst. Responsibilities: dashboard development, data cleaning, reporting. Industry: retail. 2 years experience.',
    'Currently Data Analyst at retail firm. Responsibilities include dashboard development and data cleaning. 2 years experience.',
    'Data Analyst'
  ), 112);
  assert.equal(e.status, 'active');
  assert.equal(e.score, 92);
  assert.ok(e.evidence.some((v) => v.text.includes('retail')));
  assert.ok(e.gaps.some((g) => g.includes('reporting')));
});

test('sopA-11 experience: JD with no role/domain/responsibility requirements → not_scored', () => {
  const e = find(rate('We are looking for a Python developer.', 'Built Python services for 2 years.', undefined), 112);
  assert.equal(e.status, 'not_scored');
  assert.equal(e.score, null);
});

test('sopA-12 PERSON params: JD-required + strong resume evidence scores high; no evidence stays not_scored', () => {
  const strong = find(rate('Sales role. Strong communication skills required.', 'Presented findings to stakeholders. Delivered training sessions.', 'Sales Executive'), 101);
  assert.equal(strong.status, 'active');
  assert.ok(strong.score >= 62);
  assert.ok(strong.evidence.some((x) => x.strength === 'strong'));

  const silent = find(rate('Sales role.', 'Presented findings to stakeholders.', 'Sales Executive'), 102);
  assert.equal(silent.status, 'not_scored');
  assert.equal(silent.score, null);

  const weakSuggestion = find(rate('', 'Team player who collaborated on projects.', undefined), 104);
  assert.equal(weakSuggestion.status, 'active');
  assert.equal(weakSuggestion.score, 50);
});

test('sopA-13 confidence invariant: scored params have 0..1 confidence, unscored have null', () => {
  const r = rate(DATA_JD, DATA_RESUME, 'Data Analyst');
  for (const s of r) {
    if (s.status === 'not_scored') {
      assert.equal(s.score, null);
      assert.equal(s.confidence, null);
    } else {
      assert.ok(typeof s.score === 'number' && s.score >= 0 && s.score <= 100);
      assert.ok(s.confidence >= 0 && s.confidence <= 1);
    }
  }
});