import React from 'react';
import { Tag, Tooltip } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, WarningFilled } from '@ant-design/icons';

export default function MustHaveGate({ mustHaveData }) {
  if (!mustHaveData || !mustHaveData.results || mustHaveData.results.length === 0) return null;

  const { results, passed, criticalPassed } = mustHaveData;
  const metCount = results.filter(r => r.met).length;
  const criticalResults = results.filter(r => r.severity === 'critical');
  const importantResults = results.filter(r => r.severity === 'important');

  return (
    <div style={{ background: passed ? '#f0fdf4' : '#fef2f2', border: `1px solid ${passed ? '#bbf7d0' : '#fecaca'}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {passed ? (
          <CheckCircleFilled style={{ color: '#16a34a', fontSize: 16 }} />
        ) : criticalPassed ? (
          <WarningFilled style={{ color: '#f59e0b', fontSize: 16 }} />
        ) : (
          <CloseCircleFilled style={{ color: '#ef4444', fontSize: 16 }} />
        )}
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
          Must-Have Gate: {metCount}/{results.length} requirements met
        </span>
        <Tag color={passed ? 'green' : criticalPassed ? 'orange' : 'red'}>
          {passed ? 'PASSED' : criticalPassed ? 'CRITICAL PASSED' : 'CRITICAL GAPS'}
        </Tag>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {results.map((r, i) => (
          <Tooltip key={i} title={r.evidence && r.evidence.length > 0 ? r.evidence.join('; ') : 'No evidence found'}>
            <Tag
              color={r.met ? 'green' : r.severity === 'critical' ? 'red' : 'orange'}
              style={{ cursor: 'pointer', margin: 0 }}
            >
              {r.met ? <CheckCircleFilled style={{ marginRight: 4 }} /> : <CloseCircleFilled style={{ marginRight: 4 }} />}
              {r.requirement}
              {!r.met && r.severity === 'critical' && <span style={{ fontSize: 10, marginLeft: 4 }}>(critical)</span>}
            </Tag>
          </Tooltip>
        ))}
      </div>

      {!passed && criticalGapsPresent(results) && (
        <div style={{ marginTop: 8, padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid #fecaca' }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: '#dc2626', marginBottom: 4 }}>Critical Gaps</div>
          {results.filter(r => !r.met && r.severity === 'critical').map((r, i) => (
            <div key={i} style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 2 }}>
              ✕ {r.requirement} — evidence not found in resume
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function criticalGapsPresent(results) {
  return results.some(r => !r.met && r.severity === 'critical');
}
