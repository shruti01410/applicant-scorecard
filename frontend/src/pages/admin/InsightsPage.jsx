import React, { useEffect, useState } from 'react';
import {
  Typography, Card, Select, Button, Tag, Space, Spin, Modal, Tooltip, Empty, Tabs,
} from 'antd';
import {
  SwapOutlined, ReloadOutlined, EyeOutlined,
  CheckCircleFilled, WarningOutlined, QuestionCircleOutlined,
  FireOutlined, ThunderboltOutlined, HeartOutlined, EyeInvisibleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';

const { Title, Text } = Typography;

const PARAM_KEYS = [
  { key: 'stillness', label: 'Stillness in Company', color: '#6366f1' },
  { key: 'luck', label: 'Luck & Fortune Flow', color: '#f59e0b' },
  { key: 'harmony', label: 'Harmony with Company', color: '#10b981' },
  { key: 'destiny', label: 'Destiny Momentum', color: '#3b82f6' },
  { key: 'karmic', label: 'Karmic Balance', color: '#ec4899' },
  { key: 'intuition', label: 'Intuitive Clarity', color: '#8b5cf6' },
];

const ELEMENT_META = {
  AGNI: { label: 'Momentum', icon: <FireOutlined />, color: '#ef4444', desc: 'Drive, initiative, action' },
  VAYU: { label: 'Ideation', icon: <ThunderboltOutlined />, color: '#3b82f6', desc: 'Creativity, communication, ideas' },
  JALA: { label: 'Connection', icon: <HeartOutlined />, color: '#10b981', desc: 'Empathy, patience, emotional depth' },
  AKASHA: { label: 'Perspective', icon: <EyeInvisibleOutlined />, color: '#8b5cf6', desc: 'Self-awareness, authenticity, values' },
};

const TRIGUNA_META = {
  Sattva: { color: '#10b981', label: 'Clarity', desc: 'Clarity, balance, wisdom' },
  Rajas: { color: '#f59e0b', label: 'Drive', desc: 'Drive, ambition, restlessness' },
  Tamas: { color: '#6b7280', label: 'Stability', desc: 'Stability, resistance to change' },
};

const CATEGORY_ICONS = {
  Expression: '🗣', Attitude: '⚖️', Unmasked: '🔓', Personality: '🪞', 'Soul Urge': '💎', Masked: '🎭',
};

function scoreColor(s) {
  if (s >= 70) return '#16a34a';
  if (s >= 50) return '#2563eb';
  if (s >= 30) return '#f59e0b';
  return '#ef4444';
}

function deepScoreColor(s) {
  if (s >= 5) return '#16a34a';
  if (s === 4) return '#2563eb';
  if (s === 3) return '#f59e0b';
  if (s === 2) return '#ef4444';
  return '#94a3b8';
}

function toneIcon(tone) {
  if (tone === 'good') return <CheckCircleFilled style={{ color: '#16a34a', fontSize: 12 }} />;
  if (tone === 'watch') return <WarningOutlined style={{ color: '#ef4444', fontSize: 12 }} />;
  return <QuestionCircleOutlined style={{ color: '#94a3b8', fontSize: 12 }} />;
}

function Bar({ value, max = 100, color, height = 6 }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height, background: '#e2e8f0', borderRadius: height / 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: height / 2, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: scoreColor(value), minWidth: 28, textAlign: 'right' }}>{value}%</span>
    </div>
  );
}

