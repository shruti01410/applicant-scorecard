import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Tag, Typography, Space, Popconfirm, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { api } from '../../services/api';

const { Title, Text } = Typography;

export default function CompanyProfiles() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  async function fetchRows() {
    setLoading(true);
    try { setRows(await api.get('/api/admin/companies')); } catch (e) { message.error(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { fetchRows(); }, []);

  function onAdd() { setEditing(null); form.resetFields(); setOpen(true); }
  function onEdit(r) { setEditing(r); form.setFieldsValue({ client_name: r.client_name, founder_name: r.founder_name, founded_year: r.founded_year, brand_name: r.brand_name }); setOpen(true); }

  async function onFinish(values) {
    try {
      if (editing) {
        await api.put(`/api/admin/companies/${editing.id}`, values);
        message.success('Company updated');
      } else {
        await api.post('/api/admin/companies', JSON.stringify(values));
        message.success('Company created');
      }
      setOpen(false); fetchRows();
    } catch (e) { message.error(e.message); }
  }

  async function handleDelete(id) {
    try { await api.delete(`/api/admin/companies/${id}`); message.success('Deleted'); fetchRows(); } catch (e) { message.error(e.message); }
  }

  const columns = [
    { title: 'Company', dataIndex: 'client_name', render: v => <Text strong>{v}</Text> },
    { title: 'Brand', dataIndex: 'brand_name' },
    { title: 'Founder', dataIndex: 'founder_name' },
    { title: 'Founded', dataIndex: 'founded_year' },
    { title: 'Numbers', render: (_, r) => <Space><Tag color="blue">F{r.founded_number}</Tag><Tag color="purple">B{r.brand_number}</Tag><Tag color="cyan">F{r.founder_number}</Tag></Space> },
    {
      title: 'Action',
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => onEdit(r)}>Edit</Button>
          <Popconfirm title="Delete company?" onConfirm={() => handleDelete(r.id)}><Button size="small" danger>Delete</Button></Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Company Profiles</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>Add Company</Button>
      </div>
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 12 }}>Each company has Founded/Brand/Founder numbers (computed server-side). Link a company to a JD to make “Candidate ↔ Company Echo” use the right company.</Text>
      <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 10 }} />
      <Modal title={editing ? 'Edit Company' : 'Add Company'} open={open} onCancel={() => setOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="client_name" label="Company Name" rules={[{ required: true }]}><Input placeholder="iSHR" /></Form.Item>
          <Form.Item name="founder_name" label="Founder Full Name" rules={[{ required: true }]}><Input placeholder="Manish Kumar" /></Form.Item>
          <Form.Item name="founded_year" label="Founded Year" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} placeholder="2018" min={1800} max={2100} /></Form.Item>
          <Form.Item name="brand_name" label="Brand Name (defaults to Company Name)"><Input placeholder="iSHR" /></Form.Item>
          <Button type="primary" htmlType="submit" block>{editing ? 'Update' : 'Create'}</Button>
        </Form>
      </Modal>
    </Card>
  );
}
