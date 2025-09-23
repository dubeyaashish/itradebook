import React from 'react';

const DashboardHeader = ({ title, subtitle, pollingSec = 3, rightExtra }) => {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 16px', marginBottom: 10,
      background: 'linear-gradient(180deg, rgba(15,23,42,.85), rgba(15,23,42,.55))',
      border: '1px solid rgba(148,163,184,.15)', borderRadius: 12
    }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)' }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        {rightExtra}
        <div style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)' }}>
          <span className="status-dot" style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: 999,
            background: '#22c55e', boxShadow: '0 0 0 0 rgba(34,197,94,.8)',
            marginRight: 6, animation: 'pulse 1.4s infinite'
          }} />
          Updating every {pollingSec}s
        </div>
      </div>
    </div>
  );
};

export default DashboardHeader;

