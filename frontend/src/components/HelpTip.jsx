import React from 'react';
import { Popover } from 'antd';
import './ProductTour.css';

// Small contextual help trigger — a "?" pill that opens a short explanation.
export default function HelpTip({ title, body, placement = 'top' }) {
  const content = (
    <div style={{ maxWidth: 280, fontSize: 13, lineHeight: 1.5 }}>
      {title ? <div style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>{title}</div> : null}
      <span style={{ color: '#374151' }}>{body}</span>
    </div>
  );
  return (
    <Popover
      content={content}
      placement={placement}
      trigger={['hover', 'click']}
      getPopupContainer={() => document.body}
    >
      <button type="button" className="tour-help" aria-label={title ? `Help: ${title}` : 'Help'}>?</button>
    </Popover>
  );
}
