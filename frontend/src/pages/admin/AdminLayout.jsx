import React from 'react';
import { Layout, Button, Tag, Typography } from 'antd';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../services/AuthContext';

const { Header, Content } = Layout;

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fullBleed = location.pathname === '/' || /^\/scores\/[^/]+$/.test(location.pathname);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <Layout style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Header className="navbar">
        <div className="container">
          <div className="nav-brand">Applicant Scorecard</div>
          <div className="nav-links" style={{ flex:1, justifyContent:'center' }}>
            <Link to="/" className="nav-link">Home</Link>
            <Link to="/scores" className="nav-link">Scores</Link>
            <Link to="/job-descriptions" className="nav-link">JDs</Link>
            <Link to="/decision-center" className="nav-link">Decisions</Link>
            <Link to="/insights" className="nav-link">Insights</Link>
          </div>
          <div className="nav-right" style={{ alignItems:'center', gap:8 }}>
            <span style={{ color:'#fff', fontWeight:600, fontSize:13 }}>Shruti</span>
            <Tag className="badge badge-emp" style={{ margin:0 }}>Admin</Tag>
            <button className="btn-logout" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </Header>
      <Content className={fullBleed ? 'page-full' : 'page'} style={fullBleed ? { paddingTop: 0 } : { paddingTop: 24 }}>
        <Outlet />
      </Content>
    </Layout>
  );
}