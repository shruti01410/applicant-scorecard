import React, { useEffect, useState } from 'react';
import { Button, Input, Typography, Alert, Tag, message, Divider, Spin } from 'antd';
import { SafetyCertificateOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { api } from '../services/api';

const { Text, Paragraph } = Typography;

// MFA self-service panel — lives in the account popover / security section.
export default function MfaPanel() {
  const [status, setStatus] = useState(null); // null=loading, {mfa_enabled}
  const [setup, setSetup] = useState(null);   // { secret, otpauth_url, account }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get('/api/auth/mfa/status')
      .then(setStatus)
      .catch(() => setStatus({ mfa_enabled: false }));
  }, []);

  async function startSetup() {
    setBusy(true);
    try {
      const d = await api.post('/api/auth/mfa/setup', {});
      setSetup(d);
      setCode('');
    } catch (e) {
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifySetup() {
    setBusy(true);
    try {
      await api.post('/api/auth/mfa/verify', { code });
      setStatus({ mfa_enabled: true });
      setSetup(null);
      setCode('');
      message.success('Two-factor authentication enabled');
    } catch (e) {
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function disableMfa() {
    setBusy(true);
    try {
      await api.post('/api/auth/mfa/disable', { password: disablePassword, code: disableCode });
      setStatus({ mfa_enabled: false });
      setDisableOpen(false);
      setDisablePassword('');
      setDisableCode('');
      message.success('Two-factor authentication disabled');
    } catch (e) {
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  function copySecret() {
    if (!setup) return;
    navigator.clipboard.writeText(setup.secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => message.warning('Copy failed — select the secret manually'));
  }

  if (!status) return <Spin size="small" />;

  if (status.mfa_enabled && !disableOpen) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <SafetyCertificateOutlined style={{ color: '#16a34a' }} />
          <Text strong style={{ fontSize: 13 }}>MFA is ON</Text>
          <Tag color="green" style={{ margin: 0, fontSize: 10 }}>Enabled</Tag>
        </div>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
          Sign-in requires a 6-digit code from your authenticator app.
        </Text>
        <Button size="small" danger onClick={() => setDisableOpen(true)}>Disable MFA</Button>
      </div>
    );
  }

  if (disableOpen) {
    return (
      <div>
        <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Disable MFA</Text>
        <Input.Password
          size="small"
          placeholder="Confirm password"
          value={disablePassword}
          onChange={(e) => setDisablePassword(e.target.value)}
          style={{ marginBottom: 8, borderRadius: 6 }}
        />
        <Input
          size="small"
          maxLength={6}
          placeholder="Current 6-digit code"
          value={disableCode}
          onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
          style={{ marginBottom: 8, borderRadius: 6, textAlign: 'center', letterSpacing: '0.2em' }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" danger type="primary" loading={busy} disabled={!disablePassword || disableCode.length !== 6} onClick={disableMfa}>Confirm disable</Button>
          <Button size="small" onClick={() => setDisableOpen(false)}>Cancel</Button>
        </div>
      </div>
    );
  }

  if (setup) {
    return (
      <div>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 10, fontSize: 12 }}
          message="Scan or enter this secret"
          description={
            <div style={{ fontSize: 12 }}>
              <Paragraph style={{ marginBottom: 6, fontSize: 12 }}>
                Add <b>{setup.account}</b> to Google Authenticator, Authy, or 1Password.
              </Paragraph>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <code style={{ fontSize: 12, wordBreak: 'break-all', background: '#f1f5f9', padding: '4px 6px', borderRadius: 4, flex: 1 }}>{setup.secret}</code>
                <Button size="small" icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={copySecret} />
              </div>
              <Text type="secondary" style={{ fontSize: 11 }}>Manual entry key (Base32). Or paste this into your app:</Text>
              <div style={{ fontSize: 10, wordBreak: 'break-all', color: '#64748b', marginTop: 2 }}>{setup.otpauth_url}</div>
            </div>
          }
        />
        <Input
          size="small"
          maxLength={6}
          placeholder="Enter 6-digit code to confirm"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          style={{ marginBottom: 8, borderRadius: 6, textAlign: 'center', letterSpacing: '0.2em' }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" type="primary" loading={busy} disabled={code.length !== 6} onClick={verifySetup}>Enable MFA</Button>
          <Button size="small" onClick={() => { setSetup(null); setCode(''); }}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <SafetyCertificateOutlined style={{ color: '#64748b' }} />
        <Text strong style={{ fontSize: 13 }}>Two-factor authentication</Text>
        <Tag style={{ margin: 0, fontSize: 10 }}>Off</Tag>
      </div>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
        Add a 6-digit authenticator code for extra sign-in security.
      </Text>
      <Button size="small" type="primary" loading={busy} onClick={startSetup}>Set up MFA</Button>
    </div>
  );
}
