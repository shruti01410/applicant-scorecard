import React, { useEffect, useState } from 'react';
import { Card, Tag, Typography, Tooltip, Select, Spin } from 'antd';
import { InfoCircleOutlined, HeartOutlined, ThunderboltOutlined, MinusCircleOutlined, BulbOutlined } from '@ant-design/icons';
import { api } from '../../../services/api';

const { Text, Paragraph } = Typography;

function highlightNarrative(narrative) {
  if (!narrative) return null;
  const parts = narrative.split(' — vs. ');
  if (parts.length !== 2) return <Text style={{ color: 'rgba(237,234,227,0.8)' }}>{narrative}</Text>;
  const left = parts[0];
  const right = parts[1];
  return (
    <span>
      <Text strong style={{ background: 'rgba(199,154,75,0.16)', color: '#C79A4B', padding: '2px 6px', borderRadius: 6, border: '1px solid rgba(199,154,75,0.25)' }}>{left}</Text>
      <Text style={{ color: 'rgba(237,234,227,0.5)', margin: '0 6px' }}> — vs. </Text>
      <Text strong style={{ background: 'rgba(79,143,125,0.16)', color: '#4F8F7D', padding: '2px 6px', borderRadius: 6, border: '1px solid rgba(79,143,125,0.25)' }}>{right.split('. ')[0]}</Text>
      <Text style={{ color: 'rgba(237,234,227,0.6)' }}>. {right.split('. ').slice(1).join('. ')}</Text>
    </span>
  );
}

