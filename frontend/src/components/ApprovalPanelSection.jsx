import React, { useEffect, useMemo, useState } from 'react';
import {
  Card, Tag, Button, Progress, Modal, Form, Input, Radio, Select, DatePicker, Timeline,
  Space, message, Alert, Divider, Typography, Spin,
} from 'antd';
import {
  PlusOutlined, SendOutlined, AuditOutlined, HistoryOutlined, CheckCircleOutlined,
  CloseCircleOutlined, PauseCircleOutlined, ClockCircleOutlined, TeamOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { api } from '../services/api';
import { useAuth } from '../services/AuthContext';

const { Text } = Typography;

const WORKFLOW_TAG = {
  pending: ['In Review', 'blue', <ClockCircleOutlined key="i" />],
  approved: ['Approved', 'green', <CheckCircleOutlined key="i" />],
  rejected: ['Rejected', 'red', <CloseCircleOutlined key="i" />],
  hold: ['Hold', 'gold', <PauseCircleOutlined key="i" />],
  escalated: ['Escalated', 'purple', <HistoryOutlined key="i" />],
};

const PANEL_TAG = {
  awaiting: ['Awaiting review', 'blue'],
  approved: ['Passed', 'green'],
  rejected: ['Rejected', 'red'],
  hold: ['Hold', 'gold'],
};

const RULE_OPTIONS = [
  { value: 'any_one', label: 'Any one reviewer' },
  { value: 'all', label: 'All reviewers' },
  { value: 'majority', label: 'Majority (more than half)' },
  { value: 'custom', label: 'Custom — n of m approvals' },
];

const MEMBER_TAG = {
  approve: ['Approve', 'green'],
  reject: ['Reject', 'red'],
  hold: ['Hold', 'gold'],
  null: ['Pending', 'default'],
};

function PanelForm({ form }) {
  const [rule, setRule] = useState('any_one');
  const [type, setType] = useState('panel');
  const [admins, setAdmins] = useState([]);
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState({});

  useEffect(() => {
    api.get('/api/admin/approvals/admins')
      .then((a) => setAdmins(Array.isArray(a) ? a : []))
      .catch(() => {});
  }, []);

  const memberValues = useMemo(() => {
    return members.map((id) => admins.find((a) => a.id === id)).filter(Boolean);
  }, [members, admins]);

  function setRole(id, value) {
    const next = { ...roles, [id]: value };
    setRoles(next);
    form.setFieldsValue({ member_roles: next });
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Form.Item name="approval_type" label="Review type" rules={[{ required: true }]}>
        <Radio.Group onChange={(e) => setType(e.target.value)} options={[
          { value: 'panel', label: 'Panel review' },
          { value: 'single', label: 'Single reviewer' },
        ]} />
      </Form.Item>

      {type === 'panel' && (
        <>
          <Form.Item name="panel_name" label="Panel name" rules={[{ required: true, message: 'Panel name is required' }]}>
            <Input placeholder="Technical Panel" />
          </Form.Item>
          <Form.Item name="rule_type" label="Approval rule" rules={[{ required: true }]}>
            <Select options={RULE_OPTIONS} onChange={setRule} />
          </Form.Item>
          {rule === 'custom' && (
            <Form.Item name="required_approvals" label="Required approvals (n of m)" rules={[{ required: true, message: 'How many members must approve?' }]}>
              <Input type="number" min={1} />
            </Form.Item>
          )}
          <Form.Item name="deadline" label="Deadline (optional)">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="members" label="Panel members" extra="Each member reviews with their own login — unassigned users cannot approve.">
            <Select
              mode="multiple"
              placeholder="Select admin reviewers"
              style={{ width: '100%' }}
              optionFilterProp="label"
              options={admins.map((a) => ({ value: a.id, label: `${a.name} (${a.email})` }))}
              value={members}
              onChange={setMembers}
            />
          </Form.Item>
          {memberValues.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Member roles (optional)</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {memberValues.map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Text style={{ width: 180, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</Text>
                    <Input size="small" placeholder="e.g. Technical Reviewer" value={roles[m.id] || ''} onChange={(e) => setRole(m.id, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Space>
  );
}

export default function ApprovalPanelSection({ candidateId, onDecisionChanged }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [addForm] = Form.useForm();
  const [reviewForm] = Form.useForm();
  const [finalizeForm] = Form.useForm();

  async function fetchData() {
    setLoading(true);
    try {
      const d = await api.get(`/api/admin/employees/${candidateId}/approval`);
      setData(d);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { fetchData(); }, [candidateId]);

  const workflow = data && data.workflow;
  const panels = (data && data.panels) || [];
  const history = (data && data.history) || [];

  const activePanel = panels.find((p) => p.status === 'awaiting') || panels[panels.length - 1] || null;
  const isMember = !!activePanel && !!user && activePanel.members.some((m) => m.user_id === user.id);
  const canFinalize = workflow && !workflow.completed_at && (workflow.approval_type === 'single' || (activePanel && activePanel.status !== 'awaiting'));

  function buildMembersPayload(memberIds, roles) {
    return (memberIds || []).map((id) => ({ user_id: Number(id), role: roles && roles[id] ? roles[id] : null }));
  }

  async function handleCreate(values) {
    try {
      const isSingle = values.approval_type === 'single';
      const payload = {
        candidate_id: Number(candidateId),
        approval_type: values.approval_type,
        panel_name: isSingle ? 'Single Review' : values.panel_name,
        rule_type: isSingle ? 'any_one' : values.rule_type,
        required_approvals: values.required_approvals ? Number(values.required_approvals) : null,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : null,
        members: isSingle ? [] : buildMembersPayload(values.members, values.member_roles),
      };
      await api.post('/api/admin/approvals/workflows', JSON.stringify(payload));
      message.success(isSingle ? 'Approval workflow started' : 'Panel review workflow started');
      setCreateOpen(false);
      createForm.resetFields();
      fetchData();
    } catch (e) {
      message.error(e.message);
    }
  }

  async function handleAddPanel(values) {
    try {
      const payload = {
        candidate_id: Number(candidateId),
        panel_name: values.panel_name,
        rule_type: values.rule_type,
        required_approvals: values.required_approvals ? Number(values.required_approvals) : null,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : null,
        members: buildMembersPayload(values.members, values.member_roles),
      };
      await api.post('/api/admin/approvals/panels', JSON.stringify(payload));
      message.success('Sent to another panel');
      setAddOpen(false);
      addForm.resetFields();
      fetchData();
    } catch (e) {
      message.error(e.message);
    }
  }

  async function handleSend(panel) {
    try {
      await api.post(`/api/admin/approvals/panels/${panel.id}/send`);
      message.success(`"${panel.panel_name}" sent for review`);
      fetchData();
    } catch (e) {
      message.error(e.message);
    }
  }

  async function handleReview(values) {
    try {
      await api.post(`/api/admin/approvals/panels/${reviewTarget.id}/review`, JSON.stringify({
        decision: values.decision,
        comment: values.comment || null,
      }));
      message.success('Review recorded');
      setReviewTarget(null);
      reviewForm.resetFields();
      fetchData();
    } catch (e) {
      message.error(e.message);
    }
  }

  async function handleFinalize(values) {
    try {
      const resp = await api.post(`/api/admin/approvals/${candidateId}/finalize`, JSON.stringify({
        final_decision: values.final_decision,
        reason_code: values.final_decision === 'rejected' ? values.reason_code : null,
        recruiter_feedback: values.recruiter_feedback || null,
      }));
      message.success(`Final decision recorded — email draft created`);
      if (onDecisionChanged) onDecisionChanged();
      if (resp && resp.email && resp.email.id) setFinalizeOpen(false);
      finalizeForm.resetFields();
      fetchData();
    } catch (e) {
      message.error(e.message);
    }
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><Spin size="small" /></div>;
  if (!data) return null;

  const [wfLabel, wfColor, wfIcon] = WORKFLOW_TAG[workflow ? workflow.status : 'pending'];

  return (
    <Card
      style={{ marginBottom: 16 }}
      title={<span><AuditOutlined /> Approval &amp; Decision</span>}
      styles={workflow ? undefined : { body: { padding: '12px 16px' } }}
    >
      {!workflow ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, flexWrap: 'wrap' }}>
          <AuditOutlined style={{ fontSize: 16, color: '#94a3b8' }} />
          <span style={{ fontSize: 13, color: '#334155' }}>
            No approval workflow started yet — define one to route this decision through your team.
          </span>
          <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} style={{ fontStyle: 'normal' }}>
            + Start Approval Workflow
          </Button>
        </div>
      ) : (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Tag color={wfColor} icon={wfIcon} style={{ margin: 0 }}>{wfLabel}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {workflow.health.panels_resolved}/{workflow.health.panels_total} panels resolved
            </Text>
            {workflow.health.panels_total > 1 && (
              <Progress percent={Math.round((workflow.health.panels_resolved / workflow.health.panels_total) * 100)} size="small" style={{ width: 180, margin: 0 }} />
            )}
          </div>

          <Divider style={{ margin: '4px 0' }} />

          {panels.map((panel, idx) => {
            const [pLabel, pColor] = PANEL_TAG[panel.status];
            const resolved = panel.members.filter((m) => m.decision).length;
            const total = panel.members.length;
            return (
              <div key={panel.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', background: '#fafffe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
                    <TeamOutlined /> Panel {idx + 1}: {panel.panel_name}
                  </div>
                  <Space size={8} wrap>
                    <Tag color={pColor} style={{ margin: 0 }}>{pLabel}</Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>{panel.rule_label}</Text>
                    {activePanel && activePanel.id === panel.id && !panel.sent_at && panel.status === 'awaiting' && (
                      <Button size="small" icon={<SendOutlined />} onClick={() => handleSend(panel)}>Send for Review</Button>
                    )}
                    {isMember && panel.status === 'awaiting' && (
                      <Button size="small" type="primary" onClick={() => setReviewTarget(panel)}>Review</Button>
                    )}
                  </Space>
                </div>

                {total > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <Progress
                      percent={Math.round((resolved / total) * 100)}
                      size="small"
                      format={() => `${resolved}/${total} reviewed`}
                      strokeColor={{ '0%': '#2563eb', '100%': '#16a34a' }}
                    />
                  </div>
                )}

                <Space size={6} wrap style={{ marginTop: 8 }}>
                  {panel.members.map((m) => {
                    const [tLabel, tColor] = MEMBER_TAG[m.decision || 'null'];
                    return (
                      <Tag key={m.id} color={tColor} icon={m.decision ? <CheckOutlined /> : null} style={{ margin: 0, fontSize: 11 }}>
                        {m.name} {m.role ? `· ${m.role}` : ''}
                        {m.decision ? ` — ${tLabel}` : ' — pending'}
                      </Tag>
                    );
                  })}
                </Space>
                {panel.deadline && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>Deadline: {panel.deadline}</div>
                )}
              </div>
            );
          })}

          {workflow && !workflow.completed_at && (
            <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button icon={<PlusOutlined />} onClick={() => setAddOpen(true)} style={{ alignSelf: 'flex-start' }}>
                Send to Another Panel
              </Button>
              {canFinalize && (
                <div>
                  <Button type="primary" onClick={() => { finalizeForm.setFieldsValue({ final_decision: 'approved' }); setFinalizeOpen(true); }} style={{ marginRight: 8 }}>
                    Approve Candidate
                  </Button>
                  <Button danger onClick={() => { finalizeForm.setFieldsValue({ final_decision: 'rejected' }); setFinalizeOpen(true); }}>
                    Reject Candidate
                  </Button>
                </div>
              )}
            </Space>
          )}

          {workflow && workflow.status === 'hold' && !workflow.completed_at && (
            <Alert type="info" showIcon message="Panel is on hold" description="A panel returned Hold without rejection. Restart review after resolving the concerns, or choose another panel to continue."
              action={<Button size="small" onClick={async () => { try { await api.post(`/api/admin/approvals/panels/${activePanel.id}/restart`); message.success('Panel re-opened'); fetchData(); } catch (e) { message.error(e.message); } }}>Re-open Panel</Button>} />
          )}

          {history.length > 0 && (
            <>
              <Divider style={{ margin: '4px 0' }} orientation="left" orientationMargin={0}><HistoryOutlined style={{ fontSize: 12 }} /> Approval History</Divider>
              <Timeline
                style={{ marginTop: 8 }}
                items={history.map((h) => ({
                  children: (
                    <div style={{ fontSize: 12 }}>
                      <Text strong style={{ fontSize: 12 }}>{h.action.replace(/_/g, ' ')}</Text>
                      {h.detail ? <div style={{ color: '#475569' }}>{h.detail}</div> : null}
                      <div style={{ color: '#94a3b8', fontSize: 11 }}>{h.performed_by_name} · {h.created_at}</div>
                    </div>
                  ),
                })).reverse()}
              />
            </>
          )}
        </Space>
      )}

      <Modal title="Start Approval Workflow" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} width={620} destroyOnClose>
        <Form form={createForm} layout="vertical" onFinish={handleCreate} initialValues={{ approval_type: 'panel', rule_type: 'any_one' }}>
          <PanelForm form={createForm} />
          <Button type="primary" htmlType="submit" block icon={<PlusOutlined />}>Start Workflow</Button>
        </Form>
      </Modal>

      <Modal title="Send to Another Panel" open={addOpen} onCancel={() => setAddOpen(false)} footer={null} width={620} destroyOnClose>
        <Form form={addForm} layout="vertical" onFinish={handleAddPanel} initialValues={{ rule_type: 'any_one' }}>
          <PanelForm form={addForm} />
          <Button type="primary" htmlType="submit" block icon={<SendOutlined />}>Create Next Panel</Button>
        </Form>
      </Modal>

      <Modal title={`Review: ${reviewTarget ? reviewTarget.panel_name : ''}`} open={!!reviewTarget} onCancel={() => setReviewTarget(null)} footer={null} width={520} destroyOnClose>
        <ReviewForm form={reviewForm} onFinish={handleReview} />
      </Modal>

      <Modal title="Final Decision" open={finalizeOpen} onCancel={() => setFinalizeOpen(false)} footer={null} width={560} destroyOnClose>
        <Form form={finalizeForm} layout="vertical" onFinish={handleFinalize} initialValues={{ final_decision: 'approved' }}>
          <FinalizeForm form={finalizeForm} />
          <Button type="primary" htmlType="submit" block icon={<CheckCircleOutlined />}>Record Final Decision</Button>
        </Form>
      </Modal>
    </Card>
  );
}

function ReviewForm({ form, onFinish }) {
  const [decision, setDecision] = useState('approve');
  return (
    <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ decision: 'approve' }}>
      <Form.Item name="decision" label="Your opinion" rules={[{ required: true }]}>
        <Radio.Group onChange={(e) => setDecision(e.target.value)} options={[
          { value: 'approve', label: 'Approve' },
          { value: 'reject', label: 'Reject' },
          { value: 'hold', label: 'Hold — needs more info' },
        ]} />
      </Form.Item>
      <Form.Item name="comment" label="Comment (optional)">
        <Input.TextArea rows={3} placeholder="Documented reasons for your opinion — visible in the approval history." />
      </Form.Item>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
        Opinions are individual and are never overwritten by the workflow. The final decision is computed from the panel rule once all needed reviewers have voted, and is only confirmed by the recruiter.
      </div>
      <Button type="primary" htmlType="submit" block icon={<CheckOutlined />}>Submit Review</Button>
    </Form>
  );
}

const REASON_OPTIONS = [
  { value: 'required_skill_gap', label: 'Required skill gap' },
  { value: 'experience_mismatch', label: 'Experience mismatch' },
  { value: 'assessment_result', label: 'Assessment result' },
  { value: 'other', label: 'Other' },
];

function FinalizeForm({ form }) {
  const [decision, setDecision] = useState('approved');
  return (
    <>
      <Form.Item name="final_decision" label="Final decision" rules={[{ required: true }]}>
        <Radio.Group onChange={(e) => setDecision(e.target.value)} options={[
          { value: 'approved', label: 'Approve' },
          { value: 'rejected', label: 'Reject' },
        ]} />
      </Form.Item>
      {decision === 'rejected' && (
        <Form.Item name="reason_code" label="Primary rejection reason" rules={[{ required: true, message: 'Select a documented reason' }]}>
          <Select placeholder="Select the documented reason" options={REASON_OPTIONS} />
        </Form.Item>
      )}
      <Form.Item name="recruiter_feedback" label="Recruiter feedback (internal audit trail)">
        <Input.TextArea rows={3} placeholder="Documented reasoning for this final decision." />
      </Form.Item>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
        Confirms the workflow result and creates a recruiter-editable email draft. Rejection reasons must be documented, job-related evidence — numerology and astrology are never a basis for decisions.
      </div>
    </>
  );
}

export function approvalSummaryTag(workflow) {
  if (!workflow) return <Tag style={{ margin: 0 }}>No workflow</Tag>;
  const [label, color, icon] = WORKFLOW_TAG[workflow.status] || WORKFLOW_TAG.pending;
  return <Tag color={color} icon={icon} style={{ margin: 0 }}>{label}</Tag>;
}