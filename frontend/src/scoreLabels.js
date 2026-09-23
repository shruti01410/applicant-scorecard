import { scoreMeta, scoreColor } from './scoreStatus';

export function badge(pct) {
  const m = scoreMeta(pct);
  return { label: m.label, color: m.color };
}
export function colorFor(pct) {
  return scoreColor(pct);
}