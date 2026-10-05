const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CURRENT_YEAR, buildResumeSections, labelForSentence, recencyFor } = require('../resumeContext');

test('rc-01 buildResumeSections: labels summary, experience and skills blocks', () => {
  const text = 'Data analyst with 4 years of experience.\nProfessional Experience\nBuilt BI dashboards for sales.\nSkills\nPower BI, SQL';
  const sections = buildResumeSections(text);
  const labels = sections.map((s) => s.label);
  assert.deepEqual(labels, ['Summary', 'Professional Experience', 'Skills']);
  assert.ok(sections[1].sentences.some((s) => s.includes('BI dashboards')));
});

test('rc-02 buildResumeSections: inline "Experience:" heading starts a new block', () => {
  const text = 'Summary here.\nExperience:\nLed analytics at Acme.\nEducation:\nB.Tech';
  const labels = buildResumeSections(text).map((s) => s.label);
  assert.deepEqual(labels, ['Summary', 'Professional Experience', 'Education']);
});

test('rc-03 labelForSentence: maps a normalized-equivalent sentence back to its section', () => {
  const sections = buildResumeSections('Summary first.\nProfessional Experience\nBuilt BI dashboards for the sales team.\nSkills\nExcel');
  assert.equal(labelForSentence('Built BI dashboards for the sales team.', sections), 'Professional Experience');
  assert.equal(labelForSentence('Excel', sections), 'Skills');
});

test('rc-04 labelForSentence: unknown sentence falls back to Other', () => {
  const sections = buildResumeSections('A short summary line.');
  assert.equal(labelForSentence('Completely unrelated sentence not in the resume.', sections), 'Other');
  assert.equal(labelForSentence('', sections), 'Other');
  assert.equal(labelForSentence('A short summary line.', []), 'Other');
});

test('rc-05 recencyFor: present/current wording or very recent year is current', () => {
  assert.equal(recencyFor('Currently leading BI development at Acme.').label, 'current');
  assert.equal(recencyFor(`Working since ${CURRENT_YEAR - 1} on dashboards.`).label, 'current');
});

test('rc-06 recencyFor: recent vs stale maps by age', () => {
  assert.equal(recencyFor(`Analyst from ${CURRENT_YEAR - 3} to ${CURRENT_YEAR - 2}.`).label, 'recent');
  assert.equal(recencyFor(`Analyst from ${CURRENT_YEAR - 8} to ${CURRENT_YEAR - 6}.`).label, 'stale');
});

test('rc-07 recencyFor: no timing evidence is unknown', () => {
  const res = recencyFor('Strong experience building executive dashboards.');
  assert.equal(res.label, 'unknown');
  assert.equal(res.year, null);
});