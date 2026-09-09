import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Upload, Tag, Typography, Space, Select, message } from 'antd';
import { UploadOutlined, FileTextOutlined, DeleteOutlined, ReloadOutlined, PlusOutlined, TagsOutlined, SaveOutlined } from '@ant-design/icons';
import { api } from '../../services/api';

const { Title, Text } = Typography;

function SourceTag({ source }) {
  return source === 'USER_ADDED'
    ? <Tag color="gold" style={{ marginRight: 4, fontSize: 10, lineHeight: '16px' }}>+manual</Tag>
    : <Tag color="blue" style={{ marginRight: 4, fontSize: 10, lineHeight: '16px' }}>auto</Tag>;
}

function KeywordChip({ kw, onRemove }) {
  return (
    <Tag closable onClose={() => onRemove(kw)} color="geekblue" style={{ fontSize: 12, padding: '3px 8px' }}>
      <TagsOutlined /> {kw.keyword}
      <SourceTag source={kw.source} />
    </Tag>
  );
}

export default function JobDescriptions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);
  const [descDraft, setDescDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [form] = Form.useForm();

  async function fetchRows() {
    setLoading(true);
    try { setRows(await api.get('/api/admin/job-descriptions')); } catch (e) { message.error(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { fetchRows(); api.get('/api/admin/companies').then(setCompanies).catch(()=>{}); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jdId = params.get('jd');
    if (jdId) openView(Number(jdId));
  }, []);

  async function onCreate(values) {
    try {
      const fd = new FormData();
      fd.append('title', values.title);
      if (values.client) fd.append('client', values.client);
      if (values.company_id) fd.append('company_id', values.company_id);
      if (values.description_text) fd.append('description_text', values.description_text);
      if (values.file && values.file.fileList && values.file.fileList[0]) {
        fd.append('file', values.file.fileList[0].originFileObj);
      }
      const hasFile = values.file && values.file.fileList && values.file.fileList[0];
      if (!hasFile && !values.description_text) return message.warning('Paste JD text or upload a file');
      if (hasFile || values.company_id) {
        await api.post('/api/admin/job-descriptions', fd);
      } else {
        await api.post('/api/admin/job-descriptions', JSON.stringify({ title: values.title, client: values.client, company_id: values.company_id, description_text: values.description_text }));
      }
      message.success('Job description created — keywords extracted');
      setOpen(false);
      form.resetFields();
      fetchRows();
    } catch (e) { message.error(e.message); }
  }

  async function openView(id) {
    try {
      const data = await api.get(`/api/admin/job-descriptions/${id}`);
      setView(data);
      setDescDraft(data.description_text);
    } catch (e) { message.error(e.message); }
  }

  async function refreshKeywords(data) {
    if (!view || !view.id) return;
    setView({ ...view, keywords: data.keywords });
  }

  async function removeKeyword(kw) {
    if (busy) return;
    setBusy(true);
    try {
      const data = await api.delete(`/api/admin/job-descriptions/${view.id}/keywords/${kw.id}`);
      await refreshKeywords(data);
      message.success(`Removed "${kw.keyword}"`);
      fetchRows();
    } catch (e) { message.error(e.message); } finally { setBusy(false); }
  }

  async function addKeyword(values) {
    if (busy) return;
    setBusy(true);
    try {
      const data = await api.post(`/api/admin/job-descriptions/${view.id}/keywords`, { keyword: values.keyword, mode: values.mode || 'required' });
      await refreshKeywords(data);
      message.success(`Added "${values.keyword}"`);
      fetchRows();
    } catch (e) { message.error(e.message); } finally { setBusy(false); }
  }

  async function resetKeywords() {
    if (busy) return;
    setBusy(true);
    try {
      const data = await api.post(`/api/admin/job-descriptions/${view.id}/keywords/reset`, {});
      await refreshKeywords(data);
      message.success('Restored automatically extracted keywords');
      fetchRows();
    } catch (e) { message.error(e.message); } finally { setBusy(false); }
  }

  async function saveText() {
    if (busy) return;
    setBusy(true);
    try {
      await api.put(`/api/admin/job-descriptions/${view.id}`, {
        title: view.title,
        client: view.client,
        company_id: view.company_id,
        description_text: descDraft,
      });
      const data = await api.get(`/api/admin/job-descriptions/${view.id}`);
      setView(data);
      setDescDraft(data.description_text);
      message.success('JD text saved — newly extracted keywords were added to the set');
      fetchRows();
    } catch (e) { message.error(e.message); } finally { setBusy(false); }
  }

  const activeKeywords = (view?.keywords || []).filter(k => k.is_active);
  const required = activeKeywords.filter(k => k.mode === 'required');
  const preferred = activeKeywords.filter(k => k.mode === 'preferred');

  const columns = [
    { title: 'Title', dataIndex: 'title', render: (v, r) => <a onClick={() => openView(r.id)}>{v}</a> },
    { title: 'Client', dataIndex: 'client', render: v => v || '—' },
    { title: 'Company', dataIndex: 'company_id', render: v => v ? `Company #${v}` : '—' },
    { title: 'Active keywords', dataIndex: 'keyword_count', render: v => <Tag color={v ? 'geekblue' : 'default'}>{v || 0}</Tag> },
    { title: 'Created', dataIndex: 'created_at', render: v => v ? new Date(v).toLocaleDateString() : '—' },
    { title: 'Action', render: (_, r) => <Button size="small" onClick={() => openView(r.id)}>Edit keywords</Button> },
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}><FileTextOutlined /> Job Descriptions</Title>
        <Button type="primary" onClick={() => setOpen(true)}>+ Add JD</Button>
      </div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
        Editable JD Intelligence — edit the JD text or the keyword set itself. Keywords are extracted from the JD, you can add / remove them, and the active set is what resume comparison uses.
      </Text>
      <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 10 }} />

      <Modal title="Add Job Description" open={open} onCancel={() => setOpen(false)} footer={null} width={640}>
        <Form form={form} layout="vertical" onFinish={onCreate}>
          <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Required' }]}><Input placeholder="Senior Accounts Payable" /></Form.Item>
          <Form.Item name="client" label="Client"><Input placeholder="iSHR" /></Form.Item>
          <Form.Item name="company_id" label="Company (for echo comparison)"><Select placeholder="Select company — optional" allowClear options={companies.map(c => ({ value: c.id, label: `${c.client_name} (${c.founded_year})` }))} /></Form.Item>
          <Form.Item name="description_text" label="JD Text (paste)"><Input.TextArea rows={6} placeholder="Paste full JD body here — or upload a file below" /></Form.Item>
          <Form.Item name="file" label="Or upload PDF/DOCX (10MB max)" valuePropName="file"><Upload beforeUpload={() => false} maxCount={1} accept=".pdf,.docx"><Button icon={<UploadOutlined />}>Select file</Button></Upload></Form.Item>
          <Button type="primary" htmlType="submit" block>Add JD</Button>
        </Form>
      </Modal>

      <Modal title={view ? `JD Intelligence — ${view.title}` : 'JD'} open={!!view} onCancel={() => setView(null)} footer={null} width={760}>
        {view && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Text type="secondary">Client: </Text><Tag>{view.client || '—'}</Tag>
              {view.company_id && <Tag color="blue">Company #{view.company_id}</Tag>}
              <Text type="secondary" style={{ marginLeft: 8 }}>{view.created_at}</Text>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
              <Text strong>Required keywords ({required.length})</Text> <Text type="secondary" style={{ fontSize: 11 }}>— what resume comparison checks first</Text>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {required.length === 0 && <Text type="secondary">None</Text>}
                {required.map(kw => <KeywordChip key={kw.id} kw={kw} onRemove={removeKeyword} />)}
              </div>
            </div>

            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 12 }}>
              <Text strong style={{ color: '#92400e' }}>Preferred keywords ({preferred.length})</Text>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {preferred.length === 0 && <Text type="secondary">None</Text>}
                {preferred.map(kw => <KeywordChip key={kw.id} kw={kw} onRemove={removeKeyword} />)}
              </div>
            </div>

            <Form layout="inline" onFinish={addKeyword} style={{ gap: 8, rowGap: 8 }}>
              <Form.Item name="keyword" style={{ flex: 1, minWidth: 240, marginBottom: 0 }} rules={[{ required: true, message: ' ' }]}>
                <Input placeholder="Add a keyword, e.g. Machine Learning" />
              </Form.Item>
              <Form.Item name="mode" initialValue="required" style={{ marginBottom: 0 }}>
                <Select style={{ width: 130 }} options={[{ value: 'required', label: 'Required' }, { value: 'preferred', label: 'Preferred' }]} />
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={busy}>Add</Button>
              <Button icon={<ReloadOutlined />} onClick={resetKeywords} loading={busy}>Restore auto-extracted</Button>
            </Form>

            <div style={{ borderTop: '1px dashed #dbe1ef', paddingTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <Text strong style={{ fontSize: 13 }}>JD text <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>— editing re-extracts keywords and adds any new ones to the set below</Text></Text>
                <Button type="primary" size="small" icon={<SaveOutlined />} loading={busy} disabled={descDraft === view.description_text} onClick={saveText}>Save JD text</Button>
              </div>
              <Input.TextArea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                rows={8}
                style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
          </Space>
        )}
      </Modal>
    </Card>
  );
}