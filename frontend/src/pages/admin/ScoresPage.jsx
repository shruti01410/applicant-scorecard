import React, { useEffect, useState, useRef } from 'react';
import {
  Typography, Table, Button, Input, Space, Tag, Modal, Form, message, Card, Select, Upload, Popconfirm, Segmented, Dropdown, DatePicker,
} from 'antd';
import { Link } from 'react-router-dom';
import { UploadOutlined, PlusOutlined, FileTextOutlined, StarOutlined, StarFilled, DeleteOutlined, InboxOutlined, UndoOutlined } from '@ant-design/icons';
import { api } from '../../services/api';
import { badge } from '../../scoreLabels';
import { validateResumeFileClient } from '../../services/resumeCheck';

const { Title } = Typography;

function colorFor(pct) {
  if (pct == null) return '#94a3b8';
  if (pct < 30) return '#ef4444';
  if (pct < 65) return '#f59e0b';
  if (pct < 80) return '#2563eb';
  return '#16a34a';
}
function WeightedBar({ v }) {
  if (v == null) return <span className="muted">—</span>;
  const color = colorFor(v);
  return (
    <span className="score-col" style={{ display:'flex', alignItems:'center', gap:8 }}>
      <span className="mini-bar" style={{ width:80, height:6, background:'#e2e8f0', borderRadius:99, overflow:'hidden', display:'inline-block' }}><span className="mini-fill" style={{ width: `${v}%`, backgroundColor: color, height:'100%', display:'block', borderRadius:99 }} /></span>
      <span className="score-pct" style={{ color, fontWeight:600, fontSize:12 }}>{v}%</span>
    </span>
  );
}

