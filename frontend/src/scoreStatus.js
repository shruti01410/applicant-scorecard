// Single source of truth for score -> status/color mapping.
// Used across pursuit priority, per-parameter scores, capability evaluation
// and every score visualization so colours stay consistent.
// Bands: 0-29 Red/Low, 30-49 Yellow/Moderate, 50-69 Green/Good, 70-100 Green/Strong.

export const LOW_COLOR = '#ef4444';
export const MODERATE_COLOR = '#f59e0b';
export const GOOD_COLOR = '#16a34a';
export const STRONG_COLOR = '#15803d';
export const NEUTRAL_COLOR = '#94a3b8';
export const NOT_ACTIVE_COLOR = '#cbd5e1';

export function scoreMeta(score) {
  if (score == null || isNaN(Number(score))) return { label: 'Not scored', band: 'none', color: NEUTRAL_COLOR };
  const n = Number(score);
  if (n < 30) return { label: 'Low', band: 'low', color: LOW_COLOR };
  if (n < 50) return { label: 'Moderate', band: 'moderate', color: MODERATE_COLOR };
  if (n >= 70) return { label: 'Strong', band: 'strong', color: STRONG_COLOR };
  return { label: 'Good', band: 'good', color: GOOD_COLOR };
}

export function scoreColor(score) {
  return scoreMeta(score).color;
}

export function scoreLabel(score) {
  return scoreMeta(score).label;
}