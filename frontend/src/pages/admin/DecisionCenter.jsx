import React, { useEffect, useState } from 'react';
import { Card, Tag, Button, Segmented, Spin, Empty, Modal, Descriptions, message, Space, Typography } from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, MailOutlined, FileTextOutlined, LinkOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { decisionTag, DraftEmailModal } from '../../components/DecisionModals';

const { Text } = Typography;

export default function DecisionCenter() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [details, setDetails] = useState(null);
  const [draft, setDraft] = useState(null);
  const [draftOpen, setDraftOpen] = useState(false);

  async function fetchData() {
    setLoading(true);
    try {
      const d = await api.get('/api/admin/decisions');
      setData(d);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>;
  }
  if (!data) return <Empty description="Could not load decisions" />;

  const { summary, candidates } = data;
  const filtered = candidates.filter((c) => {
    if (filter === 'all') return true;
    if (filter === 'approved') return c.latest && c.latest.decision === 'approved';
    if (filter === 'rejected') return c.latest && c.latest.decision === 'rejected';
    return !c.latest;
  });

  function statCard(label, value, color, icon) {
    return (
      <div style={{ flex: 1, minWidth: 140, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: `${color}18`, color }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{label}</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Decision Center</h2>
          <div className="sub" style={{ fontSize: 12, color: '#64748b' }}>Approval / rejection workflow with recruiter-editable email drafts</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {statCard('Approved', summary.approved, '#16a34a', <CheckCircleOutlined />)}
        {statCard('Rejected', summary.rejected, '#ef4444', <CloseCircleOutlined />)}
        {statCard('Pending decision', summary.pending, '#f59e0b', <ClockCircleOutlined />)}
      </div>

      <div style={{ marginBottom: 12 }}>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { label: `All (${candidates.length})`, value: 'all' },
            { label: 'Approved', value: 'approved' },
            { label: 'Rejected', value: 'rejected' },
            { label: 'Pending', value: 'pending' },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <Empty description="No candidates in this state" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {filtered.map((c) => {
            return (
              <div key={c.candidate_id} className="card" style={{ padding: 16, margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ fontWeight: 700, color: '#1e293b' }}>{c.applicant_name}</div>
                  {decisionTag(c.latest)}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {c.position} {c.position && c.client ? '· ' : ''}{c.client}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {c.scorecard_id ? (
                    <Link to={`/scores/${c.candidate_id}`}>
                      <Button size="small" icon={<FileTextOutlined />}>Scorecard</Button>
                    </Link>
                  ) : (
                    <Link to={`/scores/${c.candidate_id}`}>
                      <Button size="small">Score Now</Button>
                    </Link>
                  )}
                  <Button size="small" icon={<LinkOutlined />} onClick={() => setDetails(c)}>View Details</Button>
                  {c.draft && (
                    <Button size="small" icon={<MailOutlined />} onClick={() => { setDraft(c.draft); setDraftOpen(true); }}>Draft Email</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        title="Decision Details"
        open={!!details}
        onCancel={() => setDetails(null)}
        footer={null}
        width={560}
        destroyOnClose
      >
        {details && (
          <div>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Candidate">{details.applicant_name}</Descriptions.Item>
              <Descriptions.Item label="Email">{details.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="Position">{details.position || '—'}</Descriptions.Item>
              <Descriptions.Item label="Client">{details.client || '—'}</Descriptions.Item>
              <Descriptions.Item label="Decision">
                {details.latest ? (
                  <>
                    {decisionTag(details.latest)}
                    <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
                      {details.latest.reason_label ? `Reason: ${details.latest.reason_label}` : ''}
                    </div>
                  </>
                ) : 'Pending decision'}
              </Descriptions.Item>
              {details.latest && details.latest.recruiter_feedback && (
                <Descriptions.Item label="Recruiter Feedback">{details.latest.recruiter_feedback}</Descriptions.Item>
              )}
              {details.latest && (
                <Descriptions.Item label="Decided By">{details.latest.decided_by_name}</Descriptions.Item>
              )}
              {details.latest && (
                <Descriptions.Item label="Decided At">{details.latest.decided_at || '—'}</Descriptions.Item>
              )}
              {details.latest && details.latest.jd_title && (
                <Descriptions.Item label="JD">{details.latest.jd_title}</Descriptions.Item>
              )}
            </Descriptions>
            {details.latest && details.latest.evidence_snapshot && details.latest.evidence_snapshot.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <Text strong style={{ fontSize: 13 }}>Documented evidence</Text>
                <Space wrap size={4} style={{ display: 'flex', marginTop: 6 }}>
                  {details.latest.evidence_snapshot.map((e, i) => <Tag key={i} style={{ margin: 0 }}>{e}</Tag>)}
                </Space>
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <Button type="primary" icon={<MailOutlined />} onClick={() => { setDraft(details.draft); setDraftOpen(true); }}>View / Edit Email Draft</Button>
            </div>
          </div>
        )}
      </Modal>

      <DraftEmailModal
        open={draftOpen}
        draft={draft}
        onClose={() => setDraftOpen(false)}
        onSaved={fetchData}
      />
    </div>
  );
}