export default function ScoresPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [importing, setImporting] = useState(false);
  const [jds, setJds] = useState([]);
  const fileRef = useRef(null);

  async function fetchRows() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filter === 'favorites') params.set('favorite', '1');
      if (filter === 'archived') params.set('archived', '1');
      const q = params.toString() ? `?${params.toString()}` : '';
      const data = await api.get(`/api/admin/employees${q}`);
      setRows(data);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRows(); }, [search, filter]);
  useEffect(() => {
    if (addOpen) api.get('/api/admin/job-descriptions').then(setJds).catch(() => {});
  }, [addOpen]);

  function badgeFor(v) {
    const b = badge(v);
    return <Tag color={b.color} style={{ color: b.color, borderColor: b.color }}>{v == null ? 'Not scored' : `${v}% — ${b.label}`}</Tag>;
  }

  async function toggleFav(id) {
    try { await api.patch(`/api/admin/employees/${id}/favorite`); fetchRows(); } catch (e) { message.error(e.message); }
  }
  async function toggleArchive(id) {
    try { await api.patch(`/api/admin/employees/${id}/archive`); message.success('Archived status toggled'); fetchRows(); } catch (e) { message.error(e.message); }
  }
  async function handleDelete(id) {
    try { await api.delete(`/api/admin/employees/${id}`); message.success('Candidate deleted'); fetchRows(); } catch (e) { message.error(e.message); }
  }

  const columns = [
    { title: '', width: 40, render: (_, row) => <Button type="text" size="small" icon={row.is_favorite ? <StarFilled style={{ color: '#f59e0b' }} /> : <StarOutlined />} onClick={() => toggleFav(row.id)} /> },
    { title: '#', render: (_, __, i) => i + 1, width: 40 },
    {
      title: 'Employee',
      dataIndex: 'applicant_name',
      render: (v, row) => <><Link to={`/scores/${row.id}`}>{v}</Link>{row.is_archived && <Tag color="default" style={{ marginLeft: 6 }}>Archived</Tag>}</>,
    },
    { title: 'Client', dataIndex: 'client', render: v => v || '—' },
    { title: 'Position', dataIndex: 'position', render: v => v || '—' },
    { title: 'Weighted Score', dataIndex: 'weighted_pct', render: v => badgeFor(v) },
    { title: 'JD Match', dataIndex: 'capability_match_pct', render: v => v == null ? <Tag>—</Tag> : <Tag color={v >= 70 ? 'green' : v >= 40 ? 'orange' : 'red'}>{v}%</Tag> },
    {
      title: 'Action',
      width: 220,
      render: (_, row) => (
        <Space>
          <Link to={`/scores/${row.id}`}><Button size="small" type="primary">{row.scorecard_id ? 'Edit Score' : 'Score Now'}</Button></Link>
          <Button size="small" icon={row.is_archived ? <UndoOutlined /> : <InboxOutlined />} onClick={() => toggleArchive(row.id)}>{row.is_archived ? 'Unarchive' : 'Archive'}</Button>
          <Popconfirm title="Delete candidate?" description="This removes scorecard and numerology data. Cannot be undone." okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => handleDelete(row.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      ),
    },
  ];

  async function onAddCandidates(values) {
    try {
      const hasResume = values.resume && values.resume.fileList && values.resume.fileList[0];
      const hasJdFile = values.jd_file && values.jd_file.fileList && values.jd_file.fileList[0];
      const dobIso = values.date_of_birth ? values.date_of_birth.format('YYYY-MM-DD') : '';
      let resp;
      if (hasResume || hasJdFile) {
        const fd = new FormData();
        fd.append('name', values.name);
        fd.append('email', values.email);
        fd.append('date_of_birth', dobIso);
        if (values.job_description_id) fd.append('job_description_id', values.job_description_id);
        if (values.position) fd.append('position', values.position);
        if (values.client) fd.append('client', values.client);
        if (hasResume) fd.append('resume', values.resume.fileList[0].originFileObj);
        if (hasJdFile) fd.append('jd_file', values.jd_file.fileList[0].originFileObj);
        resp = await api.post('/api/admin/employees', fd);
      } else {
        resp = await api.post('/api/admin/employees', JSON.stringify({ name: values.name, email: values.email, date_of_birth: dobIso, job_description_id: values.job_description_id || null, position: values.position || null, client: values.client || null }));
      }
      if (resp && resp.auto_rated) message.success(`Candidate added — 23 parameters auto-rated from JD/Resume (match ${resp.capability_match_pct}%)`);
      else message.success('Candidate added');
      setAddOpen(false);
      addForm.resetFields();
      fetchRows();
    } catch (e) {
      message.error(e.message);
    }
  }

  async function handleFile(file) {
    const fd = new FormData();
    fd.append('file', file);
    setImporting(true);
    try {
      const resp = await api.post('/api/admin/upload-excel', fd);
      message.success(resp.message || 'Import complete');
      fetchRows();
    } catch (e) {
      message.error(e.message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const paged = rows.slice((page-1)*pageSize, page*pageSize);
  useEffect(()=>{ setPage(1); },[search]);

  return (
    <div>
      <div className="page-header" style={{ marginBottom:16 }}>
        <div>
          <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:'#1e293b' }}>Employee Scorecards</h2>
          <div className="sub" style={{ fontSize:12, color:'#64748b' }}>{rows.length} employees — page {page} of {totalPages}</div>
        </div>
        <div className="header-actions">
          <input type="file" accept=".xlsx,.xls" hidden ref={fileRef} onChange={e=>{ const f=e.target.files&&e.target.files[0]; if(f) handleFile(f); }} />
          <button className="btn-secondary" onClick={()=>fileRef.current&&fileRef.current.click()} disabled={importing}><span style={{ marginRight:6 }}>📄</span>{importing ? 'Processing…' : 'Import from Excel'}</button>
          <button className="btn-primary" onClick={()=>setAddOpen(true)}>+ Add Candidate</button>
        </div>
      </div>

      <div style={{ marginBottom:12 }}>
        <Segmented value={filter} onChange={v=>{ setFilter(v); setPage(1); }} options={[{label:'All',value:'all'},{label:'★ Favorites',value:'favorites'},{label:'Archived',value:'archived'}]} />
      </div>
      <div className="search-bar-wrap">
        <span className="search-icon">⌕</span>
        <input className="search-input" placeholder="Search by employee, client or position..." value={search} onChange={e=>setSearch(e.target.value)} />
        {search && <button className="search-clear" onClick={()=>setSearch('')}>✕</button>}
      </div>

      <div className="card" style={{ overflow:'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width:36 }}>#</th>
              <th>EMPLOYEE</th>
              <th>CLIENT</th>
              <th>POSITION</th>
              <th>WEIGHTED SCORE</th>
              <th style={{ width:110 }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ textAlign:'center', padding:24, color:'#94a3b8' }}>Loading…</td></tr>
            : paged.length===0 ? <tr><td colSpan={6} style={{ textAlign:'center', padding:32, color:'#94a3b8' }}>No employees found</td></tr>
            : paged.map((row,i)=>(
              <tr key={row.id} style={{ opacity: row.is_archived ? 0.6 : 1, background: row.is_favorite ? '#fffbeb' : undefined }}>
                <td className="td-num">{(page-1)*pageSize + i + 1}</td>
                <td>
                  <div className="emp-name" style={{ color:'#1e293b', fontWeight:600 }}><Link to={`/scores/${row.id}`} style={{ color:'#1e293b', textDecoration:'none' }}>{row.applicant_name}</Link> {row.is_favorite && <StarFilled style={{ color:'#f59e0b', fontSize:11, marginLeft:4 }}/>} {row.is_archived && <Tag style={{ marginLeft:6, fontSize:10 }}>Archived</Tag>}</div>
                  <div className="emp-email">{row.email}</div>
                </td>
                <td style={{ fontSize:13, color:'#334155' }}>{row.client || '—'}</td>
                <td style={{ fontSize:13, color:'#334155' }}>{row.position || '—'}</td>
                <td><WeightedBar v={row.weighted_pct} /></td>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <Link to={`/scores/${row.id}`}><button className={row.scorecard_id ? 'btn-edit' : 'btn-score'}>{row.scorecard_id ? 'Edit Score' : 'Score Now'}</button></Link>
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: [
                          { key:'fav', label: row.is_favorite ? '★ Remove from Favorites' : '☆ Add to Favorites', onClick:()=>toggleFav(row.id) },
                          { key:'arch', label: row.is_archived ? '↩ Unarchive' : '📥 Archive', onClick:()=>toggleArchive(row.id) },
                          { key:'del', label: 'Delete', danger:true, onClick:()=>{ if(confirm('Delete candidate? Removes scorecard & numerology. Cannot be undone.')) handleDelete(row.id); } },
                        ]
                      }}
                      placement="bottomRight"
                    >
                      <button style={{ background:'none', border:'none', cursor:'pointer', color:'#ef4444', fontSize:18, lineHeight:1, padding:'2px 6px' }} title="More">⋮</button>
                    </Dropdown>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pagination-box">
          <ul className="pagination">
            <li className={`pg-item ${page===1?'pg-disabled':''}`}><button className="pg-link pg-nav" disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹ Prev</button></li>
            {Array.from({length:totalPages},(_,k)=>k+1).map(n=>(
              <li key={n} className={`pg-item ${n===page?'pg-active':''}`}><button className="pg-link" onClick={()=>setPage(n)}>{n}</button></li>
            ))}
            <li className={`pg-item ${page===totalPages?'pg-disabled':''}`}><button className="pg-link pg-nav" disabled={page===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next ›</button></li>
          </ul>
        </div>
      </div>

      <Modal title="Add Candidate" open={addOpen} onCancel={() => setAddOpen(false)} footer={null} width={560} className="add-candidate-modal">
        <Form form={addForm} layout="vertical" onFinish={onAddCandidates}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}><Input placeholder="Full name" /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Valid email required' }]}><Input placeholder="Email" /></Form.Item>
          <Form.Item name="date_of_birth" label="Date of Birth *" rules={[{ required: true, message: 'Date of Birth is required.' }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="DD/MM/YYYY" disabledDate={(d) => d && d.isAfter(new Date())} /></Form.Item>
          <Form.Item name="position" label="Role / Position"><Input placeholder="Senior Accounts Payable" /></Form.Item>
          <Form.Item name="client" label="Client"><Input placeholder="iSHR" /></Form.Item>
          <div className="upload-row">
            <div className="upload-column">
              <Form.Item name="job_description_id" label="Job Description"><Select style={{ width: '100%' }} placeholder="Select existing JD — or upload new below" allowClear options={jds.map(j => ({ value: j.id, label: `${j.title}${j.client ? ` · ${j.client}` : ''}` }))} /></Form.Item>
              <Form.Item name="jd_file" valuePropName="file"><Upload beforeUpload={() => false} maxCount={1} accept=".pdf,.docx"><Button icon={<UploadOutlined />} block>Select JD file</Button></Upload></Form.Item>
            </div>
            <div className="upload-column">
              <Form.Item name="resume" label="Resume (PDF/DOC/DOCX, 10MB)" valuePropName="file"><Upload beforeUpload={(file) => { const r = validateResumeFileClient(file); if (!r.ok) { message.error(r.message); return Upload.LIST_IGNORE; } return false; }} maxCount={1} accept=".pdf,.doc,.docx"><Button icon={<UploadOutlined />} block>Select resume file</Button></Upload></Form.Item>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#9aa0a6', marginBottom: 12 }}><FileTextOutlined /> Upload JD + resume to calculate Capability Match and auto-rate parameters.</div>
          <Button type="primary" htmlType="submit" block>Add Candidate</Button>
        </Form>
      </Modal>
    </div>
  );
}
