import React, { useEffect, useMemo, useRef, useState } from 'react';
import { axiosInstance, STORAGE_KEYS } from '../App';
import SparklineCard from '../components/SparklineCard';
import MetricFilterBar from '../components/MetricFilterBar';
import SkeletonGrid from '../components/SkeletonGrid';
import DashboardHeader from '../components/DashboardHeader';

const POLL_MS = 3000;
const HISTORY = 24;

const TotalProfitPage = () => {
  const [rows, setRows] = useState([]);
  const [seriesMap, setSeriesMap] = useState({});
  const timerRef = useRef(null);
  const controllerRef = useRef(null);
  const isFetchingRef = useRef(false);
  const todayStr = new Date().toISOString().slice(0,10);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [symbolOptions, setSymbolOptions] = useState([]);
  const [selectedSymbols, setSelectedSymbols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState('');
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [liveEnabled, setLiveEnabled] = useState(true);

  const fetchLive = async () => {
    const token = localStorage.getItem(STORAGE_KEYS?.TOKEN) || localStorage.getItem('auth_token') || localStorage.getItem('token');
    console.log('[TotalProfit] fetching series…', { hasToken: !!token });
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    controllerRef.current = new AbortController();
    if (rows.length === 0) setLoading(true);
    setErrMsg('');
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (startTime) params.append('start_time', `${startTime}:00`);
    if (endTime) params.append('end_time', `${endTime}:59`);
    selectedSymbols.forEach(opt => params.append('symbol_ref', opt.value));
    params.append('limit', '120');
    try {
      const res = await axiosInstance.get(`/api/live-series?${params.toString()}`, { signal: controllerRef.current.signal });
      const groups = Array.isArray(res.data) ? res.data : [];
      setSeriesMap(() => {
        const next = {};
        groups.forEach(g => { next[g.symbol_ref] = {
          vals: (g.points || []).map(p => Number(p.profit_total) || 0),
          ts: (g.points || []).map(p => Number(p.ts) || 0)
        }; });
        return next;
      });
      const synth = groups.map(g => {
        const arr = g.points || [];
        const second = arr[arr.length - 2] || arr[arr.length - 1] || { profit_total: 0 };
        return { symbol_ref: g.symbol_ref, profit_total: second.profit_total };
      });
      if (synth.length) setRows(synth);
    } catch (e) {
      if (e?.code === 'ERR_CANCELED' || e?.message === 'canceled') {
        console.debug('[TotalProfit] fetch canceled');
        return;
      }
      console.error('[TotalProfit] series fetch error:', e?.message);
      setErrMsg('Failed to load data. Retrying…');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    const loadSymbols = async () => {
      try {
        let response = null;
        const endpoints = [
          () => {
            const p = new URLSearchParams();
            if (startDate) p.append('start_date', startDate);
            if (endDate) p.append('end_date', endDate);
            return axiosInstance.get(`/api/symbols?${p.toString()}`);
          },
          () => axiosInstance.get('/api/getsymbols/symbols')
        ];
        
        for (const endpoint of endpoints) {
          try {
            response = await endpoint();
            if (response?.data && Array.isArray(response.data) && response.data.length > 0) {
              break;
            }
          } catch (error) {
            console.warn('Symbol endpoint failed:', error.message);
            continue;
          }
        }
        
        if (!response || !response.data) {
          console.error('All symbol endpoints failed');
          return;
        }

        const syms = Array.isArray(response.data) ? response.data : [];
        const opts = syms.map(s => {
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

        setSymbolOptions(opts);
        if (selectedSymbols.length === 0) setSelectedSymbols(opts.slice(0, 12));
      } catch (error) {
        console.error('Error loading symbols:', error);
      }
    };
    loadSymbols();

    fetchLive().catch((e) => console.error('[TotalProfit] fetch error:', e));
    return () => { if (controllerRef.current) controllerRef.current.abort(); };
  }, [startDate, endDate]);

  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); }
    if (liveEnabled) {
      timerRef.current = setInterval(() => {
        if (document.visibilityState === 'visible' && !isFetchingRef.current) {
          fetchLive().catch((e) => console.error('[TotalProfit] fetch error:', e));
        }
      }, POLL_MS);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [liveEnabled, startDate, endDate, startTime, endTime, selectedSymbols]);

  const cards = useMemo(() => {
    const sorted = [...rows].sort((a, b) => (a.symbol_ref || '').localeCompare(b.symbol_ref || ''));
    return sorted.map((r) => {
      const seriesObj = seriesMap[r.symbol_ref] || { vals: [], ts: [] };
      const series = seriesObj.vals || [];
      const ts = seriesObj.ts || [];
      // Just use the database value - no calculation needed
      const val = parseFloat(r.profit_total) || 0;
      
      return (
        <div key={r.symbol_ref} className="metric-card">
          <SparklineCard
            title={r.symbol_ref}
            subtitle={'Total Profit'}
            series={series}
            timestamps={ts}
            value={val}
            fmt={(n) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            positiveIsGood={true}
          />
        </div>
      );
    });
  }, [rows, seriesMap]);

  return (
    <div className="page-container" style={{ padding: 16 }}>
      <div className="data-container" style={{ background: 'transparent' }}>
        <DashboardHeader title="Total Profit" subtitle="Live, second latest per symbol" pollingSec={POLL_MS/1000} />
        <MetricFilterBar
          startDate={startDate} setStartDate={setStartDate}
          endDate={endDate} setEndDate={setEndDate}
          startTime={startTime} setStartTime={setStartTime}
          endTime={endTime} setEndTime={setEndTime}
          symbolOptions={symbolOptions}
          selectedSymbols={selectedSymbols}
          setSelectedSymbols={setSelectedSymbols}
          liveEnabled={liveEnabled}
          setLiveEnabled={setLiveEnabled}
          onRefresh={() => fetchLive()}
        />
        {loading && rows.length === 0 ? (
          <SkeletonGrid count={Math.max(6, selectedSymbols.length)} />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12,
          }}>
          {cards.length ? cards : (
            <div style={{ color: 'var(--text-secondary, #9ca3af)' }}>No points in this range. Try different dates or symbols.</div>
          )}
        </div>
        )}
        {errMsg && <div style={{ marginTop: 8, fontSize: 12, color: '#f87171' }}>{errMsg}</div>}
      </div>
    </div>
  );
};

export default TotalProfitPage;