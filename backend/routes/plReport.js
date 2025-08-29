const express = require('express');
const router = express.Router();

module.exports = function(pool, { authenticateToken, getAllowedSymbols }) {
  // Get years
  const getYears = async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const sql = "SELECT DISTINCT YEAR(date) as year FROM trading_data WHERE date IS NOT NULL ORDER BY year DESC";
      const result = await conn.query(sql);
      
      const years = result.map(row => parseInt(row.year));
      const currentYear = new Date().getFullYear();
      
      if (!years.includes(currentYear)) {
        years.unshift(currentYear);
      }
      
      res.json({ years });
    } catch (error) {
      console.error('Error getting years:', error);
      res.status(500).json({ error: 'Failed to get years' });
    } finally {
      if (conn) conn.release();
    }
  };

  // Get symbols
  const getSymbols = async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const allowedSymbols = await getAllowedSymbols(conn, req);
      
      let sql = "SELECT DISTINCT symbol_ref FROM trading_data WHERE symbol_ref IS NOT NULL AND symbol_ref != '' ORDER BY symbol_ref";
      const result = await conn.query(sql);
      
      let symbols = result.map(row => row.symbol_ref);
      
      if (allowedSymbols) {
        symbols = symbols.filter(symbol => allowedSymbols.includes(symbol));
      }
      
      res.json({ symbols });
    } catch (error) {
      console.error('Error getting symbols:', error);
      res.status(500).json({ error: 'Failed to get symbols' });
    } finally {
      if (conn) conn.release();
    }
  };

  // Get trading data
  const getTradingData = async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const allowedSymbols = await getAllowedSymbols(conn, req);
      
      const year = parseInt(req.query.year) || new Date().getFullYear();
      const month = parseInt(req.query.month) || new Date().getMonth() + 1;
      const page = parseInt(req.query.page) || 1;
      const limit = 31;
      const offset = (page - 1) * limit;
      
      let symbolFilter = '';
      if (req.query.symbol_ref) {
        const symbols = req.query.symbol_ref.split(',');
        if (allowedSymbols) {
          symbols = symbols.filter(s => allowedSymbols.includes(s));
        }
        if (symbols.length > 0) {
          symbolFilter = ` AND t.symbol_ref IN (${symbols.map(s => `'${s}'`).join(',')})`;
        }
      } else if (allowedSymbols) {
        symbolFilter = ` AND t.symbol_ref IN (${allowedSymbols.map(s => `'${s}'`).join(',')})`;
      }
      
      // Build WHERE clause
      const where = `WHERE YEAR(t.date) = ${year} AND MONTH(t.date) = ${month}${symbolFilter}`;
      
      // Get trading data with balance, equity, floating
      const sql = `
        SELECT 
          DATE(t.date) as trade_date,
          t.symbol_ref,
          t.mktprice,
          t.buysize1,
          t.sellsize1,
          t.buysize2,
          t.sellsize2,
          t.buyprice1,
          t.sellprice1,
          t.buyprice2,
          t.sellprice2,
          t.Balance as company_balance_raw,
          t.equity as company_equity_raw,
          t.floating as company_floating_raw
        FROM trading_data t
        ${where}
        GROUP BY DATE(t.date), t.symbol_ref
        ORDER BY trade_date DESC, t.symbol_ref ASC
        LIMIT ? OFFSET ?
      `;
      
      const result = await conn.query(sql, [limit, offset]);
      
      // Process data and calculate totals
      const data = [];
      const totals = {
        company_realized_total: 0,
        company_unrealized_total: 0,
        company_balance_total: 0,
        company_equity_total: 0,
        company_floating_total: 0,
        exp_realized_total: 0,
        exp_unrealized_total: 0,
        exp_balance_total: 0,
        exp_equity_total: 0,
        exp_floating_total: 0,
        exp_pln_total: 0,
        accn_pf_total: 0
      };

      // Get unique dates for additional calculations
      const dates = result.map(row => row.trade_date);
      const uniqueDates = [...new Set(dates)].sort();

      // Get Exp data
      const expData = await getExpData(conn, uniqueDates, req.query.symbol_ref);

      // Get yesterday's balances
      const yesterdayBalances = await getYesterdayBalances(conn, uniqueDates, req.query.symbol_ref, expData);

      // Process each row
      for (const row of result) {
        const processedRow = await processTradeRow(row, expData, yesterdayBalances);
        data.push(processedRow);

        // Update totals
        Object.keys(totals).forEach(key => {
          totals[key] += processedRow[key.replace('_total', '')] || 0;
        });
      }

      // Round totals
      Object.keys(totals).forEach(key => {
        totals[key] = Math.round(totals[key] * 100) / 100;
      });

      // Get total count for pagination
      const countSql = `SELECT COUNT(DISTINCT DATE(date), symbol_ref) as total FROM trading_data t ${where}`;
      const countResult = await conn.query(countSql);
      const totalRecords = countResult[0].total;
      const totalPages = Math.ceil(totalRecords / limit);

      res.json({
        success: true,
        data,
        totals,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_records: parseInt(totalRecords),
          records_per_page: limit
        },
        filters: {
          year,
          month,
          symbol: req.query.symbol_ref || ''
        }
      });
    } catch (error) {
      console.error('Error getting trading data:', error);
      res.status(500).json({ error: 'Failed to get trading data' });
    } finally {
      if (conn) conn.release();
    }
  };

  // Helper function to process a single trade row
  async function processTradeRow(row, expData, yesterdayBalances) {
    const mktprice = parseFloat(row.mktprice) || 0;
    const avgSell1 = parseFloat(row.sellprice1) || 0;
    const avgBuy1 = parseFloat(row.buyprice1) || 0;
    const buysize1 = parseFloat(row.buysize1) || 0;
    const sellsize1 = parseFloat(row.sellsize1) || 0;

    const companyBalance = parseFloat(row.company_balance_raw) || 0;
    const companyEquity = parseFloat(row.company_equity_raw) || 0;
    const companyFloating = parseFloat(row.company_floating_raw) || 0;

    // Get Exp data
    const expBalance = expData[row.trade_date]?.[row.symbol_ref]?.balance || 0;
    const expEquity = expData[row.trade_date]?.[row.symbol_ref]?.equity || 0;
    const expFloating = expData[row.trade_date]?.[row.symbol_ref]?.floating || 0;
    const expPln = expData[row.trade_date]?.[row.symbol_ref]?.pln || 0;

    // Calculate realized and unrealized P&L
    let companyRealized = 0;
    let companyUnrealized = 0;
    let expRealized = 0;
    let expUnrealized = 0;

    if (avgSell1 > 0 && avgBuy1 > 0) {
      if (buysize1 > 0 && sellsize1 > 0) {
        const minLot1 = Math.min(buysize1, sellsize1);
        companyRealized = (avgSell1 - avgBuy1) * minLot1;
      }

      if (buysize1 > sellsize1) {
        companyUnrealized = (buysize1 - sellsize1) * (mktprice - avgBuy1);
      } else if (sellsize1 > buysize1) {
        companyUnrealized = (sellsize1 - buysize1) * (avgSell1 - mktprice);
      }
    }

    // Exp calculations (Level 2)
    const avgSell2 = parseFloat(row.sellprice2) || 0;
    const avgBuy2 = parseFloat(row.buyprice2) || 0;
    const buysize2 = parseFloat(row.buysize2) || 0;
    const sellsize2 = parseFloat(row.sellsize2) || 0;

    if (avgSell2 > 0 && avgBuy2 > 0) {
      if (buysize2 > 0 && sellsize2 > 0) {
        const minLot2 = Math.min(buysize2, sellsize2);
        expRealized = ((avgSell2 - avgBuy2) * minLot2) * -1;
      }

      if (buysize2 > sellsize2) {
        expUnrealized = ((buysize2 - sellsize2) * (mktprice - avgBuy2)) * -1;
      } else if (sellsize2 > buysize2) {
        expUnrealized = ((sellsize2 - buysize2) * (avgSell2 - mktprice)) * -1;
      }
    }

    // Calculate Account Profit
    const yesterdayCompanyBalance = yesterdayBalances.company[row.trade_date]?.[row.symbol_ref] || 0;
    const yesterdayExpBalance = yesterdayBalances.exp[row.trade_date]?.[row.symbol_ref] || 0;
    
    const companyBalanceDiff = companyBalance - yesterdayCompanyBalance;
    const expBalanceDiff = expBalance - yesterdayExpBalance;
    const accnPf = companyBalanceDiff - expBalanceDiff;

    return {
      ...row,
      latest_mktprice: mktprice,
      latest_buysize1: buysize1,
      latest_sellsize1: sellsize1,
      latest_buysize2: buysize2,
      latest_sellsize2: sellsize2,
      company_realized: Math.round(companyRealized * 100) / 100,
      company_unrealized: Math.round(companyUnrealized * 100) / 100,
      company_balance: Math.round(companyBalance * 100) / 100,
      company_equity: Math.round(companyEquity * 100) / 100,
      company_floating: Math.round(companyFloating * 100) / 100,
      exp_realized: Math.round(expRealized * 100) / 100,
      exp_unrealized: Math.round(expUnrealized * 100) / 100,
      exp_balance: Math.round(expBalance * 100) / 100,
      exp_equity: Math.round(expEquity * 100) / 100,
      exp_floating: Math.round(expFloating * 100) / 100,
      exp_pln: Math.round(expPln * 100) / 100,
      accn_pf: Math.round(accnPf * 100) / 100,
      daily_company_total: Math.round((companyRealized + companyUnrealized) * 100) / 100,
      daily_exp_total: Math.round((expRealized + expUnrealized) * 100) / 100,
      daily_grand_total: Math.round((companyRealized + companyUnrealized - expRealized - expUnrealized) * 100) / 100
    };
  }

  // Helper function to get Exp data
  async function getExpData(conn, dates, symbolFilter) {
    const expData = {};
    
    for (const date of dates) {
      const sql = `
        SELECT 
          su.symbol_ref,
          SUM(COALESCE(cd.balance, 0)) as total_exp_balance,
          SUM(COALESCE(cd.equity, 0)) as total_exp_equity,
          SUM(COALESCE(cd.floating, 0)) as total_exp_floating,
          SUM(COALESCE(cd.profit_loss, 0) + COALESCE(cd.profit_loss_last, 0)) as total_exp_pln
        FROM sub_users su
        LEFT JOIN (
          SELECT 
            mt5,
            balance,
            equity,
            floating,
            profit_loss,
            profit_loss_last,
            ROW_NUMBER() OVER (PARTITION BY mt5 ORDER BY created_at DESC) as rn
          FROM customer_data
          WHERE DATE(created_at) <= ?
        ) cd ON su.sub_username = cd.mt5 AND cd.rn = 1
        WHERE su.symbol_ref IS NOT NULL AND su.symbol_ref != ''
        ${symbolFilter ? `AND su.symbol_ref IN (${symbolFilter.split(',').map(s => `'${s.trim()}'`).join(',')})` : ''}
        GROUP BY su.symbol_ref
      `;

      const result = await conn.query(sql, [date]);
      expData[date] = {};
      
      for (const row of result) {
        expData[date][row.symbol_ref] = {
          balance: parseFloat(row.total_exp_balance) || 0,
          equity: parseFloat(row.total_exp_equity) || 0,
          floating: parseFloat(row.total_exp_floating) || 0,
          pln: parseFloat(row.total_exp_pln) || 0
        };
      }
    }

    return expData;
  }

  // Helper function to get yesterday's balances
  async function getYesterdayBalances(conn, dates, symbolFilter, expData) {
    const yesterdayBalances = {
      company: {},
      exp: {}
    };

    for (const date of dates) {
      const yesterday = new Date(date);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      // Get company balances
      const sqlCompany = `
        SELECT symbol_ref, COALESCE(Balance, 0) as balance 
        FROM trading_data 
        WHERE DATE(date) = ?
        ${symbolFilter ? `AND symbol_ref IN (${symbolFilter.split(',').map(s => `'${s.trim()}'`).join(',')})` : ''}
        GROUP BY symbol_ref
      `;

      const companyResult = await conn.query(sqlCompany, [yesterdayStr]);
      yesterdayBalances.company[date] = {};
      
      for (const row of companyResult) {
        yesterdayBalances.company[date][row.symbol_ref] = parseFloat(row.balance) || 0;
      }

      // Get exp balances using the same logic as getExpData
      const sqlExp = `
        SELECT 
          su.symbol_ref,
          SUM(COALESCE(cd.balance, 0)) as total_exp_balance
        FROM sub_users su
        LEFT JOIN (
          SELECT 
            mt5,
            balance,
            ROW_NUMBER() OVER (PARTITION BY mt5 ORDER BY created_at DESC) as rn
          FROM customer_data
          WHERE DATE(created_at) <= ?
        ) cd ON su.sub_username = cd.mt5 AND cd.rn = 1
        WHERE su.symbol_ref IS NOT NULL AND su.symbol_ref != ''
        ${symbolFilter ? `AND su.symbol_ref IN (${symbolFilter.split(',').map(s => `'${s.trim()}'`).join(',')})` : ''}
        GROUP BY su.symbol_ref
      `;

      const expResult = await conn.query(sqlExp, [yesterdayStr]);
      yesterdayBalances.exp[date] = {};
      
      for (const row of expResult) {
        yesterdayBalances.exp[date][row.symbol_ref] = parseFloat(row.total_exp_balance) || 0;
      }
    }

    return yesterdayBalances;
  }

  // Mount routes
  router.get('/get_years', authenticateToken, getYears);
  router.get('/get_symbols', authenticateToken, getSymbols);
  router.get('/get_trading_data', authenticateToken, getTradingData);

  return {
    router,
    _years: [authenticateToken, getYears],
    _symbols: [authenticateToken, getSymbols],
    _data: [authenticateToken, getTradingData]
  };
};
