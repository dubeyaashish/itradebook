import React, { useState, useMemo, useCallback, useEffect } from 'react';

const SparklineCard = ({ 
  title, 
  subtitle, 
  series = [], 
  timestamps = [], 
  value, 
  fmt = (n) => n.toString(), 
  positiveIsGood = true,
  precision = 2
}) => {
  const [hoverIdx, setHoverIdx] = useState(-1);
  const [isHovered, setIsHovered] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomCenter, setZoomCenter] = useState(0.5);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  
  const width = 320;
  const height = 120;
  const padding = 20;
  const chartHeight = height - padding * 2;

  // Calculate metrics
  const { minVal, maxVal, delta, deltaPct, trend, movingAvg } = useMemo(() => {
    if (!series.length) return { 
      minVal: 0, maxVal: 0, delta: 0, deltaPct: 0, 
      trend: 'neutral', movingAvg: [] 
    };
    
    const validSeries = series.filter(v => typeof v === 'number' && !isNaN(v));
    if (validSeries.length === 0) return { 
      minVal: 0, maxVal: 0, delta: 0, deltaPct: 0, 
      trend: 'neutral', movingAvg: [] 
    };

    const minVal = Math.min(...validSeries);
    const maxVal = Math.max(...validSeries);
    const first = validSeries[0];
    const last = validSeries[validSeries.length - 1];
    const delta = last - first;
    const deltaPct = first !== 0 ? (delta / first) * 100 : 0;
    
    // Simple trend analysis
    const recentPoints = validSeries.slice(-5);
    const oldPoints = validSeries.slice(-10, -5);
    const recentAvg = recentPoints.reduce((a, b) => a + b, 0) / recentPoints.length;
    const oldAvg = oldPoints.length > 0 ? oldPoints.reduce((a, b) => a + b, 0) / oldPoints.length : recentAvg;
    
    const trend = recentAvg > oldAvg * 1.02 ? 'bullish' : 
                  recentAvg < oldAvg * 0.98 ? 'bearish' : 'neutral';
    
    // Simple moving average (last 7 points)
    const movingAvg = validSeries.map((_, i) => {
      const start = Math.max(0, i - 6);
      const subset = validSeries.slice(start, i + 1);
      return subset.reduce((a, b) => a + b, 0) / subset.length;
    });

    return { minVal, maxVal, delta, deltaPct, trend, movingAvg };
  }, [series]);

  // Zoom and pan functionality
  const getVisibleRange = () => {
    const totalPoints = series.length;
    const visiblePoints = Math.max(10, Math.floor(totalPoints / zoomLevel));
    const startIdx = Math.floor((totalPoints - visiblePoints) * zoomCenter);
    const endIdx = Math.min(totalPoints, startIdx + visiblePoints);
    return { startIdx: Math.max(0, startIdx), endIdx };
  };

  const { startIdx, endIdx } = getVisibleRange();
  const visibleSeries = series.slice(startIdx, endIdx);
  const visibleTimestamps = timestamps.slice(startIdx, endIdx);
  const visibleMovingAvg = movingAvg.slice(startIdx, endIdx);

  // Recalculate min/max for visible range
  const visibleMinVal = visibleSeries.length ? Math.min(...visibleSeries) : minVal;
  const visibleMaxVal = visibleSeries.length ? Math.max(...visibleSeries) : maxVal;

  // Color scheme based on performance and trend
