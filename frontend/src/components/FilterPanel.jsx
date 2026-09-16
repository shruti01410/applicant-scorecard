import React, { useState } from 'react';
import { Select, InputNumber, Button, Space, Tag, Collapse } from 'antd';
import { FilterOutlined, ClearOutlined, SearchOutlined } from '@ant-design/icons';

const { Option } = Select;

export default function FilterPanel({ jds, onFilter, onClear }) {
  const [filters, setFilters] = useState({
    jd_id: null,
    scoreRange: null,
    experience: null,
    evaluated: null,
    sort: 'id',
    order: 'desc',
  });

  function updateFilter(key, value) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    onFilter(next);
  }

  function clearAll() {
    const cleared = { jd_id: null, scoreRange: null, experience: null, evaluated: null, sort: 'id', order: 'desc' };
    setFilters(cleared);
    onClear();
  }

  const activeCount = [filters.jd_id, filters.scoreRange, filters.experience, filters.evaluated].filter(Boolean).length;

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <FilterOutlined style={{ color: '#6366f1' }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>Sort & Filter</span>
        {activeCount > 0 && <Tag color="blue">{activeCount} active</Tag>}
        {activeCount > 0 && <Button size="small" icon={<ClearOutlined />} onClick={clearAll}>Clear</Button>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <div style={{ minWidth: 180 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Sort by</div>
          <Select size="small" value={filters.sort} onChange={v => updateFilter('sort', v)} style={{ width: '100%' }}>
            <Option value="id">Recently Added</Option>
            <Option value="overallScore">Overall Score</Option>
            <Option value="jdMatch">JD Match %</Option>
            <Option value="name">Candidate Name</Option>
          </Select>
        </div>

        <div style={{ minWidth: 100 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Order</div>
          <Select size="small" value={filters.order} onChange={v => updateFilter('order', v)} style={{ width: '100%' }}>
            <Option value="desc">High → Low</Option>
            <Option value="asc">Low → High</Option>
          </Select>
        </div>

        <div style={{ minWidth: 180 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>JD</div>
          <Select size="small" value={filters.jd_id} onChange={v => updateFilter('jd_id', v)} allowClear placeholder="All JDs" style={{ width: '100%' }}>
            {(jds || []).map(j => <Option key={j.id} value={j.id}>{j.title}{j.client ? ` · ${j.client}` : ''}</Option>)}
          </Select>
        </div>

        <div style={{ minWidth: 140 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Score Range</div>
          <Select size="small" value={filters.scoreRange} onChange={v => updateFilter('scoreRange', v)} allowClear placeholder="Any" style={{ width: '100%' }}>
            <Option value="90-100">90–100 (Excellent)</Option>
            <Option value="80-89">80–89 (Good)</Option>
            <Option value="70-79">70–79</Option>
            <Option value="below70">Below 70</Option>
          </Select>
        </div>

        <div style={{ minWidth: 140 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Experience</div>
          <Select size="small" value={filters.experience} onChange={v => updateFilter('experience', v)} allowClear placeholder="Any" style={{ width: '100%' }}>
            <Option value="0-2">0–2 years</Option>
            <Option value="2-5">2–5 years</Option>
            <Option value="5+">5+ years</Option>
          </Select>
        </div>

        <div style={{ minWidth: 140 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Evaluation</div>
          <Select size="small" value={filters.evaluated} onChange={v => updateFilter('evaluated', v)} allowClear placeholder="All" style={{ width: '100%' }}>
            <Option value="yes">Evaluated</Option>
            <Option value="no">Not Evaluated</Option>
          </Select>
        </div>
      </div>
    </div>
  );
}
