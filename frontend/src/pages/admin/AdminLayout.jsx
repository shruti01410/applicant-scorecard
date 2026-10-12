import React, { useEffect, useState } from 'react';
import { Layout, Button, Tag, message, Popover, Spin } from 'antd';
import { GoogleOutlined, MailOutlined, DisconnectOutlined, TeamOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../services/AuthContext';
import { api } from '../../services/api';
import MfaPanel from '../../components/MfaPanel';
import ProductTour from '../../components/ProductTour';

const { Header, Content } = Layout;

// End-to-end guided tour. Steps can span routes: `path` sends the tour to a
// fixed route and `pathFrom` follows the href of a link (e.g. a candidate's
// Edit Score link) so the tour can walk into a scorecard and its tabs.
const TOUR_STEPS = [
  { sel: '[data-tour="nav-scores"]', path: '/scores', title: 'Start on Scores', body: 'Scores is your candidate list. Every candidate you are evaluating lives here.' },
  { sel: '[data-tour="add"]', path: '/scores', title: 'Add a candidate', body: 'Enter name, email and date of birth to add one person. Use Import from Excel to add many at once.' },
  { sel: '[data-tour="jd-header"]', path: '/job-descriptions', title: 'Job Descriptions (JDs)', body: 'JDs are what candidates are scored against. Add a JD, edit its keywords, and identical JDs are detected and rejected automatically.' },
  { sel: '[data-tour="insights-grid"]', path: '/insights', title: 'Insights', body: 'Insights compares candidates and shows Behavioural Reflection summaries side by side. Use Compare to view several at once.' },
  { sel: '[data-tour="score"]', path: '/scores', title: 'Open the scorecard', body: 'Edit Score opens the candidate scorecard. It has five tabs — let us walk through each one.' },
  { sel: '[data-tour="tab-overview"]', pathFrom: '[data-tour="score"]', title: 'Overview', body: 'Applicant details, the Pursuit Priority band, Candidate Fit and the Person/Role split at a glance.' },
  { sel: '[data-tour="tab-capability"]', title: 'Candidate Evaluation', body: 'The JD ↔ resume evaluation, fed straight into Candidate Fit.' },
  { sel: '[data-tour="tab-parameters"]', title: 'Score Parameters (16)', body: 'The 16 SOP parameters grouped as PERSON, ROLE and DEAL, weighted to 100%. Rate each 0–100 or mark it N/A.' },
  { sel: '[data-tour="tab-deal"]', title: 'Joining Evaluation', body: 'DEAL factors (motivation, availability, compensation and joining risks) that drive Joining Probability.' },
  { sel: '[data-tour="tab-inner"]', title: 'Behavioural Reflection', body: 'Admin-only and informational. It is never used in Candidate Fit or Joining Probability.' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [acct, setAcct] = useState(null);
  const [acctLoading, setAcctLoading] = useState(false);
  const fullBleed = location.pathname === '/' || /^\/scores\/[^/]+$/.test(location.pathname);

  useEffect(() => {
    const gmail = new URLSearchParams(location.search).get('gmail');
    if (!gmail) return;
    if (gmail === 'connected') message.success('Gmail connected — you can now save email drafts to Gmail.');
    else if (gmail === 'denied') message.warning('Gmail connection was cancelled.');
    else if (gmail === 'invalid_state') message.error('Gmail connection could not be verified. Please try again.');
    else if (gmail === 'error') message.error('Gmail connection failed. Please try again.');
    const url = new URL(window.location.href);
    url.searchParams.delete('gmail');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }, [location]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  async function loadAccount() {
    setAcctLoading(true);
    try {
      const d = await api.get('/api/admin/recruiter/profile');
      setAcct(d);
    } catch (e) {
      setAcct(null);
    } finally {
      setAcctLoading(false);
    }
  }

  async function handleConnect() {
    try {
      const r = await api.get(`/api/admin/gmail/connect?return_to=${encodeURIComponent(window.location.pathname)}`);
      window.location.assign(r.authUrl);
    } catch (e) {
      message.error(e.message);
    }
  }

  async function handleDisconnect() {
    try {
      await api.post('/api/admin/gmail/disconnect');
      setAcct((a) => (a ? { ...a, gmail: { ...a.gmail, connected: false, account: null } } : a));
      message.success('Gmail disconnected');
    } catch (e) {
      message.error(e.message);
    }
  }

  const gmail = acct && acct.gmail;

  const accountContent = (
    <div style={{ width: 260 }}>
      {acctLoading ? <Spin size="small" /> : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            {acct && acct.google && acct.google.photo_url && (
              <img src={acct.google.photo_url} alt="" style={{ width: 34, height: 34, borderRadius: '50%' }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 13 }}>{user && user.name}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{user && user.email}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Tag color={user && (user.login_method === 'google' || (acct && acct.google)) ? 'blue' : 'default'} style={{ margin: 0 }}>
              {user && (user.login_method === 'google' || (acct && acct.google)) ? <><GoogleOutlined /> Google account</> : 'Password sign-in'}
            </Tag>
          </div>
          <DividerDot />
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
            Gmail draft access
          </div>
          {gmail && (
            <div style={{ marginBottom: 10 }}>
              {gmail.connected ? (
                <div style={{ fontSize: 12, color: '#16a34a', marginBottom: 8 }}>
                  <MailOutlined /> {gmail.account}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                  Not connected — drafts can't be saved to Gmail yet.
                </div>
              )}
              {gmail.connected ? (
                <Button size="small" icon={<DisconnectOutlined />} onClick={handleDisconnect}>Disconnect Gmail</Button>
              ) : (
                <Button size="small" type="primary" icon={<MailOutlined />} onClick={handleConnect}>Connect Gmail</Button>
              )}
            </div>
          )}
          <DividerDot />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <SafetyCertificateOutlined style={{ color: '#475569' }} />
            <span style={{ fontSize: 12, color: '#475569' }}>Security</span>
          </div>
          <MfaPanel />
        </>
      )}
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Header className="navbar">
        <div className="container">
          <div className="nav-brand"><img src="/humsee-logo.png" alt="" className="nav-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />Humsee Score</div>
          <div className="nav-links" style={{ flex:1, justifyContent:'center' }}>
            <Link to="/" className="nav-link">Home</Link>
            <Link to="/scores" className="nav-link" data-tour="nav-scores">Scores</Link>
            <Link to="/job-descriptions" className="nav-link" data-tour="nav-jd">JDs</Link>
            <Link to="/decision-center" className="nav-link">Decisions</Link>
            <Link to="/insights" className="nav-link" data-tour="nav-insights">Insights</Link>
            <Link to="/help" className="nav-link">Help</Link>
          </div>
          <div className="nav-right" style={{ alignItems:'center', gap:8 }}>
            <Popover content={accountContent} title="Account" trigger="click" placement="bottomRight" arrow={false}>
              <span style={{ color:'#fff', fontWeight:600, fontSize:13, cursor:'pointer' }} onMouseEnter={loadAccount}>{user ? user.name : 'Account'}</span>
            </Popover>
            <Tag className="badge badge-emp" style={{ margin:0 }}>Admin</Tag>
            <button className="btn-logout" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </Header>
      <Content className={fullBleed ? 'page-full' : 'page'} style={fullBleed ? { paddingTop: 0 } : { paddingTop: 24 }}>
        <Outlet />
      </Content>
      <ProductTour steps={TOUR_STEPS} storageKey="humsee_scores_tour_done" />
    </Layout>
  );
}

function DividerDot() {
  return <div style={{ borderTop: '1px solid #e2e8f0', margin: '0 0 10px' }} />;
}