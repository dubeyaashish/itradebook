import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, axiosInstance, STORAGE_KEYS } from '../App';
import { safeConsole } from '../utils/secureLogging';
import TradingTable from '../components/TradingTable';
import ModernPagination from '../components/ModernPagination';
import axios from 'axios';
import Select from 'react-select';
import '../styles/modal.css';

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

  // 2025 filter state (only for regular users)
  const [show2025Only, setShow2025Only] = useState(false);

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
  }, [filters, show2025Only]);

  const loadSymbols = async () => {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (!token) {
        window.location.href = '/login';
        return;
      }
      const response = await axios.get('/api/symbols');
      setSymbols(response.data || []);
    } catch (error) {
      if (error.response?.status === 401) {
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
        window.location.href = '/login';
        return;
      }
      const response = await axios.get('/api/refids');
      setRefids(response.data || []);
    } catch (error) {
      if (error.response?.status === 401) {
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

      // Add 2025 filter for regular users only
      if (show2025Only && user?.user_type === 'regular') {
        params.append('refid_starts_with', '2025');
      }

      const response = await axios.get(`/api/data?${params}`);
      
      setData(response.data?.rows || []);
      setTotalRecords(response.data?.total || 0);
    } catch (error) {
      if (error.response?.status === 401) {
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
      const token = localStorage.getItem('token');
      await axios.post('/api/data/delete', { 
        ids: ids
      }, { 
        headers: { Authorization: `Bearer ${token}` }
      });
      loadData();
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to delete records');
    }
  };

  const handleInsert = async (formData) => {
    try {
      const token = localStorage.getItem('token');
      
      // Transform the data to match receive.itradebook table structure
      const transformedData = {
        refid: formData.refid || null,
        buysize: parseFloat(formData.buysize) || 0,
        buyprice: parseFloat(formData.buyprice) || 0,
        sellsize: parseFloat(formData.sellsize) || 0,
        sellprice: parseFloat(formData.sellprice) || 0,
        symbolref: formData.symbolref,
        type: formData.type
      };

      await axios.post('/api/data/', transformedData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      loadData();
      return { success: true };
    } catch (error) {
      console.error('Insert error:', error);
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to insert record' 
      };
    }
  };

  const exportToCSV = async () => {
    try {
      setLoading(true);
      
      // Build query parameters based on current filters
      const params = new URLSearchParams();
      
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.start_time) params.append('start_time', filters.start_time);
      if (filters.end_time) params.append('end_time', filters.end_time);
      
      // Add symbol filters
      if (filters.symbolref && filters.symbolref.length > 0) {
        filters.symbolref.forEach(symbol => params.append('symbolref', symbol));
      }
      
      // Add refid filters
      if (filters.refid && filters.refid.length > 0) {
        filters.refid.forEach(refid => params.append('refid', refid));
      }
      
      // Add 2025 filter if active (only for regular users)
      if (show2025Only && user?.user_type === 'regular') {
        params.append('refid_starts_with', '2025');
      }

      // Call the CSV export endpoint
      const response = await axiosInstance.get(`/api/report/export-csv?${params.toString()}`, {
        responseType: 'blob'
      });

      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report_data_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('CSV export error:', error);
      setError('Failed to export CSV. Please try again.');
    } finally {
      setLoading(false);
    }
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

              {/* 2025 Filter for Regular Users */}
              {user?.user_type === 'regular' && (
                <div className="form-group">
                  <label>Order Filter</label>
                  <button 
                    onClick={() => setShow2025Only(!show2025Only)} 
                    className={`w-full auth-button ${show2025Only ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    {show2025Only ? '✓ 2025 Orders Only' : 'Show 2025 Orders'}
                  </button>
                </div>
              )}
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

        {/* Modern Pagination */}
        <ModernPagination
          currentPage={filters.page}
          totalPages={totalPages}
          totalRecords={totalRecords}
          recordsPerPage={filters.limit}
          onPageChange={(page) => handleFilterChange('page', page)}
          showRecordsInfo={true}
          showFirstLast={true}
        />
      </main>
    </div>
  );
};

export default ReportPage;
