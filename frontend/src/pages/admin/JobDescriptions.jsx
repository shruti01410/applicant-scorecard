import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Upload, Tag, Typography, Space, Select, message } from 'antd';
import { UploadOutlined, FileTextOutlined } from '@ant-design/icons';
import { api } from '../../services/api';

const { Title, Text, Paragraph } = Typography;

export default function JobDescriptions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [form] = Form.useForm();

  async function fetchRows() {
    setLoading(true);
    try { setRows(await api.get('/api/admin/job-descriptions')); } catch (e) { message.error(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { fetchRows(); api.get('/api/admin/companies').then(setCompanies).catch(()=>{}); }, []);

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
      message.success('Job description created');
      setOpen(false);
      form.resetFields();
      fetchRows();
    } catch (e) { message.error(e.message); }
  }

  async function openView(id) {
    try { const data = await api.get(`/api/admin/job-descriptions/${id}`); setView(data); } catch (e) { message.error(e.message); }
  }

  const columns = [
    { title: 'Title', dataIndex: 'title', render: (v, r) => <a onClick={() => openView(r.id)}>{v}</a> },
    { title: 'Client', dataIndex: 'client', render: v => v || '—' },
    { title: 'Company', dataIndex: 'company_id', render: v => v ? `Company #${v}` : '—' },
    { title: 'Created', dataIndex: 'created_at', render: v => v ? new Date(v).toLocaleDateString() : '—' },
    { title: 'Action', render: (_, r) => <Button size="small" onClick={() => openView(r.id)}>View</Button> },
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}><FileTextOutlined /> Job Descriptions</Title>
        <Button type="primary" onClick={() => setOpen(true)}>+ Add JD</Button>
      </div>
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

      <Modal title={view ? view.title : 'JD'} open={!!view} onCancel={() => setView(null)} footer={null} width={700}>
        {view && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div><Text type="secondary">Client: </Text><Tag>{view.client || '—'}</Tag> {view.company_id && <Tag color="blue">Company #{view.company_id}{companies.find(c => c.id === view.company_id) ? ` · ${companies.find(c => c.id === view.company_id).client_name}` : ''}</Tag>} <Text type="secondary">{view.created_at}</Text></div>
            <Paragraph style={{ whiteSpace: 'pre-wrap', background: '#fafafa', padding: 12, borderRadius: 6, maxHeight: 300, overflow: 'auto' }}>{view.description_text}</Paragraph>
            <div>
              <Text strong>Extracted keywords ({view.requirements ? view.requirements.length : 0})</Text>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(view.requirements || []).slice(0, 60).map(k => <Tag key={k}>{k}</Tag>)}
              </div>
            </div>
            {view.file_path && <Text type="secondary" style={{ fontSize: 11 }}>Stored: {view.file_path}</Text>}
          </Space>
        )}
      </Modal>
    </Card>
  );
}
