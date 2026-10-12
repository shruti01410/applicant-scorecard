import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import { AuthProvider, useAuth } from './services/AuthContext';
import LoginPage from './pages/LoginPage';
import ExplorePage from './pages/ExplorePage';
import LeadDashboard from './pages/LeadDashboard';
import AdminLayout from './pages/admin/AdminLayout';
import AdminHome from './pages/admin/AdminHome';
import ScoresPage from './pages/admin/ScoresPage';
import ScorePage from './pages/admin/ScorePage';
import CapabilityMatchPage from './pages/admin/CapabilityMatchPage';
import JobDescriptions from './pages/admin/JobDescriptions';
import InsightsPage from './pages/admin/InsightsPage';
import DecisionCenter from './pages/admin/DecisionCenter';
import HelpPage from './pages/admin/HelpPage';
import MyScorecard from './pages/employee/MyScorecard';
import './styles/app.css';

// Public short-link resolver — only reached when the server-side 302 is
// bypassed (dev server without backend, or a proxy that forwarded /l/:code
// to the SPA). Resolves via the JSON endpoint, then hard-navigates so the
// attribution query params land on the target page.
function ShortLinkResolver() {
  const { code } = useParams();
  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.VITE_API_URL || ''}/api/track/link/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (alive && d.target) window.location.replace(d.target); })
      .catch(() => { if (alive) window.location.replace('/explore'); });
    return () => { alive = false; };
  }, [code]);
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
      Opening link…
    </div>
  );
}

// Public routes available whether or not the visitor is signed in.
// NOTE: react-router's createRoutesFromChildren only accepts <Route> or
// React.Fragment children — call this as a function ({publicRoutes()}),
// never as a component element (<PublicRoutes />), or it throws an
// invariant and every page white-screens.
function publicRoutes() {
  return (
    <>
      <Route path="/explore" element={<ExplorePage />} />
      <Route path="/l/:code" element={<ShortLinkResolver />} />
      <Route path="/lead-dashboard" element={<LeadDashboard />} />
    </>
  );
}

function AdminRoutes() {
  return (
    <Routes>
      {publicRoutes()}
      <Route element={<AdminLayout />}>
        <Route index element={<AdminHome />} />
        <Route path="/scores" element={<ScoresPage />} />
        <Route path="/scores/:id" element={<ScorePage />} />
        <Route path="/scores/:id/capability" element={<CapabilityMatchPage />} />
        <Route path="/job-descriptions" element={<JobDescriptions />} />
        <Route path="/decision-center" element={<DecisionCenter />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function EmployeeRoutes() {
  return (
    <Routes>
      {publicRoutes()}
      <Route path="/" element={<MyScorecard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) {
    return (
      <Routes>
        {publicRoutes()}
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  return user.role === 'admin' ? <AdminRoutes /> : <EmployeeRoutes />;
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: { colorPrimary: '#6366f1', borderRadius: 8 },
      }}
    >
      <AntApp>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}
