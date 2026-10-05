import React, { useEffect, useState } from 'react';
import { Form, Input, Button, Typography, Alert, Divider } from 'antd';
import { GoogleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';

export default function LoginPage() {
  const { login, loginWithGoogle, loginWithMfa } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleEnabled] = useState(true);
  const [logoFailed, setLogoFailed] = useState(false);
  const [mfaPending, setMfaPending] = useState(null); // { mfa_token }
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  async function onFinish(values) {
    setLoading(true);
    setError('');
    try {
      const user = await login(values.username, values.password);
      if (user && user.mfa_required) {
        setMfaPending({ mfa_token: user.mfa_token });
        return;
      }
      navigate(user.role === 'admin' ? '/' : '/');
    } catch (e) {
      setError(e.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  async function onMfaFinish(e) {
    e && e.preventDefault();
    setMfaLoading(true);
    setError('');
    try {
      const user = await loginWithMfa(mfaPending.mfa_token, mfaCode);
      navigate(user.role === 'admin' ? '/' : '/');
    } catch (err) {
      setError(err.message || 'Invalid authentication code');
    } finally {
      setMfaLoading(false);
    }
  }

  async function onGoogleSignIn() {
    setGoogleLoading(true);
    setError('');
    try {
      const { firebaseLoginAvailable, signInWithGoogle, friendlyFirebaseError } = await import('../services/firebase');
      if (!(await firebaseLoginAvailable())) {
        setError('Google login is not enabled for this deployment yet.');
        return;
      }
      const { idToken } = await signInWithGoogle();
      const userData = await loginWithGoogle(idToken);
      navigate(userData.role === 'admin' ? '/' : '/');
    } catch (e) {
      setError(friendlyFirebaseError(e));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">
          {logoFailed ? (
            <div className="logo-icon">📋</div>
          ) : (
            <img src="/humsee-logo.png" alt="Humsee Score logo" className="login-logo-img" onError={() => setLogoFailed(true)} />
          )}
          <Typography.Title level={3} style={{ margin: '10px 0 4px', color:'#1e293b', fontWeight:700, textAlign:'center' }}>Humsee Score</Typography.Title>
          <Typography.Text type="secondary" style={{ display:'block', textAlign:'center', fontSize:14 }}>Sign in to your organization account</Typography.Text>
        </div>
        {error && <Alert type="error" description={error} showIcon style={{ marginBottom: 16 }} />}
        {mfaPending ? (
          <form onSubmit={onMfaFinish}>
            <Alert type="info" showIcon style={{ marginBottom: 16 }}
              message="Two-factor authentication"
              description="Enter the 6-digit code from your authenticator app." />
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 600, fontSize: 13, color: '#374151', display: 'block', marginBottom: 6 }}>Authentication code</label>
              <Input
                autoFocus
                size="large"
                maxLength={6}
                placeholder="123456"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                style={{ borderRadius: 8, letterSpacing: '0.3em', textAlign: 'center', fontSize: 18 }}
              />
            </div>
            <Button className="btn-primary full-width" htmlType="submit" block size="large" loading={mfaLoading}
              disabled={mfaCode.length !== 6} style={{ borderRadius: 8, height: 44, fontWeight: 700 }}>
              Verify
            </Button>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Button type="link" size="small" onClick={() => { setMfaPending(null); setMfaCode(''); setError(''); }}>
                ← Back to sign in
              </Button>
            </div>
          </form>
        ) : (
        <>
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
          <Form.Item name="password" label={<span style={{ fontWeight:600, fontSize:13, color:'#374151' }}>Password</span>} rules={[{ required: true, message: 'Enter password' }]} style={{ marginBottom: 12 }}>
            <Input.Password placeholder="Enter password" size="large" style={{ borderRadius:8 }} />
          </Form.Item>
          <div style={{ textAlign: 'right', marginBottom: 16 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Forgot password? Contact your administrator.
            </Typography.Text>
          </div>
          <Button className="btn-primary full-width" htmlType="submit" block size="large" loading={loading} style={{ borderRadius:8, height:44, fontWeight:700 }}>
            Sign In
          </Button>
        </Form>
        </>
        )}

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12, color: '#94a3b8' }}>
            Don&apos;t have access? Contact your organization administrator.
          </Typography.Text>
        </div>
      </div>
    </div>
  );
}