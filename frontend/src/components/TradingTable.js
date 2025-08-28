import React, { useState } from 'react';

const TradingTable = ({ 
  data, 
  symbols, 
  loading, 
  totalRecords, 
  currentPage, 
  totalPages,
  onPageChange, 
  onSort, 
  onBulkDelete, 
  onInsert,
  userType 
}) => {
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showInsertModal, setShowInsertModal] = useState(false);
  const [sortColumn, setSortColumn] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');

  // Insert form state
  const [insertForm, setInsertForm] = useState({
    refid: '',
    buysize: '',
    buyprice: '',
    sellsize: '',
    sellprice: '',
    symbolref: '',
    type: 'manual'
  });
  const [insertError, setInsertError] = useState('');
  const [insertLoading, setInsertLoading] = useState(false);

  const columns = [
    { key: 'id', label: 'ID', sortable: false },
    { key: 'refid', label: 'RefID', sortable: true },
    { key: 'symbolref', label: 'Symbol', sortable: true },
    { key: 'buysize', label: 'Buy Size', sortable: true },
    { key: 'buyprice', label: 'Buy Price', sortable: true },
    { key: 'sellsize', label: 'Sell Size', sortable: true },
    { key: 'sellprice', label: 'Sell Price', sortable: true },
    { key: 'date', label: 'Date', sortable: true },
    { key: 'type', label: 'Type', sortable: true }
  ];

  const handleSort = (column) => {
    let direction = 'asc';
    if (sortColumn === column && sortDirection === 'asc') {
      direction = 'desc';
    }
    setSortColumn(column);
    setSortDirection(direction);
    onSort(column, direction);
  };

  const handleSelectAll = () => {
    if (selectedRows.size === data.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(data.map(row => row.id)));
    }
  };

  const handleRowSelect = (id) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  const handleBulkDelete = () => {
    if (selectedRows.size === 0) {
      alert('Please select rows to delete');
      return;
    }
    onBulkDelete(Array.from(selectedRows));
    setSelectedRows(new Set());
  };

  const handleInsertSubmit = async (e) => {
    e.preventDefault();
    setInsertError('');
    setInsertLoading(true);

    // Validate required fields
    if (!insertForm.refid) {
      setInsertError('RefID is required');
      setInsertLoading(false);
      return;
    }

    const result = await onInsert(insertForm);
    
    if (result.success) {
      setShowInsertModal(false);
      setInsertForm({
        refid: '',
        buysize: '',
        buyprice: '',
        sellsize: '',
        sellprice: '',
        symbolref: '',
        type: 'manual'
      });
      setSelectedRows(new Set()); // Clear selections
    } else {
      setInsertError(result.error);
    }
    
    setInsertLoading(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const formatNumber = (value) => {
    if (value === null || value === undefined || value === '') return '';
    return parseFloat(value).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6
    });
  };

  if (loading) {
    return (
      <div className="data-container">
        <div className="loading-container">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Loading trading data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="data-container">
        {/* Table Header with Actions */}
        <div className="data-stats">
          <div className="flex justify-between items-center">
            <span>
              Showing <strong>{data.length}</strong> of <strong>{totalRecords}</strong> records
              {currentPage && totalPages && (
                <> (Page {currentPage} of {totalPages})</>
              )}
            </span>
            <div className="flex gap-3">
              <button 
                onClick={handleBulkDelete}
                disabled={selectedRows.size === 0}
                className="retry-button"
              >
                Delete Selected ({selectedRows.size})
              </button>
              <button 
                onClick={() => setShowInsertModal(true)}
                className="auth-button"
              >
                Insert New Row
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        {data.length === 0 ? (
          <div className="no-data">
            <h3>No Data Found</h3>
            <p>No trading data matches your current filters.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>
                    <input
                      type="checkbox"
                      checked={selectedRows.size === data.length && data.length > 0}
                      onChange={handleSelectAll}
                    />
                  </th>
                  {columns.map(column => (
                    <th 
                      key={column.key}
                      onClick={() => column.sortable && handleSort(column.key)}
                      style={{ cursor: column.sortable ? 'pointer' : 'default' }}
                    >
                      <div className="flex items-center">
                        {column.label}
                        {column.sortable && (
                          <span className="ml-1">
                            {sortColumn === column.key ? (
                              sortDirection === 'asc' ? '↑' : '↓'
                            ) : '↕'}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map(row => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row.id)}
                        onChange={() => handleRowSelect(row.id)}
                      />
                    </td>
                    <td>{row.id}</td>
                    <td>{row.refid || 'N/A'}</td>
                    <td>
                      <div className="flex items-center">
                        <div className="w-6 h-6 bg-blue-600 rounded text-white text-xs flex items-center justify-center mr-2">
                          {row.symbolref ? row.symbolref.charAt(0).toUpperCase() : '?'}
                        </div>
                        {row.symbolref || 'N/A'}
                      </div>
                    </td>
                    <td className="text-right font-mono">{formatNumber(row.buysize)}</td>
                    <td className="text-right font-mono">{formatNumber(row.buyprice)}</td>
                    <td className="text-right font-mono">{formatNumber(row.sellsize)}</td>
                    <td className="text-right font-mono">{formatNumber(row.sellprice)}</td>
                    <td>{formatDate(row.date)}</td>
                    <td>
                      <span className={`px-2 py-1 rounded text-xs ${
                        row.type === 'snapshot' ? 'bg-orange-100 text-orange-800' : 
                        row.type === 'manual' ? 'bg-blue-100 text-blue-800' : 
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {row.type || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Insert Modal */}
      {showInsertModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="auth-card max-w-md w-full">
            <div className="auth-header">
              <h2>Insert New Record</h2>
              <button 
                onClick={() => setShowInsertModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>

            {insertError && <div className="error-message">{insertError}</div>}

            <form onSubmit={handleInsertSubmit} className="auth-form">
              <div className="form-group">
                <label>RefID (Ticket) *</label>
                <input
                  type="text"
                  value={insertForm.refid}
                  onChange={(e) => setInsertForm({...insertForm, refid: e.target.value})}
                  required
                  placeholder="Enter unique RefID"
                />
              </div>

              <div className="form-group">
                <label>Symbol</label>
                <select
                  value={insertForm.symbolref}
                  onChange={(e) => setInsertForm({...insertForm, symbolref: e.target.value})}
                >
                  <option value="">Select Symbol</option>
                  {symbols.map(symbol => (
                    <option key={symbol} value={symbol}>{symbol}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label>Buy Size</label>
                  <input
                    type="number"
                    step="0.01"
                    value={insertForm.buysize}
                    onChange={(e) => setInsertForm({...insertForm, buysize: e.target.value})}
                    placeholder="0.00"
                  />
                </div>

                <div className="form-group">
                  <label>Buy Price</label>
                  <input
                    type="number"
                    step="0.00001"
                    value={insertForm.buyprice}
                    onChange={(e) => setInsertForm({...insertForm, buyprice: e.target.value})}
                    placeholder="0.00000"
                  />
                </div>

                <div className="form-group">
                  <label>Sell Size</label>
                  <input
                    type="number"
                    step="0.01"
                    value={insertForm.sellsize}
                    onChange={(e) => setInsertForm({...insertForm, sellsize: e.target.value})}
                    placeholder="0.00"
                  />
                </div>

                <div className="form-group">
                  <label>Sell Price</label>
                  <input
                    type="number"
                    step="0.00001"
                    value={insertForm.sellprice}
                    onChange={(e) => setInsertForm({...insertForm, sellprice: e.target.value})}
                    placeholder="0.00000"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Type</label>
                <select
                  value={insertForm.type}
                  onChange={(e) => setInsertForm({...insertForm, type: e.target.value})}
                >
                  <option value="manual">Manual</option>
                  <option value="snapshot">Snapshot</option>
                </select>
              </div>

              <div className="flex gap-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setShowInsertModal(false)}
                  className="auth-button-secondary flex-1"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={insertLoading}
                  className="auth-button flex-1"
                >
                  {insertLoading ? 'Inserting...' : 'Insert'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default TradingTable;