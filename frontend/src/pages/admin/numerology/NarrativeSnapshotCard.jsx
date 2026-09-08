import React from 'react';
import { Card, Typography } from 'antd';

const { Paragraph } = Typography;

export default function NarrativeSnapshotCard({ narrative }) {
  if (!narrative) return null;
  return (
    <Card size="small" title="Narrative Snapshot">
      <Paragraph style={{ marginBottom: 0, fontSize: 13, lineHeight: 1.6 }}>{narrative}</Paragraph>
      </Card>
  );
}
