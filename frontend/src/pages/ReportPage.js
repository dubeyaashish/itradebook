import React, { useEffect, useState } from 'react';
import TradingTable from '../components/TradingTable';
import '../App.css';

const ReportPage = () => {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('http://localhost:3001/api/data')
      .then((res) => res.json())
      .then((data) => setRows(data.rows || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>iTradeBook Report</h1>
      </header>
      {error && <p className="error">{error}</p>}
      <TradingTable rows={rows} />
    </div>
  );
};

export default ReportPage;
