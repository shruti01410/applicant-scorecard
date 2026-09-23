import React, { useEffect, useState } from 'react';
import { Typography, Button, Input, Tag, Modal, message, Select, Popconfirm, Alert } from 'antd';
import { SearchOutlined, SafetyCertificateOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { api } from '../../services/api';
import { useAuth } from '../../services/AuthContext';

const { Title } = Typography;

export default function UsersPage() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  async function fetchUsers() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('status', statusFilter);
      const q = params.toString() ? `?${params.toString()}` : '';
      const data = await api.get(`/api/admin/panel/users${q}`);
      setRows(data.rows || []);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, [search, roleFilter, statusFilter]);

  async function changeRole(id, role) {
    try {
      await api.patch(`/api/admin/panel/users/${id}/role`, { role });
      message.success('Role updated');
      fetchUsers();
    } catch (e) { message.error(e.message); }
  }

  async function toggleSuspend(row) {
    const suspended = row.status !== 'suspended';
    try {
      await api.patch(`/api/admin/panel/users/${row.id}/suspend`, { suspended });
      message.success(suspended ? 'User suspended' : 'User reactivated');
      fetchUsers();
    } catch (e) { message.error(e.message); }
  }

  const roleOptions = [
    { value: 'admin', label: 'Admin' },
    { value: 'employee', label: 'Employee' },
  ];

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Users &amp; Access</h2>
          <div className="sub" style={{ fontSize: 12, color: '#64748b' }}>
            Manage roles and account status — {rows.length} user(s)
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="Search name, email or username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 280, borderRadius: 8 }}
          allowClear
        />
        <Select
          placeholder="All roles"
          allowClear
          value={roleFilter || undefined}
          onChange={(v) => setRoleFilter(v || '')}
          options={roleOptions}
          style={{ width: 140 }}
        />
        <Select
          placeholder="All statuses"
          allowClear
          value={statusFilter || undefined}
          onChange={(v) => setStatusFilter(v || '')}
          options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Suspended' }]}
          style={{ width: 140 }}
        />
        <Button onClick={fetchUsers} loading={loading}>Refresh</Button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>USER</th>
              <th>USERNAME</th>
              <th>ROLE</th>
              <th>STATUS</th>
              <th>LAST LOGIN</th>
              <th style={{ width: 150 }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>No users found</td></tr>
            ) : rows.map((row, i) => {
              const isSelf = me && row.id === me.id;
              const suspended = row.status === 'suspended';
              return (
                <tr key={row.id} style={{ opacity: suspended ? 0.65 : 1 }}>
                  <td className="td-num">{i + 1}</td>
                  <td>
                    <div className="emp-name" style={{ color: '#1e293b', fontWeight: 600 }}>
                      {row.name} {isSelf && <Tag style={{ marginLeft: 6, fontSize: 10 }}>You</Tag>}
                    </div>
                    <div className="emp-email">{row.email || '—'}</div>
                  </td>
                  <td style={{ fontSize: 13, color: '#334155', fontFamily: 'monospace' }}>{row.username}</td>
                  <td>
                    <Select
                      size="small"
                      value={row.role}
                      options={roleOptions}
                      disabled={isSelf}
                      onChange={(v) => changeRole(row.id, v)}
                      style={{ width: 120 }}
                    />
                  </td>
                  <td>
                    {suspended
                      ? <Tag color="red" style={{ margin: 0 }}><StopOutlined /> Suspended</Tag>
                      : <Tag color="green" style={{ margin: 0 }}><CheckCircleOutlined /> Active</Tag>}
                  </td>
                  <td style={{ fontSize: 12, color: '#64748b' }}>
                    {row.last_login_at ? new Date(row.last_login_at + 'Z').toLocaleString() : 'Never'}
                  </td>
                  <td>
                    <Popconfirm
                      title={suspended ? 'Reactivate this account?' : 'Suspend this account?'}
                      description={suspended ? 'They will be able to sign in again.' : 'They will be blocked from signing in.'}
                      onConfirm={() => toggleSuspend(row)}
                      okText={suspended ? 'Reactivate' : 'Suspend'}
                      cancelText="Cancel"
                    >
                      <Button
                        size="small"
                        danger={!suspended}
                        type={suspended ? 'default' : 'primary'}
                        disabled={isSelf}
                        icon={suspended ? <CheckCircleOutlined /> : <StopOutlined />}
                      >
                        {suspended ? 'Reactivate' : 'Suspend'}
                      </Button>
                    </Popconfirm>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginTop: 14 }}
        message="Role & suspend changes are audit-logged"
        description="Every change is recorded under Admin Panel → Audit with the acting admin, target user, and timestamp."
      />
    </div>
  );
}
