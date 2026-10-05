import React, { useState } from 'react';
import { Slider, InputNumber, Checkbox, Tag, Button } from 'antd';
import { scoreColor } from '../scoreStatus';

export function DualSliderRow({ param, autoScore, manualScore, touched, na, onManualChange, onToggleNA, evidence, onEvidenceChange, confirmFor, pendingValue, onConfirm, onCancel }) {
  const effectiveScore = touched && manualScore != null ? manualScore : autoScore;
  const scoreSource = !touched ? 'auto' : manualScore === autoScore ? 'manual_confirmed' : 'manual_override';
  const weightedScore = na ? 0 : +((effectiveScore * param.weightage) / 100).toFixed(1);
  const needsConfirmation = touched && manualScore != null && manualScore > autoScore;
  const pColor = scoreColor(effectiveScore ?? 0);

  return (
    <div style={{ padding: '14px 12px', borderBottom: '1px solid #f5f6f8' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 500, marginBottom: 2 }}>
        <span>{param.name}</span>
        <span style={{ color: '#2563eb', fontWeight: 600 }}>{weightedScore}</span>
      </div>
      <div style={{ fontSize: 11.5, color: '#9ca3af', margin: '2px 0 8px' }}>{param.description}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 76px', gap: 16, alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: '#2563eb', letterSpacing: '0.3px', width: 44, flexShrink: 0, whiteSpace: 'nowrap' }}>AUTO</span>
            <div style={{ flex: 1, height: 6, background: '#e9ebef', borderRadius: 3, position: 'relative', minWidth: 0 }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: 6, borderRadius: 3, width: `${autoScore ?? 0}%`, background: scoreColor(autoScore ?? 0) }} />
            </div>
            <span style={{ width: 36, textAlign: 'center', fontSize: 12, fontWeight: 500, border: '1px solid #e9ebef', borderRadius: 6, padding: '2px 4px', color: '#374151', background: '#f8fafc', flexShrink: 0 }}>{autoScore ?? 0}</span>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: '#7c3aed', letterSpacing: '0.3px', width: 44, flexShrink: 0, whiteSpace: 'nowrap' }}>MANUAL</span>
            <Slider min={0} max={100} step={1} value={na ? 0 : touched ? Number(manualScore ?? 0) : 0} disabled={na} onChange={v => onManualChange(param.id, v)} style={{ flex: 1, margin: 0, minWidth: 0 }} tooltip={{ formatter: v => na ? 'N/A' : `${v}` }} />
            <InputNumber min={0} max={100} value={na ? null : touched ? manualScore : null} placeholder="0" disabled={na} onChange={v => onManualChange(param.id, v)} style={{ width: 56, flexShrink: 0 }} />
          </div>
          <div style={{ marginTop: 6, minHeight: 18 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, padding: '3px 8px', borderRadius: 10, whiteSpace: 'nowrap', background: !touched ? '#f1f5f9' : manualScore === autoScore ? '#dcfce7' : '#fef3c7', color: !touched ? '#64748b' : manualScore === autoScore ? '#15803d' : '#92400e' }}>
              {!touched ? 'auto' : manualScore === autoScore ? 'confirmed' : 'override'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20, minWidth: 36, textAlign: 'center', background: param.weightage >= 12 ? '#dcfce7' : param.weightage >= 10 ? '#fef3c7' : '#fce7f3', color: param.weightage >= 12 ? '#15803d' : param.weightage >= 10 ? '#92400e' : '#9d174d', flexShrink: 0 }}>{param.weightage}%</span>
          <span style={{ fontWeight: 600, fontSize: 13, color: '#2563eb' }}>{weightedScore}</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9ca3af', cursor: 'pointer', flexShrink: 0 }}>
            <input type="checkbox" checked={na} onChange={e => onToggleNA(param.id, e.target.checked)} style={{ width: 14, height: 14 }} /> N/A
          </label>
        </div>
      </div>
      {touched && scoreSource === 'manual_override' && (
        <textarea placeholder="Evidence / justification for this adjustment" value={evidence || ''} onChange={e => onEvidenceChange(param.id, e.target.value)} style={{ width: '100%', minHeight: 44, marginTop: 8, fontSize: 12, border: '1px solid #e9ebef', borderRadius: 8, padding: 8, fontFamily: 'inherit', resize: 'vertical' }} />
      )}
      {confirmFor === param.id && (
        <div style={{ marginTop: 8, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#92400e' }}>Manual score ({pendingValue}) is higher than auto-rated score ({autoScore}). Please provide supporting evidence before applying.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="small" onClick={onCancel}>Cancel</Button>
            <Button size="small" type="primary" onClick={() => onConfirm(param.id)}>Confirm & Apply</Button>
          </div>
        </div>
      )}
    </div>
  );
}
