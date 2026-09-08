import React, { useEffect, useState } from 'react';
import { Card, Tag, Typography, Spin, Alert } from 'antd';
import { CheckCircleOutlined, WarningOutlined, StarOutlined, FlagOutlined } from '@ant-design/icons';
import { api } from '../../../services/api';

const { Text, Paragraph } = Typography;

export default function OverallConclusion({ employeeId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/admin/employees/${employeeId}/overall-conclusion`).then(setData).catch(()=>setData(null)).finally(()=>setLoading(false));
  }, [employeeId]);

  if (loading) return <div style={{ textAlign:'center', padding:16 }}><Spin size="small" /></div>;
  if (!data) return null;
  const c = data.conclusion;
  if (!c) return null;

  return (
    <Card size="small" title={<span style={{ fontFamily:'Fraunces, serif', color:'#EDEAE3' }}>Overall Conclusion — Few Lines That Matter</span>} style={{ background:'#1B1D25', border:'1px solid rgba(199,154,75,0.22)' }}>
      <Paragraph style={{ fontSize:12, lineHeight:1.7, color:'rgba(237,234,227,0.85)', background:'rgba(199,154,75,0.06)', border:'1px solid rgba(199,154,75,0.14)', borderRadius:8, padding:'10px 12px' }}>
        {c.overview}
      </Paragraph>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10 }}>
        <div style={{ background:'#23252F', border:'1px solid rgba(79,143,125,0.22)', borderRadius:10, padding:'10px 12px' }}>
          <Text strong style={{ fontSize:11, color:'#4F8F7D', display:'flex', alignItems:'center', gap:6 }}><CheckCircleOutlined /> Green Flags — what to lean on</Text>
          {c.greenFlags.length ? c.greenFlags.map((g,i)=>(
            <div key={i} style={{ marginTop:6, fontSize:11, color:'rgba(237,234,227,0.8)' }}><Text strong style={{ color:'#EDEAE3', fontSize:11 }}>{g.name}</Text> <Tag style={{ marginLeft:6, fontSize:10 }}>{g.score}</Tag><Text style={{ display:'block', color:'rgba(237,234,227,0.55)', fontSize:11 }}>{g.reason}</Text></div>
          )) : <Text style={{ fontSize:11, color:'rgba(237,234,227,0.5)' }}>No standout high signals yet — need more ratings.</Text>}
        </div>
        <div style={{ background:'#23252F', border:'1px solid rgba(185,125,104,0.22)', borderRadius:10, padding:'10px 12px' }}>
          <Text strong style={{ fontSize:11, color:'#B97D68', display:'flex', alignItems:'center', gap:6 }}><WarningOutlined /> Worth Exploring — not red flags</Text>
          {c.redFlags.length ? c.redFlags.map((r,i)=>(
            <div key={i} style={{ marginTop:6, fontSize:11, color:'rgba(237,234,227,0.8)' }}><Text strong style={{ color:'#EDEAE3', fontSize:11 }}>{r.name}</Text> <Tag style={{ marginLeft:6, fontSize:10 }}>{r.score}</Tag><Text style={{ display:'block', color:'rgba(237,234,227,0.55)', fontSize:11 }}>{r.reason}</Text></div>
          )) : <Text style={{ fontSize:11, color:'rgba(237,234,227,0.5)' }}>No strong watch items.</Text>}
        </div>
      </div>

      <div style={{ marginTop:10, background:'#23252F', border:'1px solid rgba(199,154,75,0.14)', borderRadius:10, padding:'10px 12px' }}>
        <Text strong style={{ fontSize:11, color:'#C79A4B', display:'flex', alignItems:'center', gap:6 }}><StarOutlined /> Best Parts — considerations</Text>
        {c.bestParts.map((b,i)=><Text key={i} style={{ fontSize:11, display:'block', marginTop:4, color:'rgba(237,234,227,0.7)' }}>• {b}</Text>)}
      </div>

      <div style={{ marginTop:10, background:'rgba(199,154,75,0.08)', border:'1px solid rgba(199,154,75,0.18)', borderRadius:10, padding:'12px' }}>
        <Text strong style={{ fontSize:12, color:'#EDEAE3', fontFamily:'Fraunces, serif', display:'flex', alignItems:'center', gap:6 }}><FlagOutlined style={{ color:'#C79A4B' }} /> Final Verdict</Text>
        <Paragraph style={{ fontSize:12, lineHeight:1.7, color:'rgba(237,234,227,0.85)', marginTop:6, marginBottom:0 }}>{c.finalVerdict}</Paragraph>
      </div>
    </Card>
  );
}
