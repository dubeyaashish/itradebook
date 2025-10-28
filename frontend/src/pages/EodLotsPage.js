// frontend/src/pages/EodLotsPage.js
import React, { useState, useEffect, useCallback } from 'react';
import Select from 'react-select';
import axios from 'axios';
import { PageHeader } from '../components/PageHeader';
import { customSelectStyles } from '../components/SelectStyles';
import ModernPagination from '../components/ModernPagination';

// Configure axios
axios.defaults.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
axios.defaults.withCredentials = true;

const EodLotsPage = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSymbols, setSelectedSymbols] = useState([]);
  const [availableSymbols, setAvailableSymbols] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
    limit: 50
  });
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    page: 1
  });

  // Fetch available symbols
  const fetchSymbols = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/eod-lots/symbols', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailableSymbols(response.data);
    } catch (error) {
      console.error('Failed to fetch symbols:', error);
    }
  }, []);

  // Fetch EOD lots data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: filters.page,
        limit: pagination.limit
      });

      // Add filters
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      
      // Add selected symbols
      selectedSymbols.forEach(symbol => {
        params.append('symbol_ref', symbol.value);
      });

      const response = await axios.get(`/api/eod-lots?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setData(response.data.data || []);
        setPagination({
          page: response.data.pagination.current_page,
          totalPages: response.data.pagination.total_pages,
          total: response.data.pagination.total,
          limit: response.data.pagination.records_per_page
        });
      } else {
        setError('Failed to fetch EOD lots data');
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(error.response?.data?.error || 'Failed to fetch EOD lots data');
    } finally {
      setLoading(false);
    }
  }, [filters, selectedSymbols, pagination.limit]);

  // Export data as CSV
  const handleExport = async () => {
    try {
      setExporting(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();

      // Add filters
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      
      // Add selected symbols
      selectedSymbols.forEach(symbol => {
        params.append('symbol_ref', symbol.value);
      });

      const response = await axios.get(`/api/eod-lots/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      link.download = `eod_lots_${timestamp}.csv`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Export failed:', error);
      setError(error.response?.data?.error || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchSymbols();
  }, [fetchSymbols]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key === 'page' ? value : 1 // Reset to first page unless changing page
    }));
  };

  const handlePageChange = (newPage) => {
    handleFilterChange('page', newPage);
  };

  // Format number with commas and fixed decimals
  const formatNumber = (value, decimals = 8) => {
    const num = Number(value);
    if (isNaN(num)) return '0.00000000';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  // Format datetime
  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <PageHeader 
          title="EOD - Lots" 
          subtitle="End-of-day lots ratio data (latest snapshots)"
        />
        <div className="loading-container">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Loading EOD lots data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <PageHeader 
          title="EOD - Lots" 
          subtitle="End-of-day lots ratio data (latest snapshots)"
        />
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={fetchData} className="retry-button">Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader 
        title="EOD - Lots" 
        subtitle="End-of-day lots ratio data (latest snapshots)"
      />
      
      {/* Filter Section */}
      <div className="filter-container">
        <div className="filter-card">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div className="form-group">
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Start Date</label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="form-group">
              <label className="block text-sm font-medium text-gray-600 mb-1.5">End Date</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="form-group">
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Filter by Symbols</label>
              <Select
                isMulti
                value={selectedSymbols}
                onChange={setSelectedSymbols}
                options={availableSymbols}
                placeholder="Select symbols..."
                styles={customSelectStyles}
                isSearchable
                isClearable
                className="react-select-container"
                classNamePrefix="react-select"
                menuPortalTarget={document.body}
                menuPosition="fixed"
                menuPlacement="auto"
                noOptionsMessage={() => "No symbols available"}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-end justify-end gap-2">
            <button
              onClick={fetchData}
              className="auth-button flex items-center justify-center gap-2 px-4 py-2 min-h-[44px]"
            >
              <i className="fas fa-filter" />
              <span>Apply Filters</span>
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="auth-button flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              <i className={exporting ? "fas fa-spinner fa-spin" : "fas fa-download"} />
              <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
            </button>
            <button
              onClick={() => {
                setFilters({ start_date: '', end_date: '', page: 1 });
                setSelectedSymbols([]);
              }}
              className="auth-button flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-gray-600 hover:bg-gray-700"
            >
              <i className="fas fa-times" />
              <span>Clear Filters</span>
            </button>
          </div>
        </div>
      </div>

        {/* Data Table */}
        <div className="data-container">
          <div className="table-header">
            <h3>EOD Lots Data ({formatNumber(pagination.total, 0)} records)</h3>
            <p className="text-sm text-gray-600 mt-1">
              Shows latest ratio data (not accumulated - current snapshots only)
            </p>
          </div>        {data.length === 0 ? (
          <div className="no-data-message">
            No EOD lots data found for the selected filters.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Last Ratio</th>
                  <th>Last Market Diff</th>
                  <th>Last Float Diff</th>
                  <th>Used Second ID</th>
                  <th>Used Fifth ID</th>
                  <th>Updated At</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, index) => (
                  <tr key={`${row.symbol_ref}-${index}`}>
                    <td className="font-semibold text-blue-600">
                      {row.symbol_ref}
                    </td>
                    <td className="text-right font-mono">
                      <span className="text-purple-600 font-semibold">
                        {formatNumber(row.last_ratio)}
                      </span>
                    </td>
                    <td className="text-right font-mono">
                      <span className={row.last_mktdiff >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                        {formatNumber(row.last_mktdiff)}
                      </span>
                    </td>
                    <td className="text-right font-mono">
                      <span className={row.last_floatdiff >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                        {formatNumber(row.last_floatdiff)}
                      </span>
                    </td>
                    <td className="font-mono text-sm text-gray-600">
                      {row.used_second_id || 'N/A'}
                    </td>
                    <td className="font-mono text-sm text-gray-600">
                      {row.used_fifth_id || 'N/A'}
                    </td>
                    <td className="font-mono text-sm text-gray-600">
                      {formatDateTime(row.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <ModernPagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={handlePageChange}
            showPageInfo={true}
            totalRecords={pagination.total}
            recordsPerPage={pagination.limit}
          />
        )}

        {/* Summary Stats */}
        {data.length > 0 && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-semibold mb-3">Summary</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Total Records:</span>
                <span className="ml-2 font-semibold">{formatNumber(pagination.total, 0)}</span>
              </div>
              <div>
                <span className="text-gray-600">Avg Ratio:</span>
                <span className="ml-2 font-semibold text-purple-600">
                  {formatNumber(data.reduce((sum, row) => sum + (Number(row.last_ratio) || 0), 0) / data.length, 4)}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Avg Market Diff:</span>
                <span className="ml-2 font-semibold text-blue-600">
                  {formatNumber(data.reduce((sum, row) => sum + (Number(row.last_mktdiff) || 0), 0) / data.length, 4)}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Avg Float Diff:</span>
                <span className="ml-2 font-semibold text-indigo-600">
                  {formatNumber(data.reduce((sum, row) => sum + (Number(row.last_floatdiff) || 0), 0) / data.length, 4)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EodLotsPage;