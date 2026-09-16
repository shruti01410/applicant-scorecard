import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import { AuthProvider, useAuth } from './services/AuthContext';
import LoginPage from './pages/LoginPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminHome from './pages/admin/AdminHome';
import ScoresPage from './pages/admin/ScoresPage';
import ScorePage from './pages/admin/ScorePage';
import CapabilityMatchPage from './pages/admin/CapabilityMatchPage';
import JobDescriptions from './pages/admin/JobDescriptions';
import InsightsPage from './pages/admin/InsightsPage';
import MyScorecard from './pages/employee/MyScorecard';
import './styles/app.css';

function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<AdminHome />} />
        <Route path="/scores" element={<ScoresPage />} />
        <Route path="/scores/:id" element={<ScorePage />} />
        <Route path="/scores/:id/capability" element={<CapabilityMatchPage />} />
        <Route path="/job-descriptions" element={<JobDescriptions />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function EmployeeRoutes() {
  return (
    <Routes>
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