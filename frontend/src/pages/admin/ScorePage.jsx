import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Typography, Form, Input, Card, Button, DatePicker, Checkbox,
  Space, message, Tag, Tabs, Select, Upload, Modal, Slider, Alert, InputNumber, Tooltip, Timeline, Popover,
} from 'antd';
import { Link, useParams, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import { UploadOutlined, FileTextOutlined, PlusOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { api } from '../../services/api';
import { validateResumeFileClient } from '../../services/resumeCheck';
import NumerologyTab from './numerology/NumerologyTab';
import MustHaveGate from '../../components/MustHaveGate';
import RequirementBreakdown from '../../components/RequirementBreakdown';
import EvidenceDisplay from '../../components/EvidenceDisplay';
import { DecisionStatus } from '../../components/DecisionModals';
import ApprovalPanelSection from '../../components/ApprovalPanelSection';
import { DEAL_FACTORS, computeLive, decisionColors } from '../../sopModel';
import { scoreColor, NOT_ACTIVE_COLOR } from '../../scoreStatus';

const { Title, Text } = Typography;

const GROUP_META = {
  PERSON: { label: 'PERSON', title: 'Personal Competencies', hint: '10 competencies driving Candidate Fit', color: '#2563eb', sub: '35%' },
  ROLE: { label: 'ROLE', title: 'Role Competence', hint: 'Technical capability for the target role (may be N/A before technical validation)', color: '#7c3aed', sub: '40%' },
  DEAL: { label: '', title: 'Joining Factors', hint: 'Terms & commitment shaping Joining Probability', color: '#ea580c', sub: '—' },
};

/* ---- Auto-rated + Manual evaluation grid (PERSON / ROLE only) ----
   COLS: PARAMETER | WEIGHT | AUTO | MANUAL | WEIGHTED — header and every
   row share the same gridTemplateColumns so columns never drift. */
const AEVAL_COLS = 'minmax(0,2.2fr) 56px 90px 110px 60px';
const AEVAL_ROW = { display: 'grid', gridTemplateColumns: AEVAL_COLS, columnGap: 12, alignItems: 'start', padding: '14px 8px', margin: '0 -8px' };
const AEVAL_HROW = { display: 'grid', gridTemplateColumns: AEVAL_COLS, columnGap: 12, alignItems: 'center', padding: '0 8px 8px', margin: '0 -8px', borderBottom: '1px solid #e5e7eb' };
const AEVAL_HCELL = { fontSize: 11, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.3px' };
const AEVAL_BOX = { width: 36, textAlign: 'center', fontSize: 11, fontWeight: 500, border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 2px', color: '#374151', background: '#fff', boxSizing: 'border-box' };
const AEVAL_TAG = {
  auto: { background: '#f1f5f9', color: '#64748b' },
  confirmed: { background: '#dcfce7', color: '#15803d' },
  override: { background: '#fef3c7', color: '#92400e' },
  manual: { background: '#ede9fe', color: '#5b21b6' },
};
const AEVAL_CSS = `
  .aeval-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 999px; outline: none; cursor: pointer; background: #e5e7eb; }
  .aeval-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 11px; height: 11px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.25), 0 0 0 2px var(--thumb-c); cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease; margin-top: -2.5px; }
  .aeval-slider::-webkit-slider-thumb:hover { transform: scale(1.25); box-shadow: 0 2px 4px rgba(0,0,0,0.3), 0 0 0 2px var(--thumb-c); }
  .aeval-slider::-webkit-slider-runnable-track { height: 6px; border-radius: 999px; }
  .aeval-slider::-moz-range-thumb { width: 11px; height: 11px; border-radius: 50%; background: #fff; border: 2px solid var(--thumb-c); box-shadow: 0 1px 2px rgba(0,0,0,0.25); cursor: pointer; transition: transform 0.15s ease; }
  .aeval-slider::-moz-range-thumb:hover { transform: scale(1.2); }
  .aeval-slider::-moz-range-track { height: 6px; border-radius: 999px; background: transparent; }
  .aeval-slider:disabled::-webkit-slider-thumb { box-shadow: 0 1px 2px rgba(0,0,0,0.15), 0 0 0 2px #cbd5e1; cursor: default; }
  .aeval-slider:disabled { cursor: default; }
  .aeval-slider:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px rgba(59,130,246,0.25), 0 0 0 2px var(--thumb-c); }
`;
function aevalBadge(weight) {
  return weight >= 12 ? { bg: '#dcfce7', text: '#15803d' } : weight >= 10 ? { bg: '#fef3c7', text: '#92400e' } : { bg: '#fce7f3', text: '#9d174d' };
}

const APPROVAL_ACTION_LABELS = {
  workflow_created: 'Workflow started',
  panel_created: 'Panel created',
  panel_sent: 'Sent for review',
  panel_restarted: 'Panel reopened',
  member_added: 'Panel member added',
  member_reviewed: 'Review submitted',
  panel_resolved: 'Panel resolved',
  finalized: 'Workflow finalized',
};

function initials(name) {
  return String(name || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

function RingGauge({ pct, size = 108, thickness = 12, color = '#16a34a', label = 'PURSUIT' }) {
  const p = pct != null ? Math.max(0, Math.min(100, Math.round(Number(pct)))) : 0;
  const innerSize = size - thickness * 2;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: `conic-gradient(${color} ${p}%, #e2e8f0 ${p}%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <div style={{ width: innerSize, height: innerSize, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontWeight: 800, fontSize: size / 4.5, lineHeight: 1, color }}>{pct != null ? p : '—'}</span>
        <span style={{ fontSize: 9, letterSpacing: '0.08em', opacity: 0.55, marginTop: 3, color: '#475569' }}>{label}</span>
      </div>
    </div>
  );
}

export default function ScorePage() {
  const { id } = useParams();
  const location = useLocation();
  const routeParams = new URLSearchParams(location.search);
  const openInnerReport = routeParams.get('tab') === 'inner' && routeParams.get('report') === '1';
  const [form] = Form.useForm();
  const [parameters, setParameters] = useState([]);
  const [liveScores, setLiveScores] = useState({});
  const [statusMap, setStatusMap] = useState({});
  const [dealFactors, setDealFactors] = useState({});
  const [savedDecision, setSavedDecision] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [capability, setCapability] = useState(null);
  const [jds, setJds] = useState([]);
  const [capLoading, setCapLoading] = useState(false);
  const [autoScores, setAutoScores] = useState({});
  const [touchedMap, setTouchedMap] = useState({});
  const [evidenceText, setEvidenceText] = useState({});
  const [confirmFor, setConfirmFor] = useState(null);
  const [pendingValue, setPendingValue] = useState(null);
  const [evidenceOpenFor, setEvidenceOpenFor] = useState(null);
  const [hoverRow, setHoverRow] = useState(null);
  const [tooltipRow, setTooltipRow] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [selectedJd, setSelectedJd] = useState(null);
  const [evidenceData, setEvidenceData] = useState([]);
  const [mustHaveData, setMustHaveData] = useState(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [addCompanyOpen, setAddCompanyOpen] = useState(false);
  const [addCompanyForm] = Form.useForm();
  const [decisionInfo, setDecisionInfo] = useState(null);
  const [approval, setApproval] = useState(null);

  async function fetchCapability() {
    try {
      const c = await api.get(`/api/admin/employees/${id}/capability-match`);
      setCapability(c);
      if (c && c.mustHave && c.mustHave.results && c.mustHave.results.length) setMustHaveData(c.mustHave);
    } catch (e) { setCapability(null); }
  }
  async function fetchEvidence() {
    try {
      const ev = await api.get(`/api/admin/employees/${id}/evidence`);
      setEvidenceData(ev.evidence || []);
    } catch (e) { setEvidenceData([]); }
  }
  async function fetchApproval() {
    try {
      const a = await api.get(`/api/admin/employees/${id}/approval`);
      setApproval(a);
    } catch (e) { setApproval(null); }
  }

  useEffect(() => {
    (async () => {
      try {
        const [params, sc, evr] = await Promise.all([
          api.get('/api/admin/parameters'),
          api.get(`/api/admin/employees/${id}/scorecard`),
          api.get(`/api/admin/employees/${id}/evidence`).catch(() => ({ evidence: [] })),
        ]);
        setParameters(params);
        const data = sc.scorecard;
        if (data) {
          form.setFieldsValue({
            applicant_name: data.applicant_name,
            email: data.email,
            client: data.client,
            position: data.position,
            jd_shared: !!data.jd_shared,
            jd_shared_date: data.jd_shared_date ? dayjs(data.jd_shared_date) : undefined,
            remarks: data.remarks,
          });
          const scores = {}; const statuses = {}; const notes = {};
          sc.scores.forEach(s => {
            scores[s.parameter_id] = s.score;
            statuses[s.parameter_id] = s.status || 'active';
            if (s.note) notes[s.parameter_id] = s.note;
          });
          const auto = {};
          (evr.evidence || []).forEach(e => {
            if (e && e.parameter_id != null && e.score != null) auto[Number(e.parameter_id)] = Number(e.score);
          });
          const touchedInit = {};
          params.forEach(p => {
            if (p.grp !== 'PERSON' && p.grp !== 'ROLE') return;
            const A = auto[p.id];
            const S = scores[p.id];
            if (statuses[p.id] === 'na') return;
            if (A != null) {
              if (S != null && Number(S) !== A) touchedInit[p.id] = true;
              else { scores[p.id] = A; statuses[p.id] = 'active'; }
            } else if (S != null) touchedInit[p.id] = true;
          });
          setAutoScores(auto);
          setTouchedMap(touchedInit);
          setEvidenceText(notes);
          setLiveScores(scores);
          setStatusMap(statuses);
          // Hydrate DEAL factor sliders. Must read the response root (sc), not
          // sc.scorecard — loadScorecard() doesn't carry deal_factors. Accept
          // both shapes: the decision's array ({key,factor_key,score}) and the
          // top-level map ({active_search: 80, ...}).
          const rawDeal =
            (sc.decision && sc.decision.joining_probability && sc.decision.joining_probability.deal_factors) ||
            sc.deal_factors || data.deal_factors || {};
          const df = {};
          if (Array.isArray(rawDeal)) {
            rawDeal.forEach(f => {
              const k = f.factor_key != null ? f.factor_key : f.key;
              if (k != null && f.score != null) df[k] = f.score;
            });
          } else if (typeof rawDeal === 'object') {
            Object.keys(rawDeal).forEach(k => { if (rawDeal[k] != null) df[k] = rawDeal[k]; });
          }
          setDealFactors(df);
          if (sc.decision) setSavedDecision(sc.decision);
        }
        api.get('/api/admin/job-descriptions').then(setJds).catch(()=>{});
        api.get('/api/admin/companies').then(d => setCompanies(Array.isArray(d) ? d : d ? [d] : [])).catch(()=>{});
        if (data && data.company_id) form.setFieldsValue({ company_id: data.company_id });
        fetchCapability();
        fetchEvidence();
        fetchDecision();
        fetchApproval();
      } catch (e) {
        message.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function fetchDecision() {
    try {
      const d = await api.get(`/api/admin/employees/${id}/decision`);
      setDecisionInfo(d);
    } catch (e) {
      setDecisionInfo(null);
    }
  }

  async function handleResumeUpload() {
    if (!resumeFile) return message.warning('Select a PDF/DOCX first');
    setCapLoading(true);
    try {
      const fd = new FormData();
      fd.append('resume', resumeFile);
      if (selectedJd) fd.append('job_description_id', selectedJd);
      const resp = await api.post(`/api/admin/employees/${id}/resume`, fd);
      if (resp && resp.resume_warning) {
        message.warning(resp.resume_warning, 8);
      } else {
        message.success('Resume uploaded — match recomputed');
      }
      setResumeFile(null);
      fetchCapability();
    } catch (e) { message.error(e.message); } finally { setCapLoading(false); }
  }

  async function handleAutoRate() {
    setCapLoading(true);
    try {
      const fd = new FormData();
      if (resumeFile) fd.append('resume', resumeFile);
      if (selectedJd) fd.append('job_description_id', selectedJd);
      const pos = form.getFieldValue('position');
      if (pos) fd.append('position', pos);
      const resp = await api.post(`/api/admin/employees/${id}/auto-rate`, fd);
      message.success(`Auto-rated from JD/Resume (evaluation ${resp.capability_match_pct}%) — review and adjust below`);
      const sc = await api.get(`/api/admin/employees/${id}/scorecard`);
      const scores = {}; const statuses = {};
      sc.scores.forEach(s => {
        if (!activeParams.some(p => p.id === s.parameter_id)) return;
        scores[s.parameter_id] = s.score;
        statuses[s.parameter_id] = s.status || 'active';
      });
      setLiveScores(scores);
      setStatusMap(statuses);
      const evr = await api.get(`/api/admin/employees/${id}/evidence`).catch(() => ({ evidence: [] }));
      const auto = {};
      (evr.evidence || []).forEach(e => {
        if (e && e.parameter_id != null && e.score != null) auto[Number(e.parameter_id)] = Number(e.score);
      });
      setAutoScores(auto);
      setTouchedMap({});
      setEvidenceText({});
      setConfirmFor(null);
      setPendingValue(null);
      setEvidenceOpenFor(null);
      if (sc.decision) setSavedDecision(sc.decision);
      fetchCapability();
      fetchEvidence();
    } catch (e) { message.error(e.message); } finally { setCapLoading(false); }
  }

  const missingCritical = useMemo(() => {
    if (!mustHaveData || !mustHaveData.results) return [];
    return mustHaveData.results.filter(r => !r.met && r.severity === 'critical').map(r => r.requirement);
  }, [mustHaveData]);

  const activeParams = parameters.filter(p => p.status !== 'legacy');
  const scoredCount = activeParams.filter(p => statusMap[p.id] !== 'na' && statusMap[p.id] !== 'not_scored' && liveScores[p.id] != null).length;
  const hasMustHave = !!(mustHaveData && mustHaveData.results && mustHaveData.results.length > 0);

  const scoredInputs = useMemo(() => {
    const s = {};
    activeParams.forEach(p => {
      const status = statusMap[p.id];
      if (status === 'na') s[p.id] = { status: 'na', score: null };
      else if (liveScores[p.id] == null) s[p.id] = { status: 'not_scored', score: null };
      else s[p.id] = { status: 'active', score: liveScores[p.id] };
    });
    return s;
  }, [activeParams, liveScores, statusMap]);

  const liveDecision = useMemo(() => computeLive(activeParams, scoredInputs, dealFactors, {
    jdMatch: capability && capability.pct != null ? capability.pct : null,
    missing: missingCritical,
    jdAvailable: !!((capability && capability.pct != null) || selectedJd),
    resumeAvailable: !!((capability && capability.pct != null) || resumeFile),
    mandatoryResolved: !hasMustHave || missingCritical.length === 0,
    scoredAtLeast80Pct: activeParams.length > 0 && scoredCount / activeParams.length >= 0.8,
    recruiterEvidence: evidenceData.length > 0,
    references: false,
  }), [activeParams, scoredInputs, dealFactors, capability, selectedJd, resumeFile, missingCritical, hasMustHave, scoredCount, evidenceData]);

  const pp = liveDecision.pursuit_priority;
  const ppColor = decisionColors[pp.final_decision] || scoreColor(pp.display_score);

  function setScore(pId, val) {
    setLiveScores(prev => ({ ...prev, [pId]: val }));
    setStatusMap(prev => ({ ...prev, [pId]: 'active' }));
  }
  function setNa(pId, checked) {
    if (checked) {
      setStatusMap(prev => ({ ...prev, [pId]: 'na' }));
      return;
    }
    if (autoScores[pId] != null && !touchedMap[pId]) setLiveScores(prev => ({ ...prev, [pId]: Number(autoScores[pId]) }));
    setStatusMap(prev => ({ ...prev, [pId]: (liveScores[pId] != null || autoScores[pId] != null) ? 'active' : 'not_scored' }));
  }

  function applyManualScore(pId, value) {
    setLiveScores(prev => ({ ...prev, [pId]: value }));
    setStatusMap(prev => ({ ...prev, [pId]: 'active' }));
    setTouchedMap(prev => ({ ...prev, [pId]: true }));
  }
  function handleManualInput(p, rawValue) {
    if (statusMap[p.id] === 'na') return;
    const A = autoScores[p.id] != null ? Number(autoScores[p.id]) : null;
    const value = Math.max(0, Math.min(100, Number(rawValue) || 0));
    if (A != null && value > A) {
      setConfirmFor(p.id);
      setPendingValue(value);
      return;
    }
    setConfirmFor(null);
    setPendingValue(null);
    applyManualScore(p.id, value);
  }
  function confirmManualApply() {
    if (confirmFor == null || pendingValue == null) return;
    applyManualScore(confirmFor, pendingValue);
    setEvidenceOpenFor(confirmFor);
    setConfirmFor(null);
    setPendingValue(null);
  }
  function cancelManualConfirm() {
    setConfirmFor(null);
    setPendingValue(null);
  }

  function showRequiredPopup(missing) {
    Modal.warning({
      title: 'Required fields missing',
      content: `Please fill the important columns before saving: ${missing.join(', ')} is required.`,
      okText: 'OK',
      centered: true,
    });
  }
  async function onFinish(values) {
    const missingCols = [];
    if (!values.applicant_name || !String(values.applicant_name).trim()) missingCols.push('Applicant Name *');
    if (!values.email || !String(values.email).trim()) missingCols.push('Email *');
    if (!values.client || !String(values.client).trim()) missingCols.push('Client *');
    if (missingCols.length) { showRequiredPopup(missingCols); return; }
    setSaving(true);
    try {
      const scores = activeParams.map(p => {
        const status = statusMap[p.id];
        const note = evidenceText[p.id] ? String(evidenceText[p.id]) : null;
        if (status === 'na') return { parameter_id: p.id, score: null, status: 'na', note: null };
        const v = liveScores[p.id];
        if (v == null) return { parameter_id: p.id, score: null, status: 'not_scored', note: null };
        return { parameter_id: p.id, score: Math.round(Number(v)), status: 'active', note };
      });
      const deal_factors = DEAL_FACTORS.filter(f => dealFactors[f.key] != null).map(f => ({ factor_key: f.key, score: Math.round(Number(dealFactors[f.key])), note: null }));
      const resp = await api.post(`/api/admin/employees/${id}/scorecard`, JSON.stringify({
        applicant_name: values.applicant_name,
        email: values.email,
        client: values.client,
        position: values.position,
        jd_shared: values.jd_shared ? 1 : 0,
        jd_shared_date: values.jd_shared_date ? dayjs(values.jd_shared_date).format('YYYY-MM-DD') : null,
        remarks: values.remarks,
        company_id: values.company_id || null,
        scores,
        deal_factors,
        apply: {
          jd_match: capability && capability.pct != null ? capability.pct : null,
          mandatory_resolved: !hasMustHave || missingCritical.length === 0,
          jd_available: !!((capability && capability.pct != null) || selectedJd),
          resume_available: !!((capability && capability.pct != null) || resumeFile),
          recruiter_evidence: evidenceData.length > 0,
          references: false,
        },
      }));
      if (resp && resp.decision) setSavedDecision(resp.decision);
      message.success('Scorecard saved — Pursuit Priority recalculated');
    } catch (e) {
      message.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function onAddCompany(values) {
    try {
      const payload = {
        client_name: values.company_name,
        founded_year: values.founded_year ? values.founded_year.year() : null,
        brand_name: values.brand_name || values.company_name,
        founder_name: values.founder_name || 'Unknown',
      };
      const resp = await api.post('/api/admin/companies', JSON.stringify(payload));
      message.success('Company added');
      setAddCompanyOpen(false);
      addCompanyForm.resetFields();
      const list = await api.get('/api/admin/companies');
      setCompanies(Array.isArray(list) ? list : list ? [list] : []);
      if (resp && resp.id) form.setFieldsValue({ company_id: resp.id });
    } catch (e) {
      message.error(e.message);
    }
  }

  const [activeTab, setActiveTab] = useState(() => (
    new URLSearchParams(window.location.search).get('tab') === 'inner' ? 'inner' : 'overview'
  ));
  const applicantName = Form.useWatch('applicant_name', form) || 'Applicant';
  const applicantPosition = Form.useWatch('position', form) || '';
  const applicantClient = Form.useWatch('client', form) || '';

  const groupOrder = ['PERSON', 'ROLE', 'DEAL'];
  const focusArea = savedDecision && savedDecision.interview_focus ? savedDecision.interview_focus : [];
  const savedPP = savedDecision && savedDecision.pursuit_priority;

  const historyItems = (approval && approval.history ? approval.history : []).map((h) => ({
    dot: h.action === 'finalized' ? <ClockCircleOutlined style={{ color: '#ea580c' }} /> : undefined,
    color: h.action === 'member_reviewed' ? 'green' : h.action === 'panel_resolved' ? (String(h.detail || '').toLowerCase().includes('rejected') ? 'red' : 'blue') : 'gray',
    children: (
      <div style={{ fontSize: 12 }}>
        <Text strong style={{ fontSize: 12 }}>{APPROVAL_ACTION_LABELS[h.action] || h.action}</Text>
        <div style={{ color: '#64748b', marginTop: 2 }}>{h.detail}</div>
        <div style={{ color: '#94a3b8', marginTop: 2, fontSize: 11 }}>
          {h.performed_by_name} · {h.created_at ? String(h.created_at).slice(0, 16) : ''}
        </div>
      </div>
    ),
  }));

  const overviewTab = (
    <div className="page">
      <div className="score-ledger">
        <Form.Item>
          <div className="cr-banner" style={{ border: `1px solid ${ppColor}55`, background: `linear-gradient(135deg, #ffffff 0%, ${ppColor}0d 100%)` }}>
            <RingGauge pct={pp.display_score} size={96} label="PURSUIT" color={ppColor} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#64748b', fontWeight: 600 }}>PURSUIT PRIORITY — ROUTING DECISION</div>
              <Tag color={ppColor} style={{ fontSize: 18, fontWeight: 800, padding: '4px 12px', marginTop: 4, border: 'none' }}>{pp.final_decision}</Tag>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                {pp.gate_flags.length > 0
                  ? `Below threshold on ${pp.gate_flags.length} gated flag(s) — ${pp.gate_flags[0].detail}`
                  : pp.base_band
                    ? `Routing band ${pp.base_band.replace(/_/g, ' ').toLowerCase()} — no gating flags active`
                    : 'Candidate Fit × 60% · Joining Probability × 40% · rules v1.0'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {liveDecision.candidate_fit.score != null && <Tag style={{ margin: 0 }} color="geekblue">Fit {liveDecision.candidate_fit.score}</Tag>}
              {liveDecision.candidate_fit.person_score != null && <Tag style={{ margin: 0 }} color="blue">Person {liveDecision.candidate_fit.person_score}</Tag>}
              {liveDecision.candidate_fit.role_score != null && <Tag style={{ margin: 0 }} color="purple">Role {liveDecision.candidate_fit.role_score}</Tag>}
              {liveDecision.candidate_fit.jd_match_score != null && <Tag style={{ margin: 0 }} color="cyan">JD {liveDecision.candidate_fit.jd_match_score}%</Tag>}
              {liveDecision.joining_probability.score != null && <Tag style={{ margin: 0 }} color="orange">Join {liveDecision.joining_probability.score}</Tag>}
              <Tag style={{ margin: 0 }} color={liveDecision.confidence_score.score >= 80 ? 'green' : liveDecision.confidence_score.score >= 60 ? 'blue' : 'default'}>{liveDecision.confidence_score.label} {liveDecision.confidence_score.score}/100</Tag>
            </div>
          </div>
        </Form.Item>
        {pp.gate_flags.length > 0 && (
          <div style={{ marginTop: -8, marginBottom: 14 }}>
            {pp.gate_flags.map(g => (
              <Alert key={g.code} type="error" showIcon style={{ marginBottom: 6, fontSize: 12, padding: '6px 12px' }} message={<span><b>{g.code}</b> — {g.detail}</span>} />
            ))}
          </div>
        )}
        {focusArea.length === 0 && savedDecision && (
          <div style={{ marginBottom: 12, fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
            No Interview Focus yet — it is generated on save from gate/flags and the three lowest-scored active parameters, and cleared after the call is scheduled.
          </div>
        )}
        {focusArea.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#475569', marginBottom: 6 }}>INTERVIEW FOCUS (max 3) <span style={{ fontWeight: 400 }}>— clear them after the interview is scheduled</span></div>
            <Space size={6} wrap>
              {focusArea.map((f, i) => (
                <Popover
                  key={i}
                  trigger="click"
                  placement="bottomLeft"
                  title={<span style={{ fontSize: 12.5 }}>{f.title}</span>}
                  content={
                    <div style={{ maxWidth: 400 }}>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
                        {f.source} · ask these {f.questions.length} in the interview
                      </div>
                      <ol style={{ margin: 0, paddingLeft: 18 }}>
                        {f.questions.map((q, qi) => (
                          <li key={qi} style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 6 }}>{q}</li>
                        ))}
                      </ol>
                    </div>
                  }
                >
                  <Tag color="gold" style={{ margin: 0, fontSize: 12, padding: '3px 8px', cursor: 'pointer' }}>
                    {f.title} — {f.questions.length} q
                  </Tag>
                </Popover>
              ))}
            </Space>
            <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>Cleared automatically when the interview is marked scheduled.</span>
          </div>
        )}

        <div className="card form-card">
          <div className="card-title">Applicant Details</div>
          <div className="form-grid-2">
            <div className="field"><label><span className="required">*</span> Applicant Name</label><Form.Item name="applicant_name" noStyle rules={[{ required: true, message: 'Required' }]}><Input placeholder="Haroon Ali Khan" /></Form.Item></div>
            <div className="field"><label><span className="required">*</span> Email</label><Form.Item name="email" noStyle rules={[{ required: true, message: 'Email is required' },{ type: 'email', message: 'Valid email' }]}><Input placeholder="hkhanscorecard.com" /></Form.Item></div>
            <div className="field"><label><span className="required">*</span> Client</label><Form.Item name="client" noStyle rules={[{ required: true, message: 'Client is required' }]}><Input placeholder="Suez" /></Form.Item></div>
            <div className="field"><label>Position</label><Form.Item name="position" noStyle><Input placeholder="Financial Analyst" /></Form.Item></div>
          </div>
          <div className="form-grid-2" style={{ marginTop: 12 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Company (for group parameters)</label>
              <Form.Item name="company_id" noStyle>
                <Select
                  placeholder="Select company"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  style={{ width: '100%' }}
                  options={companies.map(c => ({ value: c.id, label: c.client_name }))}
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <div style={{ padding: '4px 8px', borderTop: '1px solid #f0f0f0' }}>
                        <Button type="link" icon={<PlusOutlined />} size="small" onClick={() => setAddCompanyOpen(true)}>Add New Company</Button>
                      </div>
                    </>
                  )}
                />
              </Form.Item>
              <div style={{ fontSize: 11, color: '#9aa0a6', marginTop: 4 }}>
                Company numerology feeds into the six Deep Parameters — separate from evidence-based scores.
              </div>
            </div>
          </div>
          <div style={{ padding:'0 20px', display:'flex', alignItems:'center', gap:16, marginTop:12, flexWrap:'wrap' }}>
            <Form.Item name="jd_shared" valuePropName="checked" noStyle><Checkbox>Yes, job Description was shared</Checkbox></Form.Item>
            <Form.Item name="jd_shared_date" noStyle><DatePicker placeholder="2025-08-03" style={{ width: 140 }} /></Form.Item>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <ApprovalPanelSection candidateId={id} onDecisionChanged={fetchDecision} />
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div className="card-title">Approval History</div>
          {historyItems.length > 0 ? (
            <Timeline items={historyItems} style={{ marginTop: 8 }} />
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>No approval workflow has been started for this candidate yet.</Text>
          )}
        </div>
      </div>
    </div>
  );

  const capabilityTab = (
    <div className="page">
      <div className="score-ledger">
        <Card size="small" title={<span><FileTextOutlined /> Candidate Evaluation — JD ↔ Resume <Text type="secondary" style={{ fontSize:10, marginLeft:6 }}>feeds the evaluation into Candidate Fit</Text></span>} style={{ marginBottom: 16, background: '#fff', border: capability && capability.pct != null ? '1px solid #bfdbfe' : undefined }} extra={<Tag color={capability && capability.pct != null ? capability.pct >= 50 ? 'green' : capability.pct >= 30 ? 'orange' : 'red' : 'default'} style={{ fontSize: 13 }}>{capability && capability.pct != null ? `${capability.pct}%` : 'No evaluation yet'}</Tag>}>
          {capability && capability.pct != null ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 10 }}>
                <RingGauge pct={capability.pct} size={96} label="EVALUATION" color={scoreColor(capability.pct)} />
                <div style={{ flex: 1 }}>
                  <Text strong style={{ fontSize: 15 }}>Candidate Evaluation — {capability.pct}% (weighted across all JD requirements)</Text>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    {capability.overall ? `${capability.overall.requiredMatched || 0} of ${(capability.overall.requiredMatched || 0) + (capability.overall.requiredMissing || 0)} required met · ${capability.overall.preferredMatched || 0} of ${(capability.overall.preferredMatched || 0) + (capability.overall.preferredMissing || 0)} preferred` : `${(capability.matched || []).length} of ${(capability.matched || []).length + (capability.missing || []).length} requirements met`}
                  </div>
                  {capability.mustHave && capability.mustHave.results && capability.mustHave.results.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <Tag color={capability.mustHave.passed ? 'green' : capability.mustHave.criticalPassed ? 'orange' : 'red'}>{capability.mustHave.passed ? 'MUST-HAVES MET' : capability.mustHave.criticalPassed ? 'CRITICAL PASSED' : 'CRITICAL MUST-HAVE GAPS'}</Tag>
                      <Text style={{ fontSize: 12 }}>{capability.mustHave.totalMet} of {capability.mustHave.totalRequired} must/important requirements evidenced</Text>
                    </div>
                  )}
                  <div style={{ marginTop: 10 }}><Link to={`/scores/${id}/capability`}><Text strong style={{ color:'#2563eb', fontSize: 13, textDecoration:'underline' }}>Click to view detailed evaluation → requirement breakdown / flags</Text></Link></div>
                </div>
              </div>
              <Space wrap style={{ marginTop: 10 }}>
                <Select placeholder="Link different JD" style={{ minWidth: 220 }} allowClear value={selectedJd} onChange={setSelectedJd} options={jds.map(j => ({ value: j.id, label: `${j.title}${j.client ? ` · ${j.client}` : ''}` }))} />
                <Upload beforeUpload={file => { const r = validateResumeFileClient(file); if (!r.ok) { message.error(r.message); return Upload.LIST_IGNORE; } setResumeFile(file); return false; }} maxCount={1} accept=".pdf,.doc,.docx"><Button icon={<UploadOutlined />}>{resumeFile ? resumeFile.name : 'New resume'}</Button></Upload>
                <Button loading={capLoading} onClick={handleResumeUpload}>Re-upload & Re-match</Button>
                <Tooltip title="Re-run the evidence engine to regenerate editable 0-100 suggestions for the 13 SOP PERSON/ROLE parameters from JD + resume. Recruiter-rated joining factors are preserved.">
                  <Button type="primary" loading={capLoading} onClick={handleAutoRate}>Auto-rate 16 parameters</Button>
                </Tooltip>
              </Space>
            </div>
          ) : (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>{capability && capability.message ? capability.message : 'Link a JD and upload a resume to feed the evaluation into Candidate Fit.'}</Text>
              <Space wrap style={{ marginTop: 10, width: '100%' }}>
                <Select placeholder="Select JD" style={{ minWidth: 220 }} allowClear value={selectedJd} onChange={setSelectedJd} options={jds.map(j => ({ value: j.id, label: `${j.title}${j.client ? ` · ${j.client}` : ''}` }))} />
                <Upload beforeUpload={file => { const r = validateResumeFileClient(file); if (!r.ok) { message.error(r.message); return Upload.LIST_IGNORE; } setResumeFile(file); return false; }} maxCount={1} accept=".pdf,.doc,.docx"><Button icon={<UploadOutlined />}>{resumeFile ? resumeFile.name : 'Select resume PDF/DOC/DOCX'}</Button></Upload>
                <Button loading={capLoading} onClick={handleResumeUpload}>Upload & Match</Button>
                <Tooltip title="Generates editable 0-100 suggestions for the 16 SOP parameters from JD + resume + role — nothing is final until you hit Save.">
                  <Button type="primary" loading={capLoading} onClick={handleAutoRate}>Auto-rate 16 parameters</Button>
                </Tooltip>
              </Space>
              <div style={{ fontSize: 10, color: '#9aa0a6', marginTop: 6 }}>Auto-rate will create editable 0-100 suggestions from JD + resume + role. Nothing is final until you hit Save.</div>
            </div>
          )}
        </Card>

        <RequirementBreakdown requirements={capability && capability.pct != null ? capability.requirements || [] : []} title="Candidate Evaluation — Requirement Breakdown" />

        {mustHaveData && mustHaveData.results && mustHaveData.results.length > 0 && (
          <MustHaveGate mustHaveData={mustHaveData} />
        )}

        {evidenceData.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div
              onClick={() => setShowEvidence(!showEvidence)}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: showEvidence ? 8 : 0 }}
            >
              <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>Evidence & Confidence</span>
              <span style={{ fontSize: 11, color: '#64748b' }}>{evidenceData.length} parameters scored</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6366f1' }}>{showEvidence ? '▾ Hide' : '▸ Show'}</span>
            </div>
            {showEvidence && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 12 }}>
                {evidenceData.map((ev) => {
                  const param = parameters.find(p => p.id === ev.parameter_id);
                  return <EvidenceDisplay key={ev.id} evidenceData={ev} paramName={param ? param.name : `Parameter ${ev.parameter_id}`} />;
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const parametersTab = (
    <div className="page">
      <style>{AEVAL_CSS}</style>
      <div className="score-ledger">
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div className="card-title" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding: '14px 20px' }}>
            <span>Score Parameters <Tag color="blue" style={{ marginLeft: 8, fontSize: 11 }}>{activeParams.length} active</Tag><span style={{ fontWeight:400, fontSize:11, color:'#94a3b8', marginLeft:8 }}>0-100 · N/A supported · missing params are excluded (not penalised)</span></span>
            <Tag color={pp.final_decision.includes('INTERVIEW') ? 'green' : 'orange'} style={{ fontSize: 12 }}>Pursuit {pp.display_score ?? '—'} · {pp.final_decision}</Tag>
          </div>
          {groupOrder.map(grp => {
            const meta = GROUP_META[grp];
            const rows = activeParams.filter(p => p.grp === grp);
            const groupScoreVal = liveDecision.candidate_fit[grp === 'PERSON' ? 'person_score' : grp === 'ROLE' ? 'role_score' : undefined] ?? null;
            const isDualGroup = grp === 'PERSON' || grp === 'ROLE';
            let sumAuto = 0; let sumFinal = 0; let sumManualBase = 0; let anyManual = false;
            rows.forEach(p => {
              if ((statusMap[p.id] || 'not_scored') === 'na') return;
              const A = autoScores[p.id] != null ? Number(autoScores[p.id]) : null;
              const E = liveScores[p.id] != null ? Number(liveScores[p.id]) : (A != null ? A : null);
              const w = p.weightage / 100;
              const touched = !!touchedMap[p.id];
              if (A != null) sumAuto += A * w;
              if (E != null) sumFinal += E * w;
              sumManualBase += (touched ? (E != null ? E : (A != null ? A : 0)) : (A != null ? A : (E != null ? E : 0))) * w;
              if (touched) anyManual = true;
            });
            return (
              <Card
                key={grp}
                size="small"
                collapsible
                defaultCollapsed={false}
                style={{ margin: '10px 20px', background: grp === 'DEAL' ? '#fffdf7' : '#fff', borderRadius: 10 }}
                title={
                  <span>
                    {meta.label ? <span style={{ fontWeight: 800, fontSize: 13, color: meta.color }}>{meta.label}</span> : null}
                    <span style={{ fontWeight: meta.label ? 400 : 800, fontSize: meta.label ? 12 : 13, color: meta.label ? '#475569' : meta.color, marginLeft: meta.label ? 8 : 0 }}>{meta.title}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{meta.hint}</span>
                  </span>
                }
                extra={
                  <span style={{ fontSize: 11, fontWeight: 700, color: groupScoreVal != null ? meta.color : '#94a3b8' }}>
                    {grp === 'DEAL' ? `Join ${liveDecision.joining_probability.score ?? '—'}${liveDecision.joining_probability.band ? ` · ${liveDecision.joining_probability.band}` : ''}` : groupScoreVal != null ? `${groupScoreVal} · ${meta.sub}` : 'Not scored'}
                  </span>
                }
              >
                {isDualGroup ? (
                  <>
                    <div style={AEVAL_HROW}>
                      <span style={AEVAL_HCELL}>PARAMETER</span>
                      <span style={{ ...AEVAL_HCELL, textAlign: 'center' }}>WEIGHT</span>
                      <span style={{ ...AEVAL_HCELL, textAlign: 'center' }}>AUTO</span>
                      <span style={{ ...AEVAL_HCELL, textAlign: 'center' }}>MANUAL</span>
                      <span style={{ ...AEVAL_HCELL, textAlign: 'right' }}>WEIGHTED</span>
                    </div>
                    {rows.map((p, idx) => {
                      const A = autoScores[p.id] != null ? Number(autoScores[p.id]) : null;
                      const isNa = (statusMap[p.id] || 'not_scored') === 'na';
                      const touched = !!touchedMap[p.id];
                      const E = liveScores[p.id] != null ? Number(liveScores[p.id]) : (A != null ? A : null);
                      const src = A != null
                        ? (!touched ? 'auto' : (E != null && E === A ? 'confirmed' : 'override'))
                        : ((touched || E != null) ? 'manual' : null);
                      const badge = aevalBadge(p.weightage);
                      const manualVal = touched && liveScores[p.id] != null ? Number(liveScores[p.id]) : 0;
                      const weighted = isNa ? 0 : (E == null ? null : +((E * p.weightage) / 100).toFixed(1));
                      const showConfirm = confirmFor === p.id && !isNa;
                      const showEvidence = evidenceOpenFor === p.id && src === 'override';
                      return (
                        <div key={p.id}>
                          <div
                            style={{ ...AEVAL_ROW, borderBottom: idx < rows.length - 1 ? '1px solid #f5f6f8' : 'none', background: hoverRow === p.id ? '#fafbfc' : 'transparent', transition: 'background 0.12s ease' }}
                            onMouseEnter={() => setHoverRow(p.id)}
                            onMouseLeave={() => setHoverRow(null)}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{p.name}</div>
                              <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>{p.description || ''}</div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 2 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: badge.bg, color: badge.text, textAlign: 'center', whiteSpace: 'nowrap' }}>{p.weightage}%</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                              {A != null ? (
                                <>
                                  <input
                                    type="range" className="aeval-slider" min={0} max={100}
                                    value={isNa ? 0 : A} disabled
                                    style={{ '--thumb-c': '#94a3b8', background: `linear-gradient(to right, #94a3b8 ${isNa ? 0 : A}%, #eef0f3 ${isNa ? 0 : A}%)` }}
                                  />
                                  <input style={{ ...AEVAL_BOX, background: '#f8fafc' }} value={isNa ? '' : String(A)} readOnly placeholder="—" />
                                </>
                              ) : (
                                <span style={{ fontSize: 14, color: '#cbd5e1', lineHeight: '17px' }}>—</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                              <input
                                type="range" className="aeval-slider" min={0} max={100}
                                disabled={isNa}
                                value={isNa ? 0 : manualVal}
                                onChange={e => handleManualInput(p, e.target.value)}
                                style={{ '--thumb-c': '#7c3aed', background: `linear-gradient(to right, #7c3aed ${isNa ? 0 : manualVal}%, #eef0f3 ${isNa ? 0 : manualVal}%)` }}
                              />
                              <input
                                style={AEVAL_BOX}
                                placeholder="0"
                                disabled={isNa}
                                value={isNa ? '' : (touched && liveScores[p.id] != null ? String(liveScores[p.id]) : '')}
                                onChange={e => handleManualInput(p, e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                              />
                              {src && (
                                <div style={{ position: 'relative' }}>
                                  <span
                                    onClick={() => { if (src === 'override') setEvidenceOpenFor(evidenceOpenFor === p.id ? null : p.id); }}
                                    onMouseEnter={() => { if (touched) setTooltipRow(p.id); }}
                                    onMouseLeave={() => setTooltipRow(null)}
                                    style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, whiteSpace: 'nowrap', cursor: src === 'override' ? 'pointer' : (touched ? 'help' : 'default'), ...AEVAL_TAG[src] }}
                                  >{src}</span>
                                  {tooltipRow === p.id && touched && (
                                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', fontSize: 11.5, lineHeight: 1.4, padding: '8px 10px', borderRadius: 8, width: 200, zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', textAlign: 'left', fontWeight: 400 }}>
                                      {(evidenceText[p.id] || '').trim() ? evidenceText[p.id] : 'No evidence added yet — click to add justification.'}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                              <span style={{ color: '#2563eb', fontWeight: 600, fontSize: 13.5 }}>{weighted == null ? '—' : weighted}</span>
                              <label style={{ fontSize: 10.5, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                                <input type="checkbox" checked={isNa} onChange={e => setNa(p.id, e.target.checked)} /> N/A
                              </label>
                            </div>
                          </div>
                          {showEvidence && (
                            <div style={{ padding: '0 0 12px' }}>
                              <textarea
                                placeholder="Evidence / justification for this adjustment"
                                value={evidenceText[p.id] || ''}
                                onChange={e => setEvidenceText(prev => ({ ...prev, [p.id]: e.target.value }))}
                                style={{ width: '100%', minHeight: 44, fontSize: 12.5, border: '1px solid #e9ebef', borderRadius: 8, padding: 8, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                              />
                            </div>
                          )}
                          {showConfirm && (
                            <div style={{ margin: '0 0 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 10 }}>
                              <div style={{ fontSize: 12, color: '#92400e', marginBottom: 8 }}>
                                Manual score ({pendingValue}) is higher than the auto-rated score ({A}). Please provide supporting evidence before applying.
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button type="button" style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid #e9ebef', background: '#fff', cursor: 'pointer' }} onClick={cancelManualConfirm}>Cancel</button>
                                <button type="button" style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }} onClick={confirmManualApply}>Confirm &amp; Apply</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '14px -8px 0', padding: '12px 16px', background: '#f8fafc', borderRadius: 12, fontSize: 13, fontWeight: 500, color: '#374151' }}>
                      <span>Auto <strong style={{ color: '#111827', fontWeight: 600 }}>{Math.round(sumAuto)}</strong></span>
                      <span>Manual <strong style={{ color: '#111827', fontWeight: 600 }}>{anyManual ? Math.round(sumManualBase) : '—'}</strong></span>
                      <span style={{ color: '#2563eb' }}>Final <strong style={{ color: '#111827', fontWeight: 600 }}>{Math.round(sumFinal)}</strong></span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="param-header-row" style={{ padding: '8px 12px', margin: 0 }}>
                      <span>GROUP</span><span>WEIGHT</span><span>SCORE (0-100, or mark N/A)</span><span>WEIGHTED</span>
                    </div>
                    {rows.map(p => {
                      const s = liveScores[p.id];
                      const status = statusMap[p.id] || 'not_scored';
                      const isNa = status === 'na';
                      const isScored = s != null && !isNa;
                      const contribution = isScored ? Math.round((Number(s) / 100) * p.weightage * 10) / 10 : 0;
                      const pColor = isScored ? scoreColor(Number(s)) : NOT_ACTIVE_COLOR;
                      return (
                        <div key={p.id} className="param-row" style={{ padding: '10px 12px' }}>
                          <div className="param-name-col">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="param-name">{p.name}</span>
                              {isScored && <span className="wtd-col" style={{ fontWeight: 600 }}>{contribution}</span>}
                              {isNa && <Tag color="default" style={{ margin: 0, fontSize: 10 }}>excluded</Tag>}
                            </div>
                            {isScored && (
                              <div className="gate-track" style={{ background: '#eef1f5' }}>
                                <div className="gate-fill" style={{ width: `${Math.max(2, Number(s))}%`, background: pColor }} />
                              </div>
                            )}
                            <span className="param-desc-sm" style={{ fontSize: 11, color: '#94a3b8' }}>{p.description || ''}</span>
                          </div>
                          <span className={`w-chip ${p.weightage >= 12 ? 'w3' : p.weightage >= 10 ? 'w2' : 'w1'}`}>{p.weightage}%</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 300, flex: 1 }}>
                            <Slider
                              min={0} max={100} step={1}
                              value={isNa ? 0 : s != null ? Number(s) : 0}
                              disabled={isNa}
                              onChange={v => setScore(p.id, v)}
                              style={{ flex: 1, margin: 0 }}
                              tooltip={{ formatter: v => isNa ? 'N/A' : `${v}` }}
                            />
                            <InputNumber min={0} max={100} value={isNa ? null : s != null ? Number(s) : null} disabled={isNa} onChange={v => setScore(p.id, v)} style={{ width: 64 }} />
                            <Checkbox checked={isNa} onChange={e => setNa(p.id, e.target.checked)} style={{ margin: 0, fontSize: 12 }}>N/A</Checkbox>
                          </div>
                          <span className="wtd-col" style={{ fontWeight: 600 }}>{isScored ? contribution : '—'}</span>
                        </div>
                      );
                    })}
                  </>
                )}
              </Card>
            );
          })}
          <div className="total-row-bar">
            <span>Pursuit Priority = Candidate Fit × 60% + Joining Probability × 40%</span>
            <div className="total-bar-wrap">
              <div className="total-bar"><div className="total-fill" style={{ width: `${pp.display_score ?? 0}%`, background: ppColor }} /></div>
              <span className="total-label" style={{ color: ppColor }}>{pp.display_score ?? '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const dealTab = (
    <div className="page">
      <div className="score-ledger">
        <div className="cr-banner" style={{ display:'flex', alignItems:'center', gap:24, flexWrap:'wrap', marginBottom:16 }}>
          <RingGauge pct={liveDecision.joining_probability.score} size={108} label="JOIN" color={liveDecision.joining_probability.score == null ? NOT_ACTIVE_COLOR : scoreColor(liveDecision.joining_probability.score)} />
          <div style={{ flex:1, minWidth: 240 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#64748b', fontWeight: 600 }}>JOINING PROBABILITY</div>
            <Tag color="orange" style={{ fontSize: 16, fontWeight: 700, padding: '3px 10px', marginTop: 4 }}>{liveDecision.joining_probability.score == null ? 'Not scored' : `${liveDecision.joining_probability.display_score ?? liveDecision.joining_probability.score} · ${liveDecision.joining_probability.band}`}</Tag>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
              Weighted mean of the 8 joining factors. Only scored factors contribute; the rest are excluded and the remaining weights renormalize — never a zero-penalty.
            </div>
          </div>
          <Tag color={ppColor} style={{ fontSize: 13, padding: '3px 10px' }}>Pursuit {pp.display_score ?? '—'} · {pp.final_decision}</Tag>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="param-header-row">
            <span>JOINING FACTORS</span><span>WEIGHT</span><span>SCORE</span>
          </div>
          {DEAL_FACTORS.map(f => {
            const v = dealFactors[f.key];
            const isScored = v != null;
            const pColor = isScored ? scoreColor(Number(v)) : NOT_ACTIVE_COLOR;
            return (
              <div key={f.key} className="param-row" style={{ padding: '10px 0' }}>
                <div className="param-name-col">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="param-name">{f.group ? <Tag color="orange" style={{ fontSize: 9, marginRight: 4, padding: '0 4px' }}>{f.group}</Tag> : null}{f.label}</span>
                    {isScored && <span className="wtd-col" style={{ fontWeight: 600 }}>{Math.round(Number(v) * f.weight / 100 * 10) / 10}</span>}
                  </div>
                  {isScored && (
                    <div className="gate-track" style={{ background: '#eef1f5' }}>
                      <div className="gate-fill" style={{ width: `${Math.max(2, Number(v))}%`, background: pColor }} />
                    </div>
                  )}
                </div>
                <span className="w-chip w1">{f.weight}%</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 300, flex: 1 }}>
                  <Slider min={0} max={100} step={1} value={v != null ? Number(v) : 0} onChange={val => setDealFactors(prev => ({ ...prev, [f.key]: val }))} style={{ flex: 1, margin: 0 }} tooltip={{ formatter: val => `${val}` }} />
                  <InputNumber min={0} max={100} value={v != null ? Number(v) : null} onChange={val => setDealFactors(prev => ({ ...prev, [f.key]: val == null ? null : val }))} style={{ width: 64 }} />
                </div>
              </div>
            );
          })}
          <Alert type="info" showIcon style={{ marginTop: 10, fontSize: 12 }} message={<span>D1 = Motivation & Role Intent · D2 = Availability & Joining Readiness · D3 = Compensation Alignment. Use recruiter notes, pre-screen call and manager feedback — not assumptions.</span>} />
        </div>

        <div className="card" style={{ padding:20 }}>
          <div className="field"><label>Remarks</label><Form.Item name="remarks" noStyle><Input.TextArea rows={3} placeholder="Add any notes or observations..." /></Form.Item></div>
        </div>
      </div>
    </div>
  );

  const stickyBar = activeTab === 'inner' ? null : (
    <div className="cr-stickybar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Tag color={ppColor} style={{ margin: 0, fontSize: 14, fontWeight: 700, padding: '4px 12px' }}>Pursuit {pp.display_score ?? '—'} · {pp.final_decision}</Tag>
        {activeTab === 'parameters' && <span style={{ fontSize: 11, color: '#64748b' }}>{scoredCount}/{activeParams.length} params scored</span>}
      </div>
      <Button type="primary" htmlType="submit" loading={saving} className="btn-primary">Save Scorecard & Recompute Pursuit</Button>
    </div>
  );

  return (
    <div className={`score-page tab-crossfade ${activeTab === 'inner' ? 'mode-inner' : 'score-ledger'}`}>
      <div className="score-top">
        <div className="container">
          <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
            <Link to="/scores"><Button className="btn-back" size="small" style={{ background:'#fff', color:'#2563eb', border:'1px solid #cbd5e1', padding:'6px 10px' }}>‹ Back</Button></Link>
            <div className="cr-avatar" style={{ background: ppColor }}>{initials(applicantName)}</div>
            <div>
              <Title level={4} style={{ margin:0, fontSize:18, color:'#1e293b' }}>{applicantName}</Title>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {[applicantPosition, applicantClient].filter(Boolean).join(' · ') || 'Candidate Review'}
                {savedPP && <span> · Pursuit {pp.display_score ?? '—'} · {pp.final_decision}</span>}
              </div>
            </div>
          </div>
          <DecisionStatus
            candidateId={id}
            decision={decisionInfo && decisionInfo.decision}
            draft={decisionInfo && decisionInfo.draft}
            candidateEmail={decisionInfo && decisionInfo.email}
            onChanged={fetchDecision}
          />
        </div>
      </div>

      <Form form={form} layout="vertical" onFinish={onFinish} onFinishFailed={({ errorFields })=>{
        const map={applicant_name:'Applicant Name *',email:'Email *',client:'Client *'};
        const miss = errorFields.filter(f=> ['applicant_name','email','client'].includes(f.name[0])).map(f=> map[f.name[0]]);
        if(miss.length) showRequiredPopup(miss);
      }} disabled={loading}>
        <Tabs
          className="ii-tabs"
          activeKey={activeTab}
          onChange={setActiveTab}
          tabBarGutter={24}
          renderTabBar={(props, DefaultTabBar) => (
            <div className="tabs-row">
              <div className="container">
                <DefaultTabBar {...props} />
              </div>
            </div>
          )}
          items={[
            { key: 'overview', label: 'Overview', children: overviewTab },
            { key: 'capability', label: `Candidate Evaluation${capability && capability.pct != null ? ` (${capability.pct}%)` : ''}`, children: capabilityTab },
            { key: 'parameters', label: `Score Parameters (${activeParams.length})`, children: parametersTab },
            { key: 'deal', label: 'Joining Evaluation', children: dealTab },
            { key: 'inner', label: 'Behavioral Reflection', children: <div className="ii-panel"><NumerologyTab key={id} employeeId={id} openReport={openInnerReport} /></div> },
          ]}
        />
        {stickyBar}
      </Form>

      <Modal
        title="Add New Company"
        open={addCompanyOpen}
        onCancel={() => setAddCompanyOpen(false)}
        footer={null}
        width={480}
        destroyOnClose
      >
        <Form form={addCompanyForm} layout="vertical" onFinish={onAddCompany}>
          <Form.Item name="company_name" label="Company Name *" rules={[{ required: true, message: 'Required' }]}><Input placeholder="Acme Corp" /></Form.Item>
          <Form.Item name="founded_year" label="Founded Date *" rules={[{ required: true, message: 'Required' }]}><DatePicker picker="year" style={{ width: '100%' }} placeholder="YYYY" /></Form.Item>
          <Form.Item name="brand_name" label="Brand Name"><Input placeholder="Same as company name if blank" /></Form.Item>
          <Form.Item name="founder_name" label="Founder Name"><Input placeholder="Optional" /></Form.Item>
          <div style={{ fontSize: 11, color: '#9aa0a6', marginBottom: 12 }}>
            Company numerology is used for Deep Parameters interpretation only — it does not affect evidence-based recruitment scores.
          </div>
          <Button type="primary" htmlType="submit" block>Add Company</Button>
        </Form>
      </Modal>
    </div>
  );
}