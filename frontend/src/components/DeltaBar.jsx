import React from 'react';

export default function DeltaBar({ current = 0, target = 100, color }) {
  const pct = Math.max(0, Math.min(100, current));
  const t = Math.max(0, Math.min(100, target));
  return (
    <div className="delta-bar">
      <div className="delta-track">
        <div className="delta-fill" style={{ width: `${pct}%`, background: color || '#6366f1' }} />
        <div className="delta-marker" style={{ left: `${t}%` }} />
      </div>
      <div className="delta-labels">
        <span>{pct}%</span>
        <span className="muted">target {t}%</span>
      </div>
    </div>
  );
}
