import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Select from 'react-select';
import ModernPagination from '../components/ModernPagination';

// React Select custom styles
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
  multiValue: (base) => ({
    ...base,
    backgroundColor: 'var(--accent-light)',
    color: 'var(--accent-primary)',
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: 'var(--accent-primary)',
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: 'var(--accent-primary)',
    ':hover': {
      backgroundColor: 'var(--accent-primary)',
      color: 'white',
    },
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? 'var(--accent-primary)'
      : state.isFocused
      ? 'var(--accent-light)'
      : 'transparent',
    color: state.isSelected ? 'white' : 'var(--text-primary)',
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
  }),
};

const PLReportPage = () => {
  const [data, setData] = useState([]);
  const [totals, setTotals] = useState({});
  const [symbols, setSymbols] = useState([]);
  const [selectedSymbols, setSelectedSymbols] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({});
  const [cachedData, setCachedData] = useState({});

  // NEW: view toggles to improve readability
  const [compactView, setCompactView] = useState(false); // hides Balance/Equity/Floating columns

  const [filters, setFilters] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    symbol_ref: [],
    page: 1
  });

  const monthNames = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  useEffect(() => {
    loadSymbols();
    loadYears();
    loadPLData();
  }, []);

  // Clean up old cache entries
  const cleanupCache = () => {
    const now = Date.now();
    const newCache = {};
    Object.entries(cachedData).forEach(([key, value]) => {
      if (now - value.timestamp < 5 * 60 * 1000) {
        newCache[key] = value;
      }
    });
    setCachedData(newCache);
  };

  // Preload next page
  const preloadNextPage = async () => {
    if (pagination.current_page < pagination.total_pages) {
      const nextPage = filters.page + 1;
      const params = new URLSearchParams();
      params.append('action', 'get_trading_data');
      params.append('year', filters.year);
      params.append('month', filters.month);
      params.append('page', nextPage);
      if (selectedSymbols.length > 0) params.append('symbol_ref', selectedSymbols.join(','));

      try {
        const response = await axios.get(`/api/get_trading_data?${params}`);
        if (response.data.success) {
          const cacheKey = `pl_data_${filters.year}_${filters.month}_${selectedSymbols.sort().join(',')}_${nextPage}`;
          setCachedData(prev => ({
            ...prev,
            [cacheKey]: {
              data: response.data.data,
              totals: response.data.totals,
              pagination: response.data.pagination,
              timestamp: Date.now()
            }
          }));
        }
      } catch (error) {
        console.error('Failed to preload next page:', error);
      }
    }
  };

  useEffect(() => {
    loadPLData();
    const cleanup = setInterval(cleanupCache, 60 * 1000);
    return () => clearInterval(cleanup);
  }, [filters]);

  useEffect(() => {
    if (!loading && data.length > 0) preloadNextPage();
  }, [loading, data, filters.page]);

  const loadSymbols = async () => {
    try {
      const response = await axios.get('/api/get_symbols?action=get_symbols');
      setSymbols(response.data.symbols || []);
    } catch (error) {
      console.error('Failed to load symbols:', error);
    }
  };

  const loadYears = async () => {
    try {
      const response = await axios.get('/api/get_years?action=get_years');
      const years = response.data.years || [];
      if (!years.includes(filters.year)) {
        setFilters(prev => ({ ...prev, year: years[0] || new Date().getFullYear() }));
      }
    } catch (error) {
      console.error('Failed to load years:', error);
    }
  };

  const loadPLData = async () => {
    setLoading(true);
    setError('');
    try {
      const cacheKey = `pl_data_${filters.year}_${filters.month}_${selectedSymbols.sort().join(',')}_${filters.page}`;
      const cachedResult = cachedData[cacheKey];
      if (cachedResult && (Date.now() - cachedResult.timestamp) < 5 * 60 * 1000) {
        setData(cachedResult.data);
        setTotals(cachedResult.totals);
        setPagination(cachedResult.pagination);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      params.append('action', 'get_trading_data');
      params.append('year', filters.year);
      params.append('month', filters.month);
      params.append('page', filters.page);
      if (selectedSymbols.length > 0) params.append('symbol_ref', selectedSymbols.join(','));

      const response = await axios.get(`/api/get_trading_data?${params}`);
      if (response.data.success) {
        const newData = {
          data: response.data.data,
          totals: response.data.totals,
          pagination: response.data.pagination,
          timestamp: Date.now()
        };
        setCachedData(prev => ({ ...prev, [cacheKey]: newData }));
        setData(newData.data);
        setTotals(newData.totals);
        setPagination(newData.pagination);
      } else {
        setError(response.data.error || 'Failed to load P&L data');
        setData([]);
        setTotals({});
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to load P&L data');
      setData([]);
      setTotals({});
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: key !== 'page' ? 1 : value }));
  };

  const handleSymbolSelection = (options) => {
    setSelectedSymbols(options ? options.map(opt => opt.value) : []);
  };

  const formatNumber = (value, decimals = 4) => {
    const num = Number(value);
    if (isNaN(num)) return '0.0000';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const getProfitClass = (value) => {
    const num = Number(value);
    if (num > 0) return 'text-green-600 font-semibold';
    if (num < 0) return 'text-red-600 font-semibold';
    return 'text-gray-700';
  };

  const getBalanceClass = (value) => {
    const num = Number(value);
    if (num > 0) return 'text-blue-600 font-semibold';
    if (num < 0) return 'text-orange-600 font-semibold';
    return 'text-gray-700';
  };

  const exportToCSV = async () => {
    try {
      setLoading(true);
      
      // Build query parameters based on current filters
      const params = new URLSearchParams();
      
      if (filters.year) params.append('year', filters.year);
      if (filters.month) params.append('month', filters.month);
      
      // Add selected symbols
      if (selectedSymbols && selectedSymbols.length > 0) {
        selectedSymbols.forEach(symbol => params.append('symbols', symbol));
      }

      // Call the CSV export endpoint
      const response = await axios.get(`/api/plreport/export-csv?${params.toString()}`, {
        responseType: 'blob'
      });

      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const monthName = monthNames[filters.month];
      const symbolText = selectedSymbols.length > 0 ? `_${selectedSymbols[0]}` : '_all';
      link.download = `PL_Report_${monthName}${filters.year}${symbolText}.csv`;
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

  // Handle deposit/withdrawal updates (when user finishes editing)
  const handleDepositWithdrawalUpdate = async (tradeDate, symbolRef, type, value) => {
    try {
      const amount = parseFloat(value) || 0;
      
      console.log(`Updating ${type} for ${tradeDate} ${symbolRef}: ${amount}`);
      
      // Get current row data to preserve the other value
      const currentRow = data.find(row => row.trade_date === tradeDate && row.symbol_ref === symbolRef);
      if (!currentRow) {
        console.error('Row not found');
        return;
      }
      
      const updateData = {
        trade_date: tradeDate,
        symbol_ref: symbolRef,
        deposit: type === 'deposit' ? amount : (currentRow.company_deposit || 0),
        withdrawal: type === 'withdrawal' ? amount : (currentRow.company_withdrawal || 0)
      };
      
      const response = await axios.post('/api/plreport/update_deposit_withdrawal', updateData);

      console.log(`✅ ${type} updated successfully:`, response.data);
      
      // Update only the specific row instead of reloading entire table
      updateRowInPlace(tradeDate, symbolRef, updateData.deposit, updateData.withdrawal);
      
    } catch (error) {
      console.error(`Error updating ${type}:`, error);
      const errorMsg = error.response?.data?.error || error.message;
      alert(`Failed to update ${type}: ${errorMsg}`);
    }
  };

  // Update a specific row in the table without full reload
  const updateRowInPlace = (tradeDate, symbolRef, newDeposit, newWithdrawal) => {
    setData(prevData => {
      return prevData.map(row => {
        if (row.trade_date === tradeDate && row.symbol_ref === symbolRef) {
          // Company PLN calculation
          const yesterdayEquity = getYesterdayEquity(row.symbol_ref, tradeDate);
          const rawCompanyPln = (row.company_equity || 0) - yesterdayEquity;
          const adjustedCompanyPln = rawCompanyPln - newDeposit + newWithdrawal;

          // Exp PLN calculation using Floating
          const yesterdayFloating = getYesterdayFloating(row.symbol_ref, tradeDate);
          const rawExpPln = (row.exp_floating || 0) - yesterdayFloating;

          return {
            ...row,
            company_deposit: newDeposit,
            company_withdrawal: newWithdrawal,
            company_pln: Math.round(adjustedCompanyPln * 100) / 100,
            exp_pln: Math.round(rawExpPln * 100) / 100
          };
        }
        return row;
      });
    });
    // Update totals as well
    updateTotalsInPlace();
  };

  // Helper function to get yesterday's equity for PLN calculation
  const getYesterdayEquity = (symbolRef, tradeDate) => {
    const yesterday = new Date(tradeDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // Find yesterday's equity in current data
    const yesterdayRow = data.find(row => 
      row.trade_date === yesterdayStr && row.symbol_ref === symbolRef
    );
    
    return yesterdayRow ? (parseFloat(yesterdayRow.company_equity) || 0) : 0;
  };

  // Helper function to get yesterday's floating for Exp PLN calculation
  const getYesterdayFloating = (symbolRef, tradeDate) => {
    const yesterday = new Date(tradeDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // Find yesterday's floating in current data
    const yesterdayRow = data.find(row => 
      row.trade_date === yesterdayStr && row.symbol_ref === symbolRef
    );
    
    return yesterdayRow ? (parseFloat(yesterdayRow.exp_floating) || 0) : 0;
  };

  // Update totals without full reload
  const updateTotalsInPlace = () => {
    if (data.length === 0) return;
    
    const newTotals = data.reduce((acc, row) => {
      acc.company_deposit_total = (acc.company_deposit_total || 0) + (parseFloat(row.company_deposit) || 0);
      acc.company_withdrawal_total = (acc.company_withdrawal_total || 0) + (parseFloat(row.company_withdrawal) || 0);
      acc.company_pln_total = (acc.company_pln_total || 0) + (parseFloat(row.company_pln) || 0);
      acc.exp_pln_total = (acc.exp_pln_total || 0) + (parseFloat(row.exp_pln) || 0);
      return acc;
    }, {});
    
    // Round totals
    Object.keys(newTotals).forEach(key => {
      newTotals[key] = Math.round((newTotals[key] || 0) * 100) / 100;
    });
    
    setTotals(prevTotals => ({
      ...prevTotals,
      ...newTotals
    }));
  };

  // Helpers for conditional columns
  const showBEF = !compactView; // Balance / Equity / Floating

  return (
    <div className="pl-report-page bg-gray-100 min-h-screen pb-5 px-4 sm:px-6 lg:px-8">
      {/* Filters Section */}
      <div className="data-container mb-4">
        <div className="p-4">
          <h2 className="text-xl font-semibold mb-4">Filters & Search</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div className="form-group">
              <label>Year</label>
              <Select
                value={{ value: filters.year, label: filters.year }}
                onChange={(option) => handleFilterChange('year', option.value)}
                options={Array.from({ length: 5 }, (_, i) => {
                  const year = new Date().getFullYear() - 2 + i;
                  return { value: year, label: year };
                })}
                styles={selectStyles}
                isSearchable={false}
                menuPortalTarget={document.body}
                menuPosition="fixed"
              />
            </div>

            <div className="form-group">
              <label>Month</label>
              <Select
                value={{ value: filters.month, label: monthNames[filters.month] }}
                onChange={(option) => handleFilterChange('month', option.value)}
                options={monthNames.slice(1).map((month, index) => ({ value: index + 1, label: month }))}
                styles={selectStyles}
                isSearchable={false}
                menuPortalTarget={document.body}
                menuPosition="fixed"
              />
            </div>

            <div className="form-group">
              <label>Symbols</label>
              <Select
                isMulti
                value={selectedSymbols.map(symbol => ({ value: symbol, label: symbol }))}
                onChange={handleSymbolSelection}
                options={symbols.map(symbol => ({ value: symbol, label: symbol }))}
                placeholder="Select symbols..."
                noOptionsMessage={() => 'No symbols found'}
                styles={selectStyles}
                className="react-select-container"
                classNamePrefix="react-select"
                isClearable
                menuPortalTarget={document.body}
                menuPosition="fixed"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-3 justify-end">
            <button
              onClick={loadPLData}
              disabled={loading}
              className="auth-button flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <i className="fas fa-search text-sm"></i>
                  <span>Apply Filters</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-100 rounded-md p-3 flex items-center justify-between">
          <span className="text-sm text-red-600">{error}</span>
          <button onClick={() => setError('')} className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors duration-200">
            Dismiss
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="pl-table-container">
          <div className="pl-table-loading">
            <div className="inline-block animate-spin rounded-full h-7 w-7 border-3 border-gray-200 border-t-indigo-600 mb-3"></div>
            <p className="text-sm text-gray-500">Loading P&L data...</p>
          </div>
        </div>
      )}

      {/* Main Table */}
      {!loading && (
        <div className="pl-table-container bg-gray-50">
          <div className="pl-table-header bg-gray-100">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  P&L Report - {monthNames[filters.month]} {filters.year}
                  {selectedSymbols.length > 0 && ` (${selectedSymbols[0]})`}
                </h3>
                <span className="text-sm text-gray-500">
                  {pagination.total_records || 0} records found
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCompactView(v => !v)}
                  className="px-3 py-1.5 text-sm rounded border border-gray-200 hover:bg-gray-50 transition-colors duration-200"
                >
                  {compactView ? 'Show All Columns' : 'Compact View'}
                </button>
                <button
                  onClick={exportToCSV}
                  className="auth-button-secondary"
                >
                  <i className="fas fa-download mr-2"></i>Export CSV
                </button>
              </div>
            </div>
          </div>

          {data.length === 0 ? (
            <div className="pl-table-empty">
              <i className="fas fa-clipboard-list text-gray-300 text-4xl mb-3"></i>
              <h3 className="text-base font-medium text-gray-900 mb-1">No P&L Data Found</h3>
              <p className="text-sm text-gray-500">Try adjusting your filters to see more results</p>
            </div>
          ) : (
            <div className="pl-table-wrapper">
              <table className="pl-table">
                <thead className="sticky top-0 z-30">
                  <tr>
                    <th className="sticky-left bg-gray-100 z-40">Date</th>
                    <th className="sticky-left bg-gray-100 left-[120px] z-40">Symbol</th>
                    <th className="text-right bg-gray-100">Market Price</th>
                    
                    <th colSpan={showBEF ? 7 : 4} className="text-center bg-blue-100/70 border-x border-gray-200">
                      Company Data
                    </th>
                    <th colSpan={showBEF ? 5 : 2} className="text-center bg-yellow-100/70 border-x border-gray-200">
                      Exp Data
                    </th>
                    
                    <th className="text-right bg-gray-100">Accn. Pf</th>
                    <th className="text-right bg-gray-100">Daily Total</th>
                  </tr>
                  
                  {/* Column header row */}
                  <tr className="bg-gray-100 z-20">
                    <th className="sticky-left bg-gray-100 z-40"></th>
                    <th className="sticky-left bg-gray-100 left-[120px] z-40"></th>
                    <th className="text-right bg-gray-100"></th>

                    {/* Company */}
                    {showBEF && (
                      <>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-blue-100/70 border-x border-b border-gray-200">Balance</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-blue-100/70 border-b border-gray-200">Equity</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-blue-100/70 border-b border-gray-200">Floating</th>
                      </>
                    )}
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-blue-100/70 border-x border-b border-gray-200">PLN</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-blue-100/70 border-x border-b border-gray-200">Deposit</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-blue-100/70 border-x border-b border-gray-200">Withdrawal</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-blue-100/70 border-x border-b border-gray-200">Total</th>

                    {/* Exp */}
                    {showBEF && (
                      <>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-yellow-100/70 border-x border-b border-gray-200">Balance</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-yellow-100/70 border-b border-gray-200">Equity</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-yellow-100/70 border-b border-gray-200">Floating</th>
                      </>
                    )}
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-yellow-100/70 border-b border-gray-200">PLN</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-yellow-100/70 border-x border-b border-gray-200">Total</th>
                  </tr>
                </thead>
                
                <tbody>
                  {data.map((row, index) => (
                    <tr key={index}>
                      {/* sticky left columns */}
                      <td className="px-4 py-2 whitespace-nowrap text-sm font-medium sticky-left left-0">{formatDate(row.trade_date)}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm font-medium sticky-left left-36">{row.symbol_ref || 'N/A'}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-mono tabular-nums">{formatNumber(row.latest_mktprice, 5)}</td>

                      {/* Company Data */}
                      {showBEF && (
                        <>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-50 border-l ${getBalanceClass(row.company_balance)}`}>{formatNumber(row.company_balance)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-50 ${getBalanceClass(row.company_equity)}`}>{formatNumber(row.company_equity)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-50 ${getBalanceClass(row.company_floating)}`}>{formatNumber(row.company_floating)}</td>
                        </>
                      )}
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-50 ${showBEF ? '' : 'border-l'} ${getProfitClass(row.company_pln)}`}>{formatNumber(row.company_pln)}</td>
                      <td className="px-1 py-1 whitespace-nowrap text-xs bg-blue-50 border-l">
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={row.company_deposit || 0}
                          onBlur={(e) => {
                            // Only update if value actually changed
                            const newValue = parseFloat(e.target.value) || 0;
                            const oldValue = parseFloat(row.company_deposit) || 0;
                            if (newValue !== oldValue) {
                              handleDepositWithdrawalUpdate(row.trade_date, row.symbol_ref, 'deposit', e.target.value);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.target.blur();
                            }
                          }}
                          className="w-full px-1 py-1 text-xs text-right border rounded focus:outline-none focus:border-blue-500"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-1 py-1 whitespace-nowrap text-xs bg-blue-50 border-l">
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={row.company_withdrawal || 0}
                          onBlur={(e) => {
                            // Only update if value actually changed
                            const newValue = parseFloat(e.target.value) || 0;
                            const oldValue = parseFloat(row.company_withdrawal) || 0;
                            if (newValue !== oldValue) {
                              handleDepositWithdrawalUpdate(row.trade_date, row.symbol_ref, 'withdrawal', e.target.value);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.target.blur();
                            }
                          }}
                          className="w-full px-1 py-1 text-xs text-right border rounded focus:outline-none focus:border-blue-500"
                          placeholder="0.00"
                        />
                      </td>
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-50 border-r font-bold ${getProfitClass(row.daily_company_total)}`}>{formatNumber(row.daily_company_total)}</td>

                      {/* Exp Data */}
                      {showBEF && (
                        <>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-50 border-l ${getBalanceClass(row.exp_balance)}`}>{formatNumber(row.exp_balance)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-50 ${getBalanceClass(row.exp_equity)}`}>{formatNumber(row.exp_equity)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-50 ${getBalanceClass(row.exp_floating)}`}>{formatNumber(row.exp_floating)}</td>
                        </>
                      )}
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-50 ${showBEF ? '' : 'border-l'} ${getProfitClass(row.exp_pln)}`}>{formatNumber(row.exp_pln)}</td>
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-50 border-r font-bold ${getProfitClass(row.daily_exp_total)}`}>{formatNumber(row.daily_exp_total)}</td>

                      {/* Account Profit & Grand Total */}
                      <td className={`px-4 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums font-bold ${getProfitClass(row.accn_pf)} ${index % 2 === 0 ? 'bg-gray-50' : 'bg-gray-100'}`}>{formatNumber(row.accn_pf)}</td>
                      <td className={`px-4 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums font-bold ${getProfitClass(row.daily_grand_total)} ${index % 2 === 0 ? 'bg-gray-50' : 'bg-gray-100'}`}>{formatNumber(row.daily_grand_total)}</td>
                    </tr>
                  ))}
                </tbody>
                
                {/* Totals Footer */}
                {totals && (
                  <tfoot>
                    <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                      <td colSpan={3} className="px-4 py-3 text-sm text-gray-900 text-center sticky left-0 z-10 bg-gray-100 border-r border-gray-200">TOTAL</td>

                      {/* Company Totals */}
                      {showBEF && (
                        <>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-100/50 border-l ${getBalanceClass(totals.company_balance_total)}`}>{formatNumber(totals.company_balance_total)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-100/50 ${getBalanceClass(totals.company_equity_total)}`}>{formatNumber(totals.company_equity_total)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-100/50 ${getBalanceClass(totals.company_floating_total)}`}>{formatNumber(totals.company_floating_total)}</td>
                        </>
                      )}
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-100/50 ${showBEF ? '' : 'border-l'} ${getProfitClass(totals.company_pln_total)}`}>{formatNumber(totals.company_pln_total)}</td>
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-100/50 border-l ${getProfitClass(totals.company_deposit_total || 0)}`}>{formatNumber(totals.company_deposit_total || 0)}</td>
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-100/50 border-l ${getProfitClass(totals.company_withdrawal_total || 0)}`}>{formatNumber(totals.company_withdrawal_total || 0)}</td>
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-100/50 border-r ${getProfitClass(totals.company_pln_total || 0)}`}>{formatNumber(totals.company_pln_total || 0)}</td>

                      {/* Exp Totals */}
                      {showBEF && (
                        <>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-100/50 border-l ${getBalanceClass(totals.exp_balance_total)}`}>{formatNumber(totals.exp_balance_total)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-100/50 ${getBalanceClass(totals.exp_equity_total)}`}>{formatNumber(totals.exp_equity_total)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-100/50 ${getBalanceClass(totals.exp_floating_total)}`}>{formatNumber(totals.exp_floating_total)}</td>
                        </>
                      )}
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-100/50 ${showBEF ? '' : 'border-l'} ${getProfitClass(totals.exp_pln_total)}`}>{formatNumber(totals.exp_pln_total)}</td>
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-100/50 border-r ${getProfitClass(totals.exp_pln_total || 0)}`}>{formatNumber(totals.exp_pln_total || 0)}</td>

                      {/* Grand Totals */}
                      <td className={`px-4 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums font-bold ${getProfitClass(totals.accn_pf_total)}`}>{formatNumber(totals.accn_pf_total)}</td>
                      <td className={`px-4 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums font-bold ${getProfitClass(((totals.company_realized_total || 0) + (totals.company_unrealized_total || 0)) - ((totals.exp_realized_total || 0) + (totals.exp_unrealized_total || 0)))}`}>{formatNumber(((totals.company_realized_total || 0) + (totals.company_unrealized_total || 0)) - ((totals.exp_realized_total || 0) + (totals.exp_unrealized_total || 0)))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* Modern Pagination */}
          <ModernPagination
            currentPage={pagination.current_page || 1}
            totalPages={pagination.total_pages || 1}
            totalRecords={pagination.total_records || 0}
            recordsPerPage={pagination.records_per_page || 50}
            onPageChange={(page) => handleFilterChange('page', page)}
            showRecordsInfo={true}
            showFirstLast={true}
          />
        </div>
      )}
    </div>
  );
};

export default PLReportPage;
