import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import {
  Typography, Form, Input, Card, Button, DatePicker, Checkbox,
  Space, message, Tag, Progress, Tabs, Select, Upload, Modal,
} from 'antd';
import { Link, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { UploadOutlined, FileTextOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { api } from '../../services/api';
import { badge, colorFor } from '../../scoreLabels';
import NumerologyTab from './numerology/NumerologyTab';

const { Title, Text } = Typography;

const SCORE_LABELS = ['', 'Very Poor', 'Poor', 'Average', 'Good', 'Excellent'];

export default function ScorePage() {
  const { id } = useParams();
  const [form] = Form.useForm();
  const [parameters, setParameters] = useState([]);
  const [liveScores, setLiveScores] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [capability, setCapability] = useState(null);
  const [jds, setJds] = useState([]);
  const [capLoading, setCapLoading] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [selectedJd, setSelectedJd] = useState(null);
  const [jdText, setJdText] = useState(null);
  const [resumeText, setResumeText] = useState(null);

  const totalWeight = parameters.reduce((a, p) => a + p.weightage, 0);
  const weightedPct = Math.round(
    parameters.reduce((acc, p) => acc + ((liveScores[p.id] || 0) / 5) * p.weightage, 0)
  );
  const graphRef = useRef(null);
  const [polyPoints, setPolyPoints] = useState('');
  useLayoutEffect(() => {
    function redraw() {
      if (!graphRef.current) return;
      const rect = graphRef.current.getBoundingClientRect();
      const pts = [];
      parameters.forEach(p => {
        const s = liveScores[p.id];
        if (!s) return;
        const el = graphRef.current.querySelector(`[data-param="${p.id}"] .dot-active`);
        if (!el) return;
        const r = el.getBoundingClientRect();
        pts.push(`${r.left + r.width/2 - rect.left},${r.top + r.height/2 - rect.top}`);
      });
      setPolyPoints(pts.join(' '));
    }
    redraw();
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, [liveScores, parameters]);

  async function fetchCapability() {
    try { const c = await api.get(`/api/admin/employees/${id}/capability-match`); setCapability(c); } catch (e) { setCapability(null); }
  }
  useEffect(() => {
    (async () => {
      try {
        const [params, sc] = await Promise.all([
          api.get('/api/admin/parameters'),
          api.get(`/api/admin/employees/${id}/scorecard`),
        ]);
        setParameters(params);
        const data = sc.scorecard;
        if (data) {
          form.setFieldsValue({
            applicant_name: data.applicant_name,
            email: data.email,
            client: data.client,
            position: data.position,
            jd_shared: !!data.jd_shared,
            jd_shared_date: data.jd_shared_date ? dayjs(data.jd_shared_date) : undefined,
            remarks: data.remarks,
          });
          const scores = {};
          const scoreFields = {};
          sc.scores.forEach(s => { scores[s.parameter_id] = s.score; scoreFields[`score_${s.parameter_id}`] = s.score; });
          setLiveScores(scores);
          if (Object.keys(scoreFields).length) form.setFieldsValue(scoreFields);
        }
        api.get('/api/admin/job-descriptions').then(setJds).catch(()=>{});
        fetchCapability();
      } catch (e) {
        message.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleResumeUpload() {
    if (!resumeFile) return message.warning('Select a PDF/DOCX first');
    setCapLoading(true);
    try {
      const fd = new FormData();
      fd.append('resume', resumeFile);
      if (selectedJd) fd.append('job_description_id', selectedJd);
      await api.post(`/api/admin/employees/${id}/resume`, fd);
      message.success('Resume uploaded — match recomputed');
      setResumeFile(null);
      fetchCapability();
    } catch (e) { message.error(e.message); } finally { setCapLoading(false); }
  }

  async function handleAutoRate() {
    setCapLoading(true);
    try {
      const fd = new FormData();
      if (resumeFile) fd.append('resume', resumeFile);
      if (selectedJd) fd.append('job_description_id', selectedJd);
      const pos = form.getFieldValue('position');
      if (pos) fd.append('position', pos);
      const resp = await api.post(`/api/admin/employees/${id}/auto-rate`, fd);
      message.success(`Auto-rated 23 parameters from JD/Resume (match ${resp.capability_match_pct}%) — review and adjust below`);
      const sc = await api.get(`/api/admin/employees/${id}/scorecard`);
      const scores = {}; const scoreFields = {};
      sc.scores.forEach(s => { scores[s.parameter_id] = s.score; scoreFields[`score_${s.parameter_id}`] = s.score; });
      setLiveScores(scores);
      form.setFieldsValue(scoreFields);
      fetchCapability();
    } catch (e) { message.error(e.message); } finally { setCapLoading(false); }
  }

  function showRequiredPopup(missing) {
    Modal.warning({
      title: 'Required fields missing',
      content: `Please fill the important columns before saving: ${missing.join(', ')} is required.`,
      okText: 'OK',
      centered: true,
    });
  }
  async function onFinish(values) {
    const missingCols = [];
    if (!values.applicant_name || !String(values.applicant_name).trim()) missingCols.push('Applicant Name *');
    if (!values.email || !String(values.email).trim()) missingCols.push('Email *');
    if (!values.client || !String(values.client).trim()) missingCols.push('Client *');
    if (missingCols.length) { showRequiredPopup(missingCols); return; }
    setSaving(true);
    try {
      const scores = parameters.map(p => {
        let v = Number(values[`score_${p.id}`]);
        if (!v || v < 1) v = 3;
        if (v > 5) v = 5;
        return { parameter_id: p.id, score: Math.round(v) };
      });
      const missing = parameters.filter(p => !values[`score_${p.id}`]);
      if (missing.length > 0) {
        message.warning(`You left ${missing.length} parameter(s) unrated — defaulting to 3 (Average). Please adjust if needed.`);
      }
      await api.post(`/api/admin/employees/${id}/scorecard`, JSON.stringify({
        applicant_name: values.applicant_name,
        email: values.email,
        client: values.client,
        position: values.position,
        jd_shared: values.jd_shared ? 1 : 0,
        jd_shared_date: values.jd_shared_date ? dayjs(values.jd_shared_date).format('YYYY-MM-DD') : null,
        remarks: values.remarks,
        scores,
      }));
      message.success('Scorecard saved successfully!');
    } catch (e) {
      message.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const b = badge(weightedPct);
  const [activeTab, setActiveTab] = useState('scorecard');

  const applicantName = Form.useWatch('applicant_name', form) || 'Applicant';
  return (
    <div className={`score-page tab-crossfade ${activeTab === 'inner' ? 'mode-inner' : 'score-ledger'}`}>
      {activeTab === 'scorecard' && (
        <div className="score-top">
          <div className="container">
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <Link to="/scores"><Button className="btn-back" style={{ background:'#fff', color:'#2563eb', border:'1px solid #cbd5e1', padding:'6px 12px' }}>‹ Back</Button></Link>
              <Title level={4} style={{ margin:0, fontSize:18, color:'#1e293b' }}>Score: {applicantName}</Title>
            </div>
            <span className="score-badge" style={{ borderColor: b.color, color: b.color, background:'#fff', fontSize:12 }}>{weightedPct}% — {b.label}</span>
          </div>
        </div>
      )}
      {activeTab === 'inner' && (
        <div className="score-top">
          <div className="container">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Link to="/scores"><Button size="small" style={{ background:'#fff', borderColor:'#e2e8f0', color:'#1e293b' }}>Back to List</Button></Link>
              <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => setActiveTab('scorecard')} style={{ background:'#fff', borderColor:'#e2e8f0', color:'#1e293b' }}>Back to Scorecard</Button>
              <Title level={4} style={{ margin: 0, fontFamily:'Inter, sans-serif', color:'#1e293b', fontWeight:700 }}>Score: {applicantName}</Title>
            </div>
            <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color:'#64748b' }}>Candidate Insight</span>
          </div>
        </div>
      )}

      <Tabs
        className="ii-tabs"
        activeKey={activeTab}
        onChange={setActiveTab}
        tabBarGutter={24}
        renderTabBar={(props, DefaultTabBar) =>
          activeTab === 'inner' ? null : (
            <div className="tabs-row">
              <div className="container">
                <DefaultTabBar {...props} />
              </div>
            </div>
          )
        }
        items={[
          {
            key: 'scorecard',
            label: 'Scorecard',
            children: (
              <div className="page">
              <div className="score-ledger">
              <Form form={form} layout="vertical" onFinish={onFinish} onFinishFailed={({ errorFields })=>{
                const map={applicant_name:'Applicant Name *',email:'Email *',client:'Client *'};
                const miss = errorFields.filter(f=> ['applicant_name','email','client'].includes(f.name[0])).map(f=> map[f.name[0]]);
                if(miss.length) showRequiredPopup(miss);
              }} disabled={loading}>
        <div className="card form-card">
          <div className="card-title">Applicant Details</div>
          <div className="form-grid-2">
            <div className="field"><label><span className="required">*</span> Applicant Name</label><Form.Item name="applicant_name" noStyle rules={[{ required: true, message: 'Required' }]}><Input placeholder="Haroon Ali Khan" /></Form.Item></div>
            <div className="field"><label><span className="required">*</span> Email</label><Form.Item name="email" noStyle rules={[{ required: true, message: 'Email is required' },{ type: 'email', message: 'Valid email' }]}><Input placeholder="hkhanscorecard.com" /></Form.Item></div>
            <div className="field"><label><span className="required">*</span> Client</label><Form.Item name="client" noStyle rules={[{ required: true, message: 'Client is required' }]}><Input placeholder="Suez" /></Form.Item></div>
            <div className="field"><label>Position</label><Form.Item name="position" noStyle><Input placeholder="Financial Analyst" /></Form.Item></div>
          </div>
          <div style={{ padding:'0 20px', display:'flex', alignItems:'center', gap:16, marginTop:12, flexWrap:'wrap' }}>
            <Form.Item name="jd_shared" valuePropName="checked" noStyle><Checkbox>Yes, job Description was shared</Checkbox></Form.Item>
            <Form.Item name="jd_shared_date" noStyle><DatePicker placeholder="2025-08-03" style={{ width: 140 }} /></Form.Item>
          </div>
        </div>

        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} />
        </Form.Item>

        <Card size="small" title={<span><FileTextOutlined /> Capability Match — JD ↔ Resume <Text type="secondary" style={{ fontSize:10, marginLeft:6 }}>hiring signals only</Text></span>} style={{ marginBottom: 16, background: '#fff', border: capability && capability.pct != null ? '1px solid #bfdbfe' : undefined }} extra={<Tag color={capability && capability.pct != null ? capability.pct >= 70 ? 'green' : capability.pct >= 40 ? 'orange' : 'red' : 'default'} style={{ fontSize:13 }}>{capability && capability.pct != null ? `${capability.pct}%` : 'No match yet'}</Tag>}>
          <div style={{ fontSize: 13, color: '#475569', marginBottom: 8, fontWeight:500 }}>Assistive — hiring-relevant signals (Technical, Soft, Other) from JD checked in resume.</div>
          {capability && capability.pct != null ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
                <Progress type="circle" size={56} percent={capability.pct} strokeColor={capability.pct >= 70 ? '#22c55e' : capability.pct >= 40 ? '#f59e0b' : '#ef4444'} />
                <div style={{ flex: 1 }}>
                  <Text strong style={{ fontSize:14 }}>{capability.pct}% hiring signals found in resume ({capability.matched.length}/{capability.matched.length+capability.missing.length})</Text>
                  <div style={{ marginTop:8 }}><Link to={`/scores/${id}/capability`}><Text strong style={{ color:'#2563eb', fontSize:14, textDecoration:'underline' }}>Click to view detailed match → green / red flags</Text></Link></div>
                </div>
              </div>
              <Space wrap style={{ marginTop:10 }}>
                <Select placeholder="Link different JD" style={{ minWidth: 220 }} allowClear value={selectedJd} onChange={setSelectedJd} options={jds.map(j => ({ value: j.id, label: `${j.title}${j.client ? ` · ${j.client}` : ''}` }))} />
                <Upload beforeUpload={file => { setResumeFile(file); return false; }} maxCount={1} accept=".pdf,.docx"><Button icon={<UploadOutlined />}>{resumeFile ? resumeFile.name : 'New resume'}</Button></Upload>
                <Button loading={capLoading} onClick={handleResumeUpload}>Re-upload & Re-match</Button>
                <Button type="primary" loading={capLoading} onClick={handleAutoRate}>Auto-rate 23 parameters</Button>
              </Space>
            </div>
          ) : (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>{capability && capability.message ? capability.message : 'Link a JD and upload a resume to see a transparent keyword match.'}</Text>
              <Space wrap style={{ marginTop: 10, width: '100%' }}>
                <Select placeholder="Select JD" style={{ minWidth: 220 }} allowClear value={selectedJd} onChange={setSelectedJd} options={jds.map(j => ({ value: j.id, label: `${j.title}${j.client ? ` · ${j.client}` : ''}` }))} />
                <Upload beforeUpload={file => { setResumeFile(file); return false; }} maxCount={1} accept=".pdf,.docx"><Button icon={<UploadOutlined />}>{resumeFile ? resumeFile.name : 'Select resume PDF/DOCX'}</Button></Upload>
                <Button loading={capLoading} onClick={handleResumeUpload}>Upload & Match</Button>
                <Button type="primary" loading={capLoading} onClick={handleAutoRate}>Auto-rate 23 parameters</Button>
              </Space>
              <div style={{ fontSize: 10, color: '#9aa0a6', marginTop: 6 }}>Auto-rate will create editable 1-5 suggestions from JD + resume + role. Nothing is final until you hit Save.</div>
            </div>
          )}
        </Card>

        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div className="card-title" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span>Score Parameters <span style={{ fontWeight:400, fontSize:11, color:'#94a3b8', marginLeft:8 }}>Weight = this parameter's share of the total score</span></span>
            <span className="score-badge" style={{ borderColor: b.color, color: b.color, background: b.color === '#ef4444' ? '#fee2e2' : b.color === '#f59e0b' ? '#fef3c7' : b.color === '#16a34a' ? '#dcfce7' : '#dbeafe' }}>{weightedPct}% — {b.label}</span>
          </div>
          <div className="param-header-row">
            <span>PARAMETER</span><span>WEIGHT</span><span>SCORE (click to select)</span><span>WEIGHTED</span>
          </div>
          <div ref={graphRef} style={{ position:'relative', overflow:'hidden', isolation:'isolate' }}>
            <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:0, overflow:'hidden' }}>
              <polyline points={polyPoints} fill="none" stroke="#60a5fa" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.95" />
            </svg>
            {parameters.map(p => {
              const s = liveScores[p.id] || 0;
              const contribution = Math.round((s / 5) * p.weightage * 10) / 10;
              const wColor = p.weightage >= 6 ? 'w3' : p.weightage >= 4 ? 'w2' : 'w1';
              return (
                <div key={p.id} className="param-row" data-param={p.id} style={{ position:'relative', zIndex:1 }}>
                  <div className="param-name-col"><span className="param-name">{p.name}</span><span className="param-desc-sm" style={{ fontSize:11, color:'#94a3b8' }}>{p.description || ''}</span></div>
                  <span className={`w-chip ${wColor}`}>{p.weightage}%</span>
                  <div className="score-dots-row" style={{ position:'relative' }}>
                    {[1,2,3,4,5].map(n=>(
                      <button key={n} type="button" className={`dot-btn ${s===n ? 'dot-active' : ''}`} onClick={()=>{ setLiveScores(prev=>({...prev,[p.id]:n})); form.setFieldsValue({[`score_${p.id}`]:n}); }}>{n}</button>
                    ))}
                    <span className="score-label">{s ? `${s}/5` : '0/5'}</span>
                    <Form.Item name={`score_${p.id}`} hidden><Input type="hidden" /></Form.Item>
                  </div>
                  <span className="wtd-col" style={{ fontWeight:600 }}>{contribution}</span>
                </div>
              );
            })}
          </div>
          <div className="total-row-bar">
            <span>Weighted Total</span>
            <div className="total-bar-wrap">
              <div className="total-bar"><div className="total-fill" style={{ width: `${weightedPct}%`, background: colorFor(weightedPct) }} /></div>
              <span className="total-label" style={{ color: colorFor(weightedPct) }}>{weightedPct}%</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding:20 }}>
          <div className="field"><label>Remarks</label><Form.Item name="remarks" noStyle><Input.TextArea rows={3} placeholder="Add any notes or observations..." /></Form.Item></div>
        </div>

        <div className="form-actions">
          <Link to="/scores"><Button className="btn-outline">Cancel</Button></Link>
          <Button type="primary" htmlType="submit" loading={saving} className="btn-primary">Save Scorecard</Button>
        </div>
      </Form>
              </div>
              </div>
            )
            },
            {
              key: 'inner',
              label: 'Inner Intelligence',
              children: <div className="ii-panel"><NumerologyTab employeeId={id} /></div>,
            },
          ]}
        />
    </div>
  );
}