import React, { useEffect, useState } from 'react';
import {
  Modal, Radio, Select, Input, Button, Tag, Space, Alert, message, Typography, Divider,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, CopyOutlined, MailOutlined, SaveOutlined,
  GoogleOutlined, LinkOutlined,
} from '@ant-design/icons';
import { api } from '../services/api';

const { Text } = Typography;

export const REASON_OPTIONS = [
  { value: 'required_skill_gap', label: 'Required skill gap' },
  { value: 'experience_mismatch', label: 'Experience mismatch' },
  { value: 'assessment_result', label: 'Assessment result' },
  { value: 'other', label: 'Other' },
];

export function decisionTag(decision) {
  if (!decision) return <Tag style={{ margin: 0 }}>Pending decision</Tag>;
  if (decision.decision === 'approved') {
    return <Tag color="green" icon={<CheckCircleOutlined />} style={{ margin: 0 }}>Approved</Tag>;
  }
  return <Tag color="red" icon={<CloseCircleOutlined />} style={{ margin: 0 }}>Rejected — {decision.reason_label || decision.reason_code}</Tag>;
}

const DISCLAIMER = 'Reasons are limited to documented, job-related evidence (JD/resume capability match, recorded evaluation). Numerology and astrology are never used as a basis for hiring decisions.';

