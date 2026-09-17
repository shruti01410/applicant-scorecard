import React, { useEffect, useState } from 'react';
import { Form, Input, Button, Typography, Alert, Divider } from 'antd';
import { GoogleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    import('../services/firebase')
      .then((m) => m.firebaseLoginAvailable())
      .then((ok) => setGoogleEnabled(ok))
      .catch(() => setGoogleEnabled(false));
  }, []);

  async function onFinish(values) {
    setLoading(true);
    setError('');
    try {
      const user = await login(values.username, values.password);
      navigate(user.role === 'admin' ? '/' : '/');
    } catch (e) {
      setError(e.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleSignIn() {
    setGoogleLoading(true);
    setError('');
    try {
      const { firebaseLoginAvailable, signInWithGoogle } = await import('../services/firebase');
      if (!(await firebaseLoginAvailable())) {
        setError('Google login is not enabled for this deployment yet.');
        return;
      }
      const { idToken } = await signInWithGoogle();
      const userData = await loginWithGoogle(idToken);
      navigate(userData.role === 'admin' ? '/' : '/');
    } catch (e) {
      setError(e.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">
          <div className="logo-icon">📋</div>
          <Typography.Title level={3} style={{ margin: '10px 0 4px', color:'#1e293b', fontWeight:700, textAlign:'center' }}>Applicant Scorecard</Typography.Title>
          <Typography.Text type="secondary" style={{ display:'block', textAlign:'center', fontSize:14 }}>Sign in to your account</Typography.Text>
        </div>
        {error && <Alert type="error" description={error} showIcon style={{ marginBottom: 16 }} />}
        {googleEnabled && (
          <>
            <Button
              icon={<GoogleOutlined />}
              block
              size="large"
              loading={googleLoading}
              onClick={onGoogleSignIn}
              style={{ borderRadius: 8, height: 44, fontWeight: 600, marginBottom: 12 }}
            >
              Continue with Google
            </Button>
            <Divider style={{ margin: '4px 0 16px', fontSize: 12 }} plain>or sign in with username</Divider>
          </>
        )}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="username" label={<span style={{ fontWeight:600, fontSize:13, color:'#374151' }}>Username</span>} rules={[{ required: true, message: 'Enter username' }]} style={{ marginBottom: 12 }}>
            <Input placeholder="Enter username" size="large" style={{ borderRadius:8 }} />
          </Form.Item>
          <Form.Item name="password" label={<span style={{ fontWeight:600, fontSize:13, color:'#374151' }}>Password</span>} rules={[{ required: true, message: 'Enter password' }]} style={{ marginBottom: 20 }}>
            <Input.Password placeholder="Enter password" size="large" style={{ borderRadius:8 }} />
          </Form.Item>
          <Button className="btn-primary full-width" htmlType="submit" block size="large" loading={loading} style={{ borderRadius:8, height:44, fontWeight:700 }}>
            Sign In
          </Button>
        </Form>
      </div>
    </div>
  );
}