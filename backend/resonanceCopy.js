const { outcomeFor } = require('./numerologyOutcome');

const VERDICT_COPY = {
  good: {
    label: 'Good',
    icon: '✓',
    tone: 'good',
    line: (paramName) => `Naturally suited to ${paramName.toLowerCase()}-heavy work.`,
  },
  neutral: {
    label: 'Neutral',
    icon: '·',
    tone: 'neutral',
    line: () => `No numerical signal either way — same as the base score.`,
  },
  watch: {
    label: 'Worth exploring',
    icon: '!',
    tone: 'watch',
    line: (paramName) => `Numerically distant from ${paramName.toLowerCase()} — a good area to ask about in interview, not a red flag.`,
  },
};

const LEGACY_VERDICT_COPY = {
  strong: VERDICT_COPY.good,
  light: VERDICT_COPY.neutral,
  distant: VERDICT_COPY.watch,
  neutral: VERDICT_COPY.neutral,
};

function verdictFor(diff) {
  const { tone } = outcomeFor(diff);
  return tone;
}

function explainParameter(paramName, diff) {
  const { tone, label } = outcomeFor(diff);
  const v = VERDICT_COPY[tone] || VERDICT_COPY.neutral;
  return { tone: v.tone, label: v.label, icon: v.icon, oneLiner: v.line(paramName), outcome: label };
}

module.exports = { VERDICT_COPY, LEGACY_VERDICT_COPY, verdictFor, explainParameter };
