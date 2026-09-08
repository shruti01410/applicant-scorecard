import React from 'react';
import { Card, Typography, Tag } from 'antd';

const { Text } = Typography;

export default function InterviewPrepCard({ prep }) {
  if (!prep) return null;
  return (
    <Card size="small" title="Interview Prep">
      {prep.focus && <div style={{ marginBottom: 8 }}><Text type="secondary">Focus parameter: </Text><Tag color="blue">{prep.focus}</Tag></div>}
      <ol style={{ paddingLeft: 18, margin: 0 }}>
        {prep.prompts.map((p, i) => <li key={i} style={{ marginBottom: 6, fontSize: 13 }}>{p}</li>)}
      </ol>
      </Card>
  );
}
