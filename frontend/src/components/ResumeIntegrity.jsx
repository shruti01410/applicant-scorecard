import React from 'react';
import { Card, Tag, Typography, List, Alert, Spin, Button, Space, Progress, Divider } from 'antd';
import { SafetyCertificateOutlined, WarningOutlined, CheckCircleOutlined, ExclamationCircleOutlined, InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

const severityConfig = {
  high: { color: '#ff4d4f', label: 'High', icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} /> },
  medium: { color: '#faad14', label: 'Medium', icon: <WarningOutlined style={{ color: '#faad14' }} /> },
  low: { color: '#1890ff', label: 'Low', icon: <InfoCircleOutlined style={{ color: '#1890ff' }} /> },
};

const dimensionLabels = {
  timeline_consistency: { label: 'Timeline Consistency', description: 'Employment and education dates are consistent and chronologically valid' },
  information_consistency: { label: 'Information Consistency', description: 'Information is consistent across resume sections' },
  experience_credibility: { label: 'Experience Credibility', description: 'Experience claims are supported by listed employment dates' },
  verification_readiness: { label: 'Verification Readiness', description: 'Key details are specific enough to be independently verified' },
};

const flagTypeLabels = {
  missing_dates: 'Missing / Unclear Dates',
  timeline_overlap: 'Potential Employment Timeline Overlap',
  duration_mismatch: 'Experience Duration Discrepancy',
  internal_contradiction: 'Internal Contradiction',
  employer_mismatch: 'Employer Information Inconsistency',
  designation_mismatch: 'Designation–Responsibility Mismatch',
  incomplete_history: 'Incomplete Employment History',
  experience_inflation: 'Experience Inflation',
  unsupported_claims: 'Unsupported Professional Claims',
  keyword_stuffing: 'Excessive Keyword Matching',
  unverifiable_details: 'Unclear or Unverifiable Details',
  concealment_pattern: 'Information Presentation Pattern',
};

function DimensionBar({ label, score, description }) {
  const getColor = (s) => {
    if (s >= 85) return '#52c41a';
    if (s >= 70) return '#1890ff';
    if (s >= 50) return '#faad14';
    return '#ff4d4f';
  };
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Text strong style={{ fontSize: 13 }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: 600, color: getColor(score) }}>{score}%</Text>
      </div>
      <Progress
        percent={score}
        showInfo={false}
        strokeColor={getColor(score)}
        trailColor="#f0f0f0"
        size="small"
      />
      {description && <Text type="secondary" style={{ fontSize: 11 }}>{description}</Text>}
    </div>
  );
}

function FlagEvidence({ evidence }) {
  if (!evidence || evidence.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <Text type="secondary" strong style={{ fontSize: 12 }}>Evidence:</Text>
      <List
        size="small"
        dataSource={evidence}
        renderItem={(ev) => (
          <List.Item style={{ padding: '4px 0', fontSize: 12 }}>
            <div>
              {ev.source && <Tag style={{ fontSize: 10, marginRight: 6 }}>{ev.source}</Tag>}
              <Text type="secondary" style={{ fontStyle: 'italic' }}>"{ev.text}"</Text>
            </div>
          </List.Item>
        )}
      />
    </div>
  );
}

function ResumeIntegrity({ integrityData, loading, onCheck }) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!integrityData) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={onCheck}>
          Run Integrity Check
        </Button>
      </div>
    );
  }

  const { integrityStatus, dimensions, overallStatus, detectedFlags } = integrityData;

  const dimensionEntries = dimensions ? Object.entries(dimensions) : [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>
          <SafetyCertificateOutlined /> Resume Integrity
        </Title>
        <Button size="small" icon={<ReloadOutlined />} onClick={onCheck}>Re-check</Button>
      </div>

      {/* Dimension Scores */}
      {dimensionEntries.length > 0 && (
        <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
            {dimensionEntries.map(([key, score]) => (
              <DimensionBar
                key={key}
                label={dimensionLabels[key]?.label || key}
                score={score}
                description={dimensionLabels[key]?.description}
              />
            ))}
          </div>
          {overallStatus && (
            <>
              <Divider style={{ margin: '12px 0 8px' }} />
              <div style={{ textAlign: 'center' }}>
                <Text strong style={{ fontSize: 14, color: detectedFlags.length === 0 ? '#52c41a' : '#fa8414' }}>
                  {overallStatus}
                </Text>
              </div>
            </>
          )}
        </Card>
      )}

      {/* Flags */}
      {detectedFlags.length === 0 ? (
        <Alert
          message={integrityStatus}
          type="success"
          icon={<CheckCircleOutlined />}
          showIcon
        />
      ) : (
        <>
          <Alert
            message={`${detectedFlags.length} potential integrity issue(s) detected`}
            description="Flags are sorted by severity (high first), then confidence. Only flags with confidence ≥ 50 are displayed."
            type="warning"
            icon={<WarningOutlined />}
            showIcon
            style={{ marginBottom: 16 }}
          />
          <List
            dataSource={detectedFlags}
            renderItem={(flag) => {
              const sev = severityConfig[flag.severity] || severityConfig.low;
              return (
                <List.Item style={{ marginBottom: 8 }}>
                  <Card
                    size="small"
                    style={{
                      width: '100%',
                      borderLeft: `4px solid ${sev.color}`,
                    }}
                    title={
                      <Space>
                        {sev.icon}
                        <Text strong>{flagTypeLabels[flag.flag_type] || flag.flag_type}</Text>
                        <Tag color={sev.color}>{sev.label}</Tag>
                        <Tag color="blue">Confidence: {flag.confidence}%</Tag>
                      </Space>
                    }
                  >
                    {/* Analysis */}
                    {flag.analysis && (
                      <Paragraph style={{ marginBottom: 8, fontSize: 13 }}>
                        <Text strong>What was detected: </Text>
                        <Text>{flag.analysis}</Text>
                      </Paragraph>
                    )}

                    {/* Evidence */}
                    <FlagEvidence evidence={flag.evidence} />

                    {/* Why it was flagged */}
                    {flag.explanation && (
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary" strong style={{ fontSize: 12 }}>Why it was flagged:</Text>
                        <Paragraph style={{ fontSize: 12, marginBottom: 0, marginTop: 2 }}>
                          {flag.explanation}
                        </Paragraph>
                      </div>
                    )}

                    {/* Verification recommendation */}
                    {flag.verification_required && (
                      <div style={{ marginTop: 8 }}>
                        <Tag color="orange" style={{ fontSize: 11 }}>Verification Recommended</Tag>
                      </div>
                    )}
                  </Card>
                </List.Item>
              );
            }}
          />
        </>
      )}
    </div>
  );
}

export default ResumeIntegrity;
