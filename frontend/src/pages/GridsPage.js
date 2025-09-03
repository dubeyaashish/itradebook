import React, { useState, useEffect, useCallback } from 'react';
import Select from 'react-select';
import axios from 'axios';
import io from 'socket.io-client';
import { PageHeader } from '../components/PageHeader';
import { customSelectStyles } from '../components/SelectStyles';

// Configure axios
axios.defaults.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
axios.defaults.withCredentials = true;

const GridsPage = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSymbols, setSelectedSymbols] = useState([]);
  const [availableSymbols, setAvailableSymbols] = useState([]);
  const [socket, setSocket] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Initialize socket connection
  useEffect(() => {
    const apiURL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    const newSocket = io(apiURL, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });
    
    setSocket(newSocket);
    
    newSocket.on('connect', () => {
      console.log('Connected to WebSocket for grids data');
    });
    
    newSocket.on('disconnect', () => {
      console.log('Disconnected from WebSocket');
    });
    
    newSocket.on('grids_data_update', (updatedData) => {
      console.log('Received grids data update:', updatedData);
      setData(prevData => {
        // Update existing data or add new symbol data
        const newData = [...prevData];
        const index = newData.findIndex(item => item.symbolref === updatedData.symbolref);
        if (index >= 0) {
          newData[index] = updatedData;
        } else {
          newData.push(updatedData);
        }
        return newData.sort((a, b) => a.symbolref.localeCompare(b.symbolref));
      });
      setLastUpdate(new Date());
    });

    newSocket.on('heartbeat', (data) => {
      console.log('Heartbeat received:', data.timestamp);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  // Fetch available symbols
  const fetchSymbols = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/grids/symbols', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailableSymbols(response.data);
    } catch (err) {
      console.error('Error fetching symbols:', err);
      setError('Failed to fetch available symbols');
    }
  }, []);

  // Fetch grids data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/grids/grids-data', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(response.data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error fetching grids data:', err);
      setError(err.response?.data?.error || 'Failed to fetch grids data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchSymbols();
    fetchData();
  }, [fetchSymbols, fetchData]);

  // Filter data based on selected symbols
  const filteredData = selectedSymbols.length > 0 
    ? data.filter(item => selectedSymbols.some(symbol => symbol.value === item.symbolref))
    : data;

  // Format number with original precision, limited to 4 decimal places
  const formatNumber = (num) => {
    if (num === null || num === undefined || num === '' || isNaN(num)) return '0';
    
    const number = Number(num);
    if (number === 0) return '0';
    
    // Keep original precision, just add thousand separators for readability
    let str = number.toString();
    
    // Limit to 4 decimal places if there are more
    if (str.includes('.')) {
      const parts = str.split('.');
      if (parts[1].length > 4) {
        str = number.toFixed(4);
      }
    }
    
    // Only add formatting for numbers >= 1000 to avoid changing small decimals
    if (Math.abs(number) >= 1000 && !str.includes('e')) {
      const parts = str.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      str = parts.join('.');
    }
    
    return str;
  };

  // Get cell class for profit/loss styling
  const getCellClass = (value) => {
    const num = parseFloat(value);
    if (Number.isNaN(num)) return '';
    if (num > 0) return 'text-green-600 font-semibold';
    if (num < 0) return 'text-red-600 font-semibold';
    return '';
  };

  if (loading) {
    return (
      <div className="page-container">
        <PageHeader 
          title="Grids Data" 
          subtitle="Latest grid order data with aggregated trading information"
        />
        <div className="loading-container">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Loading grids data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <PageHeader 
          title="Grids Data" 
          subtitle="Latest grid order data with aggregated trading information"
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
        title="Grids Data" 
        subtitle="Latest grid order data with aggregated trading information"
      />
      
      {/* Filter Section */}
      <div className="filter-container">
        <div className="filter-card">
          <div className="filter-row">
            <div className="form-group">
              <label>Filter by Symbols</label>
              <Select
                isMulti
                value={selectedSymbols}
                onChange={setSelectedSymbols}
                options={availableSymbols}
                placeholder="Select symbols to filter..."
                styles={customSelectStyles}
                isSearchable
                isClearable
                className="react-select-container"
                classNamePrefix="react-select"
                menuPortalTarget={document.body}
              />
              <small>Leave empty to show all symbols</small>
            </div>
            <div className="form-group">
              <label>&nbsp;</label>
              <div className="flex gap-3">
                <button onClick={fetchData} className="auth-button">
                  <i className="fas fa-sync-alt mr-2"></i>Refresh
                </button>
                {lastUpdate && (
                  <div className="text-sm text-gray-500 flex items-center">
                    Last update: {lastUpdate.toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="data-container">
        <div className="data-stats">
          <div className="flex justify-between items-center">
            <span>
              Showing <strong>{filteredData.length}</strong> symbols
              {selectedSymbols.length > 0 && (
                <span> (filtered from {data.length} total)</span>
              )}
            </span>
            <div className="text-sm text-gray-500">
              Grids data - {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>

        {filteredData.length === 0 ? (
          <div className="no-data">
            <h3>No Data Found</h3>
            <p>
              {selectedSymbols.length > 0 
                ? "No data found for the selected symbols"
                : "No grids data available"
              }
            </p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol Ref</th>
                  <th className="text-right">Total Buy Size</th>
                  <th className="text-right">Total Sell Size</th>
                  <th className="text-right">Avg Buy Price</th>
                  <th className="text-right">Avg Sell Price</th>
                  <th className="text-right">Difference</th>
                  <th className="text-center">Grid Order</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, index) => (
                  <tr key={`${row.symbolref}-${index}`}>
                    <td>
                      {row.symbolref}
                    </td>
                    <td className="text-right font-mono">
                      <span className="text-green-600 font-semibold">
                        {formatNumber(row.total_buy_size)}
                      </span>
                    </td>
                    <td className="text-right font-mono">
                      <span className="text-red-600 font-semibold">
                        {formatNumber(row.total_sell_size)}
                      </span>
                    </td>
                    <td className="text-right font-mono">
                      {formatNumber(row.weighted_avg_buy_price)}
                    </td>
                    <td className="text-right font-mono">
                      {formatNumber(row.weighted_avg_sell_price)}
                    </td>
                    <td className="text-right font-mono">
                      <span className={getCellClass(row.difference)}>
                        {formatNumber(row.difference)}
                      </span>
                    </td>
                    <td className="text-center font-mono">
                      <span className="bg-blue-100 text-white px-2 py-1 rounded text-sm">
                        {row.gridorder}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary Stats */}
        {filteredData.length > 0 && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-semibold mb-3">Summary</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Total Symbols:</span>
                <span className="ml-2 font-semibold">{filteredData.length}</span>
              </div>
              <div>
                <span className="text-gray-600">Total Buy Volume:</span>
                <span className="ml-2 font-semibold text-green-600">
                  {formatNumber(filteredData.reduce((sum, row) => sum + row.total_buy_size, 0), 4)}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Total Sell Volume:</span>
                <span className="ml-2 font-semibold text-red-600">
                  {formatNumber(filteredData.reduce((sum, row) => sum + row.total_sell_size, 0), 4)}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Net Difference:</span>
                <span className={`ml-2 font-semibold ${getCellClass(filteredData.reduce((sum, row) => sum + row.difference, 0))}`}>
                  {formatNumber(filteredData.reduce((sum, row) => sum + row.difference, 0), 4)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GridsPage;
