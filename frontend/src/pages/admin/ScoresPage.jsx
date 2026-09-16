import React, { useEffect, useState, useRef } from 'react';
import {
  Typography, Button, Input, Tag, Modal, Form, message, Select, Upload, Segmented, Dropdown, DatePicker,
} from 'antd';
import { Link } from 'react-router-dom';
import { UploadOutlined, FileTextOutlined, StarFilled, PlusOutlined } from '@ant-design/icons';
import { api } from '../../services/api';
import { badge } from '../../scoreLabels';
import { validateResumeFileClient } from '../../services/resumeCheck';
import ResumeIntegrity from '../../components/ResumeIntegrity';
import CompareCandidates from '../../components/CompareCandidates';
import FilterPanel from '../../components/FilterPanel';
import SortFilterDrawer from '../../components/SortFilterDrawer';

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
  const [integrityOpen, setIntegrityOpen] = useState(false);
  const [integrityData, setIntegrityData] = useState(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [integrityEmpId, setIntegrityEmpId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [advancedFilters, setAdvancedFilters] = useState(null);
  const [jdsList, setJdsList] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [addCompanyOpen, setAddCompanyOpen] = useState(false);
  const [addCompanyForm] = Form.useForm();

  function applyAdvancedFilters(f) {
    setAdvancedFilters(f);
    setPage(1);
  }

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
    if (addOpen) {
      api.get('/api/admin/job-descriptions').then(setJds).catch(() => {});
      api.get('/api/admin/companies').then(d => setCompanies(Array.isArray(d) ? d : d ? [d] : [])).catch(() => {});
    }
    api.get('/api/admin/job-descriptions').then(setJdsList).catch(() => {});
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

  async function handleIntegrityCheck(id) {
    setIntegrityEmpId(id);
    setIntegrityLoading(true);
    setIntegrityOpen(true);
    try {
      const data = await api.get(`/api/admin/employees/${id}/integrity-check`);
      setIntegrityData(data);
    } catch (e) {
      message.error(e.message);
      setIntegrityData(null);
    } finally {
      setIntegrityLoading(false);
    }
  }

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
        if (values.company_id) fd.append('company_id', values.company_id);
        if (hasResume) fd.append('resume', values.resume.fileList[0].originFileObj);
        if (hasJdFile) fd.append('jd_file', values.jd_file.fileList[0].originFileObj);
        resp = await api.post('/api/admin/employees', fd);
      } else {
        resp = await api.post('/api/admin/employees', JSON.stringify({ name: values.name, email: values.email, date_of_birth: dobIso, job_description_id: values.job_description_id || null, position: values.position || null, client: values.client || null, company_id: values.company_id || null }));
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

  async function onAddCompany(values) {
    try {
      const payload = {
        client_name: values.company_name,
        founded_year: values.founded_year ? values.founded_year.year() : null,
        brand_name: values.brand_name || values.company_name,
        founder_name: values.founder_name || 'Unknown',
      };
      const resp = await api.post('/api/admin/companies', JSON.stringify(payload));
      message.success('Company added');
      setAddCompanyOpen(false);
      addCompanyForm.resetFields();
      const list = await api.get('/api/admin/companies');
      setCompanies(Array.isArray(list) ? list : list ? [list] : []);
      if (resp && resp.id) addForm.setFieldsValue({ company_id: resp.id });
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

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }
  function sortIcon(key) {
    if (sortKey !== key) return <span style={{ opacity:0.3, marginLeft:4 }}>⇅</span>;
    return <span style={{ marginLeft:4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const filtered = [...rows].filter(r => {
    if (!advancedFilters) return true;
    const { scoreRange, experience, evaluation, jd } = advancedFilters;
    if (jd && jd.length > 0 && !jd.some(j => r.position && r.position.toLowerCase().includes(j.toLowerCase().split(' · ')[0].toLowerCase()) || r.client && r.client.toLowerCase().includes(j.toLowerCase().split(' · ').pop().toLowerCase()))) return false;
    if (scoreRange && scoreRange.length > 0) {
      const pct = r.weighted_pct;
      if (pct == null) return false;
      const match = scoreRange.some(sr => {
        if (sr === '90-100 (Excellent)') return pct >= 90;
        if (sr === '80-89 (Good)') return pct >= 80 && pct < 90;
        if (sr === '70-79') return pct >= 70 && pct < 80;
        if (sr === 'Below 70') return pct < 70;
        return true;
      });
      if (!match) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let key = sortKey;
    let dir = sortDir;
    if (advancedFilters && advancedFilters.sort) {
      const map = { 'Recently added': 'id', 'Overall Score': 'weighted_pct', 'JD Match': 'capability_match_pct', 'Name': 'applicant_name' };
      key = map[advancedFilters.sort] || key;
    }
    if (advancedFilters && advancedFilters.order) {
      dir = advancedFilters.order === 'Low to high' ? 'asc' : 'desc';
    }
    if (!key) return 0;
    let av = a[key], bv = b[key];
    if (av == null) av = dir === 'asc' ? Infinity : -Infinity;
    if (bv == null) bv = dir === 'asc' ? Infinity : -Infinity;
    if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return dir === 'asc' ? av - bv : bv - av;
  });
  const paged = sorted.slice((page-1)*pageSize, page*pageSize);
  useEffect(()=>{ setPage(1); },[search, filter]);

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
          {selectedIds.size >= 2 && (
            <button className="btn-primary" style={{ background:'#3d5df0' }} onClick={()=>setCompareOpen(true)}>
              Compare ({selectedIds.size})
            </button>
          )}
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

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <SortFilterDrawer resultCount={rows.length} onApply={applyAdvancedFilters} />
      </div>

      <div className="card" style={{ overflow:'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width:36 }}>
                <input type="checkbox" checked={selectedIds.size > 0 && paged.every(r => selectedIds.has(r.id))} onChange={e => {
                  if (e.target.checked) { const next = new Set(selectedIds); paged.forEach(r => { if (next.size < 5) next.add(r.id); }); setSelectedIds(next); }
                  else { const next = new Set(selectedIds); paged.forEach(r => next.delete(r.id)); setSelectedIds(next); }
                }} />
              </th>
              <th style={{ width:36 }}>#</th>
              <th style={{ cursor:'pointer', userSelect:'none' }} onClick={()=>toggleSort('applicant_name')}>EMPLOYEE{sortIcon('applicant_name')}</th>
              <th style={{ cursor:'pointer', userSelect:'none' }} onClick={()=>toggleSort('client')}>CLIENT{sortIcon('client')}</th>
              <th style={{ cursor:'pointer', userSelect:'none' }} onClick={()=>toggleSort('position')}>POSITION{sortIcon('position')}</th>
              <th style={{ cursor:'pointer', userSelect:'none' }} onClick={()=>toggleSort('weighted_pct')}>WEIGHTED SCORE{sortIcon('weighted_pct')}</th>
              <th style={{ width:110 }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ textAlign:'center', padding:24, color:'#94a3b8' }}>Loading…</td></tr>
            : paged.length===0 ? <tr><td colSpan={7} style={{ textAlign:'center', padding:32, color:'#94a3b8' }}>No employees found</td></tr>
            : paged.map((row,i)=>(
              <tr key={row.id} style={{ opacity: row.is_archived ? 0.6 : 1, background: row.is_favorite ? '#fffbeb' : selectedIds.has(row.id) ? '#eef2ff' : undefined }}>
                <td>
                  <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => {
                    const next = new Set(selectedIds);
                    if (next.has(row.id)) next.delete(row.id);
                    else if (next.size < 5) next.add(row.id);
                    else { message.warning('Maximum 5 candidates for comparison'); return; }
                    setSelectedIds(next);
                  }} />
                </td>
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
          <Form.Item name="company_id" label="Company (for Deep Parameters)">
            <Select
              placeholder="Select company"
              allowClear
              showSearch
              optionFilterProp="label"
              options={companies.map(c => ({ value: c.id, label: c.client_name }))}
              dropdownRender={(menu) => (
                <>
                  {menu}
                  <div style={{ padding: '4px 8px', borderTop: '1px solid #f0f0f0' }}>
                    <Button type="link" icon={<PlusOutlined />} size="small" onClick={() => setAddCompanyOpen(true)}>Add New Company</Button>
                  </div>
                </>
              )}
            />
          </Form.Item>
          <div style={{ fontSize: 11, color: '#9aa0a6', marginTop: -16, marginBottom: 16 }}>
            Company numerology is used for the six Deep Parameters — separate from evidence-based recruitment scores.
          </div>
          <div className="candidate-upload-grid">
            <div className="upload-column jd-column">
              <div className="upload-label jd-label">JD PDF/DOCX <span>(creates JD on the fly)</span></div>
              <Form.Item name="job_description_id" label={null} style={{ marginBottom: 12 }}><Select style={{ width: '100%' }} placeholder="Select existing JD" allowClear options={jds.map(j => ({ value: j.id, label: `${j.title}${j.client ? ` · ${j.client}` : ''}` }))} /></Form.Item>
              <Form.Item label={null}><Upload beforeUpload={() => false} maxCount={1} accept=".pdf,.docx"><Button icon={<UploadOutlined />} block>Select JD file</Button></Upload></Form.Item>
            </div>
            <div className="upload-column resume-column">
              <div className="upload-label resume-label">Resume <span>(PDF/DOC/DOCX, 10MB)</span></div>
              <Form.Item name="resume" valuePropName="file" label={null}><Upload beforeUpload={(file) => { const r = validateResumeFileClient(file); if (!r.ok) { message.error(r.message); return Upload.LIST_IGNORE; } return false; }} maxCount={1} accept=".pdf,.doc,.docx"><Button icon={<UploadOutlined />} block>Select resume file</Button></Upload></Form.Item>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#9aa0a6', marginBottom: 12 }}><FileTextOutlined /> Upload JD + resume to calculate Capability Match and auto-rate parameters.</div>
          <Button type="primary" htmlType="submit" block>Add Candidate</Button>
        </Form>
      </Modal>
      <Modal
        title="Resume Integrity Check"
        open={integrityOpen}
        onCancel={() => { setIntegrityOpen(false); setIntegrityData(null); }}
        footer={null}
        width={640}
        destroyOnClose
      >
        <ResumeIntegrity
          integrityData={integrityData}
          loading={integrityLoading}
          onCheck={() => handleIntegrityCheck(integrityEmpId)}
        />
      </Modal>
      <Modal
        title={null}
        open={compareOpen}
        onCancel={() => { setCompareOpen(false); setSelectedIds(new Set()); }}
        footer={null}
        width={960}
        destroyOnClose
        styles={{ body: { padding: 0 } }}
      >
        <CompareCandidates
          candidateIds={[...selectedIds]}
          onClose={() => { setCompareOpen(false); setSelectedIds(new Set()); }}
        />
      </Modal>
      <Modal
        title="Add New Company"
        open={addCompanyOpen}
        onCancel={() => setAddCompanyOpen(false)}
        footer={null}
        width={480}
        destroyOnClose
      >
        <Form form={addCompanyForm} layout="vertical" onFinish={onAddCompany}>
          <Form.Item name="company_name" label="Company Name *" rules={[{ required: true, message: 'Required' }]}><Input placeholder="Acme Corp" /></Form.Item>
          <Form.Item name="founded_year" label="Founded Date *" rules={[{ required: true, message: 'Required' }]}><DatePicker picker="year" style={{ width: '100%' }} placeholder="YYYY" /></Form.Item>
          <Form.Item name="brand_name" label="Brand Name"><Input placeholder="Same as company name if blank" /></Form.Item>
          <Form.Item name="founder_name" label="Founder Name"><Input placeholder="Optional" /></Form.Item>
          <div style={{ fontSize: 11, color: '#9aa0a6', marginBottom: 12 }}>
            Company numerology is used for Deep Parameters interpretation only — it does not affect evidence-based recruitment scores.
          </div>
          <Button type="primary" htmlType="submit" block>Add Company</Button>
        </Form>
      </Modal>
    </div>
  );
}
