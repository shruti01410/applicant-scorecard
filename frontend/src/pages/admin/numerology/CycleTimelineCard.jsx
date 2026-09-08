import React from 'react';
import { Card, Steps, Typography } from 'antd';

const { Text } = Typography;

export default function CycleTimelineCard({ timeline }) {
  if (!timeline || timeline.length === 0) return null;
  return (
    <Card size="small" title="4-Year Personal-Year Cycle">
      <Steps
        direction="vertical"
        size="small"
        current={0}
        items={timeline.map(t => ({
          title: `${t.year} — ${t.number} · ${t.theme}`,
          description: <Text type="secondary" style={{ fontSize: 12 }}>{t.description}</Text>,
        }))}
      />
      </Card>
  );
}
