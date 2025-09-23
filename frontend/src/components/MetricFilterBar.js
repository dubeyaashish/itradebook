import React, { useState } from 'react';
import Select from 'react-select';

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 44,
    backgroundColor: 'var(--bg-input, #0b1220)',
    borderColor: state.isFocused ? 'var(--accent-primary, #60a5fa)' : 'var(--border-color, #1f2937)',
    boxShadow: state.isFocused ? '0 0 0 3px rgba(96,165,250,.25)' : 'none',
    ':hover': { borderColor: 'var(--accent-primary, #60a5fa)' },
    color: 'var(--text-primary, #e5e7eb)'
  }),
  menu: (base) => ({ ...base, backgroundColor: 'var(--bg-card, #0f172a)', border: '1px solid var(--border-color, #1f2937)' }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  singleValue: (base) => ({ ...base, color: 'var(--text-primary, #e5e7eb)' }),
  multiValue: (base) => ({ ...base, backgroundColor: 'rgba(96,165,250,.18)', border: '1px solid rgba(96,165,250,.35)' }),
  multiValueLabel: (base) => ({ ...base, color: 'var(--text-primary, #e5e7eb)' }),
};

const MetricFilterBar = ({
  startDate, setStartDate,
  endDate, setEndDate,
  startTime, setStartTime,
  endTime, setEndTime,
  symbolOptions, selectedSymbols, setSelectedSymbols,
  liveEnabled = true, setLiveEnabled = ()=>{},
  onRefresh
}) => {
  const [showTime, setShowTime] = useState(true);

  return (
    <div className="filter-bar" style={{
      background: 'linear-gradient(180deg, rgba(15,23,42,.9), rgba(15,23,42,.6))',
      border: '1px solid rgba(148,163,184,.15)',
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 12
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.4fr 0.6fr 0.5fr', gap: 12 }}>
        <div className="filter-group">
          <label className="filter-label">Date Range</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="filter-input" />
            <span style={{ alignSelf: 'center', opacity: .7 }}>to</span>
            <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="filter-input" />
          </div>
          {showTime && (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} className="filter-input" />
              <input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} className="filter-input" />
            </div>
          )}
        </div>
        <div className="filter-group" style={{ minWidth: 240 }}>
          <label className="filter-label">Symbols</label>
          <Select isMulti options={symbolOptions} value={selectedSymbols} onChange={setSelectedSymbols} styles={selectStyles} menuPortalTarget={document.body} />
        </div>
        <div className="filter-actions" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn-primary" onClick={onRefresh}>
            <i className="fas fa-rotate-right" style={{ marginRight: 8 }}></i>Refresh
          </button>
        </div>
        <div className="filter-group" style={{ alignSelf: 'end' }}>
          <label className="filter-label">Live Updates</label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={liveEnabled} onChange={e=>setLiveEnabled(e.target.checked)} />
            <span style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 13 }}>
              {liveEnabled ? 'On' : 'Paused'}
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

export default MetricFilterBar;
