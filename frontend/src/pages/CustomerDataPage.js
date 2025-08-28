import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../App';

const CustomerDataPage = () => {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [totalRecords, setTotalRecords] = useState(0);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showInsertModal, setShowInsertModal] = useState(false);

  // Filter states
  const [filters, setFilters] = useState({
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    start_time: '00:00',
    end_time: '23:59',
    mt5: '',
    order_ref: '',
    page: 1,
    limit: 30
  });

  // Insert form state
  const [insertForm, setInsertForm] = useState({
    api_key: '',
    datetime_server_ts_tz: new Date().toISOString().slice(0, 16),
    mt5: '',
    order_ref: '',
    direction: '',
    type: '',
    volume: '',
    price: '',
    swap: '',
    swap_last: '',
    balance: '',
    equity: '',
    floating: '',
    profit_loss: '',
    profit_loss_last: '',
    symbolrate_name: '',
    currency: '',
    volume_total: ''
  });

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });

      const response = await axios.get(`/api/customer-data?${params}`);
      setData(response.data.rows);
      setTotalRecords(response.data.total);
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to load customer data');
      setData([]);
      setTotalRecords(0);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key !== 'page' ? 1 : value
    }));
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

  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) {
      alert('Please select rows to delete');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${selectedRows.size} records?`)) {
      return;
    }

    try {
      await axios.delete('/api/customer-data', { data: { ids: Array.from(selectedRows) } });
      setSelectedRows(new Set());
      loadData();
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to delete records');
    }
  };

  const handleInsertSubmit = async (e) => {
    e.preventDefault();
    
    try {
      await axios.post('/api/customer-data', insertForm);
      setShowInsertModal(false);
      setInsertForm({
        api_key: '',
        datetime_server_ts_tz: new Date().toISOString().slice(0, 16),
        mt5: '',
        order_ref: '',
        direction: '',
        type: '',
        volume: '',
        price: '',
        swap: '',
        swap_last: '',
        balance: '',
        equity: '',
        floating: '',
        profit_loss: '',
        profit_loss_last: '',
        symbolrate_name: '',
        currency: '',
        volume_total: ''
      });
      loadData();
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to insert record');
    }
  };

  const exportToCSV = () => {
    if (!data.length) {
      alert('No data to export');
      return;
    }

    const headers = ['ID', 'API Key', 'DateTime', 'MT5', 'Order Ref', 'Direction', 'Type', 'Volume', 'Price', 'Balance', 'Equity', 'Floating'];
    const csvData = [headers];
    
    data.forEach(row => {
      csvData.push([
        row.id,
        row.api_key || '',
        row.datetime_server_ts_tz || '',
        row.mt5 || '',
        row.order_ref || '',
        row.direction || '',
        row.type || '',
        row.volume || '',
        row.price || '',
        row.balance || '',
        row.equity || '',
        row.floating || ''
      ]);
    });

    const csvString = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `customer_data_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  };

  const totalPages = Math.ceil(totalRecords / filters.limit);

  return (
    <div className="customer-data-page">
      {/* Filters Section */}
      <div className="data-container mb-6">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Filters & Search</h2>
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
              />
            </div>
            <div className="form-group">
              <label>End Date</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
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
              <label>End Time</label>
              <input
                type="time"
                value={filters.end_time}
                onChange={(e) => handleFilterChange('end_time', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>MT5 Account</label>
              <input
                type="text"
                value={filters.mt5}
                onChange={(e) => handleFilterChange('mt5', e.target.value)}
                placeholder="Enter MT5 account"
              />
            </div>
            <div className="form-group">
              <label>Order Reference</label>
              <input
                type="text"
                value={filters.order_ref}
                onChange={(e) => handleFilterChange('order_ref', e.target.value)}
                placeholder="Enter order reference"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button onClick={loadData} className="auth-button">
              <i className="fas fa-search mr-2"></i>Apply Filters
            </button>
            <button 
              onClick={() => setFilters({
                start_date: new Date().toISOString().split('T')[0],
                end_date: new Date().toISOString().split('T')[0],
                start_time: '00:00',
                end_time: '23:59',
                mt5: '',
                order_ref: '',
                page: 1,
                limit: 30
              })} 
              className="auth-button-secondary"
            >
              <i className="fas fa-undo mr-2"></i>Reset
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError('')} className="retry-button">
            Dismiss
          </button>
        </div>
      )}

      {/* Data Table */}
      <div className="data-container">
        <div className="data-stats">
          <div className="flex justify-between items-center">
            <span>
              Showing <strong>{data.length}</strong> of <strong>{totalRecords}</strong> records
              {user?.user_type === 'managed' && (
                <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                  Managed User View
                </span>
              )}
            </span>
            <div className="flex gap-3">
              <button 
                onClick={handleBulkDelete}
                disabled={selectedRows.size === 0}
                className="retry-button"
              >
                <i className="fas fa-trash mr-2"></i>
                Delete Selected ({selectedRows.size})
              </button>
              <button 
                onClick={() => setShowInsertModal(true)}
                className="auth-button"
              >
                <i className="fas fa-plus mr-2"></i>Insert New
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p>Loading customer data...</p>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="no-data">
            <h3>No Customer Data Found</h3>
            <p>No customer data matches your current filters.</p>
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
                  <th>ID</th>
                  <th>API Key</th>
                  <th>DateTime</th>
                  <th>MT5</th>
                  <th>Order Ref</th>
                  <th>Direction</th>
                  <th>Type</th>
                  <th>Volume</th>
                  <th>Price</th>
                  <th>Balance</th>
                  <th>Equity</th>
                  <th>Floating</th>
                  <th>P&L</th>
                  <th>Currency</th>
                  <th>Created</th>
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
                    <td className="font-mono text-xs">{row.api_key || 'N/A'}</td>
                    <td>{formatDate(row.datetime_server_ts_tz)}</td>
                    <td className="font-semibold">{row.mt5 || 'N/A'}</td>
                    <td>{row.order_ref || 'N/A'}</td>
                    <td>
                      <span className={`px-2 py-1 rounded text-xs ${
                        row.direction === 'in' ? 'bg-green-100 text-green-800' : 
                        row.direction === 'out' ? 'bg-red-100 text-red-800' : 
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {row.direction || 'N/A'}
                      </span>
                    </td>
                    <td>
                      <span className={`px-2 py-1 rounded text-xs ${
                        row.type === 'buy' ? 'bg-blue-100 text-blue-800' : 
                        row.type === 'sell' ? 'bg-orange-100 text-orange-800' : 
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {row.type || 'N/A'}
                      </span>
                    </td>
                    <td className="text-right font-mono">{formatNumber(row.volume)}</td>
                    <td className="text-right font-mono">{formatNumber(row.price)}</td>
                    <td className="text-right font-mono">{formatNumber(row.balance)}</td>
                    <td className="text-right font-mono">{formatNumber(row.equity)}</td>
                    <td className={`text-right font-mono ${
                      Number(row.floating) > 0 ? 'text-green-600' : 
                      Number(row.floating) < 0 ? 'text-red-600' : ''
                    }`}>
                      {formatNumber(row.floating)}
                    </td>
                    <td className={`text-right font-mono ${
                      Number(row.profit_loss) > 0 ? 'text-green-600' : 
                      Number(row.profit_loss) < 0 ? 'text-red-600' : ''
                    }`}>
                      {formatNumber(row.profit_loss)}
                    </td>
                    <td>{row.currency || 'N/A'}</td>
                    <td>{formatDate(row.created_at)}</td>
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
              First
            </button>
            <button
              onClick={() => handleFilterChange('page', filters.page - 1)}
              disabled={filters.page <= 1}
              className="auth-button-secondary"
            >
              Previous
            </button>
            <span className="px-4 py-2 bg-gray-800 rounded text-white">
              Page {filters.page} of {totalPages}
            </span>
            <button
              onClick={() => handleFilterChange('page', filters.page + 1)}
              disabled={filters.page >= totalPages}
              className="auth-button-secondary"
            >
              Next
            </button>
            <button
              onClick={() => handleFilterChange('page', totalPages)}
              disabled={filters.page >= totalPages}
              className="auth-button-secondary"
            >
              Last
            </button>
          </div>
        )}
      </div>

      {/* Insert Modal */}
      {showInsertModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="auth-card max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="auth-header">
              <h2>Insert New Customer Data</h2>
              <button 
                onClick={() => setShowInsertModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleInsertSubmit} className="auth-form">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-group">
                  <label>API Key</label>
                  <input
                    type="text"
                    value={insertForm.api_key}
                    onChange={(e) => setInsertForm({...insertForm, api_key: e.target.value})}
                    placeholder="Enter API key"
                  />
                </div>

                <div className="form-group">
                  <label>DateTime</label>
                  <input
                    type="datetime-local"
                    value={insertForm.datetime_server_ts_tz}
                    onChange={(e) => setInsertForm({...insertForm, datetime_server_ts_tz: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label>MT5 Account</label>
                  <input
                    type="text"
                    value={insertForm.mt5}
                    onChange={(e) => setInsertForm({...insertForm, mt5: e.target.value})}
                    placeholder="Enter MT5 account"
                  />
                </div>

                <div className="form-group">
                  <label>Order Reference</label>
                  <input
                    type="text"
                    value={insertForm.order_ref}
                    onChange={(e) => setInsertForm({...insertForm, order_ref: e.target.value})}
                    placeholder="Enter order reference"
                  />
                </div>

                <div className="form-group">
                  <label>Direction</label>
                  <select
                    value={insertForm.direction}
                    onChange={(e) => setInsertForm({...insertForm, direction: e.target.value})}
                  >
                    <option value="">Select Direction</option>
                    <option value="in">In</option>
                    <option value="out">Out</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Type</label>
                  <select
                    value={insertForm.type}
                    onChange={(e) => setInsertForm({...insertForm, type: e.target.value})}
                  >
                    <option value="">Select Type</option>
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Volume</label>
                  <input
                    type="number"
                    step="0.01"
                    value={insertForm.volume}
                    onChange={(e) => setInsertForm({...insertForm, volume: e.target.value})}
                    placeholder="0.00"
                  />
                </div>

                <div className="form-group">
                  <label>Price</label>
                  <input
                    type="number"
                    step="0.00001"
                    value={insertForm.price}
                    onChange={(e) => setInsertForm({...insertForm, price: e.target.value})}
                    placeholder="0.00000"
                  />
                </div>

                <div className="form-group">
                  <label>Balance</label>
                  <input
                    type="number"
                    step="0.01"
                    value={insertForm.balance}
                    onChange={(e) => setInsertForm({...insertForm, balance: e.target.value})}
                    placeholder="0.00"
                  />
                </div>

                <div className="form-group">
                  <label>Equity</label>
                  <input
                    type="number"
                    step="0.01"
                    value={insertForm.equity}
                    onChange={(e) => setInsertForm({...insertForm, equity: e.target.value})}
                    placeholder="0.00"
                  />
                </div>

                <div className="form-group">
                  <label>Floating P&L</label>
                  <input
                    type="number"
                    step="0.01"
                    value={insertForm.floating}
                    onChange={(e) => setInsertForm({...insertForm, floating: e.target.value})}
                    placeholder="0.00"
                  />
                </div>

                <div className="form-group">
                  <label>Currency</label>
                  <select
                    value={insertForm.currency}
                    onChange={(e) => setInsertForm({...insertForm, currency: e.target.value})}
                  >
                    <option value="">Select Currency</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="JPY">JPY</option>
                  </select>
                </div>
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
                  className="auth-button flex-1"
                >
                  Insert Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDataPage;