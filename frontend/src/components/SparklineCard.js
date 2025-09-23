import React, { useMemo } from 'react';

// Lightweight SVG sparkline card to avoid external chart deps
// Props: { title, subtitle, series, value, fmt, positiveIsGood }
// - series: array of numbers (recent last)
// - value: latest value to display prominently
// - fmt: (number)=>string for formatting value
// - positiveIsGood: boolean to pick green/red color semantics

const SparklineCard = ({
  title,
  subtitle,
  series = [],
  timestamps = [], // parallel array of epoch seconds
  value = 0,
  fmt = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 4 }) : '0'),
  positiveIsGood = true,
}) => {
  const width = 260;
  const height = 60;
  const padding = 4;

  const { path, strokeColor, delta, deltaPct } = useMemo(() => {
    let data = (series || []).map((v) => (Number.isFinite(+v) ? +v : 0));
    // Ensure at least 2 points so the line is visible
    if (data.length === 1) data = [data[0], data[0]];
    if (data.length === 0) data = [0, 0];
    const n = data.length;

    // Autoscale to actual data range so small changes are visible.
    // Avoid forcing 0..1 bounds which can flatten lines near zero.
    let dmin = Math.min(...data);
    let dmax = Math.max(...data);
    // If the series is (near) flat, pad around the value
    if (!Number.isFinite(dmin) || !Number.isFinite(dmax)) {
      dmin = 0; dmax = 1;
    }
    let min = dmin;
    let max = dmax;
    if (min === max) {
      const pad = Math.max(1, Math.abs(min) * 0.05) || 1;
      min -= pad;
      max += pad;
    } else {
      // Add a small margin so peaks don't touch the frame
      const pad = (max - min) * 0.1;
      min -= pad;
      max += pad;
    }
    const span = max - min || 1;

    const points = data.map((y, i) => {
      const x = (i / Math.max(1, n - 1)) * (width - padding * 2) + padding;
      const ny = height - padding - ((y - min) / span) * (height - padding * 2);
      return [x, ny];
    });

    const d = points
      .map(([x, y], i) => (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : `L ${x.toFixed(2)} ${y.toFixed(2)}`))
      .join(' ');

    const last = data[n - 1] ?? 0;
    const prev = data[n - 2] ?? last;
    const rawDelta = last - prev;
    const pct = prev !== 0 ? (rawDelta / Math.abs(prev)) * 100 : 0;
    // Color logic: green when good; else red
    const good = rawDelta >= 0;
    const col = good === positiveIsGood ? '#22c55e' : '#ef4444';

    return { path: d, strokeColor: col, delta: rawDelta, deltaPct: pct };
  }, [series]);

  const [hoverIdx, setHoverIdx] = React.useState(-1);
  const onMove = (e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const n = Math.max(1, series.length - 1);
    const idx = Math.round(((x - padding) / Math.max(1, (rect.width - padding * 2))) * n);
    const clamped = Math.max(0, Math.min(series.length - 1, idx));
    setHoverIdx(clamped);
  };
  const onLeave = () => setHoverIdx(-1);
  const hoverVal = hoverIdx >= 0 ? series[hoverIdx] : null;
  const hoverTs = hoverIdx >= 0 ? timestamps[hoverIdx] : null;
  const fmtTs = (ts) => {
    if (!ts) return '';
    const d = new Date((Number(ts) || 0) * 1000);
    return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const pillBg = delta >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
  const pillColor = delta >= 0 ? '#16a34a' : '#b91c1c';

  return (
    <div className="sparkline-card" style={{
      background: 'var(--bg-card, #0f172a)',
      borderRadius: 12,
      padding: 16,
      color: 'var(--text-primary, #e5e7eb)',
      boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary, #9ca3af)' }}>{title}</div>
        <div style={{
          fontSize: 12,
          background: pillBg,
          color: pillColor,
          borderRadius: 999,
          padding: '2px 8px',
          fontWeight: 600,
        }}>
          {`${delta >= 0 ? '+' : ''}${fmt(delta)} (${(deltaPct || 0).toFixed(2)}%)`}
        </div>
      </div>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)' }}>{subtitle}</div>}
      <div style={{ fontSize: 26, fontWeight: 700 }}>{fmt(value)}</div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={onLeave}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.45" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke={strokeColor} strokeWidth="2.5" />
        {/* Area fill by closing path to bottom */}
        <path d={`${path} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`} fill="url(#sparkGrad)" opacity="0.6" />
      </svg>
      {hoverIdx >= 0 && (
        <div style={{
          position: 'absolute', bottom: 16, right: 12,
          background: 'rgba(2,6,23,0.85)',
          border: '1px solid rgba(148,163,184,0.2)',
          borderRadius: 8, padding: '6px 10px',
          fontSize: 12, color: '#e5e7eb'
        }}>
          <div style={{ opacity: 0.8 }}>{fmtTs(hoverTs)}</div>
          <div style={{ fontWeight: 700 }}>{fmt(hoverVal)}</div>
        </div>
      )}
    </div>
  );
};

export default SparklineCard;
