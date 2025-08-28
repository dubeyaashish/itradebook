import React, { useState, useEffect } from 'react';
import axios from 'axios';

const PLReportPage = () => {
  const [data, setData] = useState([]);
  const [totals, setTotals] = useState({});
  const [symbols, setSymbols] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({});

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

  useEffect(() => {
    loadPLData();
  }, [filters]);

  const loadSymbols = async () => {
    try {
      const response = await axios.get('/api/pl-symbols');
      setSymbols(response.data.symbols || []);
    } catch (error) {
      console.error('Failed to load symbols:', error);
    }
  };

  const loadYears = async () => {
    try {
      const response = await axios.get('/api/pl-years');
      // Set current year as default if not in available years
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
      const params = new URLSearchParams();
      params.append('action', 'get_trading_data');
      params.append('year', filters.year);
      params.append('month', filters.month);
      params.append('page', filters.page);
      
      if (filters.symbol_ref.length > 0) {
        params.append('symbol_ref', filters.symbol_ref[0]); // API expects single symbol
      }

      const response = await axios.get(`/api/pl-report?${params}`);
      
      if (response.data.success) {
        setData(response.data.data);
        setTotals(response.data.totals);
        setPagination(response.data.pagination);
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
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key !== 'page' ? 1 : value
    }));
  };

  const handleSymbolSelection = (symbol) => {
    const newSymbols = filters.symbol_ref.includes(symbol)
      ? filters.symbol_ref.filter(s => s !== symbol)
      : [symbol]; // Single selection for now
    
    handleFilterChange('symbol_ref', newSymbols);
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
        month: 'short',
        day: 'numeric',
        year: 'numeric'
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
    if (!data.length) {
      alert('No data to export');
      return;
    }

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

    // Add totals row
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
    const symbolText = filters.symbol_ref.length > 0 ? `_${filters.symbol_ref[0]}` : '_all';
    link.download = `PL_Report_${monthName}${filters.year}${symbolText}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pl-report-page">
      {/* Filters Section */}
      <div className="data-container mb-6">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Filters & Search</h2>
            <button onClick={exportToCSV} className="auth-button">
              <i className="fas fa-download mr-2"></i>Export CSV
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="form-group">
              <label>Year</label>
              <select
                value={filters.year}
                onChange={(e) => handleFilterChange('year', parseInt(e.target.value))}
              >
                {Array.from({ length: 5 }, (_, i) => {
                  const year = new Date().getFullYear() - 2 + i;
                  return (
                    <option key={year} value={year}>{year}</option>
                  );
                })}
              </select>
            </div>

            <div className="form-group">
              <label>Month</label>
              <select
                value={filters.month}
                onChange={(e) => handleFilterChange('month', parseInt(e.target.value))}
              >
                {monthNames.slice(1).map((month, index) => (
                  <option key={index + 1} value={index + 1}>
                    {month}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Symbol</label>
              <select
                value={filters.symbol_ref[0] || ''}
                onChange={(e) => handleFilterChange('symbol_ref', e.target.value ? [e.target.value] : [])}
              >
                <option value="">-- All Symbols --</option>
                {symbols.map(symbol => (
                  <option key={symbol} value={symbol}>{symbol}</option>
                ))}
              </select>
            </div>

            <div className="form-group flex items-end">
              <button onClick={loadPLData} className="auth-button w-full">
                <i className="fas fa-search mr-2"></i>Filter
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="data-container mb-6">
        <div className="data-stats">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-semibold">
                Daily Trading Summary - {monthNames[filters.month]} {filters.year}
                {filters.symbol_ref.length > 0 && ` (${filters.symbol_ref[0]})`}
              </h3>
              <span className="text-sm text-gray-500">
                {pagination.total_records || 0} records
              </span>
            </div>
            {pagination.total_pages > 1 && (
              <span className="text-sm text-gray-500">
                Page {pagination.current_page || 1} of {pagination.total_pages || 1}
              </span>
            )}
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

      {/* Loading */}
      {loading && (
        <div className="loading-container">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Loading P&L data...</p>
          </div>
        </div>
      )}

      {/* Data Table */}
      {!loading && (
        <div className="data-container">
          {data.length === 0 ? (
            <div className="no-data">
              <h3>No P&L Data Found</h3>
              <p>No trading data found for the selected filters.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table pl-table">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th rowSpan={2}>Date</th>
                    <th rowSpan={2}>Symbol</th>
                    <th rowSpan={2}>Market Price</th>
                    <th colSpan={6} className="text-center border-l border-gray-200">Company Data</th>
                    <th colSpan={7} className="text-center border-l border-gray-200">Exp Data</th>
                    <th rowSpan={2} className="border-l border-gray-200">Accn. Pf</th>
                    <th rowSpan={2} className="border-l border-gray-200">Daily Total</th>
                  </tr>
                  <tr className="bg-gray-50">
                    <th className="text-xs border-l border-gray-200">Realized P&L</th>
                    <th className="text-xs">Unrealized P&L</th>
                    <th className="text-xs">Balance</th>
                    <th className="text-xs">Equity</th>
                    <th className="text-xs">Floating</th>
                    <th className="text-xs">Total</th>
                    <th className="text-xs border-l border-gray-200">Realized P&L</th>
                    <th className="text-xs">Unrealized P&L</th>
                    <th className="text-xs">Balance</th>
                    <th className="text-xs">Equity</th>
                    <th className="text-xs">Floating</th>
                    <th className="text-xs">PLN</th>
                    <th className="text-xs">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="font-medium">{formatDate(row.trade_date)}</td>
                      <td className="font-medium">{row.symbol_ref || 'N/A'}</td>
                      <td className="text-center font-mono">{formatNumber(row.latest_mktprice, 5)}</td>
                      
                      {/* Company Data */}
                      <td className={`text-center font-mono text-xs ${getProfitClass(row.company_realized)} border-l border-gray-200`}>
                        {formatNumber(row.company_realized)}
                      </td>
                      <td className={`text-center font-mono text-xs ${getProfitClass(row.company_unrealized)}`}>
                        {formatNumber(row.company_unrealized)}
                      </td>
                      <td className={`text-center font-mono text-xs ${getBalanceClass(row.company_balance)}`}>
                        {formatNumber(row.company_balance)}
                      </td>
                      <td className={`text-center font-mono text-xs ${getBalanceClass(row.company_equity)}`}>
                        {formatNumber(row.company_equity)}
                      </td>
                      <td className={`text-center font-mono text-xs ${getBalanceClass(row.company_floating)}`}>
                        {formatNumber(row.company_floating)}
                      </td>
                      <td className={`text-center font-mono text-xs font-bold ${getProfitClass(row.daily_company_total)}`}>
                        {formatNumber(row.daily_company_total)}
                      </td>
                      
                      {/* Exp Data */}
                      <td className={`text-center font-mono text-xs ${getProfitClass(row.exp_realized)} border-l border-gray-200`}>
                        {formatNumber(row.exp_realized)}
                      </td>
                      <td className={`text-center font-mono text-xs ${getProfitClass(row.exp_unrealized)}`}>
                        {formatNumber(row.exp_unrealized)}
                      </td>
                      <td className={`text-center font-mono text-xs ${getBalanceClass(row.exp_balance)}`}>
                        {formatNumber(row.exp_balance)}
                      </td>
                      <td className={`text-center font-mono text-xs ${getBalanceClass(row.exp_equity)}`}>
                        {formatNumber(row.exp_equity)}
                      </td>
                      <td className={`text-center font-mono text-xs ${getBalanceClass(row.exp_floating)}`}>
                        {formatNumber(row.exp_floating)}
                      </td>
                      <td className={`text-center font-mono text-xs ${getProfitClass(row.exp_pln)}`}>
                        {formatNumber(row.exp_pln)}
                      </td>
                      <td className={`text-center font-mono text-xs font-bold ${getProfitClass(row.daily_exp_total)}`}>
                        {formatNumber(row.daily_exp_total)}
                      </td>
                      
                      {/* Account Profit & Grand Total */}
                      <td className={`text-center font-mono text-xs font-bold border-l border-gray-200 ${getProfitClass(row.accn_pf)}`}>
                        {formatNumber(row.accn_pf)}
                      </td>
                      <td className={`text-center font-mono text-xs font-bold border-l border-gray-200 ${getProfitClass(row.daily_grand_total)}`}>
                        {formatNumber(row.daily_grand_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                
                {/* Totals Footer */}
                {totals && (
                  <tfoot className="border-t-2 border-gray-300 bg-gray-100">
                    <tr className="font-bold">
                      <td colSpan={3} className="text-center">TOTAL</td>
                      
                      {/* Company Totals */}
                      <td className={`text-center font-mono text-sm ${getProfitClass(totals.company_realized_total)} border-l border-gray-200`}>
                        {formatNumber(totals.company_realized_total)}
                      </td>
                      <td className={`text-center font-mono text-sm ${getProfitClass(totals.company_unrealized_total)}`}>
                        {formatNumber(totals.company_unrealized_total)}
                      </td>
                      <td className={`text-center font-mono text-sm ${getBalanceClass(totals.company_balance_total)}`}>
                        {formatNumber(totals.company_balance_total)}
                      </td>
                      <td className={`text-center font-mono text-sm ${getBalanceClass(totals.company_equity_total)}`}>
                        {formatNumber(totals.company_equity_total)}
                      </td>
                      <td className={`text-center font-mono text-sm ${getBalanceClass(totals.company_floating_total)}`}>
                        {formatNumber(totals.company_floating_total)}
                      </td>
                      <td className={`text-center font-mono text-sm ${getProfitClass((totals.company_realized_total || 0) + (totals.company_unrealized_total || 0))}`}>
                        {formatNumber((totals.company_realized_total || 0) + (totals.company_unrealized_total || 0))}
                      </td>
                      
                      {/* Exp Totals */}
                      <td className={`text-center font-mono text-sm ${getProfitClass(totals.exp_realized_total)} border-l border-gray-200`}>
                        {formatNumber(totals.exp_realized_total)}
                      </td>
                      <td className={`text-center font-mono text-sm ${getProfitClass(totals.exp_unrealized_total)}`}>
                        {formatNumber(totals.exp_unrealized_total)}
                      </td>
                      <td className={`text-center font-mono text-sm ${getBalanceClass(totals.exp_balance_total)}`}>
                        {formatNumber(totals.exp_balance_total)}
                      </td>
                      <td className={`text-center font-mono text-sm ${getBalanceClass(totals.exp_equity_total)}`}>
                        {formatNumber(totals.exp_equity_total)}
                      </td>
                      <td className={`text-center font-mono text-sm ${getBalanceClass(totals.exp_floating_total)}`}>
                        {formatNumber(totals.exp_floating_total)}
                      </td>
                      <td className={`text-center font-mono text-sm ${getProfitClass(totals.exp_pln_total)}`}>
                        {formatNumber(totals.exp_pln_total)}
                      </td>
                      <td className={`text-center font-mono text-sm ${getProfitClass((totals.exp_realized_total || 0) + (totals.exp_unrealized_total || 0))}`}>
                        {formatNumber((totals.exp_realized_total || 0) + (totals.exp_unrealized_total || 0))}
                      </td>
                      
                      {/* Grand Totals */}
                      <td className={`text-center font-mono text-sm ${getProfitClass(totals.accn_pf_total)} border-l border-gray-200`}>
                        {formatNumber(totals.accn_pf_total)}
                      </td>
                      <td className={`text-center font-mono text-sm ${getProfitClass(
                        ((totals.company_realized_total || 0) + (totals.company_unrealized_total || 0)) - 
                        ((totals.exp_realized_total || 0) + (totals.exp_unrealized_total || 0))
                      )} border-l border-gray-200`}>
                        {formatNumber(
                          ((totals.company_realized_total || 0) + (totals.company_unrealized_total || 0)) - 
                          ((totals.exp_realized_total || 0) + (totals.exp_unrealized_total || 0))
                        )}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="mt-6 flex justify-center items-center gap-2">
              <button
                onClick={() => handleFilterChange('page', 1)}
                disabled={pagination.current_page <= 1}
                className="auth-button-secondary"
              >
                First
              </button>
              <button
                onClick={() => handleFilterChange('page', pagination.current_page - 1)}
                disabled={pagination.current_page <= 1}
                className="auth-button-secondary"
              >
                Previous
              </button>
              <span className="px-4 py-2 bg-green-600 text-white rounded">
                Page {pagination.current_page} of {pagination.total_pages}
              </span>
              <button
                onClick={() => handleFilterChange('page', pagination.current_page + 1)}
                disabled={pagination.current_page >= pagination.total_pages}
                className="auth-button-secondary"
              >
                Next
              </button>
              <button
                onClick={() => handleFilterChange('page', pagination.total_pages)}
                disabled={pagination.current_page >= pagination.total_pages}
                className="auth-button-secondary"
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