const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FAMILIES, findFamily, matchInSentences, matchInText } = require('../semanticMatch');

test('sem-01 determinism: identical inputs produce identical output', () => {
  const req = 'Microsoft Excel';
  const resume = ['Handled inventory reconciliation using spreadsheet software.'];
  assert.deepEqual(matchInSentences(req, resume), matchInSentences(req, resume));
  assert.deepEqual(findFamily('Power BI dashboards'), findFamily('Power BI dashboards'));
});

test('sem-02 findFamily: exact term containment returns the family', () => {
  const fam = findFamily('experience with business intelligence reporting');
  assert.ok(fam);
  assert.equal(fam.name, 'business intelligence');
});

test('sem-03 findFamily: unknown requirement returns null', () => {
  assert.equal(findFamily('Kubernetes orchestration of heterogeneous clusters'), null);
});

test('sem-04 findFamily: synonym spelled out resolves to the same family', () => {
  const fam = findFamily('BI reporting');
  assert.ok(fam);
  assert.equal(fam.name, 'business intelligence');
});

test('sem-05 matchInSentences: equivalent expression is found (Excel -> spreadsheet software)', () => {
  const res = matchInSentences('Microsoft Excel', ['Handled inventory reconciliation using spreadsheet software.']);
  assert.ok(res);
  assert.equal(res.family, 'spreadsheet analysis');
  assert.equal(res.equivalent, 'spreadsheet software');
  assert.match(res.sentence, /spreadsheet software/);
});

test('sem-06 matchInSentences: equivalent across sibling families (Power BI -> interactive reports)', () => {
  const res = matchInText('Power BI dashboards', 'Built interactive reports for the executive team.');
  assert.ok(res);
  assert.equal(res.equivalent, 'interactive reports');
});

test('sem-07 matchInSentences: returns null when nothing equivalent exists (never invents evidence)', () => {
  assert.equal(matchInText('Kubernetes', 'Managed customer accounts for a retail bank.'), null);
});

test('sem-08 matchInSentences: trailing sentence punctuation does not break the match', () => {
  const res = matchInSentences('Microsoft Excel', ['reconciliation using spreadsheet software.']);
  assert.ok(res);
});

test('sem-09 matchInSentences: blank requirement yields null', () => {
  assert.equal(matchInSentences('   ', ['Anything here']), null);
  assert.equal(matchInSentences('', ['Anything here']), null);
});

test('sem-10 matchInSentences: empty resume yields null', () => {
  assert.equal(matchInSentences('Microsoft Excel', []), null);
  assert.equal(matchInText('Microsoft Excel', ''), null);
});

test('sem-11 curated family list is non-empty and well-formed', () => {
  assert.ok(Array.isArray(FAMILIES) && FAMILIES.length > 0);
  for (const fam of FAMILIES) {
    assert.ok(fam.name);
    assert.ok(Array.isArray(fam.terms) && fam.terms.length > 0);
    assert.ok(Array.isArray(fam.equivalents) && fam.equivalents.length > 0);
  }
});