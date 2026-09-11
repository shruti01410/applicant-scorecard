import React from 'react';
import { Card, Typography, Tag } from 'antd';

const { Text } = Typography;

export default function InterviewPrepCard({ prep, maskedTraits }) {
  if (!prep && (!maskedTraits || maskedTraits.length === 0)) return null;
  return (
    <Card size="small" title="Interview Prep">
      {prep && prep.focus && <div style={{ marginBottom: 8 }}><Text type="secondary">Focus parameter: </Text><Tag color="blue">{prep.focus}</Tag></div>}
      {prep && prep.prompts && (
        <ol style={{ paddingLeft: 18, margin: 0 }}>
          {prep.prompts.map((p, i) => <li key={i} style={{ marginBottom: 6, fontSize: 13 }}>{p}</li>)}
        </ol>
      )}
      {maskedTraits && maskedTraits.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Masked Traits — Interview Scenarios</Text>
          <Text style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 8 }}>
            These traits shift under pressure — observe them directly in the interview.
          </Text>
          {maskedTraits.map((m, i) => (
            <div key={i} style={{ background: '#fff8ef', border: '1px solid #f2e2c4', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
              <Tag color="orange" style={{ marginBottom: 4 }}>{m.trait}</Tag>
              <Text style={{ fontSize: 12, display: 'block' }}>{m.prompt}</Text>
            </div>
          ))}
        </div>
      )}
      </Card>
  );
}
