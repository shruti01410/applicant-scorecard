const parameterThemeMap = require('./parameterThemeMap');
const { explainParameter } = require('./resonanceCopy');
const { outcomeFor } = require('./numerologyOutcome');

function matchVsRole(composite, baseScore) {
  return Object.entries(parameterThemeMap).map(([paramId, theme]) => {
    const themeNum = Number(theme);
    const diff = composite != null ? Math.abs(composite - themeNum) : null;
    const { tone, label } = outcomeFor(diff);
    const resonanceAdjust = diff != null ? ({ 0: 12, 1: 6, 2: 0, 3: -1 }[diff] ?? -3) : 0;
    const basePct = baseScore ? Math.round((baseScore / 5) * 100) : 60;
    const fitPct = Math.max(0, Math.min(100, basePct + resonanceAdjust));
    const paramIdNum = Number(paramId);
    return {
      parameter_id: paramIdNum,
      paramName: `Param ${paramIdNum}`,
      theme: themeNum,
      diff,
      tone,
      outcome: label,
      basePct,
      fitPct,
      ...explainParameter(`Param ${paramIdNum}`, diff),
    };
  });
}

module.exports = { matchVsRole };
