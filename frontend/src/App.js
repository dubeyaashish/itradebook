import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ReportPage from './pages/ReportPage';

const App = () => (
  <Router>
    <Routes>
      <Route path="/" element={<ReportPage />} />
    </Routes>
  </Router>
);

export default App;
