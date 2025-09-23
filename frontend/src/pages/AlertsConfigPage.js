import React, { useEffect, useMemo, useState } from 'react';
// Free-typed symbol input (no dropdown)
import { axiosInstance } from '../App';
import DashboardHeader from '../components/DashboardHeader';
import '../styles/components.css';

const selectStyles = {
  control: (base) => ({
    ...base,
    minHeight: 44,
    backgroundColor: 'var(--bg-input, #0b1220)',
    borderColor: 'var(--border-color, #1f2937)',
    boxShadow: 'none',
    ':hover': { borderColor: 'var(--accent-primary, #60a5fa)' },
  }),
  menu: (base) => ({ ...base, background: 'var(--bg-card, #0f172a)', border: '1px solid var(--border-color, #1f2937)' }),
  singleValue: (base) => ({ ...base, color: 'var(--text-primary, #e5e7eb)' }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
};

const defaultRule = { minutes: 5, percent: 20, enabled: true };

const AlertsConfigPage = () => {
  // No dropdown options; user types symbol manually
  const [rules, setRules] = useState([]); // saved rules only
  const [saving, setSaving] = useState(false);
  const [addSymbol, setAddSymbol] = useState(''); // free text
  const [addMinutes, setAddMinutes] = useState(defaultRule.minutes);
  const [addPercent, setAddPercent] = useState(defaultRule.percent);
  const [addEnabled, setAddEnabled] = useState(defaultRule.enabled);

  useEffect(() => {
    const loadRules = async () => {
      try {
        const res = await axiosInstance.get('/api/alerts/rules');
        const arr = Array.isArray(res.data) ? res.data : [];
        setRules(arr.map(r => ({
          id: r.id,
          symbol_ref: r.symbol_ref,
          minutes: Number(r.minutes) || defaultRule.minutes,
          percent: Number(r.percent) || defaultRule.percent,
          enabled: !!r.enabled
        })));
      } catch (e) {
        console.error('Load rules failed:', e?.message);
      }
    };
    loadRules();
  }, []);

  const updateLocalRule = (id, patch) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const addRule = async () => {
    const sym = String(addSymbol || '').trim();
    if (!sym) return alert('Type a symbol');
    setSaving(true);
    try {
      await axiosInstance.post('/api/alerts/rules/bulk', { rules: [ {
        symbol_ref: sym,
        minutes: Number(addMinutes) || defaultRule.minutes,
        percent: Number(addPercent) || defaultRule.percent,
        enabled: !!addEnabled
      } ] });
      // refresh list
      const res = await axiosInstance.get('/api/alerts/rules');
      const arr = Array.isArray(res.data) ? res.data : [];
      setRules(arr.map(r => ({ id: r.id, symbol_ref: r.symbol_ref, minutes: Number(r.minutes)||defaultRule.minutes, percent: Number(r.percent)||defaultRule.percent, enabled: !!r.enabled })));
      // clear add form
      setAddSymbol('');
    } catch (e) {
      alert(e?.response?.data?.error || 'Failed to add rule');
    } finally {
      setSaving(false);
    }
  };

  const saveRule = async (rule) => {
    setSaving(true);
    try {
      await axiosInstance.put(`/api/alerts/rules/${rule.id}`, { minutes: rule.minutes, percent: rule.percent, enabled: rule.enabled });
    } catch (e) {
      alert(e?.response?.data?.error || 'Failed to update rule');
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (rule) => {
    if (!window.confirm(`Delete rule for ${rule.symbol_ref}?`)) return;
    setSaving(true);
    try {
      await axiosInstance.delete(`/api/alerts/rules/${rule.id}`);
      setRules(prev => prev.filter(r => r.id !== rule.id));
    } catch (e) {
      alert(e?.response?.data?.error || 'Failed to delete rule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <DashboardHeader title="Alert Rules" subtitle="Set per‑symbol profit ratio triggers" pollingSec={0} rightExtra={
        <div style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)' }}>Increase‑only rules • compares current vs past window</div>
      } />

      {/* Add Rule (free-typed symbol) */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(15,23,42,.9), rgba(15,23,42,.6))',
        border: '1px solid rgba(148,163,184,.15)', borderRadius: 12, padding: 16, marginBottom: 12
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.8fr 0.6fr 0.6fr', gap: 12 }}>
          <div>
            <label className="filter-label">Symbol</label>
            <input
              className="filter-input"
              style={{ background: 'var(--bg-input)' }}
              placeholder="e.g. 88.0"
              value={addSymbol}
              onChange={(e)=>setAddSymbol(e.target.value)}
            />
          </div>
          <div>
            <label className="filter-label">Minutes (x)</label>
            <input className="filter-input" style={{ background: 'var(--bg-input)' }} type="number" min="1" value={addMinutes} onChange={(e)=>setAddMinutes(Math.max(1, Number(e.target.value)||0))} />
          </div>
          <div>
            <label className="filter-label">Percent (y)</label>
            <input className="filter-input" style={{ background: 'var(--bg-input)' }} type="number" min="0" step="0.01" value={addPercent} onChange={(e)=>setAddPercent(Math.max(0, Number(e.target.value)||0))} />
          </div>
          <div>
            <label className="filter-label">Enabled</label>
            <div style={{ height: 44, display: 'flex', alignItems: 'center' }}>
              <input type="checkbox" checked={addEnabled} onChange={()=>setAddEnabled(v=>!v)} />
              <span style={{ marginLeft: 8, color: 'var(--text-secondary, #9ca3af)' }}>{addEnabled ? 'On' : 'Off'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'end', gap: 8 }}>
            <button className="btn-primary" onClick={addRule} disabled={saving || !String(addSymbol).trim()}>
              <i className="fas fa-plus" style={{ marginRight: 8 }}></i>{saving ? 'Adding…' : 'Add Rule'}
            </button>
            <button className="btn-secondary" onClick={async ()=>{ try { await axiosInstance.post('/api/alerts/evaluate-now'); alert('Evaluation triggered'); } catch(e){ alert('Evaluate failed'); } }}>
              <i className="fas fa-bolt" style={{ marginRight: 8 }}></i>Evaluate Now
            </button>
          </div>
        </div>
      </div>

      {/* Rules grid (saved only) */}
      {rules.length === 0 ? (
        <div style={{ padding: 16, color: 'var(--text-secondary, #94a3b8)' }}>
          No saved rules yet. Add one above to get started.
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {rules.map((r) => {
          return (
            <div key={r.id} className="sparkline-card" style={{
              background: 'var(--bg-card, #0f172a)', borderRadius: 12, padding: 16,
              border: '1px solid rgba(148,163,184,.15)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 14, color: 'var(--text-secondary, #9ca3af)' }}>{r.symbol_ref}</div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={r.enabled} onChange={()=>updateLocalRule(r.id, { enabled: !r.enabled })} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary, #9ca3af)' }}>{r.enabled ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="filter-label">Window (minutes)</label>
                  <input className="filter-input" style={{ background: 'var(--bg-input)' }} type="number" min="1" value={r.minutes}
                         onChange={(e)=>updateLocalRule(r.id, { minutes: Math.max(1, Number(e.target.value)||0) })} />
                </div>
                <div>
                  <label className="filter-label">Increase ≥ %</label>
                  <input className="filter-input" style={{ background: 'var(--bg-input)' }} type="number" min="0" step="0.01" value={r.percent}
                         onChange={(e)=>updateLocalRule(r.id, { percent: Math.max(0, Number(e.target.value)||0) })} />
                </div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={()=>saveRule(r)} disabled={saving}>
                  <i className="fas fa-save" style={{ marginRight: 8 }}></i>Save
                </button>
                <button className="btn-secondary" onClick={()=>deleteRule(r)} disabled={saving}>
                  <i className="fas fa-trash" style={{ marginRight: 8 }}></i>Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};

export default AlertsConfigPage;
