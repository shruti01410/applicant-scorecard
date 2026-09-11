import React from 'react';
import { Card, Tag, Typography, Tooltip } from 'antd';
import { InfoCircleOutlined, FireOutlined, HeartOutlined, CompassOutlined, StarOutlined, EyeOutlined, TeamOutlined, UserOutlined, LockOutlined, MessageOutlined, ThunderboltOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

const CATEGORY_ICONS = {
  Expression: <MessageOutlined style={{ color: '#6366f1' }} />,
  Attitude: <ThunderboltOutlined style={{ color: '#f59e0b' }} />,
  Unmasked: <UserOutlined style={{ color: '#06b6d4' }} />,
  Personality: <EyeOutlined style={{ color: '#8b5cf6' }} />,
  'Soul Urge': <HeartOutlined style={{ color: '#ec4899' }} />,
  Masked: <LockOutlined style={{ color: '#eab308' }} />,
};

const SCORE_COLOR = { 5: '#4F8F7D', 4: '#4F8F7D', 3: '#EDEAE3', 2: '#B97D68', 1: '#B97D68' };

export default function NumoParametersCard({ params }) {
  if (!params || params.length === 0) return null;
  return (
    <Card size="small" title={<span style={{ fontFamily: 'Fraunces, serif', color: '#EDEAE3' }}>Numo Parameters <Tag color="gold" style={{ marginLeft: 8, background: 'rgba(199,154,75,0.16)', borderColor: 'rgba(199,154,75,0.3)', color: '#C79A4B' }}>Inner Intelligence</Tag> <Tooltip title="Luck & stillness based — descriptive, not predictive. Like the rest of Inner Intelligence, these never affect the 23-parameter weighted %."><InfoCircleOutlined style={{ marginLeft: 6, color: 'rgba(237,234,227,0.5)' }} /></Tooltip></span>}>
      <Paragraph style={{ fontSize: 11, marginBottom: 12, color: 'rgba(237,234,227,0.7)' }}>
        Six numerology-derived lenses — <Text strong style={{ color: '#EDEAE3' }}>stillness, luck, harmony, destiny, karmic balance, intuition</Text>. Each is 1-5 from your Life/Birth/Personal Year vs company core. Think "weather report," not verdict.
      </Paragraph>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
        {params.map(p => (
          <div key={p.key} style={{ border: `1px solid ${p.tone === 'good' ? 'rgba(79,143,125,0.28)' : p.tone === 'watch' ? 'rgba(185,125,104,0.28)' : 'rgba(199,154,75,0.18)'}`, background: '#1B1D25', borderRadius: 12, padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              {CATEGORY_ICONS[p.key] || <StarOutlined />}
              <Text strong style={{ fontSize: 13, fontFamily: 'Fraunces, serif', color: '#EDEAE3' }}>{p.name}</Text>
              <Tag style={{ marginLeft: 'auto', fontSize: 10, background: 'rgba(199,154,75,0.12)', color: '#C79A4B', borderColor: 'rgba(199,154,75,0.25)' }}>{p.number} · {p.keyword}</Tag>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Text strong style={{ color: SCORE_COLOR[p.score], fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{p.score}/5</Text>
              <Tag color={p.tone === 'good' ? 'green' : p.tone === 'watch' ? 'orange' : 'default'} style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{p.outcome || p.resonance}{p.diff != null ? ` · Δ${p.diff}` : ''}</Tag>
              {p.derivedFromAlignment && <Tag style={{ fontSize: 9, background: 'rgba(79,143,125,0.16)', color: '#4F8F7D', borderColor: 'rgba(79,143,125,0.28)' }}>Trajectory Alignment</Tag>}
            </div>
            <Text style={{ fontSize: 11, display: 'block', lineHeight: 1.5, color: 'rgba(237,234,227,0.75)' }}>{p.desc}</Text>
            <Text style={{ fontSize: 11, display: 'block', marginTop: 4, fontStyle: 'italic', color: 'rgba(237,234,227,0.55)' }}>{p.human}</Text>
            <Text style={{ fontSize: 10, display: 'block', marginTop: 8, background: 'rgba(237,234,227,0.04)', border: '1px dashed rgba(199,154,75,0.18)', borderRadius: 6, padding: '6px 8px', color: 'rgba(237,234,227,0.6)', fontVariantNumeric: 'tabular-nums' }}>Basis: {p.basis}</Text>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, background: 'rgba(199,154,75,0.06)', border: '1px solid rgba(199,154,75,0.18)', borderRadius: 10, padding: '10px 12px' }}>
        <Text strong style={{ fontSize: 11, color: '#C79A4B', fontFamily: 'Fraunces, serif' }}>Analytical note — Good (Δ0-1, teal) · Neutral (Δ2-3) · Worth exploring (Δ4+, rose)</Text>
        <Text style={{ fontSize: 11, display: 'block', marginTop: 4, lineHeight: 1.5, color: 'rgba(237,234,227,0.65)' }}>
          Stillness = PY-driven; Luck = Life Path vs 8; Harmony = Composite (DOB+name) vs Founded — shares Trajectory Alignment (single source of truth); Destiny = Expression vs 1; Karmic = Birth 6/11/22; Intuition = master 11/22. All 1-5, all neutral — a 2 is "different wavelength," not a flaw.
        </Text>
      </div>
      </Card>
  );
}
