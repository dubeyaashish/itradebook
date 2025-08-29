import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, axiosInstance, STORAGE_KEYS } from '../App';
import TradingTable from '../components/TradingTable';
import axios from 'axios';
import Select from 'react-select';

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

  // react-select styles (keeps dropdown above modals/overflow)
// put this where you define selectStyles
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
    backgroundColor: 'rgba(59,130,246,.15)',                // accent-primary @ 15%
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
    ':hover': { backgroundColor: 'rgba(239,68,68,.25)', color: '#fff' }, // error color
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
      ? 'rgba(59,130,246,.25)'  // selected
      : state.isFocused
      ? 'rgba(59,130,246,.12)'  // hover
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
  const refidOptions = useMemo(
    () => refids.map(r => ({ value: r, label: r })),
    [refids]
  );

  // Load initial data
  useEffect(() => {
    loadSymbols();
    loadRefids();
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load data when filters change
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const loadSymbols = async () => {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (!token) {
        console.log('No token found in loadSymbols');
        window.location.href = '/login';
        return;
      }
      const response = await axios.get('/api/symbols');
      setSymbols(response.data || []);
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('Token validation failed in loadSymbols');
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);
        window.location.href = '/login';
      } else {
        console.error('Failed to load symbols:', error);
      }
    }
  };

  const loadRefids = async () => {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (!token) {
        console.log('No token found in loadRefids');
        window.location.href = '/login';
        return;
      }
      const response = await axios.get('/api/refids');
      setRefids(response.data || []);
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('Token validation failed in loadRefids');
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);
        window.location.href = '/login';
      } else {
        console.error('Failed to load refids:', error);
      }
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
        } else if (value !== '' && value !== null && value !== undefined) {
          params.append(key, value);
        }
      });

      console.log('Authorization header:', axios.defaults.headers.common['Authorization']);
      const response = await axios.get(`/api/data?${params}`);
      console.log('Data response:', response.data);
      
      setData(response.data?.rows || []);
      setTotalRecords(response.data?.total || 0);
    } catch (error) {
      console.error('Load data error:', error.response || error);
      if (error.response?.status === 401) {
        console.log('Token validation failed in loadData');
        // Clear auth state and redirect
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);
        window.location.href = '/login';
      } else {
        setError(error.response?.data?.error || 'Failed to load data');
        setData([]);
        setTotalRecords(0);
      }
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

  // Handy handler for react-select multi selects
  const onMultiChange = (key) => (selected) => {
    handleFilterChange(key, (selected || []).map(o => o.value));
  };

  const handleBulkDelete = async (ids) => {
    if (!ids.length) return;
    if (!window.confirm(`Are you sure you want to delete ${ids.length} records?`)) return;

    try {
      await axios.delete('/api/data', { data: { ids } });
      loadData();
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to delete records');
    }
  };

  const handleInsert = async (formData) => {
    try {
      await axios.post('/api/data', formData);
      loadData();
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

              {/* Symbol Filter — searchable multi-select */}
              <div className="form-group">
                <label>Symbols</label>
                <Select
                  isMulti
                  isClearable
                  options={symbolOptions}
                  value={symbolOptions.filter(o => filters.symbolref.includes(o.value))}
                  onChange={onMultiChange('symbolref')}
                  placeholder="Select symbols…"
                  classNamePrefix="rs"
                  styles={selectStyles}
                  menuPortalTarget={document.body}
                />
              </div>

              {/* RefID Filter — searchable multi-select */}
              <div className="form-group">
                <label>Tickets</label>
                <Select
                  isMulti
                  isClearable
                  options={refidOptions}
                  value={refidOptions.filter(o => filters.refid.includes(o.value))}
                  onChange={onMultiChange('refid')}
                  placeholder="Select tickets…"
                  classNamePrefix="rs"
                  styles={selectStyles}
                  menuPortalTarget={document.body}
                />
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
