const DEFAULT_WEIGHTS = {
  dob: 0.7,
  name: 0.3,
};

function dobComponent(lifePath, birthNumber) {
  return Math.round((lifePath || 0) * 0.8 + (birthNumber || 0) * 0.2);
}

function compositePersonalNumber(lifePath, birthNumber, expressionNumber, weights = DEFAULT_WEIGHTS) {
  const w = weights || DEFAULT_WEIGHTS;
  const dobPart = dobComponent(lifePath, birthNumber);
  const raw = dobPart * (w.dob ?? 0.7) + (expressionNumber || 0) * (w.name ?? 0.3);
  return Math.min(9, Math.max(1, Math.round(raw)));
}

module.exports = { DEFAULT_WEIGHTS, dobComponent, compositePersonalNumber };