export function DraftEmailModal({ open, draft, candidateEmail, onClose, onSaved }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [gmail, setGmail] = useState({ configured: false, connected: false, account: null, loading: false });
  const [gmailSaving, setGmailSaving] = useState(false);
  const [gmailSaved, setGmailSaved] = useState(null);

  const to = (draft && String(draft.recipient_email || '').trim()) || candidateEmail || '';

  async function loadGmailStatus() {
    try {
      const s = await api.get('/api/admin/gmail/status');
      setGmail(s);
    } catch (e) {
      setGmail((g) => ({ ...g, loading: false }));
    }
  }

  useEffect(() => {
    if (open && draft) {
      setSubject(draft.subject || '');
      setBody(draft.body || '');
      setGmailSaved(null);
      loadGmailStatus();
    }
  }, [open, draft, candidateEmail]);

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await api.patch(`/api/admin/decisions/email-drafts/${draft.id}`, { subject, body });
      message.success('Draft saved');
      if (onSaved) onSaved(saved);
    } catch (e) {
      message.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    const text = `To: ${to || ''}\nSubject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      message.success('Draft copied to clipboard');
    } catch (e) {
      message.warning('Copy failed — select and copy manually');
    }
  }

  async function handleConnect() {
    setGmail((g) => ({ ...g, loading: true }));
    try {
      const r = await api.get(`/api/admin/gmail/connect?return_to=${encodeURIComponent(window.location.pathname)}`);
      window.location.assign(r.authUrl);
    } catch (e) {
      message.error(e.message);
      setGmail((g) => ({ ...g, loading: false }));
    }
  }

  async function handleSaveToGmail() {
    if (!draft || !draft.id) return;
    setGmailSaving(true);
    try {
      const r = await api.post(`/api/admin/gmail/email-drafts/${draft.id}/gmail`);
      setGmailSaved(r);
      message.success('Draft created in your Gmail');
      if (onSaved) onSaved();
    } catch (e) {
      message.error(e.message);
    } finally {
      setGmailSaving(false);
    }
  }

  async function handleDisconnect() {
    try {
      await api.post('/api/admin/gmail/disconnect');
      setGmail({ configured: gmail.configured, connected: false, account: null, loading: false });
      setGmailSaved(null);
      message.success('Gmail disconnected');
    } catch (e) {
      message.error(e.message);
    }
  }

  function handleOpenGmail() {
    const url = (gmailSaved && gmailSaved.gmail_draft_url)
      || (draft && draft.gmail_draft_id ? `https://mail.google.com/mail/u/0/#inbox?compose=${draft.gmail_draft_id}` : null);
    if (url) {
      window.open(url, '_blank', 'noopener');
    } else {
      message.info('Draft created — open your Gmail inbox to find it');
    }
  }

  const savedDraftId = (gmailSaved && gmailSaved.gmail_draft_id) || (draft && draft.gmail_draft_id);

  return (
    <Modal
      title={<span><MailOutlined /> Email Draft</span>}
      open={open}
      onCancel={onClose}
      width={680}
      destroyOnClose
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={handleCopy}>Copy</Button>,
        <Button key="save" type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>Save Draft</Button>,
      ]}
    >
      {draft && (
        <>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
            To: <b>{to || '—'}</b>
          </div>
          {!to && (
            <Alert
              style={{ marginBottom: 12 }}
              type="error"
              showIcon
              message="Candidate email is unavailable"
              description="Please add the candidate's email before creating the draft in Gmail."
            />
          )}
          <Input
            addonBefore="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <Input.TextArea rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
          <Alert
            style={{ marginTop: 12 }}
            type="info"
            showIcon
            message="Sending is disabled — drafts are for recruiter review"
            description="Nothing is sent automatically. Save the email as a real draft in your Gmail (below), then review and send it from Gmail yourself."
          />

          <Divider style={{ margin: '16px 0 12px' }}>Save to Gmail</Divider>

          {!gmail.configured && (
            <Alert
              type="warning"
              showIcon
              message="Gmail integration is not configured yet"
              description="An administrator needs to connect this app to Google (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET and the callback URL)."
            />
          )}

          {gmail.configured && !gmail.connected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button
                icon={<GoogleOutlined />}
                loading={gmail.loading}
                onClick={handleConnect}
                style={{ alignSelf: 'flex-start' }}
              >
                Connect Gmail
              </Button>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Signs in to your Gmail to save drafts. Your credentials stay on the server — they are never
                sent to your browser. Gmail scope: create drafts only (no sending).
              </Text>
            </div>
          )}

          {gmail.configured && gmail.connected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Tag color="blue" icon={<CheckCircleOutlined />} style={{ margin: 0 }}>
                  Connected: {gmail.account}
                </Tag>
                {savedDraftId ? (
                  <Button size="small" icon={<LinkOutlined />} onClick={handleOpenGmail}>Open Gmail Draft</Button>
                ) : (
                  <Button
                    size="small"
                    type="primary"
                    icon={<MailOutlined />}
                    loading={gmailSaving}
                    disabled={!to}
                    onClick={handleSaveToGmail}
                  >
                    Save to Gmail Draft
                  </Button>
                )}
                <Button size="small" type="text" onClick={handleDisconnect} style={{ fontSize: 12 }}>
                  Disconnect
                </Button>
              </div>
              {!to && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Add the candidate's email before you can save the draft to Gmail.
                </Text>
              )}
              {savedDraftId && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Draft saved to Gmail. Open it in Gmail to review, edit, and send — nothing is sent automatically.
                </Text>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export function RecordDecisionModal({ open, candidateId, initialDecision, onClose, onDone }) {
  const [decision, setDecision] = useState(initialDecision || 'approved');
  const [reasonCode, setReasonCode] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [disclaimer, setDisclaimer] = useState(DISCLAIMER);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDecision(initialDecision || 'approved');
    setReasonCode(null);
    setFeedback('');
    setSuggestions([]);
    setDisclaimer(DISCLAIMER);
  }, [open, initialDecision]);

  useEffect(() => {
    if (!open || decision !== 'rejected') return;
    api.get(`/api/admin/decisions/evidence/${candidateId}`)
      .then((d) => { setSuggestions(d.suggestions || []); if (d.disclaimer) setDisclaimer(d.disclaimer); })
      .catch(() => {});
  }, [open, decision, candidateId]);

  async function handleSubmit() {
    if (decision === 'rejected' && !reasonCode) {
      message.warning('Select a primary rejection reason');
      return;
    }
    setSubmitting(true);
    try {
      const resp = await api.post('/api/admin/decisions', {
        candidate_id: Number(candidateId),
        decision,
        reason_code: decision === 'rejected' ? reasonCode : null,
        recruiter_feedback: feedback || null,
      });
      message.success(decision === 'approved' ? 'Candidate approved — email draft created' : 'Candidate rejected — email draft created');
      if (onDone) onDone(resp);
    } catch (e) {
      message.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Recruiter Decision"
      open={open}
      onCancel={onClose}
      width={620}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={onClose}>Cancel</Button>,
        <Button
          key="submit"
          type="primary"
          danger={decision === 'rejected'}
          loading={submitting}
          onClick={handleSubmit}
        >
          {decision === 'approved' ? 'Approve & Create Draft' : 'Reject & Create Draft'}
        </Button>,
      ]}
    >
      <Radio.Group value={decision} onChange={(e) => setDecision(e.target.value)} style={{ marginBottom: 16 }}>
        <Radio.Button value="approved"><CheckCircleOutlined /> Approve</Radio.Button>
        <Radio.Button value="rejected"><CloseCircleOutlined /> Reject</Radio.Button>
      </Radio.Group>

      {decision === 'rejected' && (
        <>
          <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Primary reason <span style={{ color: '#ef4444' }}>*</span></div>
          <Select
            style={{ width: '100%' }}
            placeholder="Select the documented reason"
            value={reasonCode}
            onChange={setReasonCode}
            options={REASON_OPTIONS}
          />
          {suggestions.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Evidence-based suggestions — confirm before using:</Text>
              <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                {suggestions.map((s, i) => (
                  <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', background: '#f8fafc' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{s.label} · <span style={{ fontWeight: 400, color: '#64748b' }}>{s.source}</span></div>
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{s.summary}</div>
                    <Space wrap size={4} style={{ marginTop: 4 }}>
                      {s.evidence && s.evidence.slice(0, 4).map((ev, j) => (
                        <Tag key={j} style={{ fontSize: 10, margin: 0 }}>{ev}</Tag>
                      ))}
                      <Button
                        size="small"
                        type="link"
                        style={{ fontSize: 11, padding: 0 }}
                        onClick={() => { setReasonCode(s.reason_code); setFeedback(s.summary); }}
                      >
                        Use this
                      </Button>
                    </Space>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ margin: '16px 0 6px', fontSize: 13, fontWeight: 600 }}>Recruiter feedback (internal)</div>
      <Input.TextArea
        rows={4}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Documented reasoning for this decision (used for audit trail, not auto-inserted into the rejection email)."
      />

      <Divider style={{ margin: '14px 0 10px' }} />
      <div style={{ fontSize: 11, color: '#94a3b8' }}>{disclaimer}</div>
    </Modal>
  );
}

export function DecisionStatus({ candidateId, decision, draft, candidateEmail, onChanged }) {
  const [recordOpen, setRecordOpen] = useState(false);
  const [initialDecision, setInitialDecision] = useState('approved');
  const [draftOpen, setDraftOpen] = useState(false);

  function openDecision(d) {
    setInitialDecision(d);
    setRecordOpen(true);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {decisionTag(decision)}
      {decision && (
        <Button size="small" icon={<MailOutlined />} onClick={() => setDraftOpen(true)}>
          {draft ? 'View Draft Email' : 'Draft Email'}
        </Button>
      )}
      <Button size="small" type="primary" onClick={() => openDecision('approved')}>Approve</Button>
      <Button size="small" danger onClick={() => openDecision('rejected')}>Reject</Button>

      <RecordDecisionModal
        open={recordOpen}
        candidateId={candidateId}
        initialDecision={initialDecision}
        onClose={() => setRecordOpen(false)}
        onDone={(resp) => {
          setRecordOpen(false);
          if (onChanged) onChanged(resp);
        }}
      />
      <DraftEmailModal
        open={draftOpen}
        draft={draft}
        candidateEmail={candidateEmail}
        onClose={() => setDraftOpen(false)}
        onSaved={() => { if (onChanged) onChanged(); }}
      />
    </div>
  );
}
