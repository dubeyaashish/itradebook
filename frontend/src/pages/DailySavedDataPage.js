import React, { useState, useEffect } from 'react';
import axios from 'axios';

const DailySavedDataPage = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    loadLiveData();
    
    let interval;
    if (autoRefresh) {
      interval = setInterval(loadLiveData, 5000); // 5 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const loadLiveData = async () => {
    try {
      setError('');
      const response = await axios.get('/api/live-data');
      setData(response.data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to load live data:', error);
      setError(error.response?.data?.error || 'Failed to load live data');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (value, digits = 4) => {
    const num = Number(value);
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const getProfitClass = (value) => {
    const num = Number(value);
    if (num > 0) return 'text-green-600';
    if (num < 0) return 'text-red-600';
    return 'text-gray-700';
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  if (loading && data.length === 0) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading live trading data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="live-dashboard">
      {/* Controls Header */}
      <div className="data-container mb-6">
        <div className="data-stats">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <h2 className="text-lg font-semibold">Live Trading Dashboard</h2>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <div className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                <span>{autoRefresh ? 'Live' : 'Paused'}</span>
                {lastUpdated && (
                  <span className="ml-2">
                    Updated: {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={toggleAutoRefresh}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  autoRefresh 
                    ? 'bg-green-600 text-white hover:bg-green-700' 
                    : 'bg-gray-600 text-white hover:bg-gray-700'
                }`}
              >
                <i className={`fas ${autoRefresh ? 'fa-pause' : 'fa-play'} mr-2`}></i>
                {autoRefresh ? 'Pause' : 'Resume'}
              </button>
              <button
                onClick={loadLiveData}
                className="auth-button"
                disabled={loading}
              >
                <i className={`fas fa-sync-alt mr-2 ${loading ? 'animate-spin' : ''}`}></i>
                Refresh
              </button>
            </div>
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

      {/* Trading Cards Grid */}
      <div className="cards-grid">
        {data.length === 0 ? (
          <div className="no-data">
            <div className="text-center py-12">
              <i className="fas fa-inbox text-gray-300 text-4xl mb-4"></i>
              <h3>No Live Data Available</h3>
              <p>No trading data found. Check your connection and try again.</p>
              <button onClick={loadLiveData} className="auth-button mt-4">
                <i className="fas fa-refresh mr-2"></i>
                Retry
              </button>
            </div>
          </div>
        ) : (
          data.map((item, index) => {
            const profitRatio = Number(item.profit_ratio || 0);
            const isProfit = profitRatio >= 0;
            
            return (
              <div key={item.symbol_ref || index} className="trading-card">
                {/* Card Header */}
                <div className="card-header">
                  <div className="flex items-center space-x-3">
                    <div className={`symbol-icon ${isProfit ? 'profit' : 'loss'}`}>
                      {item.symbol_ref ? item.symbol_ref.charAt(0) : '?'}
                    </div>
                    <div>
                      <h3 className="symbol-name">{item.symbol_ref || 'Unknown'}</h3>
                      <p className="symbol-date">{formatDate(item.date)}</p>
                    </div>
                  </div>
                  <div className="profit-display">
                    <div className={`profit-ratio ${getProfitClass(profitRatio)}`}>
                      {formatNumber(profitRatio)}
                    </div>
                    <div className="profit-total">
                      ${formatNumber(item.profit_total)}
                    </div>
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="card-metrics">
                  <div className="metric-row">
                    <div className="metric">
                      <span className="metric-label">Market Price</span>
                      <span className="metric-value">{formatNumber(item.mktprice, 2)}</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Net Position</span>
                      <span className="metric-value">{formatNumber(item.difflot)}</span>
                    </div>
                  </div>
                  <div className="metric-row">
                    <div className="metric">
                      <span className="metric-label">Avg Buy</span>
                      <span className="metric-value">{formatNumber(item.avgbuy, 2)}</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Avg Sell</span>
                      <span className="metric-value">{formatNumber(item.avgsell, 2)}</span>
                    </div>
                  </div>
                </div>

                {/* Company Section */}
                <div className="card-section company-section">
                  <div className="section-header">
                    <i className="fas fa-building"></i>
                    <span>Company</span>
                  </div>
                  <div className="section-content">
                    <div className="order-info">
                      <div className="order-group">
                        <span className="order-label">Buy Orders</span>
                        <div className="order-details">
                          Lot: {formatNumber(item.buysize1)} avg {formatNumber(item.buyprice1, 2)}
                        </div>
                      </div>
                      <div className="order-group">
                        <span className="order-label">Sell Orders</span>
                        <div className="order-details">
                          Lot: {formatNumber(item.sellsize1)} avg {formatNumber(item.sellprice1, 2)}
                        </div>
                      </div>
                    </div>
                    <div className="balance-info">
                      <div className="balance-item">
                        <span>Balance:</span>
                        <span>{formatNumber(item.balance)}</span>
                      </div>
                      <div className="balance-item">
                        <span>Equity:</span>
                        <span>{formatNumber(item.equity)}</span>
                      </div>
                      <div className="balance-item">
                        <span>Floating:</span>
                        <span className={getProfitClass(item.floating)}>{formatNumber(item.floating)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Exp Section */}
                <div className="card-section exp-section">
                  <div className="section-header">
                    <i className="fas fa-users"></i>
                    <span>Exp</span>
                  </div>
                  <div className="section-content">
                    <div className="order-info">
                      <div className="order-group">
                        <span className="order-label">Exp Buy Orders</span>
                        <div className="order-details">
                          Lot: {formatNumber(item.sellsize2)} avg {formatNumber(item.sellprice2, 2)}
                        </div>
                      </div>
                      <div className="order-group">
                        <span className="order-label">Exp Sale Orders</span>
                        <div className="order-details">
                          Lot: {formatNumber(item.buysize2)} avg {formatNumber(item.buyprice2, 2)}
                        </div>
                      </div>
                    </div>
                    <div className="balance-info">
                      <div className="balance-item">
                        <span>Equity:</span>
                        <span>{formatNumber(item.bal || 0)}</span>
                      </div>
                      <div className="balance-item">
                        <span>Floating:</span>
                        <span>{formatNumber(item.bald || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Totals */}
                <div className="card-section totals-section">
                  <div className="section-header">
                    <i className="fas fa-calculator"></i>
                    <span>Totals</span>
                  </div>
                  <div className="section-content">
                    <div className="total-row">
                      <div className="total-item">
                        <span>Buy Lot:</span>
                        <span>{formatNumber(item.buylot)}</span>
                      </div>
                      <div className="total-item">
                        <span>Sell Lot:</span>
                        <span>{formatNumber(item.selllot)}</span>
                      </div>
                    </div>
                    <div className="total-row">
                      <div className="total-item">
                        <span>Ratio:</span>
                        <span>{formatNumber(item.sal || 0)}</span>
                      </div>
                      <div className="total-item">
                        <span>Lot Ratio:</span>
                        <span>{formatNumber(item.sald || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DailySavedDataPage;