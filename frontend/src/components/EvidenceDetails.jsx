import React from 'react';
import { Popover, Tag } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

// Reusable evidence popover — lightweight, hover on desktop, tap on mobile
// Shows: What is it? / Source / Available / Missing / Required
export function EvidenceDetailsPopover({
  label,
  definition,
  source,
  availableEvidence = [],
  missingEvidence = [],
  requiredToComplete = [],
  confidence,
  affectedParameters = [],
  children,
  placement = 'top',
}) {
  const hasAvailable = availableEvidence && availableEvidence.length > 0;
  const hasMissing = missingEvidence && missingEvidence.length > 0;
  const hasRequired = requiredToComplete && requiredToComplete.length > 0;
  const hasAffected = affectedParameters && affectedParameters.length > 0;

  const content = (
    <div style={{ maxWidth: 340, fontSize: 12, lineHeight: 1.5 }}>
      {definition && (
        <div style={{ marginBottom: 8, color: '#334155' }}>{definition}</div>
      )}
      {source && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 11, letterSpacing: '0.04em' }}>SOURCE</div>
          <div style={{ color: '#475569' }}>{source}</div>
        </div>
      )}
      {hasAvailable && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, color: '#15803d', fontSize: 11, letterSpacing: '0.04em' }}>EVIDENCE AVAILABLE</div>
          <ul style={{ margin: '4px 0 0 16px', padding: 0, color: '#334155' }}>
            {availableEvidence.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
      {!hasAvailable && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, color: '#15803d', fontSize: 11, letterSpacing: '0.04em' }}>EVIDENCE AVAILABLE</div>
          <div style={{ color: '#94a3b8', fontStyle: 'italic', marginTop: 4 }}>No supporting evidence available.</div>
        </div>
      )}
      {hasMissing && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, color: '#dc2626', fontSize: 11, letterSpacing: '0.04em' }}>EVIDENCE MISSING</div>
          <ul style={{ margin: '4px 0 0 16px', padding: 0, color: '#334155' }}>
            {missingEvidence.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
      {hasRequired && (
        <div style={{ marginBottom: hasAffected || confidence != null ? 8 : 0 }}>
          <div style={{ fontWeight: 600, color: '#2563eb', fontSize: 11, letterSpacing: '0.04em' }}>REQUIRED TO COMPLETE</div>
          <ul style={{ margin: '4px 0 0 16px', padding: 0, color: '#334155' }}>
            {requiredToComplete.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
      {hasAffected && (
        <div style={{ marginBottom: confidence != null ? 8 : 0 }}>
          <div style={{ fontWeight: 600, color: '#475569', fontSize: 11, letterSpacing: '0.04em' }}>AFFECTED PARAMETERS</div>
          <div style={{ color: '#64748b', marginTop: 4 }}>{affectedParameters.join(', ')}</div>
        </div>
      )}
      {confidence != null && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9', fontSize: 11, color: '#64748b' }}>
          Confidence: <strong style={{ color: '#1e293b' }}>{confidence}</strong>
        </div>
      )}
    </div>
  );

  return (
    <Popover
      content={content}
      title={<span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{label}</span>}
      trigger={['hover', 'click']}
      placement={placement}
      overlayInnerStyle={{ maxWidth: 360, padding: '12px 14px' }}
      overlayStyle={{ zIndex: 1050 }}
      mouseEnterDelay={0.05}
      mouseLeaveDelay={0.1}
      destroyTooltipOnHide={false}
      autoAdjustOverflow
      getPopupContainer={() => document.body}
    >
      <span style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', pointerEvents: 'auto' }}>
        {children}
      </span>
    </Popover>
  );
}

// Helper to build evidence details object — only includes actual data, never invents
export function getEvidenceDetails(entity, { candidateData, jdData, evaluationData, liveDecision, parameters, scoredInputs }) {
  // entity: 'PERSON' | 'ROLE' | 'JD' | 'LIMITED_EVIDENCE' | 'PR' | 'JD_LABEL' | 'SCORE'
  // Returns object suitable for EvidenceDetailsPopover props
  const scoredCount = parameters ? parameters.filter(p => {
    const s = scoredInputs ? scoredInputs[p.id] : null;
    return s && s.status === 'active' && s.score != null;
  }).length : 0;
  const totalActive = parameters ? parameters.filter(p => p.status !== 'legacy').length : 0;

  switch (entity) {
    case 'PERSON': {
      const personParams = parameters ? parameters.filter(p => p.grp === 'PERSON') : [];
      const scoredPerson = personParams.filter(p => {
        const s = scoredInputs ? scoredInputs[p.id] : null;
        return s && s.status === 'active' && s.score != null;
      });
      const missingPerson = personParams.filter(p => {
        const s = scoredInputs ? scoredInputs[p.id] : null;
        return !s || s.status === 'not_scored' || s.score == null;
      });
      return {
        label: 'PERSON — Personal Competencies',
        definition: 'Evaluates 10 personal competencies (communication, problem-solving, judgment etc.) that drive Candidate Fit (35% weight).',
        source: candidateData?.resumeAvailable || candidateData?.hasResume ? 'Resume + Candidate Profile + Evaluation' : 'Candidate Profile (resume not yet uploaded)',
        availableEvidence: scoredPerson.length
          ? [`${scoredPerson.length} of ${personParams.length} PERSON parameters scored`, ...scoredPerson.slice(0, 3).map(p => `${p.name} — scored`)]
          : [],
        missingEvidence: missingPerson.length
          ? missingPerson.slice(0, 3).map(p => `${p.name} — not yet evaluated` )
          : [],
        requiredToComplete: missingPerson.length ? ['Complete interview/evaluation for missing PERSON parameters'] : [],
        affectedParameters: personParams.map(p => p.name),
      };
    }
    case 'ROLE': {
      const roleParams = parameters ? parameters.filter(p => p.grp === 'ROLE') : [];
      const scoredRole = roleParams.filter(p => {
        const s = scoredInputs ? scoredInputs[p.id] : null;
        return s && s.status === 'active' && s.score != null;
      });
      const missingRole = roleParams.filter(p => {
        const s = scoredInputs ? scoredInputs[p.id] : null;
        return !s || s.status !== 'active' || s.score == null;
      });
      const hasPosition = !!(candidateData && candidateData.position);
      return {
        label: 'ROLE — Role Competence',
        definition: 'Checks technical and role-specific capability for the target position (40% of Candidate Fit). May be N/A before technical validation.',
        source: hasPosition ? `Position: ${candidateData.position} + Role requirements + JD` : 'Position configuration + Role requirements (position not yet set)',
        availableEvidence: scoredRole.length ? [`${scoredRole.length} of ${roleParams.length} ROLE parameters scored`] : [],
        missingEvidence: [
          ...(!hasPosition ? ['Position/role not configured — ROLE evaluation has no target'] : []),
          ...missingRole.map(p => `${p.name} — not yet evaluated`),
        ],
        requiredToComplete: missingRole.length || !hasPosition ? ['Set target position/client and complete technical evaluation'] : [],
        affectedParameters: roleParams.map(p => p.name),
      };
    }
    case 'JD': {
      const jdAvailable = !!(jdData && (jdData.pct != null || jdData.hasJd));
      const jdPct = jdData && jdData.pct != null ? `${jdData.pct}% match` : null;
      const missingReq = jdData && jdData.missing ? jdData.missing.slice(0, 3) : [];
      return {
        label: 'JD — Job Description',
        definition: 'Job Description defines the role requirements that power the JD Match (25% of Candidate Fit) and mandatory gates.',
        source: jdData && jdData.title ? `JD: ${jdData.title}${jdData.client ? ` · ${jdData.client}` : ''}` : 'No JD linked yet',
        availableEvidence: jdAvailable ? [jdPct ? `JD parsed — ${jdPct} evaluation available` : 'JD linked and parsed', ...(jdData.matched ? [`${jdData.matched.length} requirements matched`] : [])] : [],
        missingEvidence: !jdAvailable ? ['No JD linked — JD Match is 0 and cannot contribute to Candidate Fit'] : missingReq.length ? missingReq.map(r => `Missing mandatory: ${r}`) : [],
        requiredToComplete: !jdAvailable ? ['Link a JD to enable JD Match and mandatory validation'] : missingReq.length ? ['Resolve missing mandatory JD requirements'] : [],
        confidence: jdPct,
      };
    }
    default:
      return { label: entity, definition: '', source: '' };
  }
}

// Small inline info trigger — consistent styling
export function InfoDot({ size = 14 }) {
  return <InfoCircleOutlined style={{ fontSize: size, color: '#94a3b8', marginLeft: 6, cursor: 'help' }} />;
}
