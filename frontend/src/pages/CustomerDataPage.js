import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Select from 'react-select';
import '../styles/modal.css';
import { customSelectStyles } from '../components/SelectStyles';
import ModernPagination from '../components/ModernPagination';

// Configure axios
axios.defaults.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
axios.defaults.withCredentials = true;

const CustomerDataPage = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pagination, setPagination] = useState({});
    const [mt5Options, setMt5Options] = useState([]);
    const [orderRefOptions, setOrderRefOptions] = useState([]);
    const [symbolRefOptions, setSymbolRefOptions] = useState([]);
    const [selectedRows, setSelectedRows] = useState(new Set());
    const [showInsertModal, setShowInsertModal] = useState(false);
    const [insertForm, setInsertForm] = useState({
        mt5: '',
        order_ref: '',
        direction: '',
        type: '',
        volume: '',
        price: '',
        swap: '',
        balance: '',
        equity: '',
        floating: '',
        profit_loss: '',
        symbolrate_name: '',
        currency: '',
        volume_total: ''
    });
    const [insertError, setInsertError] = useState('');
    const [insertLoading, setInsertLoading] = useState(false);

    const [filters, setFilters] = useState({
    start_date: '',
    start_time: '',
    end_date: '',
    end_time: '',
        mt5: [],
        order_ref: [],
        symbol_ref: [],
        filter_type: '',
        page: 1,
        order_by: 'id',
        order_dir: 'desc'
    });


    // 2025 filter state (only for regular users)
    const [show2025Only, setShow2025Only] = useState(false);
    
    // User context
    const [user, setUser] = useState(null);

    // Format functions
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
            return new Date(dateString).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
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
                } else if (value !== '' && value !== null && value !== undefined) {
                    // include numeric zeros and other falsy-but-valid values
                    params.append(key, value);
                }
            });

            // Add 2025 filter for regular users only
            if (show2025Only && user?.user_type === 'regular') {
                params.append('order_ref_starts_with', '2025');
            }

            const response = await axios.get(`/api/customer-data?${params}`);
            if (response.data.success) {
                setData(response.data.data || []);
                // Normalize pagination for ModernPagination
                const respPagination = response.data.pagination || {};
                setPagination({
                    page: respPagination.current_page || respPagination.page || 1,
                    totalPages: respPagination.total_pages || respPagination.totalPages || 1,
                    total: respPagination.total_records || respPagination.total || 0,
                    limit: respPagination.records_per_page || respPagination.limit || (respPagination.per_page || 50)
                });
                setMt5Options(response.data.filters.mt5Options.map(opt => ({
                    value: opt.mt5,
                    label: opt.mt5
                })));
                setOrderRefOptions(response.data.filters.orderRefOptions.map(opt => ({
                    value: opt.order_ref,
                    label: opt.order_ref
                })));
                setSymbolRefOptions(response.data.filters.symbolRefOptions.map(opt => ({
                    value: opt.symbol_ref,
                    label: opt.symbol_ref
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
        // Get user from localStorage
        const userData = localStorage.getItem('user');
        console.log('Raw user data from localStorage:', userData);
        if (userData) {
            const parsedUser = JSON.parse(userData);
            console.log('Parsed user data:', parsedUser);
            setUser(parsedUser);
        } else {
            console.log('No user data found in localStorage');
        }
        loadData();
    }, [filters, show2025Only]);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({
            ...prev,
            [key]: value,
            page: key === 'page' ? value : 1
        }));
    };

    const exportToCSV = async () => {
        try {
            setLoading(true);
            
            const params = new URLSearchParams();
            
            // Add current filters
            Object.entries(filters).forEach(([key, value]) => {
                if (Array.isArray(value)) {
                    value.forEach(v => params.append(key, v));
                } else if (value) {
                    params.append(key, value);
                }
            });

            // Add 2025 filter if active (only for regular users)
            if (show2025Only && user?.user_type === 'regular') {
                params.append('order_ref_starts_with', '2025');
            }

            const response = await axios.get(`/api/customer-data/export-csv?${params}`, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `customer-data-${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('CSV export error:', error);
            setError('Failed to export data');
        } finally {
            setLoading(false);
        }
    };

    // Handle delete functionality - simple version
// Fixed handleBulkDelete function for CustomerDataPage.js
const handleBulkDelete = async (rowsToDelete) => {
    console.log('handleBulkDelete called with:', rowsToDelete);
    console.log('Current user:', user);
    console.log('User type:', user?.user_type);
    
    if (!rowsToDelete || rowsToDelete.length === 0) {
        alert('No rows selected for deletion');
        return;
    }

    if (!window.confirm(`Are you sure you want to delete ${rowsToDelete.length} record(s)?`)) {
        return;
    }

    try {
        const ids = rowsToDelete.map(row => row.id).filter(id => id);
        console.log('IDs to delete:', ids);
        
        if (ids.length === 0) {
            alert('Selected rows do not have valid IDs');
            return;
        }

        // Get token from localStorage for proper authentication
        const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        
        if (!token) {
            console.error('No authentication token found');
            alert('Authentication required. Please log in again.');
            return;
        }

        console.log('Making POST request to /api/customer-data/delete with data:', { ids });
        console.log('🔐 Using token:', token ? 'Present' : 'Missing');

        const response = await axios.post('/api/customer-data/delete', { ids }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('DELETE response:', response);

        if (response.data.success) {
            alert(`${response.data.affectedRows} record(s) deleted successfully`);
            setSelectedRows(new Set()); // Clear selection
            loadData(); // Refresh data
        } else {
            alert(response.data.message || 'Failed to delete data');
        }
    } catch (error) {
        console.error('Error deleting data:', error);
        console.error('Error response:', error.response);
        
        if (error.response?.status === 401 || error.response?.status === 403) {
            alert('Authentication failed. Please log in again.');
            // Optionally redirect to login
            // window.location.href = '/login';
        } else {
            alert(error.response?.data?.error || error.response?.data?.message || 'Failed to delete data');
        }
    }
};

    // Handle row selection
    const handleRowSelect = (row) => {
        const newSelected = new Set(selectedRows);
        if (newSelected.has(row.id)) {
            newSelected.delete(row.id);
        } else {
            newSelected.add(row.id);
        }
        setSelectedRows(newSelected);
    };

    // Handle select all
    const handleSelectAll = () => {
        if (selectedRows.size === data.length) {
            setSelectedRows(new Set());
        } else {
            setSelectedRows(new Set(data.map(row => row.id)));
        }
    };

    // Handle insert functionality
    const handleInsert = async (formData) => {
        try {
            await axios.post('/api/customer-data', formData);
            loadData();
            return { success: true };
        } catch (error) {
            return { 
                success: false, 
                error: error.response?.data?.error || 'Failed to insert record' 
            };
        }
    };

    const handleInsertSubmit = async (e) => {
        e.preventDefault();
        setInsertError('');
        setInsertLoading(true);

        // Validate required fields
        if (!insertForm.mt5) {
            setInsertError('MT5 ID is required');
            setInsertLoading(false);
            return;
        }

        const result = await handleInsert(insertForm);
        
        if (result.success) {
            setShowInsertModal(false);
            setInsertForm({
                mt5: '',
                order_ref: '',
                direction: '',
                type: '',
                volume: '',
                price: '',
                swap: '',
                balance: '',
                equity: '',
                floating: '',
                profit_loss: '',
                symbolrate_name: '',
                currency: '',
                volume_total: ''
            });
        } else {
            setInsertError(result.error);
        }
        
        setInsertLoading(false);
    };

    return (
        <div className="pl-report-page bg-gray-100 min-h-screen pb-2 sm:pb-5 px-2 sm:px-4 lg:px-8">
            {/* Filters Section */}
            <div className="pl-table-container mb-4 sm:mb-6 bg-white shadow rounded-lg">
                <div className="pl-table-header border-b border-gray-200 bg-gray-50 px-4 sm:px-6 py-3 sm:py-4">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Filters & Search</h2>
                </div>
                
                <div className="p-4 sm:p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                        {/* Date Range Filters */}
                        <div className="form-group">
                            <label className="block text-sm font-medium text-gray-600 mb-1.5">Start Date</label>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    type="date"
                                    value={filters.start_date}
                                    onChange={(e) => handleFilterChange('start_date', e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                                />
                                <input
                                    type="time"
                                    value={filters.start_time}
                                    onChange={(e) => handleFilterChange('start_time', e.target.value)}
                                    className="w-full sm:w-32 px-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="block text-sm font-medium text-gray-600 mb-1.5">End Date</label>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    type="date"
                                    value={filters.end_date}
                                    onChange={(e) => handleFilterChange('end_date', e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                                />
                                <input
                                    type="time"
                                    value={filters.end_time}
                                    onChange={(e) => handleFilterChange('end_time', e.target.value)}
                                    className="w-full sm:w-32 px-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 min-h-[44px]"
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
                                styles={customSelectStyles}
                                placeholder="Select sub users..."
                                noOptionsMessage={() => "No sub users available"}
                                menuPortalTarget={document.body}
                                menuPosition="fixed"
                                menuPlacement="auto"
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
                                styles={customSelectStyles}
                                placeholder="Select order references..."
                                noOptionsMessage={() => "No order references available"}
                                menuPortalTarget={document.body}
                                menuPosition="fixed"
                                menuPlacement="auto"
                            />
                        </div>

                        {/* Symbol Reference Filter */}
                        <div className="form-group">
                            <label className="block text-sm font-medium text-gray-600 mb-1.5">Symbol Reference</label>
                            <Select
                                isMulti
                                value={symbolRefOptions.filter(option => 
                                    filters.symbol_ref.includes(option.value)
                                )}
                                onChange={(selected) => handleFilterChange('symbol_ref', 
                                    selected ? selected.map(opt => opt.value) : []
                                )}
                                options={symbolRefOptions}
                                styles={customSelectStyles}
                                placeholder="Select symbol references..."
                                noOptionsMessage={() => "No symbol references available"}
                                menuPortalTarget={document.body}
                                menuPosition="fixed"
                                menuPlacement="auto"
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

                        {/* Volume Filters (gte / lte) */}
                        <div className="form-group">
                            <label className="block text-sm font-medium text-gray-600 mb-1.5">Volume (Min / Max)</label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Min"
                                    value={filters.volume_gte || ''}
                                    onChange={(e) => handleFilterChange('volume_gte', e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                />
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Max"
                                    value={filters.volume_lte || ''}
                                    onChange={(e) => handleFilterChange('volume_lte', e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        {/* Sort Order */}
                        <div className="form-group">
                            <label className="block text-sm font-medium text-gray-600 mb-1.5">Sort By</label>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <select
                                    value={filters.order_by}
                                    onChange={(e) => handleFilterChange('order_by', e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 min-h-[44px]"
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
                                    className="w-full sm:w-24 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                                >
                                    <option value="desc">DESC</option>
                                    <option value="asc">ASC</option>
                                </select>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="form-group action-row col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4 flex flex-row flex-wrap items-end justify-end gap-2">
                            <button
                                onClick={loadData}
                                className="auth-button flex items-center justify-center gap-2 px-4 py-2 min-h-[44px]"
                            >
                                <i className="fas fa-filter" />
                                <span>Apply Filters</span>
                            </button>
                            <button
                                onClick={() => setShowInsertModal(true)}
                                className="auth-button flex items-center justify-center gap-2 px-4 py-2 min-h-[44px]"
                            >
                                <i className="fas fa-plus" />
                                <span>Insert Record</span>
                            </button>
                            {user?.user_type === 'regular' && (
                                <button 
                                    onClick={() => setShow2025Only(!show2025Only)} 
                                    className={`auth-button flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] ${show2025Only ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                                >
                                    <i className="fas fa-calendar-alt" />
                                    <span>{show2025Only ? '✓ 2025 Orders Only' : 'Show 2025 Orders'}</span>
                                </button>
                            )}
                            {selectedRows.size > 0 && (
                                <button
                                    onClick={() => handleBulkDelete(data.filter(row => selectedRows.has(row.id)))}
                                    className="auth-button bg-red-600 hover:bg-red-700 flex items-center justify-center gap-2 px-4 py-2 min-h-[44px]"
                                >
                                    <i className="fas fa-trash" />
                                    <span>Delete Selected ({selectedRows.size})</span>
                                </button>
                            )}
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
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                <button
                                    onClick={exportToCSV}
                                    className="auth-button-secondary"
                                >
                                    <i className="fas fa-download mr-2"></i>
                                    Export CSV
                                </button>
                                {selectedRows.size > 0 && (
                                    <button
                                        onClick={handleBulkDelete}
                                        className="px-3 sm:px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center gap-1 sm:gap-2 text-sm min-h-[44px]"
                                    >
                                        <i className="fas fa-trash text-sm"></i>
                                        <span className="hidden sm:inline">Delete Selected ({selectedRows.size})</span>
                                        <span className="sm:hidden">({selectedRows.size})</span>
                                    </button>
                                )}
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
                                                checked={data.length > 0 && selectedRows.size === data.length}
                                                onChange={handleSelectAll}
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
                                                checked={selectedRows.has(row.id)}
                                                onChange={() => handleRowSelect(row)}
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

                    {/* Modern Pagination */}
                    <ModernPagination
                        currentPage={pagination.page || 1}
                        totalPages={pagination.totalPages || 1}
                        totalRecords={pagination.total || 0}
                        recordsPerPage={pagination.limit || 50}
                        onPageChange={(page) => handleFilterChange('page', page)}
                        showRecordsInfo={true}
                        showFirstLast={true}
                    />
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

            {/* Insert Modal */}
            {showInsertModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="auth-card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="auth-header">
                            <h2>Insert New Customer Data</h2>
                            <button 
                                onClick={() => setShowInsertModal(false)}
                                className="absolute top-4 right-4 text-gray-400 hover:text-white"
                            >
                                ×
                            </button>
                        </div>

                        {insertError && <div className="error-message">{insertError}</div>}

                        <form onSubmit={handleInsertSubmit} className="auth-form">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label>MT5 ID *</label>
                                    <input
                                        type="text"
                                        value={insertForm.mt5}
                                        onChange={(e) => setInsertForm({...insertForm, mt5: e.target.value})}
                                        required
                                        placeholder="Enter MT5 ID"
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
                                    <label>Swap</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={insertForm.swap}
                                        onChange={(e) => setInsertForm({...insertForm, swap: e.target.value})}
                                        placeholder="0.00"
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
                                    <label>Floating</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={insertForm.floating}
                                        onChange={(e) => setInsertForm({...insertForm, floating: e.target.value})}
                                        placeholder="0.00"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Profit/Loss</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={insertForm.profit_loss}
                                        onChange={(e) => setInsertForm({...insertForm, profit_loss: e.target.value})}
                                        placeholder="0.00"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Symbol</label>
                                    <input
                                        type="text"
                                        value={insertForm.symbolrate_name}
                                        onChange={(e) => setInsertForm({...insertForm, symbolrate_name: e.target.value})}
                                        placeholder="Enter symbol"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Currency</label>
                                    <input
                                        type="text"
                                        value={insertForm.currency}
                                        onChange={(e) => setInsertForm({...insertForm, currency: e.target.value})}
                                        placeholder="Enter currency"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Volume Total</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={insertForm.volume_total}
                                        onChange={(e) => setInsertForm({...insertForm, volume_total: e.target.value})}
                                        placeholder="0.00"
                                    />
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
                                    disabled={insertLoading}
                                    className="auth-button flex-1"
                                >
                                    {insertLoading ? 'Inserting...' : 'Insert'}
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