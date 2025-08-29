import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Select from 'react-select';

// React Select custom styles
const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: '38px',
    background: '#fff',
    borderColor: state.isFocused ? '#4F46E5' : '#D1D5DB',
    boxShadow: state.isFocused ? '0 0 0 1px #4F46E5' : 'none',
    '&:hover': { borderColor: '#4F46E5' }
  }),
  option: (base, state) => ({
    ...base,
    padding: '6px 12px',
    cursor: 'pointer',
    backgroundColor: state.isSelected ? '#4F46E5' : state.isFocused ? '#EEF2FF' : 'transparent',
    color: state.isSelected ? 'white' : '#1F2937',
    fontSize: '0.875rem',
    '&:active': { backgroundColor: '#4338CA' }
  }),
  menu: base => ({
    ...base,
    borderRadius: '0.375rem',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
  }),
  menuList: base => ({ ...base, padding: '4px' }),
  singleValue: base => ({ ...base, fontSize: '0.875rem' }),
  multiValue: base => ({ ...base, backgroundColor: '#EEF2FF', color: '#4338CA' }),
  multiValueLabel: base => ({ ...base, color: '#4338CA', fontWeight: 500, fontSize: '0.875rem' }),
  multiValueRemove: base => ({
    ...base,
    color: '#4338CA',
    ':hover': { backgroundColor: '#E0E7FF', color: '#4338CA' }
  })
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

  const formatNumber = (value, decimals = 2) => {
    const num = Number(value);
    if (isNaN(num)) return '0.00';
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

  const exportToCSV = () => {
    if (!data.length) { alert('No data to export'); return; }

    const headers = [
      'Date', 'Symbol', 'Market Price',
      'Company Realized P&L', 'Company Unrealized P&L', 'Company Balance', 'Company Equity', 'Company Floating', 'Company Total',
      'Exp Realized P&L', 'Exp Unrealized P&L', 'Exp Balance', 'Exp Equity', 'Exp Floating', 'Exp PLN', 'Exp Total',
      'Account Profit', 'Daily Grand Total'
    ];

    const csvData = [headers];
    data.forEach(row => {
      csvData.push([
        formatDate(row.trade_date),
        row.symbol_ref || 'N/A',
        formatNumber(row.latest_mktprice, 5),
        formatNumber(row.company_realized),
        formatNumber(row.company_unrealized),
        formatNumber(row.company_balance),
        formatNumber(row.company_equity),
        formatNumber(row.company_floating),
        formatNumber(row.daily_company_total),
        formatNumber(row.exp_realized),
        formatNumber(row.exp_unrealized),
        formatNumber(row.exp_balance),
        formatNumber(row.exp_equity),
        formatNumber(row.exp_floating),
        formatNumber(row.exp_pln),
        formatNumber(row.daily_exp_total),
        formatNumber(row.accn_pf),
        formatNumber(row.daily_grand_total)
      ]);
    });

    if (totals) {
      const companyTotal = (totals.company_realized_total || 0) + (totals.company_unrealized_total || 0);
      const expTotal = (totals.exp_realized_total || 0) + (totals.exp_unrealized_total || 0);
      const grandTotal = companyTotal - expTotal;

      csvData.push([
        'TOTAL', '', '',
        formatNumber(totals.company_realized_total),
        formatNumber(totals.company_unrealized_total),
        formatNumber(totals.company_balance_total),
        formatNumber(totals.company_equity_total),
        formatNumber(totals.company_floating_total),
        formatNumber(companyTotal),
        formatNumber(totals.exp_realized_total),
        formatNumber(totals.exp_unrealized_total),
        formatNumber(totals.exp_balance_total),
        formatNumber(totals.exp_equity_total),
        formatNumber(totals.exp_floating_total),
        formatNumber(totals.exp_pln_total),
        formatNumber(expTotal),
        formatNumber(totals.accn_pf_total),
        formatNumber(grandTotal)
      ]);
    }

    const csvString = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const monthName = monthNames[filters.month];
    const symbolText = selectedSymbols.length > 0 ? `_${selectedSymbols[0]}` : '_all';
    link.download = `PL_Report_${monthName}${filters.year}${symbolText}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Helpers for conditional columns
  const showBEF = !compactView; // Balance / Equity / Floating

  return (
    <div className="pl-report-page bg-gray-100 min-h-screen py-5 px-4 sm:px-6 lg:px-8">
      {/* Filters Section */}
      <div className="pl-table-container mb-6 bg-gray-50">
        <div className="pl-table-header border-b border-gray-200 bg-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Filters & Search</h2>
        </div>
        
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="form-group">
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Year</label>
              <Select
                value={{ value: filters.year, label: filters.year }}
                onChange={(option) => handleFilterChange('year', option.value)}
                options={Array.from({ length: 5 }, (_, i) => {
                  const year = new Date().getFullYear() - 2 + i;
                  return { value: year, label: year };
                })}
                styles={selectStyles}
                isSearchable={false}
              />
            </div>

            <div className="form-group">
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Month</label>
              <Select
                value={{ value: filters.month, label: monthNames[filters.month] }}
                onChange={(option) => handleFilterChange('month', option.value)}
                options={monthNames.slice(1).map((month, index) => ({ value: index + 1, label: month }))}
                styles={selectStyles}
                isSearchable={false}
              />
            </div>

            <div className="form-group">
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Symbols</label>
              <Select
                isMulti
                value={selectedSymbols.map(symbol => ({ value: symbol, label: symbol }))}
                onChange={handleSymbolSelection}
                options={symbols.map(symbol => ({ value: symbol, label: symbol }))}
                placeholder="Select symbols..."
                noOptionsMessage={() => 'No symbols found'}
                styles={{
                  ...selectStyles,
                  multiValue: (base) => ({ ...base, backgroundColor: '#DCFCE7', color: '#065F46' }),
                  multiValueLabel: (base) => ({ ...base, color: '#065F46', fontWeight: 500 }),
                  multiValueRemove: (base) => ({ ...base, color: '#065F46', ':hover': { backgroundColor: '#A7F3D0', color: '#065F46' } })
                }}
                className="react-select-container"
                isClearable
              />
            </div>

            <div className="form-group flex items-end">
              <button
                onClick={loadPLData}
                className="w-full px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-sm font-semibold rounded-md shadow-sm hover:from-indigo-700 hover:to-indigo-800 hover:shadow-md transform hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 active:translate-y-0 active:shadow-none flex items-center justify-center gap-2"
              >
                <i className="fas fa-filter text-lg" />
                <span>Apply Filters</span>
              </button>
            </div>
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
                  className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 transition-colors duration-200 flex items-center"
                >
                  <i className="fas fa-download mr-1.5"></i>Export CSV
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
                    
                    <th colSpan={showBEF ? 6 : 3} className="text-center bg-blue-100/70 border-x border-gray-200">
                      Company Data
                    </th>
                    <th colSpan={showBEF ? 7 : 4} className="text-center bg-yellow-100/70 border-x border-gray-200">
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
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-blue-100/70 border-x border-b border-gray-200">Realized P&L</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-blue-100/70 border-b border-gray-200">Unrealized P&L</th>
                    {showBEF && (
                      <>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-blue-100/70 border-b border-gray-200">Balance</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-blue-100/70 border-b border-gray-200">Equity</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-blue-100/70 border-b border-gray-200">Floating</th>
                      </>
                    )}
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-blue-100/70 border-x border-b border-gray-200">Total</th>

                    {/* Exp */}
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-yellow-100/70 border-x border-b border-gray-200">Realized P&L</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-yellow-100/70 border-b border-gray-200">Unrealized P&L</th>
                    {showBEF && (
                      <>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase tracking-wider bg-yellow-100/70 border-b border-gray-200">Balance</th>
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
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-50 border-l ${getProfitClass(row.company_realized)}`}>{formatNumber(row.company_realized)}</td>
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-50 ${getProfitClass(row.company_unrealized)}`}>{formatNumber(row.company_unrealized)}</td>
                      {showBEF && (
                        <>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-50 ${getBalanceClass(row.company_balance)}`}>{formatNumber(row.company_balance)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-50 ${getBalanceClass(row.company_equity)}`}>{formatNumber(row.company_equity)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-50 ${getBalanceClass(row.company_floating)}`}>{formatNumber(row.company_floating)}</td>
                        </>
                      )}
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-50 border-r font-bold ${getProfitClass(row.daily_company_total)}`}>{formatNumber(row.daily_company_total)}</td>

                      {/* Exp Data */}
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-50 border-l ${getProfitClass(row.exp_realized)}`}>{formatNumber(row.exp_realized)}</td>
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-50 ${getProfitClass(row.exp_unrealized)}`}>{formatNumber(row.exp_unrealized)}</td>
                      {showBEF && (
                        <>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-50 ${getBalanceClass(row.exp_balance)}`}>{formatNumber(row.exp_balance)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-50 ${getBalanceClass(row.exp_equity)}`}>{formatNumber(row.exp_equity)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-50 ${getBalanceClass(row.exp_floating)}`}>{formatNumber(row.exp_floating)}</td>
                        </>
                      )}
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-50 ${getProfitClass(row.exp_pln)}`}>{formatNumber(row.exp_pln)}</td>
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
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-100/50 border-l ${getProfitClass(totals.company_realized_total)}`}>{formatNumber(totals.company_realized_total)}</td>
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-100/50 ${getProfitClass(totals.company_unrealized_total)}`}>{formatNumber(totals.company_unrealized_total)}</td>
                      {showBEF && (
                        <>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-100/50 ${getBalanceClass(totals.company_balance_total)}`}>{formatNumber(totals.company_balance_total)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-100/50 ${getBalanceClass(totals.company_equity_total)}`}>{formatNumber(totals.company_equity_total)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-100/50 ${getBalanceClass(totals.company_floating_total)}`}>{formatNumber(totals.company_floating_total)}</td>
                        </>
                      )}
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-blue-100/50 border-r ${getProfitClass((totals.company_realized_total || 0) + (totals.company_unrealized_total || 0))}`}>{formatNumber((totals.company_realized_total || 0) + (totals.company_unrealized_total || 0))}</td>

                      {/* Exp Totals */}
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-100/50 border-l ${getProfitClass(totals.exp_realized_total)}`}>{formatNumber(totals.exp_realized_total)}</td>
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-100/50 ${getProfitClass(totals.exp_unrealized_total)}`}>{formatNumber(totals.exp_unrealized_total)}</td>
                      {showBEF && (
                        <>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-100/50 ${getBalanceClass(totals.exp_balance_total)}`}>{formatNumber(totals.exp_balance_total)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-100/50 ${getBalanceClass(totals.exp_equity_total)}`}>{formatNumber(totals.exp_equity_total)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-100/50 ${getBalanceClass(totals.exp_floating_total)}`}>{formatNumber(totals.exp_floating_total)}</td>
                        </>
                      )}
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-100/50 ${getProfitClass(totals.exp_pln_total)}`}>{formatNumber(totals.exp_pln_total)}</td>
                      <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums bg-yellow-100/50 border-r ${getProfitClass((totals.exp_realized_total || 0) + (totals.exp_unrealized_total || 0))}`}>{formatNumber((totals.exp_realized_total || 0) + (totals.exp_unrealized_total || 0))}</td>

                      {/* Grand Totals */}
                      <td className={`px-4 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums font-bold ${getProfitClass(totals.accn_pf_total)}`}>{formatNumber(totals.accn_pf_total)}</td>
                      <td className={`px-4 py-2 whitespace-nowrap text-xs text-right font-mono tabular-nums font-bold ${getProfitClass(((totals.company_realized_total || 0) + (totals.company_unrealized_total || 0)) - ((totals.exp_realized_total || 0) + (totals.exp_unrealized_total || 0)))}`}>{formatNumber(((totals.company_realized_total || 0) + (totals.company_unrealized_total || 0)) - ((totals.exp_realized_total || 0) + (totals.exp_unrealized_total || 0)))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="border-t border-gray-200 px-5 py-3 flex justify-center items-center gap-1.5">
              <button
                onClick={() => handleFilterChange('page', 1)}
                disabled={pagination.current_page <= 1}
                className="px-2.5 py-1 text-sm rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                First
              </button>
              <button
                onClick={() => handleFilterChange('page', pagination.current_page - 1)}
                disabled={pagination.current_page <= 1}
                className="px-2.5 py-1 text-sm rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                Previous
              </button>
              <span className="px-3 py-1 bg-indigo-600 text-white text-sm rounded">
                {pagination.current_page} of {pagination.total_pages}
              </span>
              <button
                onClick={() => handleFilterChange('page', pagination.current_page + 1)}
                disabled={pagination.current_page >= pagination.total_pages}
                className="px-2.5 py-1 text-sm rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                Next
              </button>
              <button
                onClick={() => handleFilterChange('page', pagination.total_pages)}
                disabled={pagination.current_page >= pagination.total_pages}
                className="px-2.5 py-1 text-sm rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                Last
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PLReportPage;
