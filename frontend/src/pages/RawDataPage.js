import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import Select from 'react-select';

const RawDataPage = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [totalRecords, setTotalRecords] = useState(0);
  const [dateRange, setDateRange] = useState({ minDate: '', maxDate: '' });
  const [symbols, setSymbols] = useState([]);

  // Filters
  const [filters, setFilters] = useState({
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    start_time: '00:00',
    end_time: '23:59',
    order_by: 'date',
    order_dir: 'desc',
    page: 1,
    limit: 50,
    symbol_ref: [], // Added for symbol filtering
  });

  // Column definitions (order controls both header & body)
  const columns = [
    { key: 'id', label: 'ID', sortable: false },
    { key: 'symbol_ref', label: 'Symbol', sortable: true },
    { key: 'date', label: 'Date', sortable: true },

    { key: 'buysize1', label: 'Buy Size 1', sortable: true },
    { key: 'buyprice1', label: 'Buy Price 1', sortable: true },
    { key: 'sellsize1', label: 'Sell Size 1', sortable: true },
    { key: 'sellprice1', label: 'Sell Price 1', sortable: true },

    { key: 'buysize2', label: 'Buy Size 2', sortable: true },
    { key: 'buyprice2', label: 'Buy Price 2', sortable: true },
    { key: 'sellsize2', label: 'Sell Size 2', sortable: true },
    { key: 'sellprice2', label: 'Sell Price 2', sortable: true },

    { key: 'mktprice', label: 'Market Price', sortable: true },
    { key: 'buylot', label: 'Buy Lot', sortable: true },
    { key: 'avgbuy', label: 'Avg Buy', sortable: true },
    { key: 'selllot', label: 'Sell Lot', sortable: true },
    { key: 'avgsell', label: 'Avg Sell', sortable: true },
    { key: 'difflot', label: 'Diff Lot', sortable: true },
    { key: 'profit_total', label: 'Profit Total', sortable: true },
    { key: 'profit_ratio', label: 'Profit Ratio', sortable: true },
    { key: 'type', label: 'Type', sortable: true },
  ];

  // Numeric columns for right-align & formatting
  const numericCols = new Set([
    'buysize1', 'buyprice1', 'sellsize1', 'sellprice1',
    'buysize2', 'buyprice2', 'sellsize2', 'sellprice2',
    'mktprice', 'buylot', 'avgbuy', 'selllot', 'avgsell',
    'difflot', 'profit_total', 'profit_ratio'
  ]);

  // Load date range and symbols once
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load date range
        const dateRangeResponse = await axios.get('/api/date-range');
        const { minDate, maxDate } = dateRangeResponse.data || {};
        setDateRange({ minDate, maxDate });

        // If backend provides a range and current filters are blank, seed them
        if (!filters.start_date && minDate) {
          setFilters(prev => ({ ...prev, start_date: minDate }));
        }
        if (!filters.end_date && maxDate) {
          setFilters(prev => ({ ...prev, end_date: maxDate }));
        }

        // Load symbols
        const symbolsResponse = await axios.get('/api/symbols');
        setSymbols(symbolsResponse.data || []);
      } catch (err) {
        console.error('Failed to load initial data:', err);
      }
    };

    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load data whenever filters change
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach(v => params.append(key, v));
          } else if (value !== undefined && value !== null && value !== '') {
            params.append(key, value);
          }
        });

        const { data: resp } = await axios.get(`/api/trading-data?${params}`);
        setData(resp.rows || []);
        setTotalRecords(resp.total || 0);
      } catch (err) {
        setError(err?.response?.data?.error || 'Failed to load trading data');
        setData([]);
        setTotalRecords(0);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [filters]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key !== 'page' ? 1 : value,
    }));
  };

  // Handy handler for react-select multi selects
  const onMultiChange = (key) => (selected) => {
    handleFilterChange(key, (selected || []).map(o => o.value));
  };

  const handleSort = (column) => {
    let direction = 'asc';
    if (filters.order_by === column && filters.order_dir === 'asc') {
      direction = 'desc';
    }
    setFilters(prev => ({ ...prev, order_by: column, order_dir: direction, page: 1 }));
  };

  const getSortIcon = (column) => {
    if (filters.order_by !== column) return 'fas fa-sort text-gray-400';
    return filters.order_dir === 'asc'
      ? 'fas fa-sort-up text-blue-600'
      : 'fas fa-sort-down text-blue-600';
  };

  const formatNumber = (value, decimals = 4) => {
    if (value === null || value === undefined || value === '') return '0';
    const num = parseFloat(value);
    if (Number.isNaN(num)) return '0';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const getCellClass = (value) => {
    const num = parseFloat(value);
    if (Number.isNaN(num)) return '';
    if (num > 0) return 'text-green-600 font-semibold';
    if (num < 0) return 'text-red-600 font-semibold';
    return '';
  };

  const escapeCSV = (val) => {
    const s = String(val ?? '');
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const exportToCSV = () => {
    if (!data.length) {
      alert('No data to export');
      return;
    }

    const headers = columns.map(col => col.label);
    const csvData = [headers];

    data.forEach(row => {
      const rowData = columns.map(col => {
        const value = row[col.key];
        if (col.key === 'date') return formatDate(value);
        if (numericCols.has(col.key)) return formatNumber(value);
        return value ?? '';
      });
      csvData.push(rowData);
    });

    const csvString = csvData.map(row => row.map(escapeCSV).join(',')).join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trading_data_${filters.start_date}_to_${filters.end_date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil((totalRecords || 0) / (filters.limit || 1)));

  // react-select styles
  const selectStyles = {
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
    control: (base, state) => ({
      ...base,
      minHeight: 42,
      backgroundColor: 'var(--bg-input)',
      borderColor: state.isFocused ? 'var(--accent-primary)' : 'var(--border-color)',
      boxShadow: state.isFocused ? '0 0 0 3px rgb(59 130 246 / 0.10)' : 'none',
      ':hover': { borderColor: 'var(--accent-primary)' },
      color: 'var(--text-primary)',
    }),
    placeholder: (base) => ({
      ...base,
      color: 'var(--text-muted)',
    }),
    input: (base) => ({
      ...base,
      color: 'var(--text-primary)',
    }),
    singleValue: (base) => ({
      ...base,
      color: 'var(--text-primary)',
    }),
    valueContainer: (base) => ({
      ...base,
      padding: '2px 8px',
      color: 'var(--text-primary)',
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: 'rgba(59,130,246,.15)',
      border: '1px solid var(--accent-primary)',
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: 'var(--text-primary)',
      fontWeight: 600,
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: 'var(--text-secondary)',
      ':hover': { backgroundColor: 'rgba(239,68,68,.25)', color: '#fff' },
    }),
    indicatorsContainer: (base) => ({ ...base, color: 'var(--text-secondary)' }),
    dropdownIndicator: (base) => ({
      ...base, color: 'var(--text-secondary)',
      ':hover': { color: 'var(--text-primary)' },
    }),
    clearIndicator: (base) => ({
      ...base, color: 'var(--text-secondary)',
      ':hover': { color: 'var(--accent-error)' },
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      boxShadow: 'var(--shadow-lg)',
      color: 'var(--text-primary)',
      overflow: 'hidden',
    }),
    menuList: (base) => ({
      ...base,
      backgroundColor: 'var(--bg-card)',
      padding: 4,
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? 'rgba(59,130,246,.25)'
        : state.isFocused
        ? 'rgba(59,130,246,.12)'
        : 'transparent',
      color: 'var(--text-primary)',
      ':active': { backgroundColor: 'rgba(59,130,246,.25)' },
    }),
  };

  // Options for react-select
  const symbolOptions = useMemo(
    () => symbols.map(s => ({ value: s, label: s })),
    [symbols]
  );

  return (
    <div className="raw-data-page">
      {/* Header Info */}
      <div className="data-container mb-6">
        <div className="data-stats">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold mb-2">Raw Trading Data Table</h2>
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <span>
                  <i className="fas fa-circle text-blue-500 mr-1"></i>
                  Raw Data View
                </span>
                <span>Page loaded: {new Date().toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Date Filter Section */}
      <div className="data-container mb-6">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Date & Time Range Filter</h3>
            <button onClick={exportToCSV} className="auth-button">
              <i className="fas fa-download mr-2"></i>Export CSV
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="form-group">
              <label>Start Date</label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                min={dateRange.minDate}
                max={dateRange.maxDate}
              />
            </div>
            <div className="form-group">
              <label>Start Time</label>
              <input
                type="time"
                value={filters.start_time}
                onChange={(e) => handleFilterChange('start_time', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>End Date</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                min={dateRange.minDate}
                max={dateRange.maxDate}
              />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <input
                type="time"
                value={filters.end_time}
                onChange={(e) => handleFilterChange('end_time', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Symbols</label>
              <Select
                isMulti
                isClearable
                options={symbolOptions}
                value={symbolOptions.filter(o => filters.symbol_ref.includes(o.value))}
                onChange={onMultiChange('symbol_ref')}
                placeholder="Select symbols…"
                classNamePrefix="rs"
                styles={selectStyles}
                menuPortalTarget={document.body}
              />
            </div>
            <div className="form-group">
              <label>Records per page</label>
              <select
                value={filters.limit}
                onChange={(e) => handleFilterChange('limit', parseInt(e.target.value, 10))}
              >
                <option value={10}>10</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button onClick={() => setFilters(prev => ({ ...prev }))} className="auth-button">
              <i className="fas fa-search mr-2"></i>Apply Filter
            </button>
            <button onClick={() => setFilters(prev => ({ ...prev }))} className="auth-button-secondary">
              <i className="fas fa-sync mr-2"></i>Get Latest Data
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError('')} className="retry-button">Dismiss</button>
        </div>
      )}

      {/* Data Table */}
      <div className="data-container">
        <div className="data-stats">
          <div className="flex justify-between items-center">
            <span>
              Showing <strong>{data.length}</strong> of <strong>{(totalRecords || 0).toLocaleString()}</strong> records
            </span>
            <div className="text-sm text-gray-500">
              Range: {filters.start_date} {filters.start_time} to {filters.end_date} {filters.end_time}
              {filters.order_by && (
                <span className="ml-2">| Sorted by: {filters.order_by} ({filters.order_dir.toUpperCase()})</span>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p>Loading trading data...</p>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="no-data">
            <h3>No Data Found</h3>
            <p>No trading data found for the selected date range ({filters.start_date} to {filters.end_date})</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ maxHeight: '600px' }}>
            <table className="data-table">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-800 text-white">
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      onClick={() => column.sortable && handleSort(column.key)}
                      className={column.sortable ? 'cursor-pointer hover:bg-gray-700' : ''}
                    >
                      <div className="flex items-center">
                        <span>{column.label}</span>
                        {column.sortable && <i className={`${getSortIcon(column.key)} ml-1 text-xs`}></i>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {columns.map((col) => {
                      const val = row[col.key];

                      // Special cells
                      if (col.key === 'symbol_ref') {
                        const letter = (val || '?').toString().charAt(0).toUpperCase();
                        return (
                          <td key={`${row.id}-${col.key}`}>
                            <div className="flex items-center">
                              <div className="w-6 h-6 bg-blue-600 rounded text-white text-xs flex items-center justify-center mr-2">
                                {letter}
                              </div>
                              {val || 'N/A'}
                            </div>
                          </td>
                        );
                      }

                      if (col.key === 'date') {
                        return (
                          <td key={`${row.id}-${col.key}`}>{formatDate(val)}</td>
                        );
                      }

                      if (col.key === 'type') {
                        return (
                          <td key={`${row.id}-${col.key}`}>
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                val === 'snapshot'
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {val || 'N/A'}
                            </span>
                          </td>
                        );
                      }

                      // Numeric default
                      if (numericCols.has(col.key)) {
                        return (
                          <td key={`${row.id}-${col.key}`} className={`text-right font-mono ${getCellClass(val)}`}>
                            {formatNumber(val)}
                          </td>
                        );
                      }

                      // Fallback text
                      return <td key={`${row.id}-${col.key}`}>{val ?? 'N/A'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex justify-center items-center gap-2">
            <button
              onClick={() => handleFilterChange('page', 1)}
              disabled={filters.page <= 1}
              className="auth-button-secondary"
            >
              <i className="fas fa-angle-double-left"></i>
            </button>
            <button
              onClick={() => handleFilterChange('page', Math.max(1, filters.page - 1))}
              disabled={filters.page <= 1}
              className="auth-button-secondary"
            >
              <i className="fas fa-angle-left"></i>
            </button>
            <span className="px-4 py-2 bg-blue-600 text-white rounded">
              Page {filters.page} of {totalPages}
            </span>
            <button
              onClick={() => handleFilterChange('page', Math.min(totalPages, filters.page + 1))}
              disabled={filters.page >= totalPages}
              className="auth-button-secondary"
            >
              <i className="fas fa-angle-right"></i>
            </button>
            <button
              onClick={() => handleFilterChange('page', totalPages)}
              disabled={filters.page >= totalPages}
              className="auth-button-secondary"
            >
              <i className="fas fa-angle-double-right"></i>
            </button>
          </div>
        )}

        {/* Summary Card */}
        {data.length > 0 && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-semibold mb-3">Page Summary</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Records on Page:</span>
                <span className="ml-2 font-semibold">{data.length.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-600">Unique Symbols:</span>
                <span className="ml-2 font-semibold">{new Set(data.map((r) => r.symbol_ref).filter(Boolean)).size}</span>
              </div>
              <div>
                <span className="text-gray-600">Total Profit:</span>
                <span
                  className={`ml-2 font-semibold ${getCellClass(
                    data.reduce((sum, r) => sum + (parseFloat(r.profit_total) || 0), 0)
                  )}`}
                >
                  {formatNumber(
                    data.reduce((sum, r) => sum + (parseFloat(r.profit_total) || 0), 0),
                    2
                  )}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Avg Profit:</span>
                <span
                  className={`ml-2 font-semibold ${getCellClass(
                    data.reduce((sum, r) => sum + (parseFloat(r.profit_total) || 0), 0) / data.length
                  )}`}
                >
                  {formatNumber(
                    data.reduce((sum, r) => sum + (parseFloat(r.profit_total) || 0), 0) / data.length,
                    2
                  )}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RawDataPage;
