import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import TradingTable from '../components/TradingTable';
import axios from 'axios';

const ReportPage = () => {
  const { user, logout } = useAuth();
  const [data, setData] = useState([]);
  const [symbols, setSymbols] = useState([]);
  const [refids, setRefids] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [totalRecords, setTotalRecords] = useState(0);
  
  // Filter states
  const [filters, setFilters] = useState({
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    start_time: '00:00',
    end_time: '23:59',
    symbolref: [],
    refid: [],
    filter_type: '',
    order_by: 'date',
    order_dir: 'desc',
    page: 1,
    limit: 30
  });

  // Load initial data
  useEffect(() => {
    loadSymbols();
    loadRefids();
    loadData();
  }, []);

  // Load data when filters change
  useEffect(() => {
    loadData();
  }, [filters]);

  const loadSymbols = async () => {
    try {
      const response = await axios.get('/api/symbols');
      setSymbols(response.data);
    } catch (error) {
      console.error('Failed to load symbols:', error);
    }
  };

  const loadRefids = async () => {
    try {
      const response = await axios.get('/api/refids');
      setRefids(response.data);
    } catch (error) {
      console.error('Failed to load refids:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(v => params.append(key, v));
        } else if (value) {
          params.append(key, value);
        }
      });

      const response = await axios.get(`/api/data?${params}`);
      setData(response.data.rows);
      setTotalRecords(response.data.total);
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to load data');
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
      page: key !== 'page' ? 1 : value // Reset to first page unless changing page
    }));
  };

  const handleBulkDelete = async (ids) => {
    if (!ids.length) return;
    
    if (!window.confirm(`Are you sure you want to delete ${ids.length} records?`)) {
      return;
    }

    try {
      await axios.delete('/api/data', { data: { ids } });
      loadData(); // Reload data after successful deletion
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to delete records');
    }
  };

  const handleInsert = async (formData) => {
    try {
      await axios.post('/api/data', formData);
      loadData(); // Reload data after successful insertion
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.error || 'Failed to insert record' 
      };
    }
  };

  const exportToCSV = () => {
    if (!data.length) {
      alert('No data to export');
      return;
    }

    const headers = ['ID', 'RefID', 'Symbol', 'Buy Size', 'Buy Price', 'Sell Size', 'Sell Price', 'Date', 'Type'];
    const csvData = [headers];
    
    data.forEach(row => {
      csvData.push([
        row.id,
        row.refid || '',
        row.symbolref || '',
        row.buysize || '',
        row.buyprice || '',
        row.sellsize || '',
        row.sellprice || '',
        row.date || '',
        row.type || ''
      ]);
    });

    const csvString = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trading_data_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(totalRecords / filters.limit);

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <h1>iTradeBook Dashboard</h1>
          </div>
          <div className="header-right">
            <div className="user-info">
              <span className="user-welcome">Welcome, {user?.username}</span>
              {user?.user_type === 'managed' && (
                <span className="badge">Managed User</span>
              )}
            </div>
            <button onClick={logout} className="logout-button">
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Filters Section */}
        <div className="data-container mb-4">
          <div className="p-4">
            <h2 className="text-xl font-semibold mb-4">Filters & Search</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* Date Filters */}
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

              {/* Symbol Filter */}
              <div className="form-group">
                <label>Symbols</label>
                <select 
                  multiple
                  value={filters.symbolref}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, option => option.value);
                    handleFilterChange('symbolref', selected);
                  }}
                  className="h-20"
                >
                  {symbols.map(symbol => (
                    <option key={symbol} value={symbol}>{symbol}</option>
                  ))}
                </select>
              </div>

              {/* RefID Filter */}
              <div className="form-group">
                <label>Tickets</label>
                <select 
                  multiple
                  value={filters.refid}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, option => option.value);
                    handleFilterChange('refid', selected);
                  }}
                  className="h-20"
                >
                  {refids.map(refid => (
                    <option key={refid} value={refid}>{refid}</option>
                  ))}
                </select>
              </div>

              {/* Filter Type */}
              <div className="form-group">
                <label>Filter Type</label>
                <select
                  value={filters.filter_type}
                  onChange={(e) => handleFilterChange('filter_type', e.target.value)}
                >
                  <option value="">All Types</option>
                  <option value="snapshot">Snapshot</option>
                </select>
              </div>

              {/* Records per page */}
              <div className="form-group">
                <label>Records per page</label>
                <select
                  value={filters.limit}
                  onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
                >
                  <option value={10}>10</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <button onClick={() => loadData()} className="auth-button">
                Apply Filters
              </button>
              <button onClick={exportToCSV} className="auth-button-secondary">
                Export CSV
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
        <TradingTable
          data={data}
          symbols={symbols}
          loading={loading}
          totalRecords={totalRecords}
          currentPage={filters.page}
          totalPages={totalPages}
          onPageChange={(page) => handleFilterChange('page', page)}
          onSort={(column, direction) => {
            handleFilterChange('order_by', column);
            handleFilterChange('order_dir', direction);
          }}
          onBulkDelete={handleBulkDelete}
          onInsert={handleInsert}
          userType={user?.user_type}
        />

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
            <span className="px-4 py-2 bg-gray-800 rounded">
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
      </main>
    </div>
  );
};

export default ReportPage;