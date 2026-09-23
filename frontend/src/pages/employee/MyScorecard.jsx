import React, { useEffect, useState } from 'react';
import {
  Typography, Card, Table, Tag, Row, Col, Button, message, Empty,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../services/AuthContext';
import { decisionColors } from '../../sopModel';
import { scoreColor } from '../../scoreStatus';

const { Title, Paragraph } = Typography;

const GRP_COLOR = { PERSON: 'blue', ROLE: 'purple', DEAL: 'orange' };

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

  const decision = data.decision || null;
  const pp = decision && decision.pursuit_priority;
  const ppColor = pp && pp.display_score != null ? (decisionColors[pp.final_decision] || scoreColor(pp.display_score)) : '#94a3b8';

  const columns = [
    { title: '#', render: (_, __, i) => i + 1, width: 50 },
    {
      title: 'Group',
      dataIndex: 'grp',
      width: 90,
      render: v => <Tag color={GRP_COLOR[v] || 'default'} style={{ fontSize: 10, fontWeight: 700 }}>{v}</Tag>,
    },
    { title: 'Parameter', dataIndex: 'name' },
    {
      title: 'Weight',
      dataIndex: 'weightage',
      render: v => <Tag>{v}%</Tag>,
    },
    {
      title: 'Score',
      dataIndex: 'score',
      render: (v, row) => row.status === 'na' ? <Tag>N/A</Tag> : <Tag color={v >= 50 ? 'green' : v >= 30 ? 'orange' : 'red'}>{v}/100</Tag>,
    },
    {
      title: 'Weighted',
      dataIndex: 'score',
      render: (v, row) => row.status === 'na' || v == null ? '—' : Math.round((v / 100) * row.weightage * 10) / 10,
    },
    {
      title: 'Visual',
      dataIndex: 'score',
      width: 160,
      render: (v, row) => {
        const width = row.status === 'na' || v == null ? 0 : (v / 100) * 100;
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

      <Card className="employee-badge" style={{ maxWidth: 460 }}>
        <div className="score-pct">
          <div style={{ textAlign: 'center', width: '100%' }}>
            <div style={{ fontSize: 48, fontWeight: 800, color: ppColor }}>{pp && pp.display_score != null ? `${pp.display_score}%` : '—'}</div>
            <Tag color={ppColor} style={{ color: ppColor }}>{pp ? pp.final_decision : 'Not scored'}</Tag>
            <div style={{ marginTop: 8 }}>
              {decision && decision.candidate_fit && decision.candidate_fit.score != null && <Tag color="geekblue">Fit {decision.candidate_fit.score}</Tag>}
              {decision && decision.joining_probability && decision.joining_probability.score != null && <Tag color="orange">Join {decision.joining_probability.score}</Tag>}
              {decision && decision.confidence_score && <Tag>{decision.confidence_score.label}</Tag>}
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>Pursuit Priority = Candidate Fit × 60% + Joining Probability × 40%</div>
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
          dataSource={(data.scores || []).filter(s => s.grp)}
          pagination={false}
        />
      </Card>
    </div>
  );
}