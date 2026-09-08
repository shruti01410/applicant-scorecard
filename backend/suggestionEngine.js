const parameterThemeMap = require('./parameterThemeMap');

function suggestedRating(compositeNumber, parameterThemeNumber) {
  const diff = Math.abs(compositeNumber - parameterThemeNumber);
  const scale = { 0: 5, 1: 4, 2: 3, 3: 2 };
  return scale[diff] ?? 1;
}

function suggestAllRatings(compositeNumber, themeMap = parameterThemeMap) {
  return Object.fromEntries(
    Object.entries(themeMap).map(([paramId, theme]) => [
      paramId,
      suggestedRating(compositeNumber, theme),
    ])
  );
}

module.exports = { suggestedRating, suggestAllRatings, parameterThemeMap };
