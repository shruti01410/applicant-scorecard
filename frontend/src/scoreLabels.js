export function badge(pct) {
  if (pct == null) return { label: 'Not scored', color: '#9CA3AF' };
  if (pct >= 80) return { label: 'Excellent', color: '#16a34a' };
  if (pct >= 65) return { label: 'Good', color: '#2563eb' };
  if (pct >= 30) return { label: 'Average', color: '#f59e0b' };
  return { label: 'Needs Improvement', color: '#ef4444' };
}
export function colorFor(pct) {
  if (pct == null) return '#94a3b8';
  if (pct < 30) return '#ef4444';
  if (pct < 65) return '#f59e0b';
  if (pct < 80) return '#2563eb';
  return '#16a34a';
}