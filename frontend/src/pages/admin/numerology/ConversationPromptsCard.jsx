import React, { useEffect, useState } from 'react';
import { Card, Typography, Tag } from 'antd';
import { api } from '../../../services/api';

const { Text } = Typography;

const FALLBACK = [
  'What kind of work leaves you feeling most energised vs drained?',
  'How do you prefer to receive feedback when something needs to change?',
  'Describe the team environment where you do your best work.',
];

export default function ConversationPromptsCard({ employeeId }) {
  const [behav, setBehav] = useState(null);
  useEffect(() => {
    if (!employeeId) return;
    api.get(`/api/admin/employees/${employeeId}/tri-nature`).then(d=>{
      if (d && d.hasProfile) {
        const sorted = Object.entries(d.parameters).sort((a,b)=>a[1].score-b[1].score);
        const low = sorted[0];
        const high = sorted[sorted.length-1];
        setBehav({ low, high, signature: d.signature });
      }
    }).catch(()=>{});
  }, [employeeId]);
  if (behav && behav.low) {
    const prompts = [
      `You scored high on "${behav.high[0]}" (${behav.high[1].score}) — ${behav.high[1].light.toLowerCase()}. When does that help you most?`,
      `On "${behav.low[0]}" (${behav.low[1].score}) the shadow is "${behav.low[1].shadow.toLowerCase()}" — how do you notice it and what do you do?`,
      `Your signature is ${behav.signature.name} — what part of that feels most like you right now, and what feels less like you?`,
    ];
    return (
      <Card size="small" title={<span style={{ fontFamily:'Fraunces, serif', color:'#EDEAE3' }}>Conversation Prompts — based on behavioral signals</span>} style={{ background:'#1B1D25', border:'1px solid rgba(199,154,75,0.18)' }}>
        <ol style={{ paddingLeft: 18, margin: 0, color:'rgba(237,234,227,0.85)' }}>
          {prompts.map((p, i) => <li key={i} style={{ marginBottom: 6, fontSize: 12, lineHeight:1.6 }}>{p}</li>)}
        </ol>
        <Text style={{ fontSize: 11, display: 'block', marginTop: 8, color:'rgba(237,234,227,0.55)' }}>Use as openers — verify in conversation, do not score from these answers. Based on 25 behavioral parameters.</Text>
        </Card>
    );
  }
  return (
    <Card size="small" title={<span style={{ fontFamily:'Fraunces, serif', color:'#EDEAE3' }}>Conversation Prompts</span>} style={{ background:'#1B1D25', border:'1px solid rgba(199,154,75,0.18)' }}>
      <ol style={{ paddingLeft: 18, margin: 0, color:'rgba(237,234,227,0.85)' }}>
        {FALLBACK.map((p, i) => <li key={i} style={{ marginBottom: 6, fontSize: 12 }}>{p}</li>)}
      </ol>
      <Text style={{ fontSize: 11, display: 'block', marginTop: 8, color:'rgba(237,234,227,0.55)' }}>Use as openers — verify in conversation, do not score from these answers.</Text>
      </Card>
  );
}
