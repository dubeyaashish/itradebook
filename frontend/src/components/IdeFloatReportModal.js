import React, { useEffect, useMemo, useState } from 'react';
import { axiosInstance } from '../App';

const numberOrEmpty = (v) => (v === '' || v === null || v === undefined ? '' : v);
const toNum = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v) || 0);

const DiffInput = ({ label, client, company, value, onChange, manual, onRecalc, disabled }) => {
  const computed = useMemo(() => toNum(company) - toNum(client), [client, company]);
  return (
    <div className="diff-input">
      <input
        type="number"
        step="0.01"
        value={numberOrEmpty(value)}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <button type="button" className="icon-button" title="Recalculate"
        onClick={() => onRecalc(computed)} disabled={disabled}
      >
        ↻
      </button>
    </div>
  );
};

const IdeFloatReportModal = ({ open, onClose, initial }) => {
  const makeInitialReport = (base) => ({
    id: null,
    doc_number: '',
    report_date: new Date().toISOString().split('T')[0],
    client_name: '',
    opening_client: '', opening_company: '', opening_diff: '',
    closing_client: '', closing_company: '', closing_diff: '',
    daily_change_client: '', daily_change_company: '', daily_change_diff: '',
    winloss_client: '', winloss_company: '', winloss_diff: '',
    remarks: '', status: 'draft',
    ...(base || {})
  });

  const [report, setReport] = useState(() => makeInitialReport(initial));

  // track manual edits on diffs so we don't overwrite them
  const [manual, setManual] = useState({ opening: false, closing: false, daily: false, winloss: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!open) return; setError(''); }, [open]);

  // Reset form to a fresh report whenever opening the modal for a new report
  useEffect(() => {
    if (open) {
      setReport(makeInitialReport(initial));
      setManual({ opening: false, closing: false, daily: false, winloss: false });
    }
  }, [open, initial]);

  // auto-calc diffs unless manually overridden
  useEffect(() => {
    if (!manual.opening) setReport((p) => ({ ...p, opening_diff: toNum(p.opening_company) - toNum(p.opening_client) }));
  }, [report.opening_client, report.opening_company]);
  useEffect(() => {
    if (!manual.closing) setReport((p) => ({ ...p, closing_diff: toNum(p.closing_company) - toNum(p.closing_client) }));
  }, [report.closing_client, report.closing_company]);
  useEffect(() => {
    if (!manual.daily) setReport((p) => ({ ...p, daily_change_diff: toNum(p.daily_change_company) - toNum(p.daily_change_client) }));
  }, [report.daily_change_client, report.daily_change_company]);
  useEffect(() => {
    if (!manual.winloss) setReport((p) => ({ ...p, winloss_diff: toNum(p.winloss_company) - toNum(p.winloss_client) }));
  }, [report.winloss_client, report.winloss_company]);

  const setField = (k) => (e) => setReport((p) => ({ ...p, [k]: e.target ? e.target.value : e }));
  const setDiff = (key, mark) => (val) => { setManual((m) => ({ ...m, [mark]: true })); setReport((p) => ({ ...p, [key]: val })); };
  const recalc = (key, mark) => (val) => { setManual((m) => ({ ...m, [mark]: false })); setReport((p) => ({ ...p, [key]: val })); };

  const saveDraft = async () => {
    setBusy(true); setError('');
    try {
      const payload = { ...report };
      if (!report.id) {
        const { data } = await axiosInstance.post('/api/ide-float-report/draft', payload);
        setReport((p) => ({ ...p, id: data.id, doc_number: data.doc_number }));
      } else {
        await axiosInstance.put(`/api/ide-float-report/${report.id}`, payload);
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to save');
    } finally { setBusy(false); }
  };

  const downloadPDF = async () => {
    try {
      if (!report.id) await saveDraft();
      if (!report.id) return;
      const resp = await axiosInstance.get(`/api/ide-float-report/${report.id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.doc_number || 'IDE-Report'}.pdf`;
      document.body.appendChild(a);
      a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch (e) { setError(e?.response?.data?.error || e.message || 'Failed to download'); }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-lg">
        <div className="modal-header">
          <h2>IDE Daily Float Comparison Report</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="meta-row">
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={report.report_date} onChange={setField('report_date')} />
            </div>
            <div className="form-group">
              <label>Client</label>
              <input type="text" value={report.client_name} placeholder="Client name" onChange={setField('client_name')} />
            </div>
            <div className="form-group">
              <label>Document No.</label>
              <input type="text" value={report.doc_number || '—'} disabled />
            </div>
          </div>

          {error && <div className="error-banner" style={{ marginTop: 8 }}>{error}</div>}

          <div className="matrix">
            <div className="matrix-header">
              <div>Metric</div>
              <div>Client</div>
              <div>Company</div>
              <div>Difference</div>
            </div>
            <div className="matrix-row">
              <div>Opening Float (USD)</div>
              <div><input type="number" step="0.01" value={numberOrEmpty(report.opening_client)} onChange={setField('opening_client')} /></div>
              <div><input type="number" step="0.01" value={numberOrEmpty(report.opening_company)} onChange={setField('opening_company')} /></div>
              <div>
                <DiffInput client={report.opening_client} company={report.opening_company}
                  value={numberOrEmpty(report.opening_diff)} onChange={setDiff('opening_diff','opening')} onRecalc={recalc('opening_diff','opening')} />
              </div>
            </div>
            <div className="matrix-row">
              <div>Closing Float (USD)</div>
              <div><input type="number" step="0.01" value={numberOrEmpty(report.closing_client)} onChange={setField('closing_client')} /></div>
              <div><input type="number" step="0.01" value={numberOrEmpty(report.closing_company)} onChange={setField('closing_company')} /></div>
              <div>
                <DiffInput client={report.closing_client} company={report.closing_company}
                  value={numberOrEmpty(report.closing_diff)} onChange={setDiff('closing_diff','closing')} onRecalc={recalc('closing_diff','closing')} />
              </div>
            </div>
            <div className="matrix-row">
              <div>Daily Change (%)</div>
              <div><input type="number" step="0.01" value={numberOrEmpty(report.daily_change_client)} onChange={setField('daily_change_client')} /></div>
              <div><input type="number" step="0.01" value={numberOrEmpty(report.daily_change_company)} onChange={setField('daily_change_company')} /></div>
              <div>
                <DiffInput client={report.daily_change_client} company={report.daily_change_company}
                  value={numberOrEmpty(report.daily_change_diff)} onChange={setDiff('daily_change_diff','daily')} onRecalc={recalc('daily_change_diff','daily')} />
              </div>
            </div>
            <div className="matrix-row">
              <div>Win/Loss</div>
              <div><input type="number" step="0.01" value={numberOrEmpty(report.winloss_client)} onChange={setField('winloss_client')} /></div>
              <div><input type="number" step="0.01" value={numberOrEmpty(report.winloss_company)} onChange={setField('winloss_company')} /></div>
              <div>
                <DiffInput client={report.winloss_client} company={report.winloss_company}
                  value={numberOrEmpty(report.winloss_diff)} onChange={setDiff('winloss_diff','winloss')} onRecalc={recalc('winloss_diff','winloss')} />
              </div>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 12 }}>
            <label>Remarks</label>
            <textarea rows={4} placeholder="Add remarks here..." value={report.remarks} onChange={setField('remarks')} />
          </div>

          <div className="watermark">IdealExecution</div>
        </div>
        <div className="modal-footer">
          <button className="auth-button" onClick={saveDraft} disabled={busy}>{busy ? 'Saving...' : 'Save Draft'}</button>
          {report?.id ? (
            <button className="auth-button" onClick={downloadPDF}>Download PDF</button>
          ) : null}
        </div>
      </div>
      <style>{`
        .modal-lg { max-width: 980px; }
        .modal-header { display:flex; align-items:center; justify-content:space-between; }
        .meta-row { display:grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap:12px; }
        .matrix { border:1px solid rgba(255,255,255,0.08); border-radius:8px; overflow:hidden; margin-top:12px; }
        .matrix-header, .matrix-row { display:grid; grid-template-columns: 1.2fr 1fr 1fr 1fr; }
        .matrix-header { background: rgba(255,255,255,0.06); font-weight:600; }
        .matrix-header>div, .matrix-row>div { padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.06); }
        .matrix-row:last-child>div { border-bottom:0; }
        .table input, .matrix input, .matrix textarea { width:100%; }
        .diff-input { display:flex; gap:6px; align-items:center; }
        .icon-button { padding:6px 8px; border-radius:6px; background: var(--btn-bg, #2d3748); color:#fff; border:0; cursor:pointer; }
        .watermark { position:absolute; right:20px; bottom:16px; opacity:0.35; font-size:12px; }
      `}</style>
    </div>
  );
};

export default IdeFloatReportModal;
