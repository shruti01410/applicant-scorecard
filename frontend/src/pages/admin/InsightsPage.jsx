import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Spin, Empty, Select, Button, Tag, Modal, Tabs, Dropdown } from 'antd';
import {
  SearchOutlined, ReloadOutlined, AppstoreOutlined, UnorderedListOutlined,
  EditOutlined, MoreOutlined, RightOutlined, SwapOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import * as scoreStatus from '../../scoreStatus';

const { Title } = Typography;

const AVATAR_COLORS = ['#33436B', '#6E58C9', '#2E8B57', '#B8860B', '#C0392B', '#2563EB'];

const PARAM_KEYS = [
  { key: 'stillness', label: 'Stillness in Company', color: '#6366f1' },
  { key: 'luck', label: 'Luck & Fortune Flow', color: '#f59e0b' },
  { key: 'harmony', label: 'Harmony with Company', color: '#10b981' },
  { key: 'destiny', label: 'Destiny Momentum', color: '#3b82f6' },
  { key: 'karmic', label: 'Karmic Balance', color: '#ec4899' },
  { key: 'intuition', label: 'Intuitive Clarity', color: '#8b5cf6' },
];

const ELEMENT_META = {
  AGNI: { label: 'Momentum', color: '#ef4444', desc: 'Drive, initiative, action' },
  VAYU: { label: 'Ideation', color: '#3b82f6', desc: 'Creativity, communication, ideas' },
  JALA: { label: 'Connection', color: '#10b981', desc: 'Empathy, patience, emotional depth' },
  AKASHA: { label: 'Perspective', color: '#8b5cf6', desc: 'Self-awareness, authenticity, values' },
};

const TRIGUNA_META = {
  Sattva: { color: '#10b981', label: 'Clarity' },
  Rajas: { color: '#f59e0b', label: 'Drive' },
  Tamas: { color: '#6b7280', label: 'Stability' },
};

const CATEGORY_ICONS = {
  Expression: '🗣', Attitude: '⚖️', Unmasked: '🔓', Personality: '🪞', 'Soul Urge': '💎', Masked: '🎭',
};

function scoreColor(s) {
  return scoreStatus.scoreColor(s);
}

function tileTone(v) {
  if (v == null) return '';
  if (v >= 65) return 'good';
  if (v >= 40) return 'amber';
  return 'bad';
}

function ringToneClass(v) {
  if (v == null) return '';
  if (v >= 65) return 'good';
  if (v >= 50) return 'amber';
  return 'bad';
}

function ringColor(v) {
  if (v == null) return 'var(--line-soft)';
  if (v >= 65) return 'var(--good)';
  if (v >= 50) return 'var(--amber)';
  return 'var(--bad)';
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function avatarColor(id) {
  return AVATAR_COLORS[Math.abs(Number(id) || 0) % AVATAR_COLORS.length];
}

function Bar({ value, color }) {
  const pct = Math.min(100, value || 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--line-soft)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: scoreColor(value), minWidth: 28, textAlign: 'right' }}>{value}%</span>
    </div>
  );
}

function DeepBar({ value, color }) {
  const pct = (value / 5) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--line-soft)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: scoreColor(value * 20), minWidth: 22, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function scoreBadge(s) {
  if (s == null) return '—';
  const w = Math.max(0, Math.min(100, s));
  return (
    <span style={{
      display: 'inline-block', minWidth: 34, padding: '3px 6px', borderRadius: 8,
      background: scoreColor(w), color: '#fff', fontWeight: 700, fontSize: 13, textAlign: 'center',
    }}>{s}</span>
  );
}

function toneIcon(p) {
  if (!p || !p.tone) return null;
  if (p.tone === 'good') return <span style={{ color: '#16a34a' }}>✔</span>;
  if (p.tone === 'watch') return <span style={{ color: '#ef4444' }}>!</span>;
  return null;
}

