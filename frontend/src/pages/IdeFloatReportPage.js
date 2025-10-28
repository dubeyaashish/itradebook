import React, { useEffect, useState, useMemo } from 'react';
import IdeFloatReportModal from '../components/IdeFloatReportModal';
import PdfModal from '../components/PdfModal';
import ModernPagination from '../components/ModernPagination';
import { axiosInstance } from '../App';
import '../styles/modal.css';

const IdeFloatReportPage = () => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfSrc, setPdfSrc] = useState('');
  const [selected, setSelected] = useState(null);
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const loadList = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await axiosInstance.get('/api/ide-float-report');
      setItems(Array.isArray(data) ? data : []);
      setPage(1);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load reports');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadList(); }, []);

  const openPdf = async (it) => {
    try {
      setSelected(it); setPdfOpen(true); setPdfSrc('');
      const resp = await axiosInstance.get(`/api/ide-float-report/${it.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
      setPdfSrc(url);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load PDF');
      setPdfOpen(false);
    }
  };

  const downloadSelected = async () => {
    if (!selected) return;
    try {
      const resp = await axiosInstance.get(`/api/ide-float-report/${selected.id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${selected.doc_number || 'IDE-Report'}.pdf`; document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  const loadLogs = async () => {
    if (!selected) return;
    try {
      const { data } = await axiosInstance.get(`/api/ide-float-report/${selected.id}/logs`);
      setLogs(Array.isArray(data) ? data : []);
    } catch {}
  };

  // Client-side pagination
  const totalPages = useMemo(() => Math.max(1, Math.ceil(items.length / limit)), [items.length, limit]);
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * limit;
    return items.slice(start, start + limit);
  }, [items, page, limit]);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>IDE Daily Float Comparison Report</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="auth-button btn-wide" onClick={() => setOpen(true)}>New Report</button>
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: 12 }}>
          <span>{error}</span>
          <button onClick={() => setError('')} className="retry-button">Dismiss</button>
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Recent Reports</h2>
        {loading ? (
          <div>Loading reports…</div>
        ) : items.length === 0 ? (
          <div>No reports yet. Click “New Report”.</div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Doc Number</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((it, idx) => (
                    <tr key={it.id}>
                      <td>{(page - 1) * limit + idx + 1}</td>
                      <td className="font-mono">{(it.report_date || '').slice(0,10)}</td>
                      <td>{it.client_name || '—'}</td>
                      <td className="font-mono">{it.doc_number || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="auth-button-secondary" onClick={() => openPdf(it)}>View PDF</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ModernPagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={(p) => setPage(p)}
              totalRecords={items.length}
              recordsPerPage={limit}
              showRecordsInfo={true}
            />
          </>
        )}
      </div>

      <IdeFloatReportModal open={open} onClose={() => { setOpen(false); loadList(); }} />
      <PdfModal
        open={pdfOpen}
        title={selected ? `${selected.client_name} — ${selected.doc_number}` : 'Preview'}
        src={pdfSrc}
        onClose={() => { setPdfOpen(false); if (pdfSrc) URL.revokeObjectURL(pdfSrc); setPdfSrc(''); setLogs([]); }}
        onDownload={downloadSelected}
        history={logs}
        onLoadHistory={loadLogs}
      />
    </div>
  );
};

export default IdeFloatReportPage;