function DeepBar({ value, max = 5, color }) {
  const pct = (value / max) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: deepScoreColor(value), minWidth: 22, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function TriNatureMini({ tri }) {
  if (!tri) return <div style={{ fontSize: 11, color: '#94a3b8' }}>No behavioral data</div>;
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      {Object.entries(tri.elements || {}).map(([el, score]) => {
        const meta = ELEMENT_META[el];
        return (
          <div key={el} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#5c6580', minWidth: 80, display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ color: meta?.color }}>{meta?.icon}</span> {meta?.label || el}
            </span>
            <Bar value={score} color={meta?.color || '#94a3b8'} />
          </div>
        );
      })}
      <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Tag color={ELEMENT_META[tri.dominantElement]?.color} style={{ margin: 0, fontSize: 10 }}>
          {ELEMENT_META[tri.dominantElement]?.label}
        </Tag>
        <Tag color={TRIGUNA_META[tri.dominantMode]?.color} style={{ margin: 0, fontSize: 10 }}>
          {TRIGUNA_META[tri.dominantMode]?.label || tri.dominantMode}
        </Tag>
      </div>
      {tri.signature && (
        <div style={{ fontSize: 10, color: '#8892a8', fontStyle: 'italic', marginTop: 2 }}>
          {tri.signature.name}
        </div>
      )}
    </div>
  );
}

