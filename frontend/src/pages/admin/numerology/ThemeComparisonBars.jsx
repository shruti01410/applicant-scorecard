import React from 'react';
import { Card, Tag, Typography } from 'antd';
import DeltaBar from '../../../components/DeltaBar';

const { Text } = Typography;

export default function ThemeComparisonBars({ rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <Card size="small" title="Theme Comparison">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text strong style={{ minWidth: 120, fontSize: 13 }}>{r.name}</Text>
            <Tag>{r.archetype ? `${r.archetype.number} · ${r.archetype.name}` : '—'}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>{r.theme || '—'} {r.current_personal_year ? `(PY ${r.current_personal_year})` : ''}</Text>
          </div>
        ))}
      </div>
      </Card>
  );
}
