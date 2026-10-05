import React from 'react';
import { Card, Tag, Tooltip } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, QuestionCircleOutlined } from '@ant-design/icons';
import { scoreColor, NOT_ACTIVE_COLOR } from '../scoreStatus';

const PRIORITY_META = {
  must: { label: 'Must Have', color: '#ef4444' },
  important: { label: 'Important', color: '#f59e0b' },
  preferred: { label: 'Preferred', color: '#16a34a' },
  nice_to_have: { label: 'Nice to Have', color: '#94a3b8' },
};

const STRENGTH_META = {
  strong: { label: 'Strong Contextual Evidence', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  explicit: { label: 'Explicit Evidence', color: '#16a34a', bg: '#f0fdf4', border: '#a7f3d0' },
  weak: { label: 'Weak / Related Evidence', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  none: { label: 'No Evidence', color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
};

const RECENCY_META = {
  current: { label: 'Current', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  recent: { label: 'Recent', color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
  stale: { label: 'Stale', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
};

const STATUS_ICON = {
  matched: <CheckCircleFilled style={{ color: '#16a34a' }} />,
  partial: <QuestionCircleOutlined style={{ color: '#f59e0b' }} />,
  missing: <CloseCircleFilled style={{ color: '#ef4444' }} />,
};

const CATEGORY_ORDER = ['technical', 'tools', 'soft', 'domain', 'education', 'experience', 'certificates', 'responsibilities', 'other'];

export default function RequirementBreakdown({ requirements = [], title = 'Requirement Breakdown', weighted }) {
  if (!requirements || requirements.length === 0) return null;

  const byStatus = {
    matched: requirements.filter(r => r.matchStatus === 'matched').length,
    partial: requirements.filter(r => r.matchStatus === 'partial').length,
    missing: requirements.filter(r => r.matchStatus === 'missing').length,
  };

  const groups = {};
  for (const r of requirements) {
    const key = r.category || 'other';
    if (!groups[key]) groups[key] = { label: r.categoryLabel || key, items: [] };
    groups[key].items.push(r);
  }
  const ordered = CATEGORY_ORDER.filter(c => groups[c]).map(c => groups[c])
    .concat(Object.keys(groups).filter(c => !CATEGORY_ORDER.includes(c)).map(c => groups[c]));

  return (
    <Card size="small" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 13.5, color: '#1e293b' }}>{title}</span>
        <Tag style={{ margin: 0 }} color="green" icon={<CheckCircleFilled />}>Matched {byStatus.matched}</Tag>
        <Tag style={{ margin: 0 }} color="orange" icon={<QuestionCircleOutlined />}>Partial {byStatus.partial}</Tag>
        <Tag style={{ margin: 0 }} color="red" icon={<CloseCircleFilled />}>Missing {byStatus.missing}</Tag>
        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
          Weighted score = Σ(score × category weight × priority weight) ÷ Σ(weights)
        </span>
      </div>

      {ordered.map(g => {
        const matched = g.items.filter(r => r.matchStatus === 'matched').length;
        const partial = g.items.filter(r => r.matchStatus === 'partial').length;
        return (
          <div key={g.label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 12.5, color: '#334155' }}>{g.label}</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{g.items.length} requirement{g.items.length !== 1 ? 's' : ''}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: matched === g.items.length ? '#16a34a' : '#94a3b8' }}>
                {matched}/{g.items.length} met{partial ? ` · ${partial} partial` : ''}
              </span>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {g.items.map((r, i) => {
                const pri = PRIORITY_META[r.priority] || PRIORITY_META.preferred;
                const str = STRENGTH_META[r.evidenceStrength] || STRENGTH_META.none;
                const statusIcon = STATUS_ICON[r.matchStatus] || STATUS_ICON.missing;
                const evidence = Array.isArray(r.matchedEvidence) ? r.matchedEvidence : [];
                const show = evidence[0] ? evidence[0].slice(0, 140) + (evidence[0].length > 140 ? '…' : '') : 'No direct evidence snippet found';
                return (
                  <div key={`${r.requirement}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #eef1f5', borderRadius: 6, padding: '6px 10px' }}>
                    {statusIcon}
                    <Tag color={pri.color} style={{ margin: 0, fontSize: 10, lineHeight: '18px' }}>{pri.label}</Tag>
                    <Tooltip title={r.explanation || r.expectedEvidence}>
                      <span style={{ fontWeight: 600, fontSize: 12.5, color: '#1e293b', cursor: 'help' }}>{r.requirement}</span>
                    </Tooltip>
                    {r.semantic && (
                      <Tooltip title={`Resume shows a semantically related expression — family: ${r.semantic.family}; equivalent: "${r.semantic.equivalent}". Confirm in the interview.`}>
                        <Tag style={{ margin: 0, fontSize: 10, lineHeight: '18px', background: '#eef2ff', color: '#4f46e5', borderColor: '#c7d2fe' }}>semantic</Tag>
                      </Tooltip>
                    )}
                    {r.evidenceSection && (
                      <Tag style={{ margin: 0, fontSize: 10, lineHeight: '18px', background: '#f1f5f9', color: '#334155', borderColor: '#cbd5e1' }}>{r.evidenceSection}</Tag>
                    )}
                    {r.recency && r.recency.label !== 'unknown' && (() => {
                      const rec = RECENCY_META[r.recency.label] || { color: '#475569', bg: '#f8fafc', border: '#e2e8f0' };
                      return (
                        <Tooltip title="How recent the resume evidence is">
                          <Tag style={{ margin: 0, fontSize: 10, lineHeight: '18px', background: rec.bg, color: rec.color, borderColor: rec.border }}>{r.recency.label}{r.recency.year ? ' · ' + r.recency.year : ''}</Tag>
                        </Tooltip>
                      );
                    })()}
                    {r.evidenceStrength === 'none' && r.expectedEvidence ? (
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{r.expectedEvidence}</span>
                    ) : (
                      <Tooltip title={r.explanation || show}>
                        <span style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340 }}>“{show}”</span>
                      </Tooltip>
                    )}
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Tag style={{ margin: 0, fontSize: 10, background: str.bg, color: str.color, borderColor: str.border }}>{str.label}</Tag>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: r.matchStatus === 'missing' ? NOT_ACTIVE_COLOR : scoreColor(r.score) }}>{r.score}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </Card>
  );
}