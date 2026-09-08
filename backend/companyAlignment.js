const { outcomeFor } = require('./numerologyOutcome');
const { compositePersonalNumber } = require('./numerologyUtils');

function buildAlignment(profile, company) {
  if (!profile || !company) return null;
  const lifePath = profile.life_path_number;
  const birth = profile.birth_number;
  const expression = profile.expression_number;
  const composite = compositePersonalNumber(lifePath, birth, expression);
  const founded = company.founded_number;
  const brand = company.brand_number;
  const founder = company.founder_number;

  const dims = [
    { dimension: 'Trajectory Alignment', candidateNumber: composite, companyNumber: founded, label: 'Composite vs Founded' },
    { dimension: 'Brand Alignment', candidateNumber: expression, companyNumber: brand, label: 'Expression vs Brand' },
    { dimension: 'Founder Alignment', candidateNumber: birth, companyNumber: founder, label: 'Birth vs Founder' },
  ].map(d => {
    const diff = d.candidateNumber != null && d.companyNumber != null ? Math.abs(d.candidateNumber - d.companyNumber) : null;
    const { tone, label } = outcomeFor(diff);
    return { ...d, diff, tone, outcome: label };
  });

  const diffs = dims.map(d => d.diff).filter(v => v != null);
  const overallDiff = diffs.length ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null;
  const { tone: overallTone, label: overallLabel } = outcomeFor(overallDiff);
  const overall = { diff: overallDiff, tone: overallTone, label: overallLabel };

  return { candidateComposite: composite, dimensions: dims, overall };
}

module.exports = { buildAlignment };
