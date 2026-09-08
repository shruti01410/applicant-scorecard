import React, { useEffect, useState } from 'react';
import { Card, Tag, Button, Typography, Space, Alert, message } from 'antd';
import { BulbOutlined, CloseOutlined } from '@ant-design/icons';
import { api } from '../../services/api';

const { Text, Paragraph } = Typography;

export default function SuggestionPanel({ employeeId, onApply }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [applied, setApplied] = useState({});

  async function fetchSuggestions() {
    setLoading(true);
    try {
      const res = await api.get(`/api/admin/employees/${employeeId}/suggested-ratings`);
      setData(res);
    } catch (e) {
      if (!String(e.message).includes('No numerology profile')) message.error(e.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { fetchSuggestions(); }, [employeeId]);

  if (dismissed || !data) return null;
  if (loading && !data) return <Card size="small" loading />;

  const { composite, weights, life_path, expression, birth, suggestions } = data;

  return (
    <Card size="small" title={<span><BulbOutlined style={{ color: '#f59e0b', marginRight: 6 }} />Numerology-Suggested Ratings <Tag color="purple">Read-only</Tag></span>} extra={<Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setDismissed(true)}>Dismiss</Button>} style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
      <Alert type="warning" showIcon style={{ marginBottom: 10, fontSize: 11 }} message="Assistive suggestions — not auto-filled" description="Each suggestion is one click to apply, always overridable, never bulk-applied. Check with legal for your jurisdiction before using birth-data inputs in hiring decisions." />
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
        Composite <Text strong>{composite}</Text> from Life Path {life_path}×{weights.lifePath} + Expression {expression}×{weights.expression} + Birth {birth}×{weights.birth} (weights via <Text code style={{ fontSize: 10 }}>NUMEROLOGY_WEIGHTS</Text> env). Diff to param theme → 5/4/3/2/1.
      </Text>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {suggestions.map(s => (
          <div key={s.parameter_id} style={{ background: applied[s.parameter_id] ? '#f0fdf4' : '#fff', border: `1px solid ${applied[s.parameter_id] ? '#bbf7d0' : '#fde68a'}`, borderRadius: 6, padding: '6px 8px', opacity: applied[s.parameter_id] ? 0.7 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong style={{ fontSize: 12 }}>{s.parameter_name}</Text>
              <Tag color={s.suggested_rating >= 4 ? 'green' : s.suggested_rating === 3 ? 'blue' : 'orange'}>{s.suggested_rating}/5</Tag>
            </div>
            <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 2 }}>{s.reason}</Text>
            <Button size="small" type={applied[s.parameter_id] ? 'default' : 'primary'} block style={{ marginTop: 6 }} disabled={applied[s.parameter_id]} onClick={() => { onApply(s.parameter_id, s.suggested_rating); setApplied(prev => ({ ...prev, [s.parameter_id]: true })); message.success(`Applied ${s.suggested_rating} to ${s.parameter_name} — you can still edit before Save`); }}>
              {applied[s.parameter_id] ? 'Applied' : `Apply ${s.suggested_rating}`}
            </Button>
          </div>
        ))}
      </div>
      <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 8, textAlign: 'center' }}>One field at a time — no “Apply all” to keep the admin in control. Saved scores are logged with source: manual vs numerology_suggested.</Text>
    </Card>
  );
}
