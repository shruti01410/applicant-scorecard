import React from 'react';
import { Tag, Tooltip } from 'antd';
import { BulbFilled, CheckCircleFilled, MinusCircleFilled, WarningFilled } from '@ant-design/icons';

function confidenceColor(conf) {
  if (conf >= 0.8) return '#16a34a';
  if (conf >= 0.5) return '#f59e0b';
  return '#ef4444';
}

function confidenceLabel(conf) {
  if (conf >= 0.8) return 'High';
  if (conf >= 0.5) return 'Medium';
  return 'Low';
}

function strengthColor(s) {
  if (s === 'strong') return '#16a34a';
  if (s === 'moderate') return '#f59e0b';
  return '#94a3b8';
}

export default function EvidenceDisplay({ evidenceData, paramName }) {
  if (!evidenceData) return null;

  const { score, confidence, evidence, reason, jd_match_pct } = evidenceData;

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{paramName}</span>
        <Tag color={score == null ? 'default' : 'blue'} style={{ margin: 0 }}>Score: {score ?? 'Not scored'}</Tag>
        {(confidence == null || score == null) ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#94a3b8' }}>
            No rating — evidence insufficient
          </span>
        ) : (
          <Tooltip title={`Confidence: ${Math.round(confidence * 100)}%`}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: confidenceColor(confidence), display: 'inline-block' }} />
              {confidenceLabel(confidence)} ({Math.round(confidence * 100)}%)
            </span>
          </Tooltip>
        )}
        {jd_match_pct != null && <Tag style={{ margin: 0 }}>Evaluation: {jd_match_pct}%</Tag>}
      </div>

      {reason && (
        <div style={{ fontSize: 12, color: '#475569', marginBottom: 6, fontStyle: 'italic' }}>
          <BulbFilled style={{ marginRight: 4, color: '#6366f1' }} />
          {reason}
        </div>
      )}

      {evidence && evidence.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {evidence.map((e, i) => (
            e.type === 'gap' || e.source === 'gap' ? (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <WarningFilled style={{ color: '#ef4444', fontSize: 11 }} />
                <span style={{ color: '#b91c1c' }}>{e.text}</span>
                <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 500 }}>gap</span>
              </div>
            ) : (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                {e.strength === 'strong' ? (
                  <CheckCircleFilled style={{ color: '#16a34a', fontSize: 11 }} />
                ) : e.strength === 'moderate' ? (
                  <BulbFilled style={{ color: '#f59e0b', fontSize: 11 }} />
                ) : (
                  <MinusCircleFilled style={{ color: '#94a3b8', fontSize: 11 }} />
                )}
                <span style={{ color: '#334155' }}>{e.text}</span>
                {e.section && (
                  <Tag style={{ margin: 0, fontSize: 10, lineHeight: '16px', background: '#f1f5f9', color: '#334155', borderColor: '#cbd5e1' }}>{e.section}</Tag>
                )}
                {e.recency && (
                  <Tag style={{ margin: 0, fontSize: 10, lineHeight: '16px', background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>{e.recency}{e.recencyYear ? ' · ' + e.recencyYear : ''}</Tag>
                )}
                {e.strength && (
                  <span style={{ fontSize: 10, color: strengthColor(e.strength), fontWeight: 500 }}>
                    {e.strength}
                  </span>
                )}
              </div>
            )
          ))}
        </div>
      )}

      {(!evidence || evidence.length === 0) && (
        <div style={{ fontSize: 12, color: '#94a3b8' }}>No specific evidence found</div>
      )}
    </div>
  );
}
