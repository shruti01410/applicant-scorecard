import React, { useEffect, useState } from 'react';
import { Card, Tag, Typography, Progress, Spin, Alert, Button, Space } from 'antd';
import { Link, useParams } from 'react-router-dom';
import { CheckCircleOutlined, WarningOutlined, FileTextOutlined } from '@ant-design/icons';
import { api } from '../../services/api';

const { Title, Text, Paragraph } = Typography;

export default function CapabilityMatchPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [sc, setSc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [cap, score] = await Promise.all([
          api.get(`/api/admin/employees/${id}/capability-match`),
          api.get(`/api/admin/employees/${id}/scorecard`).catch(()=>null),
        ]);
        setData(cap);
        setSc(score?.scorecard || null);
      } catch (e) { setData({ pct:null, message:e.message }); } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <div style={{ textAlign:'center', padding:40 }}><Spin /></div>;
  if (!data) return <Alert type="error" message="No data" />;
  if (data.pct == null) return (
    <Card style={{ maxWidth:900, margin:'0 auto' }}>
      <Link to={`/scores/${id}`}><Button size="small" style={{ marginBottom:12 }}>← Back to Scorecard</Button></Link>
      <Alert type="info" message={data.message || 'Resume or JD not linked yet'} description="Link a JD and upload a resume on the scorecard to see the match." />
    </Card>
  );

  const total = (data.matched?.length||0) + (data.missing?.length||0);
  return (
    <div style={{ maxWidth:960, margin:'0 auto' }}>
      <Link to={`/scores/${id}`}><Button size="small" style={{ marginBottom:12 }}>← Back to Scorecard — {sc?.applicant_name || `Candidate ${id}`}</Button></Link>
      <Card style={{ borderRadius:12 }}>
        <Title level={4} style={{ margin:0 }}><FileTextOutlined /> Capability Match — JD ↔ Resume</Title>
        <Text type="secondary" style={{ fontSize:13 }}>Hiring signals only — skills, tools, education & experience extracted from JD and checked in resume</Text>
        <div style={{ display:'flex', alignItems:'center', gap:24, marginTop:16, flexWrap:'wrap' }}>
          <Progress type="circle" size={96} percent={data.pct} strokeColor={data.pct>=70?'#16a34a':data.pct>=40?'#f59e0b':'#ef4444'} format={()=> <span style={{ fontSize:22, fontWeight:800 }}>{data.pct}%</span>} />
          <div style={{ flex:1, minWidth:240 }}>
            <Text strong style={{ fontSize:15 }}>{data.pct}% hiring signals found in resume</Text>
            <Text type="secondary" style={{ display:'block', fontSize:13, marginTop:4 }}>{data.matched.length} of {total} required signals matched</Text>
            <div style={{ marginTop:8, height:8, background:'#e2e8f0', borderRadius:99, overflow:'hidden' }}><div style={{ width:`${data.pct}%`, height:'100%', background: data.pct>=70?'#16a34a':data.pct>=40?'#f59e0b':'#ef4444', borderRadius:99 }} /></div>
          </div>
        </div>
      </Card>

      {data.categories && Object.keys(data.categories).length>0 && (
        <Card size="small" title="Breakdown by hiring lens" style={{ marginTop:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap:12 }}>
            {Object.entries(data.categories).map(([cat, d])=> d.required.length>0 && (
              <div key={cat} style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderLeft:`4px solid ${cat==='skills'||cat==='tools'?'#1e40af':cat==='soft'?'#16a34a':'#f59e0b'}`, borderRadius:8, padding:'12px' }}>
                <Text strong style={{ fontSize:14, textTransform:'capitalize' }}>{cat}: {d.matched.length}/{d.required.length} · {Math.round(d.matched.length/d.required.length*100)}%</Text>
                <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', gap:6 }}>{d.required.map(k=> <Tag key={k} color={d.matched.includes(k)?'green':'orange'} style={{ fontSize:12, padding:'2px 8px' }}>{k}</Tag>)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card size="small" title={<span><CheckCircleOutlined style={{ color:'#16a34a', marginRight:6 }}/>Green Flags — Matched ({data.matched.length})</span>} style={{ marginTop:16, borderLeft:'4px solid #16a34a' }}>
        {data.matched.length ? <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>{data.matched.map(k=> <Tag key={k} color="green" style={{ fontSize:13, padding:'4px 10px', borderRadius:99 }}>{k}</Tag>)}</div> : <Text type="secondary">No hiring signals matched — resume may be missing JD requirements</Text>}
      </Card>

      <Card size="small" title={<span><WarningOutlined style={{ color:'#ef4444', marginRight:6 }}/>Red Flags — Missing ({data.missing.length})</span>} style={{ marginTop:16, borderLeft:'4px solid #ef4444' }}>
        {data.missing.length ? <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>{data.missing.map(k=> <Tag key={k} color="red" style={{ fontSize:13, padding:'4px 10px', borderRadius:99 }}>{k}</Tag>)}</div> : <Text type="secondary" style={{ color:'#16a34a' }}>All JD hiring signals found in resume — no red flags</Text>}
      </Card>

      {data.flags && data.flags.length>0 && (
        <Card size="small" title={<span><WarningOutlined style={{ color:'#b91c1c', marginRight:6 }}/>Resume Integrity — Red Flags ({data.flags.length})</span>} style={{ marginTop:16, borderLeft:'4px solid #b91c1c', background:'#fef2f2' }}>
          <Text type="secondary" style={{ fontSize:12, display:'block', marginBottom:8 }}>Focus: inconsistency, concealment, inflation, verification difficulty — short flags for quick review</Text>
          <div style={{ display:'grid', gap:8 }}>
            {data.flags.map((f,i)=>(
              <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', background:'#fff', border:`1px solid ${f.severity==='high'?'#fecaca':f.severity==='medium'?'#fed7aa':'#e2e8f0'}`, borderLeft:`4px solid ${f.severity==='high'?'#ef4444':f.severity==='medium'?'#f59e0b':'#94a3b8'}`, borderRadius:8, padding:'8px 10px' }}>
                <Tag color={f.severity==='high'?'red':f.severity==='medium'?'orange':'default'} style={{ marginTop:2, fontSize:11 }}>{f.severity.toUpperCase()}</Tag>
                <div style={{ flex:1 }}>
                  <Text strong style={{ fontSize:13, color:'#1e293b' }}>{f.label}</Text>
                  <Text style={{ fontSize:12, display:'block', color:'#475569', marginTop:2 }}>{f.short}</Text>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ marginTop:16, textAlign:'center' }}><Link to={`/scores/${id}`}><Button type="primary">Back to Scorecard</Button></Link></div>
    </div>
  );
}