export default function CandidateCompanyMatchCard({ data, employeeId, companies: propCompanies, selectedCompanyId, onCompanyChange }) {
  const [companies, setCompanies] = useState(propCompanies || []);
  const [selectedId, setSelectedId] = useState(selectedCompanyId || data?.company?.id || null);
  const [liveData, setLiveData] = useState(data);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setLiveData(data); if (data?.company?.id && !selectedCompanyId) setSelectedId(data.company.id); }, [data]);
  useEffect(() => { if (propCompanies && propCompanies.length) setCompanies(propCompanies); else api.get('/api/admin/companies').then(setCompanies).catch(()=>{}); }, [propCompanies]);
  useEffect(() => { if (selectedCompanyId != null) setSelectedId(selectedCompanyId); }, [selectedCompanyId]);

  const handleChange = (newId) => {
    setSelectedId(newId);
    if (onCompanyChange) onCompanyChange(newId);
    if (newId && employeeId) {
      setLoading(true);
      api.get(`/api/admin/employees/${employeeId}/numerology/company-match?companyId=${newId}`).then(setLiveData).catch(()=>{}).finally(()=>setLoading(false));
    }
  };

  const display = liveData || data;
  if (!display || !display.hasComparison) return null;
  const tone = display.tone || display.outcome && ({ Good: 'good', Neutral: 'neutral', 'Worth exploring': 'watch' }[display.outcome]) || (display.diff != null && display.diff <= 1 ? 'good' : display.diff != null && display.diff <= 3 ? 'neutral' : 'watch');
  const label = display.outcome || display.echo;
  const color = tone === 'good' ? 'green' : tone === 'watch' ? 'orange' : 'default';
  const Icon = tone === 'good' ? HeartOutlined : tone === 'watch' ? MinusCircleOutlined : ThunderboltOutlined;
  const humanTitle = tone === 'good' ? 'Good — close this year' : tone === 'watch' ? 'Worth exploring — more distance this year' : 'Neutral — different wavelengths and that’s okay';
  const humanDesc = tone === 'good' ? 'Their current life theme is close to your company’s core. Think “same song, nearby key.”' : tone === 'watch' ? 'More numerical distance this year — worth a question in interview, not a filter.' : 'Two or more apart — no particular resonance right now. Neutral, not a red flag.';
  const alignment = display.alignment;
  const overall = display.overall || (alignment && alignment.overall);
  return (
    <Card size="small" title={<span style={{ fontFamily: 'Fraunces, serif', color: '#EDEAE3' }}>Candidate ↔ Company Echo <Tooltip title="We compare the candidate’s changing yearly theme to the company’s fixed birth number."><InfoCircleOutlined style={{ marginLeft: 6, color: 'rgba(237,234,227,0.5)' }} /></Tooltip></span>}>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 11, color: 'rgba(237,234,227,0.6)', fontFamily: 'Inter, sans-serif' }}>Compare against:</Text>
        <Select value={selectedId} onChange={handleChange} options={companies.map(c => ({ value: c.id, label: `${c.client_name} (${c.founded_year})` }))} style={{ minWidth: 220 }} placeholder="Select company" allowClear={false} />
        {loading && <Spin size="small" style={{ marginLeft: 8 }} />}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums' }}>
        <Tag color={color} icon={<Icon />} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999 }}>{label}{display.diff != null ? ` · Δ${display.diff}` : ''}</Tag>
        <Tag style={{ background: 'rgba(79,143,125,0.14)', borderColor: 'rgba(79,143,125,0.28)', color: '#EDEAE3' }}>Candidate <Text strong style={{ color: '#4F8F7D' }}>PY {display.candidate.number}</Text> <Text style={{ color: 'rgba(237,234,227,0.6)' }}>· {display.candidate.theme}</Text></Tag>
        <Text style={{ color: 'rgba(237,234,227,0.4)' }}>vs</Text>
        <Tag style={{ background: 'rgba(199,154,75,0.12)', borderColor: 'rgba(199,154,75,0.25)', color: '#EDEAE3' }}>{display.company.name} <Text strong style={{ color: '#C79A4B' }}>· {display.company.number}</Text> <Text style={{ color: 'rgba(237,234,227,0.6)' }}>· {display.company.theme}</Text></Tag>
        {overall && <Tag color={overall.tone === 'good' ? 'green' : overall.tone === 'watch' ? 'orange' : 'default'} style={{ fontVariantNumeric: 'tabular-nums' }}>Overall {overall.label} · Δ{overall.diff}</Tag>}
      </div>
      {alignment && alignment.dimensions && alignment.dimensions.length > 0 && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {alignment.dimensions.map(d => (
            <div key={d.dimension} style={{ border: `1px solid ${d.tone === 'good' ? 'rgba(79,143,125,0.28)' : d.tone === 'watch' ? 'rgba(185,125,104,0.28)' : 'rgba(199,154,75,0.18)'}`, borderRadius: 10, padding: '10px 12px', background: '#23252F' }}>
              <Text strong style={{ fontSize: 11, fontFamily: 'Fraunces, serif', color: '#EDEAE3' }}>{d.dimension}</Text>
              <div style={{ marginTop: 6 }}><Tag color={d.tone === 'good' ? 'green' : d.tone === 'watch' ? 'orange' : 'default'} style={{ fontVariantNumeric: 'tabular-nums' }}>{d.outcome} · Δ{d.diff}</Tag></div>
              <Text style={{ fontSize: 10, display: 'block', marginTop: 6, color: 'rgba(237,234,227,0.6)', fontVariantNumeric: 'tabular-nums' }}>{d.candidateNumber} vs {d.companyNumber} · {d.label}</Text>
            </div>
          ))}
        </div>
      )}

      {display.supportNarrative && (
        <div style={{ marginTop: 12, background: 'rgba(199,154,75,0.08)', border: '1px solid rgba(199,154,75,0.18)', borderRadius: 10, padding: '12px' }}>
          <Text strong style={{ fontSize: 11, color: '#C79A4B', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Fraunces, serif' }}><BulbOutlined style={{ color: '#C79A4B' }} /> In plain English</Text>
          <Paragraph style={{ marginTop: 8, marginBottom: 0, fontSize: 12, lineHeight: 1.7, color: 'rgba(237,234,227,0.85)' }}>
            {highlightNarrative(display.supportNarrative)}
          </Paragraph>
          <Text style={{ fontSize: 11, display: 'block', marginTop: 8, fontStyle: 'italic', color: 'rgba(237,234,227,0.55)' }}>{humanDesc}</Text>
        </div>
      )}

      <div style={{ marginTop: 12, background: '#1B1D25', border: '1px solid rgba(199,154,75,0.18)', borderRadius: 10, padding: '12px' }}>
        <Text strong style={{ fontSize: 12, fontFamily: 'Fraunces, serif', color: '#EDEAE3' }}>{humanTitle}</Text>
        <Paragraph style={{ fontSize: 11, marginTop: 6, marginBottom: 0, lineHeight: 1.6, color: 'rgba(237,234,227,0.7)' }}>
          The candidate’s <Text mark style={{ background: 'rgba(79,143,125,0.18)', color: '#4F8F7D', padding: '1px 4px', borderRadius: 4 }}>Personal Year {display.candidate.number} ({display.candidate.theme})</Text> is their theme <i style={{ color: 'rgba(237,234,227,0.8)' }}>this year only</i> — it shifts annually. Your company’s <Text mark style={{ background: 'rgba(199,154,75,0.14)', color: '#C79A4B', padding: '1px 4px', borderRadius: 4 }}>Founded Number {display.company.number} ({display.company.theme})</Text> is fixed, like a birth chart. Echo just asks: <Text strong style={{ color: '#EDEAE3' }}>how close are those two numbers?</Text>
        </Paragraph>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
          <div style={{ textAlign: 'center', background: tone === 'good' ? 'rgba(79,143,125,0.12)' : '#23252F', border: `1px solid ${tone === 'good' ? 'rgba(79,143,125,0.28)' : 'rgba(199,154,75,0.18)'}`, borderRadius: 8, padding: '8px 4px' }}>
            <HeartOutlined style={{ color: tone === 'good' ? '#4F8F7D' : 'rgba(237,234,227,0.35)' }} /><Text strong style={{ display: 'block', fontSize: 11, marginTop: 4, color: tone === 'good' ? '#4F8F7D' : 'rgba(237,234,227,0.6)', fontFamily: 'Fraunces, serif' }}>Good</Text><Text style={{ fontSize: 10, color: 'rgba(237,234,227,0.5)' }}>Δ0-1<br />Close</Text>
          </div>
          <div style={{ textAlign: 'center', background: tone === 'neutral' ? 'rgba(237,234,227,0.06)' : '#23252F', border: `1px solid ${tone === 'neutral' ? 'rgba(237,234,227,0.14)' : 'rgba(199,154,75,0.18)'}`, borderRadius: 8, padding: '8px 4px' }}>
            <ThunderboltOutlined style={{ color: tone === 'neutral' ? '#EDEAE3' : 'rgba(237,234,227,0.35)' }} /><Text strong style={{ display: 'block', fontSize: 11, marginTop: 4, color: tone === 'neutral' ? '#EDEAE3' : 'rgba(237,234,227,0.6)', fontFamily: 'Fraunces, serif' }}>Neutral</Text><Text style={{ fontSize: 10, color: 'rgba(237,234,227,0.5)' }}>Δ2-3<br />Different okay</Text>
          </div>
          <div style={{ textAlign: 'center', background: tone === 'watch' ? 'rgba(185,125,104,0.12)' : '#23252F', border: `1px solid ${tone === 'watch' ? 'rgba(185,125,104,0.28)' : 'rgba(199,154,75,0.18)'}`, borderRadius: 8, padding: '8px 4px', opacity: tone === 'watch' ? 1 : 0.6 }}>
            <MinusCircleOutlined style={{ color: tone === 'watch' ? '#B97D68' : 'rgba(237,234,227,0.35)' }} /><Text strong style={{ display: 'block', fontSize: 11, marginTop: 4, color: tone === 'watch' ? '#B97D68' : 'rgba(237,234,227,0.6)', fontFamily: 'Fraunces, serif' }}>Worth exploring</Text><Text style={{ fontSize: 10, color: 'rgba(237,234,227,0.5)' }}>Δ4+<br />Ask, not filter</Text>
          </div>
        </div>
        <Text style={{ fontSize: 10, display: 'block', marginTop: 10, textAlign: 'center', color: 'rgba(237,234,227,0.45)' }}>
          Analytical note: <Text strong style={{ color: 'rgba(237,234,227,0.7)' }}>“No echo” is neutral</Text> — numbers not lining up this year is not a poor-fit signal. Never use echo as a filter.
        </Text>
      </div>

      </Card>
  );
}