function CandidateCard({ c, selected, onToggle, onView }) {
  return (
    <Card
      size="small"
      hoverable
      style={{
        borderRadius: 10,
        border: selected ? '2px solid #6366f1' : '1px solid #e5e7eb',
        background: selected ? '#faf5ff' : '#fff',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      bodyStyle={{ padding: '14px 16px' }}
      onClick={() => onToggle(c.id)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1c2333' }}>{c.name}</div>
          <div style={{ fontSize: 11, color: '#8892a8' }}>{c.company_name || 'No company'}</div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {c.hasProfile ? (
            <Tag color="green" style={{ margin: 0, fontSize: 11 }}>Evaluated</Tag>
          ) : (
            <Tag color="default" style={{ margin: 0, fontSize: 11 }}>No DOB</Tag>
          )}
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(c.id)}
            onClick={e => e.stopPropagation()}
            style={{ width: 16, height: 16, accentColor: '#6366f1' }}
          />
        </div>
      </div>

      {/* Top Parameter */}
      {c.top_parameter && (
        <div style={{ marginBottom: 10, padding: '6px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#8892a8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Top Parameter</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: deepScoreColor(c.top_parameter.score) }}>
            {c.top_parameter.name} — {c.top_parameter.score}/5
          </div>
        </div>
      )}

      {/* 6 Deep Parameters */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#8892a8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Deep Parameters</div>
        <div style={{ display: 'grid', gap: 3 }}>
          {(c.deep_params || []).map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: '#5c6580', minWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.name}
              </span>
              <DeepBar value={p.score} color={PARAM_KEYS[i]?.color || '#94a3b8'} />
            </div>
          ))}
        </div>
      </div>

      {/* Behavioral Profile */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#8892a8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Behavioral Profile</div>
        <TriNatureMini tri={c.tri_nature} />
      </div>

      {/* Category Summary */}
      {c.tri_nature?.categories && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#8892a8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>6 Categories</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
            {Object.entries(c.tri_nature.categories).map(([key, cat]) => (
              <div key={key} style={{ textAlign: 'center', padding: '3px 4px', background: '#f8fafc', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 12 }}>{CATEGORY_ICONS[key]}</div>
                <div style={{ fontSize: 9, color: '#5c6580', fontWeight: 600 }}>{cat.name}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: cat.score != null ? scoreColor(cat.score) : '#94a3b8' }}>
                  {cat.score != null ? `${cat.score}%` : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Triguna */}
      {c.tri_nature?.triguna && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
          {Object.entries(c.tri_nature.triguna).filter(([k]) => k !== 'raw').map(([mode, pct]) => (
            <Tooltip key={mode} title={TRIGUNA_META[mode]?.desc}>
              <Tag color={TRIGUNA_META[mode]?.color} style={{ margin: 0, fontSize: 10 }}>
                {TRIGUNA_META[mode]?.label || mode}: {pct}%
              </Tag>
            </Tooltip>
          ))}
        </div>
      )}

      <div style={{ marginTop: 8, textAlign: 'right' }}>
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={e => { e.stopPropagation(); onView(c.id); }}
          style={{ fontSize: 12, padding: 0, color: '#6366f1' }}
        >
          View Details
        </Button>
      </div>
    </Card>
  );
}

function ComparisonTable({ candidates, section }) {
  if (!candidates || candidates.length === 0) return null;

  if (section === 'deep') {
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 500 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e2e5f1', color: '#5c6580', fontWeight: 600, position: 'sticky', left: 0, background: '#fff', zIndex: 1, minWidth: 160 }}>Parameter</th>
              {candidates.map(c => (
                <th key={c.id} style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid #e2e5f1', minWidth: 120 }}>
                  <div style={{ fontWeight: 700, color: '#1c2333', fontSize: 13 }}>{c.name}</div>
                  <div style={{ fontWeight: 400, color: '#8892a8', fontSize: 10 }}>{c.company_name || ''}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PARAM_KEYS.map((pk) => {
              const scores = candidates.map(c => {
                const p = c.deep_params.find(dp => dp.name === pk.label);
                return p ? p.score : 0;
              });
              const max = Math.max(...scores);
              const min = Math.min(...scores.filter(s => s > 0));
              const hasRange = max !== min && min > 0;
              return (
                <tr key={pk.key} style={{ background: '#fff' }}>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f2f7', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                    <span style={{ fontWeight: 600, color: '#1c2333' }}>{pk.label}</span>
                  </td>
                  {candidates.map(c => {
                    const p = c.deep_params.find(dp => dp.name === pk.label);
                    const s = p ? p.score : 0;
                    const isBest = hasRange && s === max;
                    return (
                      <td key={c.id} style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid #f0f2f7', background: isBest ? '#f0fdf4' : undefined }}>
                        <span style={{
                          display: 'inline-block', width: 30, height: 30, lineHeight: '30px', borderRadius: 15,
                          background: deepScoreColor(s), color: s > 0 ? '#fff' : '#cbd5e1', fontWeight: 700, fontSize: 13,
                        }}>
                          {s || '—'}
                        </span>
                        {p && p.tone && <span style={{ marginLeft: 4 }}>{toneIcon(p.tone)}</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (section === 'elements') {
    const elements = ['AGNI', 'VAYU', 'JALA', 'AKASHA'];
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 500 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e2e5f1', color: '#5c6580', fontWeight: 600, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>Element</th>
              {candidates.map(c => (
                <th key={c.id} style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid #e2e5f1' }}>
                  <div style={{ fontWeight: 700, color: '#1c2333', fontSize: 13 }}>{c.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {elements.map(el => {
              const meta = ELEMENT_META[el];
              const scores = candidates.map(c => c.tri_nature?.elements?.[el] || 0);
              const max = Math.max(...scores);
              return (
                <tr key={el} style={{ background: '#fff' }}>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f2f7', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                    <span style={{ fontWeight: 600, color: meta?.color }}>{meta?.icon} {meta?.label}</span>
                  </td>
                  {candidates.map(c => {
                    const s = c.tri_nature?.elements?.[el] || 0;
                    const isBest = s === max && max > 0;
                    return (
                      <td key={c.id} style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid #f0f2f7', background: isBest ? '#f0fdf4' : undefined }}>
                        <span style={{ fontWeight: 700, color: scoreColor(s), fontSize: 14 }}>{s}%</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* Dominant Element Row */}
            <tr style={{ background: '#f8fafc' }}>
              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f2f7', fontWeight: 600, position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1 }}>Dominant</td>
              {candidates.map(c => (
                <td key={c.id} style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid #f0f2f7' }}>
                  <Tag color={ELEMENT_META[c.tri_nature?.dominantElement]?.color} style={{ margin: 0, fontSize: 11 }}>
                    {ELEMENT_META[c.tri_nature?.dominantElement]?.label}
                  </Tag>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (section === 'categories') {
    const catKeys = Object.keys(candidates[0]?.tri_nature?.categories || {});
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 500 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e2e5f1', color: '#5c6580', fontWeight: 600, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>Category</th>
              {candidates.map(c => (
                <th key={c.id} style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid #e2e5f1' }}>
                  <div style={{ fontWeight: 700, color: '#1c2333', fontSize: 13 }}>{c.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {catKeys.map(key => {
              const scores = candidates.map(c => c.tri_nature?.categories?.[key]?.score || 0);
              const max = Math.max(...scores);
              return (
                <tr key={key} style={{ background: '#fff' }}>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f2f7', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                    <span style={{ fontWeight: 600, color: '#1c2333' }}>{CATEGORY_ICONS[key]} {candidates[0]?.tri_nature?.categories?.[key]?.name || key}</span>
                  </td>
                  {candidates.map(c => {
                    const s = c.tri_nature?.categories?.[key]?.score;
                    const isBest = s === max && max > 0;
                    return (
                      <td key={c.id} style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid #f0f2f7', background: isBest ? '#f0fdf4' : undefined }}>
                        <span style={{ fontWeight: 700, color: s != null ? scoreColor(s) : '#94a3b8', fontSize: 14 }}>
                          {s != null ? `${s}%` : '—'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (section === 'triguna') {
    const modes = ['Sattva', 'Rajas', 'Tamas'];
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 500 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e2e5f1', color: '#5c6580', fontWeight: 600, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>Mode</th>
              {candidates.map(c => (
                <th key={c.id} style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid #e2e5f1' }}>
                  <div style={{ fontWeight: 700, color: '#1c2333', fontSize: 13 }}>{c.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modes.map(mode => (
              <tr key={mode} style={{ background: '#fff' }}>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f2f7', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                  <Tag color={TRIGUNA_META[mode]?.color} style={{ margin: 0, fontSize: 11 }}>{TRIGUNA_META[mode]?.label || mode}</Tag>
                </td>
                {candidates.map(c => {
                  const s = c.tri_nature?.triguna?.[mode] || 0;
                  return (
                    <td key={c.id} style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid #f0f2f7' }}>
                      <span style={{ fontWeight: 700, color: scoreColor(s), fontSize: 14 }}>{s}%</span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr style={{ background: '#f8fafc' }}>
              <td style={{ padding: '8px 12px', fontWeight: 600, position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1 }}>Signature</td>
              {candidates.map(c => (
                <td key={c.id} style={{ textAlign: 'center', padding: '8px 12px', fontSize: 12, fontStyle: 'italic', color: '#5c6580' }}>
                  {c.tri_nature?.signature?.name || '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}

export default function InsightsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState([]);
  const [summary, setSummary] = useState({ total: 0, evaluated: 0, companies: [], jds: [] });
  const [jds, setJds] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [jdFilter, setJdFilter] = useState(null);
  const [companyFilter, setCompanyFilter] = useState(null);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedIds, setSelectedIds] = useState([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareData, setCompareData] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareTab, setCompareTab] = useState('deep');

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (jdFilter) params.set('jdId', jdFilter);
      if (companyFilter) params.set('companyId', companyFilter);
      params.set('sortBy', sortBy);
      params.set('order', sortOrder);
      const data = await api.get(`/api/admin/inner-intelligence/candidates?${params.toString()}`);
      setCandidates(data.candidates);
      setSummary(data.summary);
    } catch (e) {
      console.error('Failed to load insights:', e);
    }
    setLoading(false);
  }

  async function loadFilters() {
    try {
      const [jdList, compList] = await Promise.all([
        api.get('/api/admin/inner-intelligence/jds'),
        api.get('/api/admin/inner-intelligence/companies'),
      ]);
      setJds(jdList);
      setCompanies(compList);
    } catch (e) {
      console.error('Failed to load filters:', e);
    }
  }

  useEffect(() => { loadFilters(); }, []);
  useEffect(() => { loadData(); }, [jdFilter, companyFilter, sortBy, sortOrder]);

  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function selectAll() {
    const evalIds = candidates.filter(c => c.hasProfile).map(c => c.id);
    setSelectedIds(evalIds);
  }

  async function openCompare() {
    if (selectedIds.length < 2) return;
    setCompareLoading(true);
    setCompareOpen(true);
    try {
      const data = await api.post('/api/admin/inner-intelligence/compare', { candidateIds: selectedIds });
      setCompareData(data.candidates);
    } catch (e) {
      console.error(e);
    }
    setCompareLoading(false);
  }

  const sortOptions = [
    { label: 'Name', value: 'name' },
    { label: 'Avg Score', value: 'paramScore' },
    { label: 'Stillness', value: 'stillness' },
    { label: 'Luck', value: 'luck' },
    { label: 'Harmony', value: 'harmony' },
    { label: 'Destiny', value: 'destiny' },
    { label: 'Karmic', value: 'karmic' },
    { label: 'Intuition', value: 'intuition' },
  ];

  const compareTabs = [
    { key: 'deep', label: '6 Deep Parameters' },
    { key: 'elements', label: '4 Elements' },
    { key: 'categories', label: '6 Categories' },
    { key: 'triguna', label: 'Energy Modes' },
  ];

  return (
    <div style={{ padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#1c2333' }}>Inner Intelligence</Title>
          <Text style={{ color: '#8892a8', fontSize: 13 }}>Full behavioral profile — 6 categories, 4 elements, 21 parameters, plus fit signals</Text>
        </div>
        <Space>
          <Tag color="purple" style={{ fontSize: 12, padding: '2px 10px' }}>Total: {summary.total}</Tag>
          <Tag color="green" style={{ fontSize: 12, padding: '2px 10px' }}>Evaluated: {summary.evaluated}</Tag>
        </Space>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select placeholder="All JDs" allowClear style={{ minWidth: 200 }} value={jdFilter} onChange={setJdFilter} options={jds.map(j => ({ label: j.title, value: j.id }))} />
        <Select placeholder="All Companies" allowClear style={{ minWidth: 180 }} value={companyFilter} onChange={setCompanyFilter} options={companies.map(c => ({ label: c.client_name, value: c.id }))} />
        <Select placeholder="Sort by" style={{ minWidth: 140 }} value={sortBy} onChange={setSortBy} options={sortOptions} />
        <Button
          icon={<SwapOutlined style={{ transform: sortOrder === 'asc' ? 'rotate(180deg)' : undefined }} />}
          onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
          title={sortOrder === 'desc' ? 'Highest first' : 'Lowest first'}
        />
        <Button icon={<ReloadOutlined />} onClick={loadData}>Refresh</Button>
        <div style={{ flex: 1 }} />
        <Button onClick={selectAll} style={{ fontSize: 12 }}>Select All Evaluated</Button>
        {selectedIds.length > 0 && (
          <Tag closable onClose={() => setSelectedIds([])} style={{ fontSize: 12 }}>{selectedIds.length} selected</Tag>
        )}
        <Button type="primary" icon={<SwapOutlined />} disabled={selectedIds.length < 2} onClick={openCompare} style={{ background: '#6366f1', borderColor: '#6366f1' }}>
          Compare ({selectedIds.length})
        </Button>
      </div>

      <div style={{ padding: '8px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#92400e' }}>
        <WarningOutlined style={{ marginRight: 6 }} />
        Reflection, not a prediction. These are mathematical summaries of numerology data — not hiring signals.
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : candidates.length === 0 ? (
        <Empty description="No candidates found" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
          {candidates.map(c => (
            <CandidateCard key={c.id} c={c} selected={selectedIds.includes(c.id)} onToggle={toggleSelect} onView={(id) => navigate(`/scores/${id}`)} />
          ))}
        </div>
      )}

      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700 }}>Comparison — Full Behavioral Profile ({compareData ? compareData.length : 0} candidates)</span>
          </div>
        }
        open={compareOpen}
        onCancel={() => { setCompareOpen(false); setCompareData(null); }}
        footer={null}
        width={1000}
        styles={{ body: { padding: '16px 24px' } }}
      >
        <div style={{ padding: '6px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, marginBottom: 12, fontSize: 11, color: '#92400e' }}>
          Numerology comparison only — not an employment suitability ranking.
        </div>
        {compareLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : compareData ? (
          <Tabs activeKey={compareTab} onChange={setCompareTab} items={compareTabs.map(t => ({
            key: t.key,
            label: t.label,
            children: <ComparisonTable candidates={compareData} section={t.key} />,
          }))} />
        ) : null}
      </Modal>
    </div>
  );
}
