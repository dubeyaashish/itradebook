-- P&L Report Cache Table
-- This table stores pre-calculated daily P&L data to improve performance

CREATE TABLE IF NOT EXISTS pl_report_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cache_date DATE NOT NULL,
  symbol_ref VARCHAR(50) NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL,
  
  -- Market data
  mktprice DECIMAL(20,8),
  buysize1 DECIMAL(20,8),
  sellsize1 DECIMAL(20,8),
  buysize2 DECIMAL(20,8),
  sellsize2 DECIMAL(20,8),
  buyprice1 DECIMAL(20,8),
  sellprice1 DECIMAL(20,8),
  buyprice2 DECIMAL(20,8),
  sellprice2 DECIMAL(20,8),
  
  -- Company data
  company_balance DECIMAL(20,8),
  company_equity DECIMAL(20,8),
  company_floating DECIMAL(20,8),
  company_realized DECIMAL(20,8),
  company_unrealized DECIMAL(20,8),
  
  -- Exp data
  exp_balance DECIMAL(20,8),
  exp_equity DECIMAL(20,8),
  exp_floating DECIMAL(20,8),
  exp_pln DECIMAL(20,8),
  exp_realized DECIMAL(20,8),
  exp_unrealized DECIMAL(20,8),
  
  -- Calculated totals
  accn_pf DECIMAL(20,8),
  daily_company_total DECIMAL(20,8),
  daily_exp_total DECIMAL(20,8),
  daily_grand_total DECIMAL(20,8),
  
  -- Cache metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes for performance
  UNIQUE KEY unique_date_symbol (cache_date, symbol_ref),
  INDEX idx_year_month (year, month),
  INDEX idx_symbol_ref (symbol_ref),
  INDEX idx_cache_date (cache_date),
  INDEX idx_updated_at (updated_at)
);