function CandidateCard({ c, selected, onToggle, onView, onViewReport, onCapability }) {
  const avgPct = c.avg_score != null ? Math.round((c.avg_score / 5) * 100) : null;
  const elements = c.tri_nature?.elements || {};
  const archetype = c.tri_nature?.signature?.name || c.top_parameter?.name || 'Not evaluated';
  const tags = [];
  if (c.tri_nature?.dominantElement) tags.push(ELEMENT_META[c.tri_nature.dominantElement]?.label || c.tri_nature.dominantElement);
  if (c.tri_nature?.dominantMode) tags.push(TRIGUNA_META[c.tri_nature.dominantMode]?.label || c.tri_nature.dominantMode);

  const roleLine = [c.jd_title, c.company_name].filter(Boolean).join(' · ') || 'No role linked';

  const best = c.deep_params && c.deep_params.length
    ? c.deep_params.reduce((a, b) => (b.score > a.score ? b : a))
    : null;
  const worst = c.deep_params && c.deep_params.length
    ? c.deep_params.reduce((a, b) => (b.score < a.score ? b : a))
    : null;

  const kebabItems = [
    { key: 'scorecard', label: 'Open scorecard', onClick: () => onView(c.id) },
    { key: 'reflection', label: 'Behavioral Reflection', onClick: () => onViewReport(c.id) },
    { key: 'capability', label: 'Candidate evaluation', onClick: () => onCapability(c.id) },
  ];

  return (
    <div className="cand-card" style={selected ? { borderColor: 'var(--brand)', boxShadow: '0 0 0 1px var(--brand)' } : undefined}>
      <div className="cc-top">
        <div className="cc-id">
          <div className="cc-avatar" style={{ background: avatarColor(c.id) }}>{initials(c.name)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="cc-name">{c.name}</div>
            <div className="cc-role">{roleLine}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`cc-pill ${c.hasProfile ? 'completed' : 'pending'}`}>
            {c.hasProfile ? 'Completed' : 'In progress'}
          </span>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(c.id)}
            title="Select to compare"
            style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}
          />
        </div>
      </div>

      <div className="cc-score-row">
        <div
          className="cc-ring"
          data-val={avgPct != null ? `${avgPct}%` : '—'}
          style={{ background: `conic-gradient(${ringColor(avgPct)} 0% ${avgPct || 0}%, var(--line-soft) ${avgPct || 0}% 100%)` }}
        />
        <div className="cc-score-text">
          <div className="label">Overall reflection</div>
          <div className="archetype">{archetype}</div>
        </div>
        {tags.length > 0 && (
          <div className="cc-tags">
            {tags.map((t, i) => (
              <span key={i} className={`ir-tag${i > 0 ? ' violet' : ''}`}>{t}</span>
            ))}
          </div>
        )}
      </div>

      <div className="cc-metrics">
        {(['AGNI', 'VAYU', 'JALA', 'AKASHA']).map(el => {
          const v = elements[el];
          const meta = ELEMENT_META[el];
          return (
            <div className="metric-tile" key={el} title={meta.desc}>
              <div className={`m-val ${tileTone(v)}`}>{v != null ? `${v}%` : '—'}</div>
              <div className="m-label">{meta.label}</div>
            </div>
          );
        })}
      </div>

      <div className="priority-block">
        <div className="priority-head">
          <span className="p-label">Inner Intelligence insight</span>
          {avgPct != null && <span className={`p-pct ${ringToneClass(avgPct)}`}>{avgPct}%</span>}
        </div>
        {c.deep_params && c.deep_params.length > 0 ? (
          <>
            <div style={{ display: 'grid', gap: 4 }}>
              {c.deep_params.slice(0, 3).map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-soft)', minWidth: 130, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.name}
                  </span>
                  <DeepBar value={p.score} color={PARAM_KEYS[i]?.color || '#94a3b8'} />
                  {toneIcon(p)}
                </div>
              ))}
            </div>
            <div className="priority-breakdown">
              {best && <span className="seg">Top: {best.name} {best.score}/5 ({Math.round((best.score / 5) * 100)}%)</span>}
              {worst && best && worst.score !== best.score && (
                <>
                  <span className="sep">·</span>
                  <span className="seg">Edge: {worst.name} {worst.score}/5</span>
                </>
              )}
              <span className="evidence">{c.hasProfile ? 'Behavioral profile' : 'Add DOB to evaluate'}</span>
            </div>
          </>
        ) : (
          <div className="priority-breakdown">
            <span className="seg">No behavioral data yet</span>
            <span className="evidence">Add DOB to evaluate</span>
          </div>
        )}
      </div>

      <div className="cc-foot">
        <span className="updated">{c.email || ''}</span>
        <div className="cc-foot-actions">
          <a className="view-link" onClick={() => onViewReport(c.id)}>
            View details
            <svg viewBox="0 0 20 20" fill="none"><path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
          <button className="edit-score-btn" onClick={() => onView(c.id)}>
            <EditOutlined />
            Edit Score
          </button>
          <Dropdown menu={{ items: kebabItems }} placement="bottomRight" trigger={['click']}>
            <button className="kebab-btn" title="More actions"><MoreOutlined /></button>
          </Dropdown>
        </div>
      </div>
    </div>
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
                const p = (c.deep_params || []).find(dp => dp.name === pk.label);
                return p ? p.score : 0;
              });
              const max = Math.max(...scores);
              return (
                <tr key={pk.key} style={{ background: '#fff' }}>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f2f7', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                    <span style={{ fontWeight: 600, color: '#1c2333' }}>{pk.label}</span>
                  </td>
                  {candidates.map(c => {
                    const p = (c.deep_params || []).find(dp => dp.name === pk.label);
                    const s = p ? p.score : 0;
                    const isBest = s === max && max > 0;
                    return (
                      <td key={c.id} style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid #f0f2f7', background: isBest ? '#f0fdf4' : undefined }}>
                        <span style={{
                          display: 'inline-block', width: 30, height: 30, lineHeight: '30px', borderRadius: 15,
                          background: s > 0 ? scoreColor(s * 20) : '#cbd5e1', color: s > 0 ? '#fff' : '#cbd5e1', fontWeight: 700, fontSize: 13,
                        }}>
                          {s || '—'}
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

  if (section === 'elements') {
    const els = ['AGNI', 'VAYU', 'JALA', 'AKASHA'];
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
            {els.map(el => {
              const meta = ELEMENT_META[el];
              const scores = candidates.map(c => c.tri_nature?.elements?.[el] || 0);
              const max = Math.max(...scores);
              return (
                <tr key={el} style={{ background: '#fff' }}>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f2f7', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                    <span style={{ fontWeight: 600, color: meta.color }}>{meta.label}</span>
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
            <tr style={{ background: '#f8fafc' }}>
              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f2f7', fontWeight: 600, position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1 }}>Dominant</td>
              {candidates.map(c => (
                <td key={c.id} style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid #f0f2f7' }}>
                  <Tag color={ELEMENT_META[c.tri_nature?.dominantElement]?.color} style={{ margin: 0, fontSize: 11 }}>
                    {ELEMENT_META[c.tri_nature?.dominantElement]?.label || '—'}
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
    if (!catKeys.length) return <Empty description="No category data" />;
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
  const [summary, setSummary] = useState({ total: 0, evaluated: 0 });
  const [jds, setJds] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [jdFilter, setJdFilter] = useState(null);
  const [companyFilter, setCompanyFilter] = useState(null);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('desc');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid');
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
    setSelectedIds(candidates.filter(c => c.hasProfile).map(c => c.id));
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(c =>
      c.name.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)
    );
  }, [candidates, search]);

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

  const profileCount = candidates.filter(c => c.tri_nature).length;

  return (
    <div className="insights-view" style={{ padding: '0 24px 24px' }}>
      <div className="page-head">
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#1B2330' }}>Behavioral Reflection</Title>
          <div className="sub">
            <b>{summary.total || candidates.length}</b> candidates &middot;{' '}
            <b>{summary.evaluated}</b> completed &middot; <b>{profileCount}</b> profiles
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <SearchOutlined />
          <input
            type="text"
            placeholder="Search by candidate name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select
          placeholder="All JDs"
          allowClear
          style={{ minWidth: 180 }}
          size="middle"
          value={jdFilter}
          onChange={setJdFilter}
          options={jds.map(j => ({ label: j.title, value: j.id }))}
        />
        <Select
          placeholder="All Companies"
          allowClear
          style={{ minWidth: 160 }}
          size="middle"
          value={companyFilter}
          onChange={setCompanyFilter}
          options={companies.map(c => ({ label: c.client_name, value: c.id }))}
        />
        <Select
          placeholder="Sort by"
          style={{ minWidth: 130 }}
          size="middle"
          value={sortBy}
          onChange={setSortBy}
          options={sortOptions}
        />
        <button
          className="bar-btn"
          title={sortOrder === 'desc' ? 'Highest first' : 'Lowest first'}
          onClick={() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
        >
          <SwapOutlined style={{ transform: sortOrder === 'asc' ? 'rotate(180deg)' : undefined }} />
        </button>
        <button className="bar-btn" onClick={loadData}><ReloadOutlined /> Refresh</button>
        <div style={{ flex: 1 }} />
        <button className="bar-btn" onClick={selectAll}>Select evaluated</button>
        {selectedIds.length > 0 && (
          <Tag closable onClose={() => setSelectedIds([])} style={{ fontSize: 12 }}>
            {selectedIds.length} selected
          </Tag>
        )}
        <Button
          type="primary"
          icon={<SwapOutlined />}
          disabled={selectedIds.length < 2}
          onClick={openCompare}
          style={{ background: '#33436B', borderColor: '#33436B' }}
        >
          Compare ({selectedIds.length})
        </Button>
        <div className="view-toggle">
          <button
            className={viewMode === 'grid' ? 'active' : ''}
            title="Grid view"
            onClick={() => setViewMode('grid')}
          >
            <AppstoreOutlined />
          </button>
          <button
            className={viewMode === 'list' ? 'active' : ''}
            title="List view"
            onClick={() => setViewMode('list')}
          >
            <UnorderedListOutlined />
          </button>
        </div>
      </div>

      <div style={{ padding: '8px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#92400E' }}>
        Reflection, not a prediction. These are mathematical summaries of numerology data — not hiring signals.
        Not used directly in Candidate Fit or Joining Probability.
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : visible.length === 0 ? (
        <Empty description="No candidates found" />
      ) : (
        <div className={`ir-grid${viewMode === 'list' ? ' list-mode' : ''}`} data-tour="insights-grid">
          {visible.map(c => (
            <CandidateCard
              key={c.id}
              c={c}
              selected={selectedIds.includes(c.id)}
              onToggle={toggleSelect}
              onView={(id) => navigate(`/scores/${id}`)}
              onViewReport={(id) => navigate(`/scores/${id}?tab=inner&report=1`)}
              onCapability={(id) => navigate(`/scores/${id}/capability`)}
            />
          ))}
        </div>
      )}

      <Modal
        title={
          <span style={{ fontWeight: 700 }}>
            Comparison — Inner Intelligence ({compareData ? compareData.length : 0} candidates)
          </span>
        }
        open={compareOpen}
        onCancel={() => { setCompareOpen(false); setCompareData(null); }}
        footer={null}
        width={1000}
        styles={{ body: { padding: '16px 24px' } }}
      >
        <div style={{ padding: '6px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, marginBottom: 12, fontSize: 11, color: '#92400E' }}>
          Numerology comparison only — not an employment suitability ranking.
        </div>
        {compareLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : compareData ? (
          <Tabs
            activeKey={compareTab}
            onChange={setCompareTab}
            items={compareTabs.map(t => ({
              key: t.key,
              label: t.label,
              children: <ComparisonTable candidates={compareData} section={t.key} />,
            }))}
          />
        ) : null}
      </Modal>
    </div>
  );
}
