import React, { useState, useEffect, useCallback } from 'react';
import Select from 'react-select';
import { axiosInstance } from '../App';

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 44,
    maxHeight: 100, // Limit height expansion
    backgroundColor: 'var(--bg-input, #0b1220)',
    borderColor: state.isFocused ? 'var(--accent-primary, #60a5fa)' : 'var(--border-color, #1f2937)',
    boxShadow: state.isFocused ? '0 0 0 3px rgba(96,165,250,.25)' : 'none',
    ':hover': { borderColor: 'var(--accent-primary, #60a5fa)' },
    color: 'var(--text-primary, #e5e7eb)',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    overflow: 'hidden'
  }),
  valueContainer: (base) => ({
    ...base,
    maxHeight: 80,
    overflowY: 'auto',
    padding: '2px 8px'
  }),
  multiValue: (base) => ({ 
    ...base, 
    backgroundColor: 'rgba(96,165,250,.18)', 
    border: '1px solid rgba(96,165,250,.35)',
    borderRadius: 4,
    margin: '1px 2px',
    fontSize: '12px'
  }),
  multiValueLabel: (base) => ({ 
    ...base, 
    color: 'var(--text-primary, #e5e7eb)',
    fontSize: '12px',
    padding: '2px 4px'
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: 'var(--text-secondary, #94a3b8)',
    ':hover': {
      backgroundColor: 'rgba(239,68,68,0.3)',
      color: '#ef4444'
    }
  }),
  loadingIndicator: (base) => ({
    ...base,
    color: 'var(--accent-primary, #60a5fa)'
  }),
  noOptionsMessage: (base) => ({
    ...base,
    color: 'var(--text-secondary, #94a3b8)',
    padding: 12
  }),
  placeholder: (base) => ({
    ...base,
    color: 'var(--text-secondary, #94a3b8)'
  })
};

