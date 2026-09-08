function outcomeFor(diff) {
  if (diff == null) return { tone: 'neutral', label: 'Neutral' };
  const d = Math.abs(Number(diff));
  if (d <= 1) return { tone: 'good', label: 'Good' };
  if (d <= 3) return { tone: 'neutral', label: 'Neutral' };
  return { tone: 'watch', label: 'Worth exploring' };
}

module.exports = { outcomeFor };
