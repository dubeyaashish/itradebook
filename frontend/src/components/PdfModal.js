import React, { useEffect, useState } from 'react';

const PdfModal = ({ open, title = 'Preview', src, onClose, onDownload, history = [], onLoadHistory }) => {
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => { if (!open) setShowHistory(false); }, [open]);

  const toggleHistory = async () => {
    if (!showHistory && onLoadHistory) {
      try { await onLoadHistory(); } catch {}
    }
    setShowHistory((v) => !v);
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-content" style={{ maxWidth: '1024px', width: '100%', height: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={toggleHistory}>{showHistory ? 'Hide History' : 'History'}</button>
            {onDownload && (
              <button className="btn-secondary" onClick={onDownload}>Download</button>
            )}
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="modal-body" style={{ padding: 0, flex: 1, display: 'flex' }}>
          <div style={{ flex: 1 }}>
            {src ? (
              <iframe title="pdf" src={src} style={{ width: '100%', height: '100%', border: 'none', background: '#111827' }} />
            ) : (
              <div style={{ padding: 16 }}>Loading PDF…</div>
            )}
          </div>
          {showHistory && (
            <div style={{ width: 320, borderLeft: '1px solid #1e293b', background: '#0f172a', padding: 12, overflowY: 'auto' }}>
              <h3 style={{ margin: '4px 0 8px 0', fontSize: 14, opacity: 0.9 }}>Audit History</h3>
              {(!history || history.length === 0) ? (
                <div style={{ fontSize: 12, opacity: 0.8 }}>No events</div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {history.map((h) => (
                    <li key={h.id} style={{ border: '1px solid #1e293b', borderRadius: 8, padding: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 12, opacity: 0.9 }}>
                        <strong>{h.action}</strong> • {new Date(h.created_at).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>user: {h.user_id ?? '—'}</div>
                      {h.details && (
                        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#0b1220', padding: 6, borderRadius: 6, marginTop: 6, fontSize: 11 }}>
                          {typeof h.details === 'string' ? h.details : JSON.stringify(h.details, null, 2)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PdfModal;