const MetricFilterBar = ({
  startDate, setStartDate,
  endDate, setEndDate,
  startTime, setStartTime,
  endTime, setEndTime,
  symbolOptions, setSymbolOptions = () => {}, // Add default function
  selectedSymbols, setSelectedSymbols,
  liveEnabled = true, setLiveEnabled = () => {},
  onRefresh
}) => {
  const [showTime, setShowTime] = useState(true);
  const [symbolsLoading, setSymbolsLoading] = useState(false);
  const [symbolsError, setSymbolsError] = useState('');

  const loadSymbols = useCallback(async () => {
    setSymbolsLoading(true);
    setSymbolsError('');
    
    try {
      const endpoints = [
        () => {
          const params = new URLSearchParams();
          if (startDate) params.append('start_date', startDate);
          if (endDate) params.append('end_date', endDate);
          return axiosInstance.get(`/api/symbols?${params.toString()}`);
        },
        () => axiosInstance.get('/api/getsymbols/symbols')
      ];
      
      let response = null;
      
      for (const endpoint of endpoints) {
        try {
          response = await endpoint();
          if (response?.data && Array.isArray(response.data) && response.data.length > 0) {
            break;
          }
        } catch (error) {
          console.warn('Endpoint failed:', error.message);
          continue;
        }
      }
      
      if (!response || !response.data) {
        throw new Error('All symbol endpoints failed');
      }

      const rawSymbols = Array.isArray(response.data) ? response.data : [];
      const normalizedOptions = rawSymbols.map(s => {
        if (typeof s === 'string') {
          return { value: s, label: s };
        }
        if (s && typeof s === 'object') {
          const value = s.value ?? s.symbolref ?? s.symbol_ref ?? '';
          const label = s.label ?? value;
          return { value: String(value), label: String(label) };
        }
        return { value: String(s ?? ''), label: String(s ?? '') };
      }).filter(opt => opt.value && opt.value.trim());

      normalizedOptions.sort((a, b) => a.label.localeCompare(b.label));

      setSymbolOptions(normalizedOptions);

      if (selectedSymbols.length === 0 && normalizedOptions.length > 0) {
        setSelectedSymbols(normalizedOptions.slice(0, 12));
      }

    } catch (error) {
      console.error('Failed to load symbols:', error);
      setSymbolsError('Failed to load symbols');
    } finally {
      setSymbolsLoading(false);
    }
  }, [startDate, endDate, selectedSymbols.length, setSelectedSymbols]);

  useEffect(() => {
    loadSymbols();
  }, [startDate, endDate]);

  const selectAllSymbols = () => setSelectedSymbols(symbolOptions);
  const clearAllSymbols = () => setSelectedSymbols([]);
  const selectTopSymbols = (count = 12) => setSelectedSymbols(symbolOptions.slice(0, count));

  return (
    <div className="filter-bar" style={{
      background: 'linear-gradient(180deg, rgba(15,23,42,.9), rgba(15,23,42,.6))',
      border: '1px solid rgba(148,163,184,.15)',
      borderRadius: 12,
      padding: '16px 20px',
      marginBottom: 16
    }}>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1.2fr 1.6fr 0.6fr 0.5fr', 
        gap: 16,
        alignItems: 'start'
      }}>
        {/* Date Range */}
        <div className="filter-group">
          <label style={{ 
            fontSize: 13, 
            fontWeight: 600, 
            color: 'var(--text-secondary, #94a3b8)',
            marginBottom: 8,
            display: 'block'
          }}>
            Date Range
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
              style={{
                flex: 1,
                minHeight: 44,
                padding: '0 12px',
                backgroundColor: 'var(--bg-input, #0b1220)',
                border: '1px solid var(--border-color, #1f2937)',
                borderRadius: 6,
                color: 'var(--text-primary, #e5e7eb)',
                fontSize: 14
              }}
            />
            <span style={{ 
              color: 'var(--text-secondary, #94a3b8)', 
              fontSize: 13,
              fontWeight: 500
            }}>to</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
              style={{
                flex: 1,
                minHeight: 44,
                padding: '0 12px',
                backgroundColor: 'var(--bg-input, #0b1220)',
                border: '1px solid var(--border-color, #1f2937)',
                borderRadius: 6,
                color: 'var(--text-primary, #e5e7eb)',
                fontSize: 14
              }}
            />
          </div>
          {showTime && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input 
                type="time" 
                value={startTime} 
                onChange={e => setStartTime(e.target.value)} 
                style={{
                  flex: 1,
                  minHeight: 36,
                  padding: '0 12px',
                  backgroundColor: 'var(--bg-input, #0b1220)',
                  border: '1px solid var(--border-color, #1f2937)',
                  borderRadius: 6,
                  color: 'var(--text-primary, #e5e7eb)',
                  fontSize: 13
                }}
              />
              <input 
                type="time" 
                value={endTime} 
                onChange={e => setEndTime(e.target.value)} 
                style={{
                  flex: 1,
                  minHeight: 36,
                  padding: '0 12px',
                  backgroundColor: 'var(--bg-input, #0b1220)',
                  border: '1px solid var(--border-color, #1f2937)',
                  borderRadius: 6,
                  color: 'var(--text-primary, #e5e7eb)',
                  fontSize: 13
                }}
              />
            </div>
          )}
        </div>

        {/* Symbols */}
        <div className="filter-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ 
              fontSize: 13, 
              fontWeight: 600, 
              color: 'var(--text-secondary, #94a3b8)'
            }}>
              Symbols {selectedSymbols.length > 0 && (
                <span style={{ 
                  fontSize: 11, 
                  color: 'var(--accent-primary, #60a5fa)',
                  fontWeight: 500
                }}>
                  ({selectedSymbols.length} selected)
                </span>
              )}
            </label>
            {symbolsLoading && (
              <div style={{ fontSize: 11, color: 'var(--accent-primary, #60a5fa)' }}>
                Loading...
              </div>
            )}
          </div>
          
          <Select 
            isMulti 
            options={symbolOptions} 
            value={selectedSymbols} 
            onChange={setSelectedSymbols} 
            styles={selectStyles} 
            menuPortalTarget={document.body}
            menuPosition="fixed"
            placeholder={symbolsLoading ? "Loading symbols..." : "Select symbols..."}
            noOptionsMessage={() => symbolsError || "No symbols available"}
            isLoading={symbolsLoading}
            loadingMessage={() => "Loading symbols..."}
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            isClearable={false}
            maxMenuHeight={200}
            controlShouldRenderValue={true}
          />
          
          <div style={{ 
            display: 'flex', 
            gap: 6, 
            marginTop: 6, 
            fontSize: 11,
            opacity: symbolsLoading ? 0.5 : 1
          }}>
            <button 
              onClick={selectAllSymbols}
              disabled={symbolsLoading}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary, #60a5fa)',
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: 3,
                fontSize: 11
              }}
            >
              All
            </button>
            <span style={{ color: 'var(--text-muted, #6b7280)' }}>|</span>
            <button 
              onClick={() => selectTopSymbols(12)}
              disabled={symbolsLoading}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary, #60a5fa)',
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: 3,
                fontSize: 11
              }}
            >
              Top 12
            </button>
            <span style={{ color: 'var(--text-muted, #6b7280)' }}>|</span>
            <button 
              onClick={clearAllSymbols}
              disabled={symbolsLoading}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary, #94a3b8)',
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: 3,
                fontSize: 11
              }}
            >
              Clear
            </button>
          </div>
          
          {symbolsError && (
            <div style={{ 
              fontSize: 11, 
              color: '#ef4444', 
              marginTop: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              <i className="fas fa-exclamation-triangle" />
              {symbolsError}
              <button 
                onClick={loadSymbols}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-primary, #60a5fa)',
                  cursor: 'pointer',
                  fontSize: 11,
                  textDecoration: 'underline',
                  marginLeft: 4
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button 
            onClick={onRefresh}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              minHeight: 44,
              padding: '0 16px',
              backgroundColor: 'var(--accent-primary, #60a5fa)',
              border: 'none',
              borderRadius: 6,
              color: 'white',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <i className="fas fa-sync-alt" />
            Refresh
          </button>
          
          <button 
            onClick={() => setShowTime(!showTime)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              minHeight: 32,
              padding: '0 12px',
              backgroundColor: 'rgba(148,163,184,0.1)',
              border: '1px solid rgba(148,163,184,0.2)',
              borderRadius: 4,
              color: 'var(--text-secondary, #94a3b8)',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            <i className={`fas ${showTime ? 'fa-eye-slash' : 'fa-eye'}`} />
            {showTime ? 'Hide' : 'Show'} Time
          </button>
        </div>

        {/* Live Updates */}
        <div>
          <label style={{ 
            fontSize: 13, 
            fontWeight: 600, 
            color: 'var(--text-secondary, #94a3b8)',
            marginBottom: 8,
            display: 'block'
          }}>
            Live Updates
          </label>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8, 
            cursor: 'pointer',
            padding: '8px 12px',
            borderRadius: 6,
            backgroundColor: liveEnabled ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.1)',
            border: `1px solid ${liveEnabled ? 'rgba(34,197,94,0.3)' : 'rgba(148,163,184,0.2)'}`
          }}>
            <input 
              type="checkbox" 
              checked={liveEnabled} 
              onChange={e => setLiveEnabled(e.target.checked)}
              style={{
                width: 16,
                height: 16,
                accentColor: 'var(--accent-primary, #60a5fa)'
              }}
            />
            <div>
              <span style={{ 
                color: liveEnabled ? '#22c55e' : 'var(--text-secondary, #94a3b8)', 
                fontSize: 13,
                fontWeight: 500
              }}>
                {liveEnabled ? 'Active' : 'Paused'}
              </span>
              <div style={{ 
                fontSize: 10, 
                color: 'var(--text-muted, #6b7280)'
              }}>
                {liveEnabled ? '3s polling' : 'Manual only'}
              </div>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};

export default MetricFilterBar;