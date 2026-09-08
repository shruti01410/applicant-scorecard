import React, { useEffect, useState } from 'react';
import {
  Typography, Card, Table, Tag, Space, Row, Col, Statistic, Button, message, Empty,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../services/AuthContext';
import { badge } from '../../scoreLabels';

const { Title, Paragraph } = Typography;

export default function MyScorecard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [sc, setSc] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await api.get('/api/employee/scorecard');
        setSc(resp.scorecard);
        setData(resp);
      } catch (e) {
        message.error(e.message);
      }
    })();
  }, []);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  if (!data || !sc) {
    return (
      <div className="employee-page">
        <div className="employee-header">
          <Title level={4} style={{ margin: 0 }}>My Scorecard</Title>
          <Button onClick={handleLogout}>Logout</Button>
        </div>
        <Card style={{ marginTop: 24 }}>
          <Empty description="No scorecard has been submitted for you yet." />
        </Card>
      </div>
    );
  }

  const b = badge(data.weighted_pct);

  const columns = [
    { title: '#', render: (_, __, i) => i + 1, width: 50 },
    { title: 'Parameter', dataIndex: 'name' },
    {
      title: 'Weight',
      dataIndex: 'weightage',
      render: v => <Tag>{v}</Tag>,
    },
    {
      title: 'Score',
      dataIndex: 'score',
      render: v => <Tag color="green">{v}/5</Tag>,
    },
    {
      title: 'Weighted',
      dataIndex: 'score',
      render: (v, row) => Math.round((v / 5) * row.weightage * 10) / 10,
    },
    {
      title: 'Visual',
      dataIndex: 'score',
      width: 160,
      render: v => {
        const width = (v / 5) * 100;
        return <div className="mini-bar"><div className="mini-fill" style={{ width: width + '%' }} /></div>;
      },
    },
  ];

  return (
    <div className="employee-page">
      <div className="employee-header">
        <Title level={4} style={{ margin: 0 }}>My Scorecard</Title>
        <Paragraph type="secondary">Your evaluation results</Paragraph>
        <Button onClick={handleLogout}>Logout</Button>
      </div>

      <Card className="employee-badge" style={{ maxWidth: 400 }}>
        <div className="score-pct">
          <div style={{ textAlign: 'center', width: '100%' }}>
            <div style={{ fontSize: 48, fontWeight: 800, color: b.color }}>{data.weighted_pct}%</div>
            <Tag color={b.color} style={{ color: b.color }}>{b.label}</Tag>
          </div>
        </div>
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 16, maxWidth: 600 }}>
        <Col span={8}><Card><Statistic title="Client" value={sc.client || '—'} /></Card></Col>
        <Col span={8}><Card><Statistic title="Position" value={sc.position || '—'} /></Card></Col>
        <Col span={8}><Card><Statistic title="JD Shared" value={sc.jd_shared ? 'Yes' : 'No'} /></Card></Col>
      </Row>

      <Card title="Parameter Breakdown" style={{ marginTop: 16 }}>
        <Table
          rowKey="parameter_id"
          columns={columns}
          dataSource={data.scores || []}
          pagination={false}
        />
      </Card>
    </div>
  );
}