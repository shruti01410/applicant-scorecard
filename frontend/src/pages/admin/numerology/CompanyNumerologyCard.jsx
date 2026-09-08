import React from 'react';
import { Card, Tag, Typography, Collapse, Tooltip } from 'antd';
import { InfoCircleOutlined, CalendarOutlined, ShopOutlined, UserOutlined, BulbOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

function digitSumSteps(year) {
  const s = String(year);
  const sum = s.split('').reduce((a, d) => a + Number(d), 0);
  const red = String(sum).split('').reduce((a, d) => a + Number(d), 0);
  const needsReduce = sum > 9;
  if (needsReduce && sum !== red) return `${s.split('').join(' + ')} = ${sum} → ${String(sum).split('').join(' + ')} = ${red}`;
  if (needsReduce) return `${s.split('').join(' + ')} = ${sum} → ${red}`;
  return `${s.split('').join(' + ')} = ${sum}`;
}

function nameSteps(name, value) {
  if (!name) return '';
  const map = { a:1,j:1,s:1,b:2,k:2,t:2,c:3,l:3,u:3,d:4,m:4,v:4,e:5,n:5,w:5,f:6,o:6,x:6,g:7,p:7,y:7,h:8,q:8,z:8,i:9,r:9 };
  const letters = String(name).toLowerCase().split('').filter(ch => map[ch]);
  const total = letters.reduce((a, ch) => a + map[ch], 0);
  const parts = letters.map(ch => `${ch.toUpperCase()}=${map[ch]}`).join(' + ');
  if (total > 9 && total !== value) return `${parts} = ${total} → ${String(total).split('').join(' + ')} = ${value}`;
  if (total > 9) return `${parts} = ${total}`;
  return `${parts} = ${value}`;
}

const HIGHLIGHTS = [
  { icon: <CalendarOutlined style={{ color: '#6366f1' }} />, label: 'Founded Number', color: 'blue', desc: 'The year you were born as a company.', human: 'Think “birthday energy” — the conditions you started in (e.g., a 2 is collaborative, an 8 is achievement-driven).' },
  { icon: <ShopOutlined style={{ color: '#8b5cf6' }} />, label: 'Brand Number', color: 'purple', desc: 'How the outside world feels your name.', human: 'Your public vibe — a 3 sounds expressive and chatty, a 4 sounds solid and reliable.' },
  { icon: <UserOutlined style={{ color: '#06b6d4' }} />, label: 'Founder Number', color: 'cyan', desc: 'The leadership imprint from day one.', human: 'Culture DNA — the founder’s name carries their working style into the company’s story.' },
];

export default function CompanyNumerologyCard({ company, companies, selectedCompanyId, onCompanyChange }) {
  if (!company || company.hasProfile === false) return null;
  const hasNumbers = company.founded_number != null || company.brand_number != null;
  return (
    <Card size="small" title={<span style={{ fontFamily: 'Fraunces, serif', color: '#EDEAE3' }}>Company Numerology <Tooltip title="A fixed reference point — like a birth chart for the company. Not a score."><InfoCircleOutlined style={{ marginLeft: 6, color: 'rgba(237,234,227,0.5)' }} /></Tooltip></span>} extra={companies && companies.length > 1 && onCompanyChange ? <select value={selectedCompanyId || ''} onChange={e => onCompanyChange(Number(e.target.value))} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(199,154,75,0.25)', background: '#23252F', color: '#EDEAE3' }}>{companies.map(c => <option key={c.id} value={c.id}>{c.client_name} ({c.founded_year})</option>)}</select> : null}>
      <Paragraph style={{ fontSize: 12, marginBottom: 10, color: 'rgba(237,234,227,0.75)', lineHeight: 1.6 }}>
        Just like people have a <Text strong style={{ color: '#EDEAE3' }}>Life Path</Text>, companies have a <Text strong style={{ color: '#EDEAE3' }}>birth story</Text>. These three numbers are the company's fixed personality — they don't change year to year.
      </Paragraph>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Tag style={{ background: 'rgba(199,154,75,0.14)', borderColor: 'rgba(199,154,75,0.28)', color: '#C79A4B' }}>{company.client_name}</Tag>
        <Tag style={{ background: 'rgba(79,143,125,0.14)', borderColor: 'rgba(79,143,125,0.28)', color: '#4F8F7D' }}>Founded {company.founded_year} <Text strong style={{ color: '#4F8F7D' }}>· {company.founded_number}</Text></Tag>
        {company.brand_name && <Tag style={{ background: 'rgba(199,154,75,0.10)', borderColor: 'rgba(199,154,75,0.22)', color: '#C79A4B' }}>Brand {company.brand_name} <Text strong style={{ color: '#C79A4B' }}>· {company.brand_number}</Text></Tag>}
        {company.founder_name && <Tag style={{ background: 'rgba(185,125,104,0.14)', borderColor: 'rgba(185,125,104,0.28)', color: '#B97D68' }}>Founder {company.founder_name} <Text strong style={{ color: '#B97D68' }}>· {company.founder_number}</Text></Tag>}
      </div>

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        {HIGHLIGHTS.map(h => (
          <div key={h.label} style={{ background: '#23252F', border: '1px solid rgba(199,154,75,0.18)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              {h.icon}<Text strong style={{ fontSize: 12, fontFamily: 'Fraunces, serif', color: '#EDEAE3' }}>{h.label}</Text><Tag style={{ marginLeft: 'auto', fontSize: 10, background: 'rgba(199,154,75,0.12)', color: '#C79A4B', borderColor: 'rgba(199,154,75,0.2)' }}>{h.label.split(' ')[0]}</Tag>
            </div>
            <Text style={{ fontSize: 11, display: 'block', color: 'rgba(237,234,227,0.65)', lineHeight: 1.5 }}>{h.desc}</Text>
            <Text style={{ fontSize: 11, display: 'block', marginTop: 6, color: 'rgba(237,234,227,0.55)', fontStyle: 'italic' }}><BulbOutlined style={{ color: '#C79A4B', marginRight: 4 }} />{h.human}</Text>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, background: 'rgba(79,143,125,0.08)', border: '1px solid rgba(79,143,125,0.22)', borderRadius: 10, padding: '10px 12px' }}>
        <Text strong style={{ fontSize: 12, color: '#4F8F7D', fontFamily: 'Fraunces, serif' }}>Analytical lens</Text>
        <Text style={{ fontSize: 11, display: 'block', marginTop: 6, color: 'rgba(237,234,227,0.65)', lineHeight: 1.5 }}>
          Together these three form a <Text strong style={{ color: '#EDEAE3' }}>numerical profile</Text> — constant, not a yearly score. Use it to ask: “Does this candidate’s current life theme complement our origin story?” Never as a hiring filter.
        </Text>
      </div>

      {hasNumbers && (
        <Collapse size="small" ghost style={{ marginTop: 10 }} items={[{
          key: '1',
          label: <Text style={{ fontSize: 12, color: 'rgba(237,234,227,0.7)' }}>See the math — how each number is calculated</Text>,
          children: (
            <div style={{ fontSize: 11, lineHeight: 1.7, background: '#23252F', border: '1px solid rgba(199,154,75,0.14)', borderRadius: 8, padding: '10px 12px' }}>
              <div><Text code style={{ fontSize: 11, background: 'rgba(199,154,75,0.12)', color: '#C79A4B', borderColor: 'rgba(199,154,75,0.18)' }}>Founded {company.founded_year}</Text> <Text style={{ color: 'rgba(237,234,227,0.6)' }}>→ {digitSumSteps(company.founded_year)}</Text></div>
              {company.brand_name && <div style={{ marginTop: 6 }}><Text code style={{ fontSize: 11, background: 'rgba(199,154,75,0.12)', color: '#C79A4B', borderColor: 'rgba(199,154,75,0.18)' }}>{company.brand_name}</Text> <Text style={{ color: 'rgba(237,234,227,0.6)' }}>→ {nameSteps(company.brand_name, company.brand_number)}</Text></div>}
              {company.founder_name && <div style={{ marginTop: 6 }}><Text code style={{ fontSize: 11, background: 'rgba(199,154,75,0.12)', color: '#C79A4B', borderColor: 'rgba(199,154,75,0.18)' }}>{company.founder_name}</Text> <Text style={{ color: 'rgba(237,234,227,0.6)' }}>→ {nameSteps(company.founder_name, company.founder_number)}</Text></div>}
              <Text style={{ fontSize: 10, display: 'block', marginTop: 8, color: 'rgba(237,234,227,0.45)' }}>Letters: A=1,B=2…I=9,J=1…Z=8. Birth numbers keep 11/22/33; names/years reduce fully to 1-9. No mysticism — just addition.</Text>
            </div>
          )
        }]} />
      )}
      </Card>
  );
}
