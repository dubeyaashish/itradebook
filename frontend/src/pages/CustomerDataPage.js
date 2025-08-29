import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Select from 'react-select';

// Configure axios
axios.defaults.baseURL = 'http://localhost:3001';
axios.defaults.withCredentials = true;

// Axios configuration
axios.defaults.baseURL = 'http://localhost:3001';
axios.defaults.withCredentials = true;

const CustomerDataPage = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pagination, setPagination] = useState({});
    const [mt5Options, setMt5Options] = useState([]);
    const [orderRefOptions, setOrderRefOptions] = useState([]);
    const [selectedRows, setSelectedRows] = useState([]);

    const [filters, setFilters] = useState({
        start_date: '',
        end_date: '',
        mt5: [],
        order_ref: [],
        filter_type: '',
        page: 1,
        order_by: 'id',
        order_dir: 'desc'
    });

    // Format functions
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
            return new Date(dateString).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return dateString;
        }
    };

    const getProfitClass = (value) => {
        const num = Number(value);
        if (num > 0) return 'text-green-600';
        if (num < 0) return 'text-red-600';
        return '';
    };

    // Fetch data
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

            const response = await axios.get(`/api/customer-data?${params}`);
            if (response.data.success) {
                setData(response.data.data);
                setPagination(response.data.pagination);
                setMt5Options(response.data.filters.mt5Options.map(opt => ({
                    value: opt.mt5,
                    label: opt.mt5
                })));
                setOrderRefOptions(response.data.filters.orderRefOptions.map(opt => ({
                    value: opt.order_ref,
                    label: opt.order_ref
                })));
            } else {
                setError('Failed to load data');
            }
        } catch (error) {
            setError(error.response?.data?.error || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [filters]);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({
            ...prev,
            [key]: value,
            page: key === 'page' ? value : 1
        }));
    };

    const exportToCSV = async () => {
        try {
            const params = new URLSearchParams();
            Object.entries(filters).forEach(([key, value]) => {
                if (Array.isArray(value)) {
                    value.forEach(v => params.append(key, v));
                } else if (value) {
                    params.append(key, value);
                }
            });

            const response = await axios.get(`/api/customer-data/export?${params}`, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `trading-data-${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            setError('Failed to export data');
        }
    };

    const handleBulkDelete = async () => {
        if (!selectedRows.length) {
            setError('No rows selected for deletion');
            return;
        }

        if (!window.confirm('Are you sure you want to delete the selected rows?')) {
            return;
        }

        try {
            await axios.delete('/api/customer-data', {
                data: { ids: selectedRows }
            });
            setSelectedRows([]);
            loadData();
        } catch (error) {
            setError(error.response?.data?.error || 'Failed to delete rows');
        }
    };

    return (
        <div className="pl-report-page bg-gray-100 min-h-screen py-5 px-4 sm:px-6 lg:px-8">
            {/* Filters Section */}
            <div className="pl-table-container mb-6 bg-white shadow rounded-lg">
                <div className="pl-table-header border-b border-gray-200 bg-gray-50 px-6 py-4">
                    <h2 className="text-lg font-semibold text-gray-900">Filters & Search</h2>
                </div>
                
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {/* Date Range Filters */}
                        <div className="form-group">
                            <label className="block text-sm font-medium text-gray-600 mb-1.5">Start Date</label>
                            <div className="flex gap-2">
                                <input
                                    type="date"
                                    value={filters.start_date}
                                    onChange={(e) => handleFilterChange('start_date', e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                />
                                <input
                                    type="time"
                                    value={filters.start_time}
                                    onChange={(e) => handleFilterChange('start_time', e.target.value)}
                                    className="w-24 px-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="block text-sm font-medium text-gray-600 mb-1.5">End Date</label>
                            <div className="flex gap-2">
                                <input
                                    type="date"
                                    value={filters.end_date}
                                    onChange={(e) => handleFilterChange('end_date', e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                />
                                <input
                                    type="time"
                                    value={filters.end_time}
                                    onChange={(e) => handleFilterChange('end_time', e.target.value)}
                                    className="w-24 px-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        {/* Sub Users Filter */}
                        <div className="form-group">
                            <label className="block text-sm font-medium text-gray-600 mb-1.5">Sub Users (MT5)</label>
                            <Select
                                isMulti
                                value={mt5Options.filter(option => 
                                    filters.mt5.includes(option.value)
                                )}
                                onChange={(selected) => handleFilterChange('mt5', 
                                    selected ? selected.map(opt => opt.value) : []
                                )}
                                options={mt5Options}
                                className="react-select-container"
                                classNamePrefix="react-select"
                                placeholder="Select sub users..."
                                noOptionsMessage={() => "No sub users available"}
                            />
                        </div>

                        {/* Order Reference Filter */}
                        <div className="form-group">
                            <label className="block text-sm font-medium text-gray-600 mb-1.5">Order Reference</label>
                            <Select
                                isMulti
                                value={orderRefOptions.filter(option => 
                                    filters.order_ref.includes(option.value)
                                )}
                                onChange={(selected) => handleFilterChange('order_ref', 
                                    selected ? selected.map(opt => opt.value) : []
                                )}
                                options={orderRefOptions}
                                className="react-select-container"
                                classNamePrefix="react-select"
                                placeholder="Select order references..."
                                noOptionsMessage={() => "No order references available"}
                            />
                        </div>

                        {/* Filter Type */}
                        <div className="form-group">
                            <label className="block text-sm font-medium text-gray-600 mb-1.5">Filter Type</label>
                            <select
                                value={filters.filter_type}
                                onChange={(e) => handleFilterChange('filter_type', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">All Types</option>
                                <option value="snapshot">Snapshot Only</option>
                            </select>
                        </div>

                        {/* Sort Order */}
                        <div className="form-group">
                            <label className="block text-sm font-medium text-gray-600 mb-1.5">Sort By</label>
                            <div className="flex gap-2">
                                <select
                                    value={filters.order_by}
                                    onChange={(e) => handleFilterChange('order_by', e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="id">ID</option>
                                    <option value="datetime_server_ts_tz">Date</option>
                                    <option value="mt5">Sub User</option>
                                    <option value="order_ref">Order Ref</option>
                                    <option value="profit_loss">P/L</option>
                                    <option value="balance">Balance</option>
                                    <option value="equity">Equity</option>
                                </select>
                                <select
                                    value={filters.order_dir}
                                    onChange={(e) => handleFilterChange('order_dir', e.target.value)}
                                    className="w-24 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="desc">DESC</option>
                                    <option value="asc">ASC</option>
                                </select>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="form-group flex items-end gap-2">
                            <button
                                onClick={loadData}
                                className="flex-1 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-sm font-semibold rounded-md shadow-sm hover:from-indigo-700 hover:to-indigo-800 hover:shadow-md transform hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 active:translate-y-0 active:shadow-none flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-filter text-lg" />
                                <span>Apply Filters</span>
                            </button>
                            <button
                                onClick={() => handleFilterChange('page', 1)}
                                className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors"
                            >
                                <i className="fas fa-sync-alt" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="mb-6 bg-red-50 border border-red-100 rounded-md p-4">
                    <div className="flex">
                        <i className="fas fa-exclamation-circle text-red-400 mr-3"></i>
                        <span className="text-sm text-red-800">{error}</span>
                    </div>
                </div>
            )}

            {/* Loading State */}
            {loading && (
                <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    <span className="ml-3 text-gray-600">Loading data...</span>
                </div>
            )}

            {/* Data Table */}
            {!loading && data.length > 0 && (
                <div className="trading-table-container">
                    <div className="trading-table-header">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                    <i className="fas fa-table text-blue-600"></i>
                                    Trading Data
                                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                                        {pagination.total?.toLocaleString()} records
                                    </span>
                                </h2>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors flex items-center gap-2"
                                >
                                    <i className="fas fa-sync-alt"></i>
                                    Refresh
                                </button>
                                <button
                                    onClick={exportToCSV}
                                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-2"
                                >
                                    <i className="fas fa-file-export"></i>
                                    Export CSV
                                </button>
                                {selectedRows.length > 0 && (
                                    <button
                                        onClick={handleBulkDelete}
                                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center gap-2"
                                    >
                                        <i className="fas fa-trash"></i>
                                        Delete Selected ({selectedRows.length})
                                    </button>
                                )}
                                <button
                                    onClick={() => window.open('/api/customer-data/debug', '_blank')}
                                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors flex items-center gap-2"
                                >
                                    <i className="fas fa-bug"></i>
                                    Debug
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="pl-table-wrapper relative">
                        <table className="pl-table">
                            <thead className="sticky top-0 z-40 bg-gray-50">
                                <tr className="bg-gray-50">
                                    <th className="sticky-left left-0">
                                        <div className="flex justify-center">
                                            <input
                                                type="checkbox"
                                                checked={selectedRows.length === data.length}
                                                onChange={() => {
                                                    if (selectedRows.length === data.length) {
                                                        setSelectedRows([]);
                                                    } else {
                                                        setSelectedRows(data.map(row => row.id));
                                                    }
                                                }}
                                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </th>
                                    <th className="sticky-left left-[50px]">
                                        <div className="flex items-center gap-2">
                                            <i className="fas fa-hashtag text-blue-600"></i> ID
                                        </div>
                                    </th>
                                    <th className="sticky-left left-[200px]">
                                        <div className="flex items-center gap-2">
                                            <i className="fas fa-key text-blue-600"></i> API Key
                                        </div>
                                    </th>
                                    <th className="sticky-left left-[350px]">
                                        <div className="flex items-center gap-2">
                                            <i className="fas fa-calendar-alt text-blue-600"></i> Date
                                        </div>
                                    </th>
                                    <th className="bg-gray-50">
                                        <div className="flex items-center gap-2">
                                            <i className="fas fa-user text-gray-600"></i> MT5
                                        </div>
                                    </th>
                                    <th className="bg-gray-50">
                                        <div className="flex items-center gap-2">
                                            <i className="fas fa-hashtag text-gray-600"></i> Order Ref
                                        </div>
                                    </th>
                                    <th className="bg-gray-50">
                                        <div className="flex items-center gap-2">
                                            <i className="fas fa-exchange-alt text-gray-600"></i> Direction
                                        </div>
                                    </th>
                                    <th className="bg-gray-50">
                                        <div className="flex items-center gap-2">
                                            <i className="fas fa-tag text-gray-600"></i> Type
                                        </div>
                                    </th>
                                    <th className="text-right bg-gray-50">
                                        <div className="flex items-center justify-end gap-2">
                                            <i className="fas fa-chart-bar text-gray-600"></i> Volume
                                        </div>
                                    </th>
                                    <th className="text-right bg-gray-50">
                                        <div className="flex items-center justify-end gap-2">
                                            <i className="fas fa-tag text-gray-600"></i> Price
                                        </div>
                                    </th>
                                    <th className="text-right bg-gray-50">
                                        <div className="flex items-center justify-end gap-2">
                                            <i className="fas fa-sync text-gray-600"></i> Swap
                                        </div>
                                    </th>
                                    <th className="text-right bg-gray-50">
                                        <div className="flex items-center justify-end gap-2">
                                            <i className="fas fa-history text-gray-600"></i> Last Swap
                                        </div>
                                    </th>
                                    <th className="text-right bg-gray-50">
                                        <div className="flex items-center justify-end gap-2">
                                            <i className="fas fa-wallet text-gray-600"></i> Balance
                                        </div>
                                    </th>
                                    <th className="text-right bg-gray-50">
                                        <div className="flex items-center justify-end gap-2">
                                            <i className="fas fa-balance-scale text-gray-600"></i> Equity
                                        </div>
                                    </th>
                                    <th className="text-right bg-gray-50">
                                        <div className="flex items-center justify-end gap-2">
                                            <i className="fas fa-stream text-gray-600"></i> Floating
                                        </div>
                                    </th>
                                    <th className="text-right bg-gray-50">
                                        <div className="flex items-center justify-end gap-2">
                                            <i className="fas fa-chart-line text-gray-600"></i> P/L
                                        </div>
                                    </th>
                                    <th className="text-right bg-gray-50">
                                        <div className="flex items-center justify-end gap-2">
                                            <i className="fas fa-history text-gray-600"></i> Last P/L
                                        </div>
                                    </th>
                                    <th className="bg-gray-50">
                                        <div className="flex items-center gap-2">
                                            <i className="fas fa-chart-line text-gray-600"></i> Symbol
                                        </div>
                                    </th>
                                    <th className="bg-gray-50">
                                        <div className="flex items-center gap-2">
                                            <i className="fas fa-dollar-sign text-gray-600"></i> Currency
                                        </div>
                                    </th>
                                    <th className="text-right bg-gray-50">
                                        <div className="flex items-center justify-end gap-2">
                                            <i className="fas fa-chart-area text-gray-600"></i> Volume Total
                                        </div>
                                    </th>
                                    <th className="bg-gray-50">
                                        <div className="flex items-center gap-2">
                                            <i className="fas fa-clock text-gray-600"></i> Created At
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {data.map((row, index) => (
                                    <tr key={row.id}>
                                        <td className="sticky-left left-0">
                                            <input
                                                type="checkbox"
                                                checked={selectedRows.includes(row.id)}
                                                onChange={() => {
                                                    if (selectedRows.includes(row.id)) {
                                                        setSelectedRows(prev => prev.filter(id => id !== row.id));
                                                    } else {
                                                        setSelectedRows(prev => [...prev, row.id]);
                                                    }
                                                }}
                                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                        </td>
                                        <td className="sticky-left left-[50px]">{row.id}</td>
                                        <td className="sticky-left left-[200px]">{row.api_key || 'N/A'}</td>
                                        <td className="sticky-left left-[350px]">{formatDate(row.datetime_server_ts_tz)}</td>
                                        <td>{row.mt5}</td>
                                        <td>{row.order_ref}</td>
                                        <td>{row.direction}</td>
                                        <td>{row.type}</td>
                                        <td className="text-right font-mono">{formatNumber(row.volume, 2)}</td>
                                        <td className="text-right font-mono">{formatNumber(row.price, 5)}</td>
                                        <td className="text-right font-mono">{formatNumber(row.swap, 2)}</td>
                                        <td className="text-right font-mono">{formatNumber(row.swap_last, 2)}</td>
                                        <td className="text-right font-mono">{formatNumber(row.balance, 2)}</td>
                                        <td className="text-right font-mono">{formatNumber(row.equity, 2)}</td>
                                        <td className="text-right font-mono">{formatNumber(row.floating, 2)}</td>
                                        <td className={`text-right font-mono ${getProfitClass(row.profit_loss)}`}>
                                            {formatNumber(row.profit_loss, 2)}
                                        </td>
                                        <td className={`text-right font-mono ${getProfitClass(row.profit_loss_last)}`}>
                                            {formatNumber(row.profit_loss_last, 2)}
                                        </td>
                                        <td>{row.symbolrate_name}</td>
                                        <td>{row.currency}</td>
                                        <td className="text-right font-mono">{formatNumber(row.volume_total, 2)}</td>
                                        <td>{formatDate(row.created_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {pagination.total_pages > 1 && (
                        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between">
                            <div className="flex-1 flex justify-between sm:hidden">
                                <button
                                    onClick={() => handleFilterChange('page', (pagination.page || 1) - 1)}
                                    disabled={(pagination.page || 1) <= 1}
                                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => handleFilterChange('page', (pagination.page || 1) + 1)}
                                    disabled={(pagination.page || 1) >= (pagination.totalPages || 1)}
                                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Next
                                </button>
                            </div>
                            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-sm text-gray-700">
                                        Showing page {pagination.page || 1} of {pagination.totalPages || 1}
                                    </p>
                                </div>
                                <div>
                                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                                        <button
                                            onClick={() => handleFilterChange('page', 1)}
                                            disabled={(pagination.page || 1) <= 1}
                                            className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            <span className="sr-only">First</span>
                                            <i className="fas fa-angle-double-left"></i>
                                        </button>
                                        <button
                                            onClick={() => handleFilterChange('page', (pagination.page || 1) - 1)}
                                            disabled={(pagination.page || 1) <= 1}
                                            className="relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            <span className="sr-only">Previous</span>
                                            <i className="fas fa-angle-left"></i>
                                        </button>
                                        <button
                                            onClick={() => handleFilterChange('page', (pagination.page || 1) + 1)}
                                            disabled={(pagination.page || 1) >= (pagination.totalPages || 1)}
                                            className="relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            <span className="sr-only">Next</span>
                                            <i className="fas fa-angle-right"></i>
                                        </button>
                                        <button
                                            onClick={() => handleFilterChange('page', pagination.totalPages || 1)}
                                            disabled={(pagination.page || 1) >= (pagination.totalPages || 1)}
                                            className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            <span className="sr-only">Last</span>
                                            <i className="fas fa-angle-double-right"></i>
                                        </button>
                                    </nav>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* No Data State */}
            {!loading && data.length === 0 && (
                <div className="bg-white shadow rounded-lg p-8 text-center">
                    <i className="fas fa-inbox text-gray-400 text-4xl mb-4"></i>
                    <h3 className="text-lg font-medium text-gray-900 mb-1">No Data Found</h3>
                    <p className="text-gray-500">Try adjusting your search filters</p>
                </div>
            )}
        </div>
    );
};

export default CustomerDataPage;