import React from 'react';
import { Card, Tag, Typography } from 'antd';

const { Text } = Typography;

export default function ArchetypeCard({ profile }) {
  if (!profile || !profile.hasProfile) return null;
  const arch = profile.archetype;
  return (
    <Card size="small" title={`Archetype — ${arch ? arch.name : '—'} ${arch ? `#${arch.number}` : ''}`}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <Tag>Life Path {profile.life_path_number}</Tag>
        <Tag>Birth {profile.birth_number}</Tag>
        <Tag>Personal Year {profile.current_personal_year} — {profile.current_personal_year_theme}</Tag>
      </div>
      {arch && <Text type="secondary">{arch.summary}</Text>}
      {arch && arch.tags && arch.tags.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {arch.tags.map(t => <Tag key={t}>{t}</Tag>)}
        </div>
      )}
      </Card>
  );
}
