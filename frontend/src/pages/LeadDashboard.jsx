import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Tabs, Table, Tag, Button, Input, Select, Space, Drawer, message,
  Spin, Empty, Tooltip, Badge, Popconfirm, Card, Statistic,
} from 'antd';
import {
  ReloadOutlined, DownloadOutlined, CopyOutlined, PlusOutlined,
  LogoutOutlined, ArrowLeftOutlined, RetweetOutlined, EyeOutlined,
} from '@ant-design/icons';
import { api } from '../services/api';
import { useAuth } from '../services/AuthContext';
import '../styles/explore.css';

const STATUS_COLORS = {
  new: 'geekblue', contacted: 'blue', qualified: 'purple', converted: 'green', closed: 'default',
};
const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'converted', 'closed'].map((s) => ({ value: s, label: s }));

function token() {
  return localStorage.getItem('token');
}

async function downloadCsv() {
  const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/admin/leads/export`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- own login gate (never renders the shared /login page) ----------

function Gate({ onLogin }) {
  const { login, loginWithMfa } = useAuth();
  const [mfa, setMfa] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mfa) {
        const user = await loginWithMfa(mfa.mfa_token, code);
        onLogin(user);
      } else {
        const user = await login(username, password);
        if (user && user.mfa_required) setMfa({ mfa_token: user.mfa_token });
        else onLogin(user);
      }
    } catch (err) {
      setError(err.message || 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ld-gate">
      <div className="ld-gate-card">
        <div className="ld-gate-brand">
          <img src="/humsee-logo.png" alt="" className="ld-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          HUMSEE SCORE
        </div>
        <div className="ld-gate-tag">Lead Desk</div>
        <h2>Visitor &amp; lead tracking</h2>
        <p className="ld-gate-sub">Administrator sign-in required.</p>
        <form onSubmit={submit}>
          {mfa ? (
            <label className="ld-field">
              <span>Authentication code</span>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric" placeholder="123456" autoFocus />
            </label>
          ) : (
            <>
              <label className="ld-field">
                <span>Username</span>
                <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
              </label>
              <label className="ld-field">
                <span>Password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </label>
            </>
          )}
          {error && <div className="ld-error">{error}</div>}
          <button className="ld-btn" type="submit" disabled={busy || (mfa ? code.length !== 6 : !username || !password)}>
            {busy ? 'Signing in…' : mfa ? 'Verify code' : 'Sign in'}
          </button>
          {mfa && (
            <button type="button" className="ld-link-btn" onClick={() => { setMfa(null); setCode(''); setError(''); }}>
              ← Use password instead
            </button>
          )}
        </form>
        <Link to="/explore" className="ld-gate-back">← Back to public site</Link>
      </div>
    </div>
  );
}

// ---------- shared bits ----------

function Attribution({ attribution }) {
  if (!attribution || !Object.keys(attribution).length) return <span className="ld-muted">Direct</span>;
  return (
    <Space size={4} wrap>
      {attribution.utm_source && <Tag color="blue">{attribution.utm_source}</Tag>}
      {attribution.utm_campaign && <Tag>{attribution.utm_campaign}</Tag>}
      {attribution.sl && <Tag color="gold">link {attribution.sl}</Tag>}
      {attribution.gclid && <Tag color="green">gclid</Tag>}
      {attribution.ref && <Tag>via {attribution.ref}</Tag>}
    </Space>
  );
}

function Journey({ items }) {
  if (!items || !items.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No activity recorded yet" />;
  return (
    <div className="ld-journey">
      {items.map((e, i) => (
        <div className="ld-journey-row" key={`${e.id || i}-${e.created_at}`}>
          <span className={`ld-dot ld-dot-${e.event_type}`} />
          <div className="ld-journey-body">
            <div className="ld-journey-title">
              <b>{e.event_type}</b> {e.path && <code>{e.path}</code>}
            </div>
            {e.title && <div className="ld-muted">{e.title}</div>}
            {e.meta && typeof e.meta === 'object' && Object.keys(e.meta).length > 0 && (
              <div className="ld-muted ld-meta">{JSON.stringify(e.meta)}</div>
            )}
          </div>
          <div className="ld-journey-time">{(e.created_at || '').replace('T', ' ').slice(0, 16)}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- tabs ----------

function LeadsTab() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      const data = await api.get(`/api/admin/leads?${params.toString()}`);
      setRows(data.leads || []);
      setSummary(data.summary || {});
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => { load(); }, [load]);

  async function openDetail(id) {
    setDetailLoading(true);
    try {
      setDetail(await api.get(`/api/admin/leads/${id}`));
    } catch (e) {
      message.error(e.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function setStatusFor(id, next) {
    try {
      await api.patch(`/api/admin/leads/${id}`, { status: next });
      message.success(`Marked ${next}`);
      load();
      setDetail((d) => (d && d.lead.id === id ? { ...d, lead: { ...d.lead, status: next } } : d));
    } catch (e) {
      message.error(e.message);
    }
  }

  async function retry(id) {
    try {
      const r = await api.post(`/api/admin/tracking/deliveries/${id}/retry`, {});
      const d = r.delivery;
      if (d.status === 'sent') message.success('Delivered');
      else message.error(`Still failing: ${d.last_error}`);
      if (detail) openDetail(detail.lead.id);
    } catch (e) {
      message.error(e.message);
    }
  }

  const columns = [
    { title: 'Received', dataIndex: 'created_at', width: 150, render: (v) => (v || '').replace('T', ' ').slice(0, 16) },
    {
      title: 'Contact', key: 'contact', render: (_, r) => (
        <div>
          <b>{r.name}</b>
          <div className="ld-muted">{r.email}</div>
          {r.company && <div className="ld-muted">{r.company}{r.phone ? ` · ${r.phone}` : ''}</div>}
        </div>
      ),
    },
    { title: 'Interest', dataIndex: 'interest', width: 170, render: (v) => v || '—' },
    { title: 'Source', key: 'src', width: 190, render: (_, r) => <Attribution attribution={r.attribution} /> },
    { title: 'Path', dataIndex: 'source_path', width: 110, render: (v) => v || '—' },
    {
      title: 'Status', key: 'status', width: 150, render: (_, r) => (
        <Select size="small" value={r.status} options={STATUS_OPTIONS} style={{ width: 130 }}
          onChange={(v) => setStatusFor(r.id, v)} onClick={(e) => e.stopPropagation()} />
      ),
    },
    {
      title: '', key: 'act', width: 90, render: (_, r) => (
        <Button size="small" icon={<EyeOutlined />} onClick={(e) => { e.stopPropagation(); openDetail(r.id); }}>Journey</Button>
      ),
    },
  ];

  return (
    <div>
      <div className="ld-kpis">
        <Card><Statistic title="Total leads" value={summary.total || 0} /></Card>
        <Card><Statistic title="New" value={summary.new || 0} valueStyle={{ color: '#1677ff' }} /></Card>
        <Card><Statistic title="Qualified" value={summary.qualified || 0} valueStyle={{ color: '#722ed1' }} /></Card>
        <Card><Statistic title="Converted" value={summary.converted || 0} valueStyle={{ color: '#52c41a' }} /></Card>
        <Card><Statistic title="Closed" value={summary.closed || 0} /></Card>
      </div>

      <Space style={{ marginBottom: 14 }} wrap>
        <Input.Search placeholder="Name, email, company…" value={q} onChange={(e) => setQ(e.target.value)}
          onSearch={load} allowClear style={{ width: 260 }} />
        <Select placeholder="Status" allowClear value={status || undefined}
          onChange={(v) => setStatus(v || '')} options={STATUS_OPTIONS} style={{ width: 150 }} />
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
        <Button icon={<DownloadOutlined />} onClick={() => downloadCsv().catch((e) => message.error(e.message))}>Export CSV</Button>
      </Space>

      <Table rowKey="id" size="middle" loading={loading} columns={columns} dataSource={rows}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        onRow={(r) => ({ onClick: () => openDetail(r.id) })} />

      <Drawer title={detail ? `Lead #${detail.lead.id} — ${detail.lead.name}` : 'Lead'} width={560}
        open={!!detail} onClose={() => setDetail(null)} loading={detailLoading}>
        {detail && (
          <div>
            <div className="ld-detail-grid">
              <div><span>Email</span><a href={`mailto:${detail.lead.email}`}>{detail.lead.email}</a></div>
              <div><span>Company</span>{detail.lead.company || '—'}</div>
              <div><span>Phone</span>{detail.lead.phone || '—'}</div>
              <div><span>Interest</span>{detail.lead.interest || '—'}</div>
              <div><span>Received</span>{(detail.lead.created_at || '').replace('T', ' ').slice(0, 16)}</div>
              <div><span>Share link</span>{detail.lead.share_code ? `${detail.lead.share_label || ''} (${detail.lead.share_code})` : '—'}</div>
            </div>
            <div className="ld-detail-block">
              <span>Attribution</span>
              <Attribution attribution={detail.lead.attribution} />
            </div>
            {detail.lead.message && (
              <div className="ld-detail-block"><span>Message</span><p className="ld-message">{detail.lead.message}</p></div>
            )}

            {detail.deliveries && detail.deliveries.length > 0 && (
              <div className="ld-detail-block">
                <span>Webhook / email deliveries</span>
                {detail.deliveries.map((d) => (
                  <div className="ld-delivery" key={d.id}>
                    <Tag color={d.status === 'sent' ? 'green' : d.status === 'failed' ? 'red' : 'default'}>{d.status}</Tag>
                    <code className="ld-delivery-target">{d.target}</code>
                    <span className="ld-muted">attempts {d.attempts}</span>
                    {d.status !== 'sent' && (
                      <Button size="small" icon={<RetweetOutlined />} onClick={() => retry(d.id)}>Retry</Button>
                    )}
                    {d.last_error && <div className="ld-muted">{d.last_error}</div>}
                  </div>
                ))}
              </div>
            )}

            <div className="ld-detail-block">
              <span>Visitor journey</span>
              {detail.visitor ? (
                <div className="ld-muted" style={{ marginBottom: 8 }}>
                  Visitor <code>{(detail.visitor.visitor_uuid || '').slice(0, 8)}…</code> · first seen{' '}
                  {(detail.visitor.first_seen_at || '').replace('T', ' ').slice(0, 16)} · {detail.visitor.event_count} events
                </div>
              ) : (
                <div className="ld-muted" style={{ marginBottom: 8 }}>No linked visitor (submitted before tracking init).</div>
              )}
              <Journey items={detail.journey} />
            </div>

            <div className="ld-detail-block">
              <span>Update status</span>
              <Select value={detail.lead.status} options={STATUS_OPTIONS} style={{ width: 180 }}
                onChange={(v) => setStatusFor(detail.lead.id, v)} />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function VisitorsTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/admin/tracking/visitors');
      setRows(data.visitors || []);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function open(id) {
    try {
      setDetail(await api.get(`/api/admin/tracking/visitors/${id}`));
    } catch (e) {
      message.error(e.message);
    }
  }

  const columns = [
    { title: 'Last seen', dataIndex: 'last_seen_at', width: 150, render: (v) => (v || '').replace('T', ' ').slice(0, 16) },
    { title: 'First seen', dataIndex: 'first_seen_at', width: 150, render: (v) => (v || '').replace('T', ' ').slice(0, 16) },
    { title: 'Visitor', dataIndex: 'visitor_uuid', width: 120, render: (v) => <code>{(v || '').slice(0, 8)}…</code> },
    { title: 'Landing', dataIndex: 'landing_path', width: 160, render: (v) => v || '—' },
    { title: 'First touch', key: 'ft', render: (_, r) => <Attribution attribution={r.first_touch} /> },
    { title: 'Events', dataIndex: 'event_count', width: 80 },
    { title: 'Sessions', dataIndex: 'sessions', width: 90 },
    {
      title: '', key: 'act', width: 110, render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => open(r.id)}>Timeline</Button>
          {r.lead_id && <Tag color="green">lead</Tag>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 14 }}>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <Table rowKey="id" size="middle" loading={loading} columns={columns} dataSource={rows}
        pagination={{ pageSize: 20, showSizeChanger: false }} />
      <Drawer title="Visitor timeline" width={560} open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <div>
            <div className="ld-detail-grid">
              <div><span>Visitor</span><code>{detail.visitor.visitor_uuid}</code></div>
              <div><span>First seen</span>{(detail.visitor.first_seen_at || '').replace('T', ' ').slice(0, 16)}</div>
              <div><span>Last seen</span>{(detail.visitor.last_seen_at || '').replace('T', ' ').slice(0, 16)}</div>
              <div><span>Events</span>{detail.visitor.event_count}</div>
            </div>
            <div className="ld-detail-block"><span>First touch</span><Attribution attribution={detail.visitor.first_touch} /></div>
            <div className="ld-detail-block"><span>Last touch</span><Attribution attribution={detail.visitor.last_touch} /></div>
            <div className="ld-detail-block"><span>Activity</span><Journey items={detail.events} /></div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function SourcesTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get(`/api/admin/tracking/analytics?days=${days}`));
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Spin style={{ display: 'block', margin: '60px auto' }} />;
  if (!data) return <Empty />;

  const maxSource = Math.max(1, ...data.sources.map((s) => s.visitors));
  const maxPage = Math.max(1, ...data.pages.map((p) => p.n));
  const maxDay = Math.max(1, ...data.daily.map((d) => d.n));

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select value={days} onChange={setDays} style={{ width: 160 }}
          options={[7, 30, 90, 180].map((d) => ({ value: d, label: `Last ${d} days` }))} />
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>

      <div className="ld-kpis">
        <Card><Statistic title="Visitors" value={data.totals.visitors} /></Card>
        <Card><Statistic title="Sessions" value={data.totals.sessions} /></Card>
        <Card><Statistic title="Events" value={data.totals.events} /></Card>
        <Card><Statistic title="Share clicks" value={data.totals.shareClicks} /></Card>
        <Card><Statistic title="Leads" value={data.totals.leads} valueStyle={{ color: '#52c41a' }} /></Card>
      </div>

      <div className="ld-two-col">
        <Card title="Sources (first touch)" size="small" className="ld-chart-card">
          {data.sources.length ? data.sources.map((s) => (
            <div className="ld-bar-row" key={s.source}>
              <span className="ld-bar-label">{s.source}</span>
              <div className="ld-bar-track"><div className="ld-bar-fill" style={{ width: `${(s.visitors / maxSource) * 100}%` }} /></div>
              <span className="ld-bar-val">{s.visitors}</span>
            </div>
          )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        </Card>

        <Card title="Top pages" size="small" className="ld-chart-card">
          {data.pages.length ? data.pages.map((p) => (
            <div className="ld-bar-row" key={p.path}>
              <span className="ld-bar-label">{p.path}</span>
              <div className="ld-bar-track"><div className="ld-bar-fill ld-bar-fill-alt" style={{ width: `${(p.n / maxPage) * 100}%` }} /></div>
              <span className="ld-bar-val">{p.n}</span>
            </div>
          )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        </Card>
      </div>

      <div className="ld-two-col">
        <Card title={`Events per day (last ${days})`} size="small" className="ld-chart-card">
          <div className="ld-hist">
            {data.daily.map((d) => (
              <Tooltip key={d.day} title={`${d.day}: ${d.n}`}>
                <div className="ld-hist-bar" style={{ height: `${Math.max(4, (d.n / maxDay) * 100)}%` }} />
              </Tooltip>
            ))}
          </div>
          {!data.daily.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        </Card>

        <Card title="Event types" size="small" className="ld-chart-card">
          {data.eventTypes.map((t) => (
            <div className="ld-bar-row" key={t.event_type}>
              <span className="ld-bar-label">{t.event_type}</span>
              <div className="ld-bar-track"><div className="ld-bar-fill" style={{ width: `${(t.n / Math.max(1, data.eventTypes[0].n)) * 100}%` }} /></div>
              <span className="ld-bar-val">{t.n}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function ShareLinksTab({ analytics, reloadAnalytics }) {
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('/explore');
  const [utmSource, setUtmSource] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [busy, setBusy] = useState(false);

  const links = (analytics && analytics.shareLinks) || [];

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post('/api/admin/tracking/share-links', {
        label: label || 'Untitled link',
        target_path: target,
        utm: { utm_source: utmSource || undefined, utm_campaign: utmCampaign || undefined },
      });
      message.success('Share link created');
      setLabel('');
      setUtmSource('');
      setUtmCampaign('');
      reloadAnalytics();
      copy(`${window.location.origin}/l/${r.shareLink.code}`);
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => message.success('Link copied'));
    } else {
      message.info(text);
    }
  }

  async function toggle(row) {
    try {
      await api.patch(`/api/admin/tracking/share-links/${row.id}`, { active: !row.active });
      reloadAnalytics();
    } catch (e) {
      message.error(e.message);
    }
  }

  const columns = [
    {
      title: 'Label', key: 'label', render: (_, r) => (
        <div><b>{r.label}</b><div className="ld-muted">{r.target_path}</div></div>
      ),
    },
    {
      title: 'URL', key: 'url', render: (_, r) => (
        <Space size={4}>
          <code className="ld-url">{`${window.location.origin}/l/${r.code}`}</code>
          <Tooltip title="Copy">
            <Button size="small" icon={<CopyOutlined />} onClick={() => copy(`${window.location.origin}/l/${r.code}`)} />
          </Tooltip>
        </Space>
      ),
    },
    { title: 'UTM', key: 'utm', render: (_, r) => <Attribution attribution={r.utm} /> },
    { title: 'Clicks', dataIndex: 'clicks', width: 90 },
    { title: 'Leads', dataIndex: 'leads', width: 90, render: (v) => <Badge count={v} showZero color={v ? 'green' : 'default'} /> },
    {
      title: 'State', key: 'active', width: 110, render: (_, r) => (
        <Popconfirm title={r.active ? 'Deactivate this link?' : 'Reactivate this link?'} onConfirm={() => toggle(r)}>
          <Tag color={r.active ? 'green' : 'default'} style={{ cursor: 'pointer' }}>{r.active ? 'active' : 'off'}</Tag>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Card title="Create a share link" size="small" style={{ marginBottom: 16 }}>
        <form onSubmit={create} className="ld-share-form">
          <Input placeholder="Label (e.g. Q3 LinkedIn)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
          <Select value={target} onChange={setTarget} style={{ width: 180 }}
            options={[
              { value: '/explore', label: '→ /explore (tour)' },
              { value: '/lead-dashboard', label: '→ /lead-dashboard' },
              { value: '/', label: '→ / (home)' },
            ]} />
          <Input placeholder="utm_source (e.g. linkedin)" value={utmSource} onChange={(e) => setUtmSource(e.target.value)} maxLength={80} />
          <Input placeholder="utm_campaign" value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} maxLength={80} />
          <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={busy}>Create</Button>
        </form>
      </Card>
      <Table rowKey="id" size="middle" columns={columns} dataSource={links}
        pagination={false}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No share links yet — create one above" /> }} />
      <p className="ld-muted" style={{ marginTop: 10 }}>
        Open a link to see it redirect to the target with attribution appended (e.g. <code>/explore?sl=abc123&amp;utm_source=linkedin</code>).
      </p>
    </div>
  );
}

// ---------- page ----------

export default function LeadDashboard() {
  const { user, loading, logout } = useAuth();
  const [analytics, setAnalytics] = useState(null);

  const loadAnalytics = useCallback(async () => {
    try {
      setAnalytics(await api.get('/api/admin/tracking/analytics?days=90'));
    } catch (e) {
      // non-fatal — tabs load their own data
    }
  }, []);

  useEffect(() => {
    if (user && user.role === 'admin') loadAnalytics();
  }, [user, loadAnalytics]);

  if (loading) return <div className="ld-loading"><Spin size="large" /></div>;

  if (!user) return <Gate onLogin={() => { /* AuthContext state flips -> re-render */ }} />;

  if (user.role !== 'admin') {
    return (
      <div className="ld-gate">
        <div className="ld-gate-card">
          <div className="ld-gate-tag">Lead Desk</div>
          <h2>Administrator access required</h2>
          <p className="ld-gate-sub">Signed in as <b>{user.username}</b> ({user.role}). Use an admin account.</p>
          <Space>
            <Button onClick={logout}>Sign out</Button>
            <Link to="/"><Button type="primary">Back to app</Button></Link>
          </Space>
        </div>
      </div>
    );
  }

  const items = [
    { key: 'leads', label: <span><Badge count={analytics ? analytics.totals.leads : 0} size="small" offset={[6, 0]}>Leads</Badge></span>, children: <LeadsTab /> },
    { key: 'visitors', label: 'Visitors', children: <VisitorsTab /> },
    { key: 'sources', label: 'Sources', children: <SourcesTab /> },
    { key: 'links', label: 'Share Links', children: <ShareLinksTab analytics={analytics} reloadAnalytics={loadAnalytics} /> },
  ];

  return (
    <div className="ld-root">
      <header className="ld-header">
        <div className="ld-header-left">
          <img src="/humsee-logo.png" alt="" className="ld-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span className="ld-brand">HUMSEE SCORE</span>
          <span className="ld-sep">/</span>
          <span className="ld-page">Lead Desk</span>
        </div>
        <div className="ld-header-right">
          <Link to="/" className="ld-back"><ArrowLeftOutlined /> Back to app</Link>
          <span className="ld-user">{user.name || user.username}</span>
          <Tooltip title="Sign out">
            <Button size="small" icon={<LogoutOutlined />} onClick={logout} />
          </Tooltip>
        </div>
      </header>
      <main className="ld-main">
        <Tabs defaultActiveKey="leads" items={items} />
      </main>
    </div>
  );
}