const colors = {
  primary: value >= 0 ? '#22c55e' : '#ef4444'  // Simple: green if positive, red if negative
};

  // Generate chart paths for visible data
  const { linePath, areaPath, maPath } = useMemo(() => {
    if (!visibleSeries.length || visibleMaxVal === visibleMinVal) {
      return { linePath: '', areaPath: '', maPath: '' };
    }

    const range = visibleMaxVal - visibleMinVal || 1;
    const stepX = (width - padding * 2) / Math.max(1, visibleSeries.length - 1);
    
    // Main price line
    const points = visibleSeries.map((val, i) => {
      const x = padding + i * stepX;
      const y = padding + (1 - (val - visibleMinVal) / range) * chartHeight;
      return { x, y, val };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`;
    
    // Moving average line
    const maPoints = visibleMovingAvg.map((val, i) => {
      const x = padding + i * stepX;
      const y = padding + (1 - (val - visibleMinVal) / range) * chartHeight;
      return { x, y };
    });
    const maPath = maPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return { linePath, areaPath, maPath };
  }, [visibleSeries, visibleMovingAvg, visibleMinVal, visibleMaxVal, width, height, padding, chartHeight]);

  // Mouse interaction handlers
  const handleMouseMove = useCallback((e) => {
    if (!visibleSeries.length) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const stepX = (width - padding * 2) / Math.max(1, visibleSeries.length - 1);
    const idx = Math.round((x - padding) / stepX);
    
    if (idx >= 0 && idx < visibleSeries.length) {
      setHoverIdx(startIdx + idx);
    }
  }, [visibleSeries, width, padding, startIdx]);

  const handleMouseLeave = useCallback(() => {
    setHoverIdx(-1);
    setIsHovered(false);
    setIsDragging(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  // Zoom and pan handlers
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoomLevel = Math.min(Math.max(zoomLevel * delta, 1), 10);
    setZoomLevel(newZoomLevel);
  }, [zoomLevel]);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, center: zoomCenter });
      e.preventDefault();
    }
  }, [zoomCenter]);

  const handleMouseMoveGlobal = useCallback((e) => {
    if (isDragging && dragStart) {
      const deltaX = e.clientX - dragStart.x;
      const sensitivity = 0.002;
      const newCenter = Math.min(Math.max(dragStart.center - deltaX * sensitivity, 0), 1);
      setZoomCenter(newCenter);
    }
  }, [isDragging, dragStart]);

  const handleMouseUpGlobal = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
  }, []);

  // Add global mouse listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMoveGlobal);
      document.addEventListener('mouseup', handleMouseUpGlobal);
      return () => {
        document.removeEventListener('mousemove', handleMouseMoveGlobal);
        document.removeEventListener('mouseup', handleMouseUpGlobal);
      };
    }
  }, [isDragging, handleMouseMoveGlobal, handleMouseUpGlobal]);

  // Reset zoom function
  const resetZoom = () => {
    setZoomLevel(1);
    setZoomCenter(0.5);
  };

  // Format timestamp for hover tooltip
  const formatTimestamp = (ts) => {
    if (!ts) return '';
    const date = new Date(ts * 1000);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  // Get trend icon
  const getTrendIcon = () => {
    switch (trend) {
      case 'bullish': return '📈';
      case 'bearish': return '📉';
      default: return '➡️';
    }
  };

  // Hover values
  const hoverVal = hoverIdx >= 0 ? series[hoverIdx] : value;
  const hoverTs = hoverIdx >= 0 ? timestamps[hoverIdx] : null;

  return (
    <div 
      style={{
        position: 'relative',
        background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.95))',
        border: `1px solid ${isHovered ? colors.primary : 'rgba(148,163,184,0.2)'}`,
        borderRadius: 12,
        padding: 16,
        minHeight: 200,
        transition: 'all 0.3s ease',
        backdropFilter: 'blur(10px)',
        boxShadow: isHovered 
          ? `0 8px 32px ${colors.glow}, 0 0 0 1px ${colors.primary}` 
          : '0 4px 16px rgba(0,0,0,0.1)',
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
        cursor: 'crosshair'
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header with Zoom Controls */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        marginBottom: 8 
      }}>
        <div>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6,
            marginBottom: 4
          }}>
            <h3 style={{ 
              margin: 0, 
              fontSize: 16, 
              fontWeight: 700,
              color: 'var(--text-primary, #e5e7eb)',
              letterSpacing: '0.5px'
            }}>
              {title}
            </h3>
            <span style={{ fontSize: 14 }}>{getTrendIcon()}</span>
            {trend !== 'neutral' && (
              <div style={{
                padding: '2px 6px',
                backgroundColor: trend === 'bullish' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                color: trend === 'bullish' ? '#22c55e' : '#ef4444',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {trend}
              </div>
            )}
          </div>
          {subtitle && (
            <div style={{ 
              fontSize: 11, 
              color: 'var(--text-muted, #6b7280)',
              fontWeight: 500
            }}>
              {subtitle}
            </div>
          )}
        </div>
        
        {/* Zoom Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
          {zoomLevel > 1 && (
            <div style={{
              padding: '2px 6px',
              backgroundColor: 'rgba(96,165,250,0.1)',
              border: '1px solid rgba(96,165,250,0.3)',
              borderRadius: 4,
              fontSize: 10,
              color: '#60a5fa',
              fontWeight: 600
            }}>
              {zoomLevel.toFixed(1)}x
            </div>
          )}
          
          <div style={{
            display: 'flex',
            backgroundColor: 'rgba(0,0,0,0.3)',
            borderRadius: 4,
            overflow: 'hidden'
          }}>
            <button
              onClick={() => setZoomLevel(prev => Math.min(prev * 1.2, 10))}
              style={{
                padding: '4px 6px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#60a5fa',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 600
              }}
              title="Zoom In"
            >
              +
            </button>
            <button
              onClick={() => setZoomLevel(prev => Math.max(prev * 0.8, 1))}
              style={{
                padding: '4px 6px',
                border: 'none',
                borderLeft: '1px solid rgba(96,165,250,0.2)',
                backgroundColor: 'transparent',
                color: '#60a5fa',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 600
              }}
              title="Zoom Out"
            >
              -
            </button>
            {zoomLevel > 1 && (
              <button
                onClick={resetZoom}
                style={{
                  padding: '4px 6px',
                  border: 'none',
                  borderLeft: '1px solid rgba(96,165,250,0.2)',
                  backgroundColor: 'transparent',
                  color: '#60a5fa',
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 600
                }}
                title="Reset Zoom"
              >
                ⌂
              </button>
            )}
          </div>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            backgroundColor: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 12,
            fontSize: 10,
            color: '#22c55e',
            fontWeight: 600
          }}>
            <div style={{
              width: 6,
              height: 6,
              backgroundColor: '#22c55e',
              borderRadius: '50%',
              animation: 'pulse 2s infinite'
            }} />
            LIVE
          </div>
        </div>
      </div>

      {/* Main Value Display */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'baseline', 
        gap: 8,
        marginBottom: 12
      }}>
        <div style={{ 
          fontSize: 28, 
          fontWeight: 800,
          color: colors.primary,
          fontFamily: 'monospace',
          letterSpacing: '-0.5px'
        }}>
          {fmt(hoverVal || value)}
        </div>
      </div>

      {/* Stats - Removed */}

      {/* Chart */}
      <svg 
        width="100%" 
        height={height} 
        viewBox={`0 0 ${width} ${height}`} 
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        style={{ 
          borderRadius: 8,
          cursor: isDragging ? 'grabbing' : zoomLevel > 1 ? 'grab' : 'crosshair'
        }}
      >
        <defs>
          <linearGradient id={`areaGrad-${title}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.primary} stopOpacity="0.3" />
            <stop offset="70%" stopColor={colors.primary} stopOpacity="0.1" />
            <stop offset="100%" stopColor={colors.primary} stopOpacity="0.05" />
          </linearGradient>
          
          <filter id={`glow-${title}`}>
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/> 
            </feMerge>
          </filter>

          <pattern id={`grid-${title}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth="0.5"/>
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill={`url(#grid-${title})`} opacity="0.3" />

        {maPath && (
          <path 
            d={maPath} 
            fill="none" 
            stroke="#fbbf24" 
            strokeWidth="1.5" 
            opacity="0.7"
            strokeDasharray="2,2"
          />
        )}

        <path d={areaPath} fill={`url(#areaGrad-${title})`} />

        <path 
          d={linePath} 
          fill="none" 
          stroke={colors.primary} 
          strokeWidth="2.5" 
          filter={isHovered ? `url(#glow-${title})` : 'none'}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {visibleSeries.map((val, i) => {
          const x = padding + i * ((width - padding * 2) / Math.max(1, visibleSeries.length - 1));
          const y = padding + (1 - (val - visibleMinVal) / (visibleMaxVal - visibleMinVal || 1)) * chartHeight;
          const originalIdx = startIdx + i;
          const isHoverPoint = originalIdx === hoverIdx;
          
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={isHoverPoint ? 5 : 2}
              fill={isHoverPoint ? colors.primary : 'white'}
              stroke={colors.primary}
              strokeWidth={isHoverPoint ? 3 : 1.5}
              opacity={isHoverPoint ? 1 : 0.8}
              filter={isHoverPoint ? `url(#glow-${title})` : 'none'}
              style={{ 
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
            />
          );
        })}

        {hoverIdx >= startIdx && hoverIdx < endIdx && (
          <g>
            <line
              x1={padding + (hoverIdx - startIdx) * ((width - padding * 2) / Math.max(1, visibleSeries.length - 1))}
              y1={padding}
              x2={padding + (hoverIdx - startIdx) * ((width - padding * 2) / Math.max(1, visibleSeries.length - 1))}
              y2={height - padding}
              stroke={colors.primary}
              strokeWidth="1"
              strokeDasharray="2,2"
              opacity="0.7"
            />
          </g>
        )}

        {zoomLevel > 1 && (
          <g>
            <rect
              x={padding}
              y={height - padding - 3}
              width={(width - padding * 2)}
              height="2"
              fill="rgba(96,165,250,0.2)"
            />
            <rect
              x={padding + (width - padding * 2) * zoomCenter * (1 - 1/zoomLevel)}
              y={height - padding - 3}
              width={(width - padding * 2) / zoomLevel}
              height="2"
              fill="#60a5fa"
            />
          </g>
        )}
      </svg>

      {hoverIdx >= 0 && (
        <div style={{
          position: 'absolute',
          top: 12,
          right: 12,
          background: 'rgba(15,23,42,0.95)',
          border: `1px solid ${colors.primary}`,
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 11,
          color: '#e5e7eb',
          fontFamily: 'monospace',
          backdropFilter: 'blur(10px)',
          boxShadow: `0 4px 16px ${colors.glow}`,
          zIndex: 10
        }}>
          <div style={{ color: colors.primary, fontWeight: 700, marginBottom: 2 }}>
            {fmt(series[hoverIdx])}
          </div>
          {timestamps[hoverIdx] && (
            <div style={{ opacity: 0.8, fontSize: 10 }}>
              {formatTimestamp(timestamps[hoverIdx])}
            </div>
          )}
        </div>
      )}

      {isHovered && (
        <div style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          fontSize: 9,
          color: 'rgba(148,163,184,0.6)',
          fontFamily: 'monospace'
        }}>
          Scroll: zoom • Drag: pan • Click buttons: zoom
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default SparklineCard;