const express = require('express');
const router = express.Router();

module.exports = function(pool, { authenticateToken, getAllowedSymbols }, dbHelpers) {
  const { getDbConnection, executeQuery, executeTransaction } = dbHelpers || {};

  // Simple in-memory cache for today's data (expires every 5 minutes)
  let todayCache = {
    date: null,
    data: null,
    timestamp: null,
    symbolKey: null
  };

  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Helper function to get cache key for symbols
  const getSymbolCacheKey = (symbolList) => {
    if (!symbolList || symbolList.length === 0) return 'all';
    return symbolList.sort().join(',');
  };

  // Helper function to check if cache is valid
  const isCacheValid = (todayStr, symbolList) => {
    const now = Date.now();
    const symbolKey = getSymbolCacheKey(symbolList);
    
    return todayCache.date === todayStr && 
           todayCache.symbolKey === symbolKey &&
           todayCache.timestamp && 
           (now - todayCache.timestamp) < CACHE_DURATION;
  };

  // Helper function to get database connection
  const getConnection = async () => {
    if (getDbConnection) {
      return await getDbConnection(pool);
    }
    return await pool.getConnection();
  };

  // Common trade row processing logic
  async function processTradeRowCommon(row, expData, yesterdayBalances, forStorage = false, deposit = 0, withdrawal = 0) {
    const mktprice = parseFloat(row.mktprice) || 0;
    const avgSell1 = parseFloat(row.sellprice1) || 0;
    const avgBuy1 = parseFloat(row.buyprice1) || 0;
    const buysize1 = parseFloat(row.buysize1) || 0;
    const sellsize1 = parseFloat(row.sellsize1) || 0;

    const companyBalance = parseFloat(row.company_balance_raw) || 0;
    const companyEquity = parseFloat(row.company_equity_raw) || 0;
    const companyFloating = parseFloat(row.company_floating_raw) || 0;

    // Get Exp data
    const expBalance = expData[row.symbol_ref]?.balance || 0;
    const expEquity = expData[row.symbol_ref]?.equity || 0;
    const expFloating = expData[row.symbol_ref]?.floating || 0;

    // Explicitly query previous day's exp_floating for this symbol
    let yesterdayExpFloating = 0;
    if (row.trade_date && row.symbol_ref) {
      const yesterday = new Date(row.trade_date);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      if (yesterdayBalances.exp[row.symbol_ref + '_' + yesterdayStr]) {
        yesterdayExpFloating = yesterdayBalances.exp[row.symbol_ref + '_' + yesterdayStr];
      } else if (yesterdayBalances.exp[row.symbol_ref]?.floating) {
        yesterdayExpFloating = yesterdayBalances.exp[row.symbol_ref].floating;
      }
    }
    const expPln = expFloating - yesterdayExpFloating;

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

    // Calculate Account Profit and Company PLN
    const yesterdayCompanyBalance = yesterdayBalances.company[row.symbol_ref]?.balance || 0;
    const yesterdayCompanyEquity = yesterdayBalances.company[row.symbol_ref]?.equity || 0;
    const yesterdayExpBalance = yesterdayBalances.exp[row.symbol_ref] || 0;
    
    const companyBalanceDiff = companyBalance - yesterdayCompanyBalance;
    const expBalanceDiff = expBalance - yesterdayExpBalance;
    const accnPf = companyBalanceDiff - expBalanceDiff;
    
    // Calculate Company PLN = Today's Equity - Yesterday's Equity - Deposit + Withdrawal
    const rawCompanyPln = companyEquity - yesterdayCompanyEquity;
    const companyPln = rawCompanyPln - deposit + withdrawal;
    
    // Debug logging for Company PLN calculation
    if (row.symbol_ref && (companyPln !== 0 || yesterdayCompanyEquity !== 0)) {
      console.log(`Company PLN for ${row.symbol_ref} on ${row.trade_date}: ${companyEquity} - ${yesterdayCompanyEquity} = ${rawCompanyPln}, Deposit=${deposit}, Withdrawal=${withdrawal}, Adjusted=${companyPln}`);
    }

    const result = {
      trade_date: row.trade_date,
      symbol_ref: row.symbol_ref,
      latest_mktprice: Math.round(mktprice * 100) / 100,
      latest_buysize1: Math.round(buysize1 * 100) / 100,
      latest_sellsize1: Math.round(sellsize1 * 100) / 100,
      latest_buysize2: Math.round(buysize2 * 100) / 100,
      latest_sellsize2: Math.round(sellsize2 * 100) / 100,
      buyprice1: Math.round((parseFloat(row.buyprice1) || 0) * 100) / 100,
      sellprice1: Math.round((parseFloat(row.sellprice1) || 0) * 100) / 100,
      buyprice2: Math.round((parseFloat(row.buyprice2) || 0) * 100) / 100,
      sellprice2: Math.round((parseFloat(row.sellprice2) || 0) * 100) / 100,
      company_balance: Math.round(companyBalance * 100) / 100,
      company_equity: Math.round(companyEquity * 100) / 100,
      company_floating: Math.round(companyFloating * 100) / 100,
      company_pln: Math.round(companyPln * 100) / 100,
      company_deposit: Math.round(deposit * 100) / 100,
      company_withdrawal: Math.round(withdrawal * 100) / 100,
      company_realized: Math.round(companyRealized * 100) / 100,
      company_unrealized: Math.round(companyUnrealized * 100) / 100,
      exp_balance: Math.round(expBalance * 100) / 100,
      exp_equity: Math.round(expEquity * 100) / 100,
      exp_floating: Math.round(expFloating * 100) / 100,
      exp_pln: Math.round(expPln * 100) / 100,
      exp_realized: Math.round(expRealized * 100) / 100,
      exp_unrealized: Math.round(expUnrealized * 100) / 100,
      accn_pf: Math.round(accnPf * 100) / 100,
      daily_company_total: Math.round((companyRealized + companyUnrealized) * 100) / 100,
      daily_exp_total: Math.round((expRealized + expUnrealized) * 100) / 100,
      daily_grand_total: Math.round((companyRealized + companyUnrealized - expRealized - expUnrealized) * 100) / 100,
      company_balance_raw: companyBalance,
      company_equity_raw: companyEquity,
      company_floating_raw: companyFloating
    };

    if (forStorage) {
      // For storage, add additional fields
      result.mktprice = result.latest_mktprice;
      result.buysize1 = result.latest_buysize1;
      result.sellsize1 = result.latest_sellsize1;
      result.buysize2 = result.latest_buysize2;
      result.sellsize2 = result.latest_sellsize2;
    }

    return result;
  }

  // Helper function to get Exp data for a single date
  async function getExpDataForDate(conn, date, symbolList) {
    const expData = {};
    
    // Build symbol filter clause
    let symbolFilterClause = '';
    if (symbolList && symbolList.length > 0) {
      symbolFilterClause = `AND su.symbol_ref IN (${symbolList.map(s => `'${s.trim()}'`).join(',')})`;
    }
    
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
      ${symbolFilterClause}
      GROUP BY su.symbol_ref
    `;

    const result = await conn.query(sql, [date]);
    
    for (const row of result) {
      expData[row.symbol_ref] = {
        balance: parseFloat(row.total_exp_balance) || 0,
        equity: parseFloat(row.total_exp_equity) || 0,
        floating: parseFloat(row.total_exp_floating) || 0,
        pln: parseFloat(row.total_exp_pln) || 0
      };
    }

    return expData;
  }

  // Helper function to get yesterday's balances for a single date
  async function getYesterdayBalancesForDate(conn, date, symbolList) {
    const yesterdayBalances = {
      company: {},
      exp: {}
    };

    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    console.log(`🔍 Getting yesterday balances for ${date}, looking for data from ${yesterdayStr}`);

    // Build symbol filter clause
    let symbolFilterClause = '';
    if (symbolList && symbolList.length > 0) {
      symbolFilterClause = `AND symbol_ref IN (${symbolList.map(s => `'${s.trim()}'`).join(',')})`;
    }

    // First, try to get yesterday's data from pl_report_daily table (stored data)
    const sqlStoredData = `
      SELECT 
        symbol_ref, 
        company_balance,
        company_equity
      FROM pl_report_daily 
      WHERE trade_date = ?
      ${symbolFilterClause}
    `;

    const storedResult = await conn.query(sqlStoredData, [yesterdayStr]);
    console.log(`📊 Found ${storedResult.length} stored records for ${yesterdayStr}`);
    
    if (storedResult.length > 0) {
      // Use stored data if available
      for (const row of storedResult) {
        yesterdayBalances.company[row.symbol_ref] = {
          balance: parseFloat(row.company_balance) || 0,
          equity: parseFloat(row.company_equity) || 0
        };
        console.log(`💰 ${row.symbol_ref} yesterday equity from stored: ${row.company_equity}`);
      }
    } else {
      // Fallback: Get company balances from raw trading_data
      const sqlCompany = `
        SELECT 
          symbol_ref, 
          COALESCE(Balance, 0) as balance,
          COALESCE(equity, 0) as equity
        FROM trading_data 
        WHERE DATE(date) = ?
        ${symbolFilterClause}
        GROUP BY symbol_ref
      `;

      const companyResult = await conn.query(sqlCompany, [yesterdayStr]);
      console.log(`📊 Found ${companyResult.length} raw company records for ${yesterdayStr}`);
      
      for (const row of companyResult) {
        yesterdayBalances.company[row.symbol_ref] = {
          balance: parseFloat(row.balance) || 0,
          equity: parseFloat(row.equity) || 0
        };
        console.log(`💰 ${row.symbol_ref} yesterday equity from raw: ${row.equity}`);
      }
    }

    // Get exp balances using the same logic as getExpDataForDate
    const expSymbolFilterClause = symbolList && symbolList.length > 0 
      ? `AND su.symbol_ref IN (${symbolList.map(s => `'${s.trim()}'`).join(',')})` 
      : '';
      
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
      ${expSymbolFilterClause}
      GROUP BY su.symbol_ref
    `;

    const expResult = await conn.query(sqlExp, [yesterdayStr]);
    
    for (const row of expResult) {
      yesterdayBalances.exp[row.symbol_ref] = parseFloat(row.total_exp_balance) || 0;
    }

    return yesterdayBalances;
  }
  // Get years
  const getYears = async (req, res) => {
    let conn;
    try {
      conn = await getConnection();
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
      res.status(500).json({ error: 'Failed to get years: ' + error.message });
    } finally {
      if (conn) conn.release();
    }
  };

  // Get symbols
  const getSymbols = async (req, res) => {
    let conn;
    try {
      conn = await getConnection();
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
      res.status(500).json({ error: 'Failed to get symbols: ' + error.message });
    } finally {
      if (conn) conn.release();
    }
  };

  // Get trading data with daily pre-calculation
  const getTradingData = async (req, res) => {
    let conn;
    try {
      conn = await getConnection();
      const allowedSymbols = await getAllowedSymbols(conn, req);
      
      const year = parseInt(req.query.year) || new Date().getFullYear();
      const month = parseInt(req.query.month) || new Date().getMonth() + 1;
      const page = parseInt(req.query.page) || 1;
      const limit = 31;
      const offset = (page - 1) * limit;
      
      // Build symbol filter
      let symbolList = null;
      if (req.query.symbol_ref) {
        symbolList = req.query.symbol_ref.split(',');
        if (allowedSymbols) {
          symbolList = symbolList.filter(s => allowedSymbols.includes(s));
        }
      } else if (allowedSymbols && allowedSymbols.length > 0) {
        symbolList = allowedSymbols;
      }
      
      // Get current date
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;
      
      // Check if we're requesting current month data
      const isCurrentMonth = (year === currentYear && month === currentMonth);
      
      if (isCurrentMonth) {
        // For current month: get stored data for past days + calculate live data for today
        const { data, totals, totalRecords } = await getMixedData(conn, year, month, symbolList, todayStr, page, limit, offset);
        
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
          filters: { year, month, symbol: req.query.symbol_ref || '' },
          data_info: { 
            current_month: true, 
            live_calculation: true,
            today_calculated_live: true
          }
        });
      } else {
        // For past months: ensure all data is stored, then return stored data
        await ensurePastMonthDataStored(conn, year, month, symbolList);
        const { data, totals, totalRecords } = await getStoredData(conn, year, month, symbolList, page, limit, offset);
        
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
          filters: { year, month, symbol: req.query.symbol_ref || '' },
          data_info: { 
            current_month: false, 
            live_calculation: false,
            all_data_stored: true
          }
        });
      }
    } catch (error) {
      console.error('Error getting trading data:', error);
      res.status(500).json({ error: 'Failed to get trading data: ' + error.message });
    } finally {
      if (conn) conn.release();
    }
  };

  // Get mixed data: stored data for past days + live calculation for today
  async function getMixedData(conn, year, month, symbolList, todayStr, page, limit, offset) {
    // First ensure past days are stored
    await ensureCurrentMonthPastDaysStored(conn, year, month, symbolList, todayStr);
    
    // Calculate today's data live (only if needed)
    const todayData = await calculateLiveDataForToday(conn, todayStr, symbolList);
    
    // Check if today's data exists and if we need it for this page
    const todayCount = todayData.length;
    const hasToday = todayCount > 0;
    
    // Calculate how much stored data we need
    let storedLimit = limit;
    let storedOffset = offset;
    
    if (hasToday && offset === 0) {
      // First page and we have today's data - reduce stored data needed
      storedLimit = Math.max(0, limit - todayCount);
      storedOffset = 0;
    } else if (hasToday && offset > 0) {
      // Not first page - adjust offset to account for today's data
      storedOffset = Math.max(0, offset - todayCount);
    }
    
    // Get only the stored data we actually need (exclude today's data)
    const { data: storedData, totals: storedTotals, totalRecords: storedRecords } = 
      await getStoredData(conn, year, month, symbolList, 1, storedLimit, storedOffset, true);
    
    // Efficiently combine data for this page only
    let combinedData = [];
    if (hasToday && offset === 0) {
      // First page: today's data first, then stored data
      combinedData = [...todayData, ...storedData];
    } else if (hasToday && offset < todayCount) {
      // Page overlaps with today's data
      const todaySlice = todayData.slice(offset, Math.min(offset + limit, todayCount));
      const remainingLimit = limit - todaySlice.length;
      if (remainingLimit > 0 && storedData.length > 0) {
        combinedData = [...todaySlice, ...storedData.slice(0, remainingLimit)];
      } else {
        combinedData = todaySlice;
      }
    } else {
      // Page is all stored data
      combinedData = storedData;
    }
    
    // Calculate totals efficiently - use database totals for stored data + add today's totals
    let totals = { ...storedTotals };
    if (hasToday) {
      const todayTotals = calculateTotalsFromData(todayData);
      Object.keys(totals).forEach(key => {
        totals[key] = Math.round(((totals[key] || 0) + (todayTotals[key] || 0)) * 100) / 100;
      });
    }
    
    const totalRecords = storedRecords + todayCount;
    
    return { 
      data: combinedData, 
      totals, 
      totalRecords 
    };
  }

  // Calculate live data for today only (with caching and auto-storage)
  async function calculateLiveDataForToday(conn, todayStr, symbolList) {
    // Check cache first
    if (isCacheValid(todayStr, symbolList)) {
      console.log('Using cached today data');
      return todayCache.data;
    }

    console.log('Calculating fresh today data');
    
    let symbolFilter = '';
    if (symbolList && symbolList.length > 0) {
      symbolFilter = `AND symbol_ref IN (${symbolList.map(s => `'${s.trim()}'`).join(',')})`;
    }
    
    // Get today's trading data
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
      WHERE DATE(t.date) = ? ${symbolFilter}
      GROUP BY DATE(t.date), t.symbol_ref
    `;
    
    const result = await conn.query(sql, [todayStr]);
    
    if (result.length === 0) {
      // Cache empty result too
      todayCache = {
        date: todayStr,
        data: [],
        timestamp: Date.now(),
        symbolKey: getSymbolCacheKey(symbolList)
      };
      return [];
    }
    
    // Calculate P&L for today's data
    const expData = await getExpDataForDate(conn, todayStr, symbolList);
    const yesterdayBalances = await getYesterdayBalancesForDate(conn, todayStr, symbolList);
    
    const processedData = [];
    for (const row of result) {
      // Get existing deposit/withdrawal values if they exist
      const existingQuery = `
        SELECT company_deposit, company_withdrawal 
        FROM pl_report_daily 
        WHERE trade_date = ? AND symbol_ref = ?
      `;
      const existingResult = await conn.query(existingQuery, [todayStr, row.symbol_ref]);
      
      const deposit = existingResult.length > 0 ? parseFloat(existingResult[0].company_deposit) || 0 : 0;
      const withdrawal = existingResult.length > 0 ? parseFloat(existingResult[0].company_withdrawal) || 0 : 0;
      
      const processed = await processTradeRowCommon(row, expData, yesterdayBalances, false, deposit, withdrawal);
      processedData.push(processed);
    }

    // Auto-store today's data in the database (but don't finalize it)
    try {
      await storeTodayData(conn, todayStr, processedData);
      console.log(`✅ Auto-stored today's data (${processedData.length} records) for ${todayStr}`);
    } catch (error) {
      console.error(`❌ Error auto-storing today's data:`, error.message);
    }

    // Cache the result
    todayCache = {
      date: todayStr,
      data: processedData,
      timestamp: Date.now(),
      symbolKey: getSymbolCacheKey(symbolList)
    };
    
    return processedData;
  }

  // Store today's data in the database (helper function)
  async function storeTodayData(conn, dateStr, processedData) {
    if (!processedData || processedData.length === 0) {
      return;
    }
    
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    
    // Delete existing records for today (in case we're recalculating)
    await conn.query(`DELETE FROM pl_report_daily WHERE trade_date = ?`, [dateStr]);
    
    // Insert today's data
    for (const processed of processedData) {
      const insertSql = `
        INSERT INTO pl_report_daily (
          trade_date, symbol_ref, year, month,
          mktprice, buysize1, sellsize1, buysize2, sellsize2,
          buyprice1, sellprice1, buyprice2, sellprice2,
          company_balance, company_equity, company_floating, company_pln,
          company_deposit, company_withdrawal,
          company_realized, company_unrealized,
          exp_balance, exp_equity, exp_floating, exp_pln,
          exp_realized, exp_unrealized,
          accn_pf, daily_company_total, daily_exp_total, daily_grand_total,
          is_finalized
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      await conn.query(insertSql, [
        processed.trade_date,
        processed.symbol_ref,
        year,
        month,
        processed.latest_mktprice,
        processed.latest_buysize1,
        processed.latest_sellsize1,
        processed.latest_buysize2,
        processed.latest_sellsize2,
        processed.buyprice1,
        processed.sellprice1,
        processed.buyprice2,
        processed.sellprice2,
        processed.company_balance,
        processed.company_equity,
        processed.company_floating,
        processed.company_pln,
        processed.company_deposit,
        processed.company_withdrawal,
        processed.company_realized,
        processed.company_unrealized,
        processed.exp_balance,
        processed.exp_equity,
        processed.exp_floating,
        processed.exp_pln,
        processed.exp_realized,
        processed.exp_unrealized,
        processed.accn_pf,
        processed.daily_company_total,
        processed.daily_exp_total,
        processed.daily_grand_total,
        false // Don't finalize today's data automatically
      ]);
    }
  }

  // Ensure past days in current month are stored
  async function ensureCurrentMonthPastDaysStored(conn, year, month, symbolList, todayStr) {
    // Get all trading dates in this month before today
    let symbolFilter = '';
    if (symbolList && symbolList.length > 0) {
      symbolFilter = `AND symbol_ref IN (${symbolList.map(s => `'${s.trim()}'`).join(',')})`;
    }
    
    const sql = `
      SELECT DISTINCT DATE(date) as trade_date
      FROM trading_data 
      WHERE YEAR(date) = ? AND MONTH(date) = ? AND DATE(date) < ? ${symbolFilter}
      ORDER BY trade_date
    `;
    
    const dates = await conn.query(sql, [year, month, todayStr]);
    
    for (const dateRow of dates) {
      const dateStr = dateRow.trade_date;
      
      // Check if this date is already stored and finalized
      const existsQuery = `
        SELECT COUNT(*) as count 
        FROM pl_report_daily 
        WHERE trade_date = ? AND is_finalized = TRUE
        ${symbolList ? `AND symbol_ref IN (${symbolList.map(s => `'${s.trim()}'`).join(',')})` : ''}
      `;
      
      const existsResult = await conn.query(existsQuery, [dateStr]);
      
      if (existsResult[0].count === 0) {
        // Store this date's data
        await storeDataForDate(conn, dateStr, symbolList, true);
      }
    }
  }

  // Ensure all data for a past month is stored
  async function ensurePastMonthDataStored(conn, year, month, symbolList) {
    console.log(`Ensuring past month data is stored for ${year}-${String(month).padStart(2, '0')}`);
    
    // Get all trading dates in this month
    let symbolFilter = '';
    if (symbolList && symbolList.length > 0) {
      symbolFilter = `AND symbol_ref IN (${symbolList.map(s => `'${s.trim()}'`).join(',')})`;
    }
    
    const sql = `
      SELECT DISTINCT DATE(date) as trade_date
      FROM trading_data 
      WHERE YEAR(date) = ? AND MONTH(date) = ? ${symbolFilter}
      ORDER BY trade_date
    `;
    
    const dates = await conn.query(sql, [year, month]);
    console.log(`Found ${dates.length} trading days to process`);
    
    let processedCount = 0;
    for (const dateRow of dates) {
      const dateStr = dateRow.trade_date;
      
      // Check if this date is already stored and finalized
      const existsQuery = `
        SELECT COUNT(*) as count 
        FROM pl_report_daily 
        WHERE trade_date = ? AND is_finalized = TRUE
        ${symbolList ? `AND symbol_ref IN (${symbolList.map(s => `'${s.trim()}'`).join(',')})` : ''}
      `;
      
      const existsResult = await conn.query(existsQuery, [dateStr]);
      
      if (existsResult[0].count === 0) {
        // Store this date's data
        await storeDataForDate(conn, dateStr, symbolList, true);
        processedCount++;
      }
    }
    
    console.log(`✓ Processed ${processedCount} new dates for ${year}-${String(month).padStart(2, '0')}`);
  }

  // Store data for a specific date
  async function storeDataForDate(conn, dateStr, symbolList, finalize = false) {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    
    let symbolFilter = '';
    if (symbolList && symbolList.length > 0) {
      symbolFilter = `AND symbol_ref IN (${symbolList.map(s => `'${s.trim()}'`).join(',')})`;
    }
    
    // Get trading data for this date
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
      WHERE DATE(t.date) = ? ${symbolFilter}
      GROUP BY DATE(t.date), t.symbol_ref
    `;
    
    const result = await conn.query(sql, [dateStr]);
    
    if (result.length === 0) {
      return;
    }
    
    // Calculate P&L data
    const expData = await getExpDataForDate(conn, dateStr, symbolList);
    const yesterdayBalances = await getYesterdayBalancesForDate(conn, dateStr, symbolList);
    
    // Delete existing records for this date
    await conn.query(`DELETE FROM pl_report_daily WHERE trade_date = ? ${symbolFilter}`, [dateStr]);
    
    // Insert new data
    for (const row of result) {
      // Get existing deposit/withdrawal values if they exist
      const existingQuery = `
        SELECT company_deposit, company_withdrawal 
        FROM pl_report_daily 
        WHERE trade_date = ? AND symbol_ref = ?
      `;
      const existingResult = await conn.query(existingQuery, [row.trade_date, row.symbol_ref]);
      
      const deposit = existingResult.length > 0 ? parseFloat(existingResult[0].company_deposit) || 0 : 0;
      const withdrawal = existingResult.length > 0 ? parseFloat(existingResult[0].company_withdrawal) || 0 : 0;
      
      const processed = await processTradeRowCommon(row, expData, yesterdayBalances, true, deposit, withdrawal);
      processed.year = year;
      processed.month = month;
      processed.is_finalized = finalize;
      
      const insertSql = `
        INSERT INTO pl_report_daily (
          trade_date, symbol_ref, year, month,
          mktprice, buysize1, sellsize1, buysize2, sellsize2,
          buyprice1, sellprice1, buyprice2, sellprice2,
          company_balance, company_equity, company_floating, company_pln,
          company_deposit, company_withdrawal,
          company_realized, company_unrealized,
          exp_balance, exp_equity, exp_floating, exp_pln,
          exp_realized, exp_unrealized,
          accn_pf, daily_company_total, daily_exp_total, daily_grand_total,
          is_finalized
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      await conn.query(insertSql, [
        processed.trade_date,
        processed.symbol_ref,
        processed.year,
        processed.month,
        processed.mktprice,
        processed.buysize1,
        processed.sellsize1,
        processed.buysize2,
        processed.sellsize2,
        processed.buyprice1,
        processed.sellprice1,
        processed.buyprice2,
        processed.sellprice2,
        processed.company_balance,
        processed.company_equity,
        processed.company_floating,
        processed.company_pln,
        processed.company_deposit,
        processed.company_withdrawal,
        processed.company_realized,
        processed.company_unrealized,
        processed.exp_balance,
        processed.exp_equity,
        processed.exp_floating,
        processed.exp_pln,
        processed.exp_realized,
        processed.exp_unrealized,
        processed.accn_pf,
        processed.daily_company_total,
        processed.daily_exp_total,
        processed.daily_grand_total,
        processed.is_finalized
      ]);
    }
  }

  // Get stored data from daily table (excludes today for current month)
  async function getStoredData(conn, year, month, symbolList, page, limit, offset, excludeToday = false) {
    let symbolFilter = '';
    if (symbolList && symbolList.length > 0) {
      symbolFilter = `AND symbol_ref IN (${symbolList.map(s => `'${s.trim()}'`).join(',')})`;
    }
    
    // Add today exclusion for current month
    let dateFilter = '';
    if (excludeToday) {
      const today = new Date().toISOString().split('T')[0];
      dateFilter = `AND trade_date < '${today}'`;
    }
    
    // Get data
    const dataSql = `
      SELECT 
        trade_date,
        symbol_ref,
        mktprice as latest_mktprice,
        buysize1 as latest_buysize1,
        sellsize1 as latest_sellsize1,
        buysize2 as latest_buysize2,
        sellsize2 as latest_sellsize2,
        buyprice1,
        sellprice1,
        buyprice2,
        sellprice2,
        company_balance,
        company_equity,
        company_floating,
        company_pln,
        company_deposit,
        company_withdrawal,
        company_realized,
        company_unrealized,
        exp_balance,
        exp_equity,
        exp_floating,
        exp_pln,
        exp_realized,
        exp_unrealized,
        accn_pf,
        daily_company_total,
        daily_exp_total,
        daily_grand_total,
        company_balance as company_balance_raw,
        company_equity as company_equity_raw,
        company_floating as company_floating_raw
      FROM pl_report_daily 
      WHERE year = ? AND month = ? ${symbolFilter} ${dateFilter}
      ORDER BY trade_date DESC, symbol_ref ASC
      LIMIT ? OFFSET ?
    `;
    
    const data = await conn.query(dataSql, [year, month, limit, offset]);
    
    // Calculate Company PLN for each row on the fly
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      // Get yesterday's equity for this symbol from stored data
      const previousDay = new Date(row.trade_date);
      previousDay.setDate(previousDay.getDate() - 1);
      const yesterdayDate = previousDay.toISOString().split('T')[0];
      
      const yesterdayQuery = `
        SELECT company_equity 
        FROM pl_report_daily 
        WHERE trade_date = ? AND symbol_ref = ?
      `;
      const yesterdayResult = await conn.query(yesterdayQuery, [yesterdayDate, row.symbol_ref]);
      const yesterdayEquity = yesterdayResult.length > 0 ? parseFloat(yesterdayResult[0].company_equity) || 0 : 0;
      
      // Calculate Company PLN = Today's Equity - Yesterday's Equity - Deposit + Withdrawal
      const todayEquity = parseFloat(row.company_equity) || 0;
      const rawCompanyPln = todayEquity - yesterdayEquity;
      const deposit = parseFloat(row.company_deposit) || 0;
      const withdrawal = parseFloat(row.company_withdrawal) || 0;
      const adjustedCompanyPln = rawCompanyPln - deposit + withdrawal;
      
      // Override the stored company_pln with calculated value
      row.company_pln = Math.round(adjustedCompanyPln * 100) / 100;
      
      console.log(`📊 ${row.trade_date} ${row.symbol_ref}: Equity=${todayEquity}, Yesterday=${yesterdayEquity}, Raw PLN=${rawCompanyPln}, Deposit=${deposit}, Withdrawal=${withdrawal}, Adjusted PLN=${row.company_pln}`);
    }
    
    // Get totals (also exclude today if needed)
    const totalsSql = `
      SELECT 
        SUM(company_realized) as company_realized_total,
        SUM(company_unrealized) as company_unrealized_total,
        SUM(company_balance) as company_balance_total,
        SUM(company_equity) as company_equity_total,
        SUM(company_floating) as company_floating_total,
        SUM(company_deposit) as company_deposit_total,
        SUM(company_withdrawal) as company_withdrawal_total,
        SUM(exp_realized) as exp_realized_total,
        SUM(exp_unrealized) as exp_unrealized_total,
        SUM(exp_balance) as exp_balance_total,
        SUM(exp_equity) as exp_equity_total,
        SUM(exp_floating) as exp_floating_total,
        SUM(exp_pln) as exp_pln_total,
        SUM(accn_pf) as accn_pf_total
      FROM pl_report_daily 
      WHERE year = ? AND month = ? ${symbolFilter} ${dateFilter}
    `;
    
    const totalsResult = await conn.query(totalsSql, [year, month]);
    const totals = totalsResult[0] || {};
    
    // Recalculate Company PLN total from our calculated values
    totals.company_pln_total = data.reduce((sum, row) => sum + (parseFloat(row.company_pln) || 0), 0);
    
    // Round totals
    Object.keys(totals).forEach(key => {
      totals[key] = Math.round((totals[key] || 0) * 100) / 100;
    });
    
    // Get total count (also exclude today if needed)
    const countSql = `
      SELECT COUNT(*) as total 
      FROM pl_report_daily 
      WHERE year = ? AND month = ? ${symbolFilter} ${dateFilter}
    `;
    
    const countResult = await conn.query(countSql, [year, month]);
    const totalRecords = countResult[0].total;
    
    return { data, totals, totalRecords };
  }

  // Calculate totals from an array of data
  function calculateTotalsFromData(data) {
    const totals = {
      company_realized_total: 0,
      company_unrealized_total: 0,
      company_balance_total: 0,
      company_equity_total: 0,
      company_floating_total: 0,
      company_pln_total: 0,
      exp_realized_total: 0,
      exp_unrealized_total: 0,
      exp_balance_total: 0,
      exp_equity_total: 0,
      exp_floating_total: 0,
      exp_pln_total: 0,
      accn_pf_total: 0
    };

    for (const row of data) {
      totals.company_realized_total += parseFloat(row.company_realized || 0);
      totals.company_unrealized_total += parseFloat(row.company_unrealized || 0);
      totals.company_balance_total += parseFloat(row.company_balance || 0);
      totals.company_equity_total += parseFloat(row.company_equity || 0);
      totals.company_floating_total += parseFloat(row.company_floating || 0);
      totals.company_pln_total += parseFloat(row.company_pln || 0);
      totals.exp_realized_total += parseFloat(row.exp_realized || 0);
      totals.exp_unrealized_total += parseFloat(row.exp_unrealized || 0);
      totals.exp_balance_total += parseFloat(row.exp_balance || 0);
      totals.exp_equity_total += parseFloat(row.exp_equity || 0);
      totals.exp_floating_total += parseFloat(row.exp_floating || 0);
      totals.exp_pln_total += parseFloat(row.exp_pln || 0);
      totals.accn_pf_total += parseFloat(row.accn_pf || 0);
    }

    // Round totals
    Object.keys(totals).forEach(key => {
      totals[key] = Math.round(totals[key] * 100) / 100;
    });

    return totals;
  }

  // Management endpoints
  const finalizeDay = async (req, res) => {
    let conn;
    try {
      conn = await getConnection();
      const { date } = req.body;
      
      if (!date) {
        return res.status(400).json({ error: 'Date is required' });
      }
      
      // Mark the day as finalized
      await conn.query(
        'UPDATE pl_report_daily SET is_finalized = TRUE WHERE trade_date = ?',
        [date]
      );
      
      res.json({ success: true, message: `Day ${date} has been finalized` });
    } catch (error) {
      console.error('Error finalizing day:', error);
      res.status(500).json({ error: 'Failed to finalize day' });
    } finally {
      if (conn) conn.release();
    }
  };

  const getStorageStats = async (req, res) => {
    let conn;
    try {
      conn = await getConnection();
      
      const stats = await conn.query(`
        SELECT 
          year,
          month,
          COUNT(*) as record_count,
          COUNT(DISTINCT symbol_ref) as symbol_count,
          SUM(CASE WHEN is_finalized = TRUE THEN 1 ELSE 0 END) as finalized_count,
          MIN(updated_at) as oldest_update,
          MAX(updated_at) as latest_update
        FROM pl_report_daily
        GROUP BY year, month
        ORDER BY year DESC, month DESC
      `);
      
      const totalRecords = await conn.query('SELECT COUNT(*) as total FROM pl_report_daily');
      
      res.json({
        success: true,
        stats,
        total_records: totalRecords[0].total
      });
    } catch (error) {
      console.error('Error getting storage stats:', error);
      res.status(500).json({ error: 'Failed to get storage stats' });
    } finally {
      if (conn) conn.release();
    }
  };

  const rebuildMonth = async (req, res) => {
    let conn;
    try {
      conn = await getConnection();
      
      console.log('🔄 Starting complete rebuild of all P&L data...');
      
      // Delete ALL existing data
      const deleteResult = await conn.query('DELETE FROM pl_report_daily');
      console.log(`✅ Deleted ${deleteResult.affectedRows} existing records`);
      
      // Get ALL trading dates from trading_data
      const datesQuery = `
        SELECT DISTINCT DATE(date) as trade_date, YEAR(date) as year, MONTH(date) as month
        FROM trading_data 
        WHERE date IS NOT NULL
        ORDER BY trade_date
      `;
      
      const dates = await conn.query(datesQuery);
      console.log(`📅 Found ${dates.length} trading days to recalculate`);
      
      let processedCount = 0;
      for (const dateRow of dates) {
        const dateStr = dateRow.trade_date;
        const year = dateRow.year;
        const month = dateRow.month;
        
        try {
          await storeDataForDate(conn, dateStr, null, true);
          processedCount++;
          console.log(`✅ ${processedCount}/${dates.length} - Completed ${dateStr}`);
        } catch (error) {
          console.error(`❌ Error processing ${dateStr}:`, error.message);
        }
      }
      
      console.log(`🎉 Rebuild complete! Processed ${processedCount}/${dates.length} dates`);
      
      res.json({ 
        success: true, 
        message: `Complete rebuild finished! Processed ${processedCount}/${dates.length} dates`,
        processed: processedCount,
        total: dates.length
      });
    } catch (error) {
      console.error('❌ Rebuild failed:', error);
      res.status(500).json({ error: 'Failed to rebuild data: ' + error.message });
    } finally {
      if (conn) conn.release();
    }
  };

  // Update deposit/withdrawal for a specific date and symbol
  const updateDepositWithdrawal = async (req, res) => {
    let conn;
    try {
      conn = await getConnection();
      const { trade_date, symbol_ref, deposit, withdrawal } = req.body;
      
      console.log('Update request received:', { trade_date, symbol_ref, deposit, withdrawal });
      
      if (!trade_date || !symbol_ref) {
        return res.status(400).json({ error: 'trade_date and symbol_ref are required' });
      }
      
      const depositAmount = parseFloat(deposit) || 0;
      const withdrawalAmount = parseFloat(withdrawal) || 0;
      
      // Check if record exists
      const checkSql = `
        SELECT * FROM pl_report_daily 
        WHERE trade_date = ? AND symbol_ref = ?
      `;
      
      const existing = await conn.query(checkSql, [trade_date, symbol_ref]);
      console.log(`Found ${existing.length} existing records for ${trade_date} ${symbol_ref}`);
      
      if (existing.length === 0) {
        // No record exists yet - create a minimal record for deposit/withdrawal tracking
        const insertSql = `
          INSERT INTO pl_report_daily (
            trade_date, symbol_ref, year, month,
            company_deposit, company_withdrawal,
            mktprice, buysize1, sellsize1, buysize2, sellsize2,
            buyprice1, sellprice1, buyprice2, sellprice2,
            company_balance, company_equity, company_floating, company_pln,
            company_realized, company_unrealized,
            exp_balance, exp_equity, exp_floating, exp_pln,
            exp_realized, exp_unrealized,
            accn_pf, daily_company_total, daily_exp_total, daily_grand_total,
            is_finalized
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const date = new Date(trade_date);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        
        await conn.query(insertSql, [
          trade_date, symbol_ref, year, month, 
          depositAmount, withdrawalAmount,
          0, 0, 0, 0, 0,  // mktprice, buysize1, sellsize1, buysize2, sellsize2
          0, 0, 0, 0,     // buyprice1, sellprice1, buyprice2, sellprice2
          0, 0, 0, 0,     // company_balance, company_equity, company_floating, company_pln
          0, 0,           // company_realized, company_unrealized
          0, 0, 0, 0,     // exp_balance, exp_equity, exp_floating, exp_pln
          0, 0,           // exp_realized, exp_unrealized
          0, 0, 0, 0,     // accn_pf, daily_company_total, daily_exp_total, daily_grand_total
          false           // is_finalized
        ]);
        
        console.log(`✅ Created new record for ${trade_date} ${symbol_ref} with Deposit=${depositAmount}, Withdrawal=${withdrawalAmount}`);
      } else {
        // Update existing record
        const updateSql = `
          UPDATE pl_report_daily 
          SET company_deposit = ?, company_withdrawal = ?, updated_at = CURRENT_TIMESTAMP
          WHERE trade_date = ? AND symbol_ref = ?
        `;
        
        const updateResult = await conn.query(updateSql, [depositAmount, withdrawalAmount, trade_date, symbol_ref]);
        console.log('Update result:', updateResult);
        
        console.log(`✅ Updated deposit/withdrawal for ${trade_date} ${symbol_ref}: Deposit=${depositAmount}, Withdrawal=${withdrawalAmount}`);
      }
      
      res.json({ 
        success: true, 
        message: 'Deposit/withdrawal updated successfully',
        data: {
          trade_date,
          symbol_ref,
          deposit: depositAmount,
          withdrawal: withdrawalAmount
        }
      });
    } catch (error) {
      console.error('Error updating deposit/withdrawal:', error);
      res.status(500).json({ error: 'Failed to update deposit/withdrawal: ' + error.message });
    } finally {
      if (conn) conn.release();
    }
  };

  // Get deposit/withdrawal values for a specific date and symbol
  const getDepositWithdrawal = async (req, res) => {
    let conn;
    try {
      conn = await getConnection();
      const { trade_date, symbol_ref } = req.query;
      
      if (!trade_date || !symbol_ref) {
        return res.status(400).json({ error: 'trade_date and symbol_ref are required' });
      }
      
      const sql = `
        SELECT company_deposit, company_withdrawal 
        FROM pl_report_daily 
        WHERE trade_date = ? AND symbol_ref = ?
      `;
      
      const result = await conn.query(sql, [trade_date, symbol_ref]);
      
      if (result.length === 0) {
        return res.json({ 
          deposit: 0, 
          withdrawal: 0 
        });
      }
      
      res.json({
        deposit: parseFloat(result[0].company_deposit) || 0,
        withdrawal: parseFloat(result[0].company_withdrawal) || 0
      });
    } catch (error) {
      console.error('Error getting deposit/withdrawal:', error);
      res.status(500).json({ error: 'Failed to get deposit/withdrawal: ' + error.message });
    } finally {
      if (conn) conn.release();
    }
  };

  // Insert trading data handler
  const insertTradingData = async (req, res) => {
    let conn;
    try {
      conn = await getConnection();
      const allowedSymbols = await getAllowedSymbols(conn, req);
      
      const {
        symbol_ref, mktprice, buysize1, buyprice1, sellsize1, sellprice1,
        buysize2, buyprice2, sellsize2, sellprice2, type, balance, equity, 
        profit_and_loss, floating
      } = req.body;
      
      if (!symbol_ref) {
        return res.status(400).json({ success: false, message: 'Symbol is required' });
      }

      if (allowedSymbols && !allowedSymbols.includes(symbol_ref)) {
        return res.status(403).json({ success: false, message: 'Access denied to this symbol' });
      }

      const query = `
        INSERT INTO trading_data (
          symbol_ref, mktprice, buysize1, buyprice1, sellsize1, sellprice1,
          buysize2, buyprice2, sellsize2, sellprice2, type, balance, equity,
          profit_and_loss, floating, date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      const params = [
        symbol_ref,
        parseFloat(mktprice) || 0,
        parseFloat(buysize1) || 0,
        parseFloat(buyprice1) || 0,
        parseFloat(sellsize1) || 0,
        parseFloat(sellprice1) || 0,
        parseFloat(buysize2) || 0,
        parseFloat(buyprice2) || 0,
        parseFloat(sellsize2) || 0,
        parseFloat(sellprice2) || 0,
        type || null,
        parseFloat(balance) || 0,
        parseFloat(equity) || 0,
        parseFloat(profit_and_loss) || 0,
        parseFloat(floating) || 0
      ];

      const result = await conn.query(query, params);

      res.json({
        success: true,
        message: 'Trading data inserted successfully',
        id: result.insertId
      });

    } catch (error) {
      console.error('Error inserting trading data:', error);
      res.status(500).json({ success: false, message: 'Failed to insert trading data: ' + error.message });
    } finally {
      if (conn) conn.release();
    }
  };

  // Delete trading data handler
  const deleteTradingData = async (req, res) => {
    let conn;
    try {
      conn = await getConnection();
      const allowedSymbols = await getAllowedSymbols(conn, req);
      
      const { ids } = req.body;
      
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, message: 'No IDs provided' });
      }

      // Check permissions for each record
      // Only check permissions for managed users (when allowedSymbols is an array)
      if (Array.isArray(allowedSymbols)) {
        const checkQuery = `SELECT id, symbol_ref FROM trading_data WHERE id IN (${ids.map(() => '?').join(',')})`;
        const records = await conn.query(checkQuery, ids);
        
        for (const record of records) {
          if (!allowedSymbols.includes(record.symbol_ref)) {
            return res.status(403).json({ 
              success: false, 
              message: `Access denied to symbol ${record.symbol_ref}` 
            });
          }
        }
      }
      // For regular users (allowedSymbols === null), no permission check needed

      const deleteQuery = `DELETE FROM trading_data WHERE id IN (${ids.map(() => '?').join(',')})`;
      const result = await conn.query(deleteQuery, ids);

      res.json({
        success: true,
        message: `${result.affectedRows} records deleted successfully`,
        affectedRows: result.affectedRows
      });

    } catch (error) {
      console.error('Error deleting trading data:', error);
      res.status(500).json({ success: false, message: 'Failed to delete trading data: ' + error.message });
    } finally {
      if (conn) conn.release();
    }
  };

  // CSV Export function for P&L Report
  const exportCSV = async (req, res) => {
    let conn;
    try {
      const safeGetConnection = async () => {
        if (getDbConnection) {
          return await getDbConnection(pool);
        }
        return await pool.getConnection();
      };

      conn = await safeGetConnection();
      const allowed = await getAllowedSymbols(conn, req);

      const { year, month, symbols } = req.query;
      let symbolList = [];

      if (symbols) {
        symbolList = Array.isArray(symbols) ? symbols : [symbols];
        if (allowed !== null) {
          symbolList = symbolList.filter(s => allowed.includes(s));
        }
      } else if (allowed !== null) {
        symbolList = allowed;
      }

      if (Array.isArray(allowed) && allowed.length === 0) {
        return res.json([]);
      }

      // Build query for CSV export
      let query = `
        SELECT 
          symbolref, refid, type, buyprice, sellprice, buysize, sellsize,
          profit_loss, commision, swap, volume,
          DATE_FORMAT(date, '%Y-%m-%d %H:%i:%s') as date
        FROM trading_data 
        WHERE 1=1
      `;
      const params = [];

      if (year) {
        query += ' AND YEAR(date) = ?';
        params.push(year);
      }

      if (month) {
        query += ' AND MONTH(date) = ?';
        params.push(month);
      }

      if (symbolList && symbolList.length > 0) {
        query += ` AND symbolref IN (${symbolList.map(() => '?').join(',')})`;
        params.push(...symbolList);
      }

      query += ' ORDER BY date DESC';

      const rows = await conn.query(query, params);

      // Set CSV headers
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="pl_report.csv"');

      // Create CSV content
      const headers = ['Symbol Ref', 'Ref ID', 'Type', 'Buy Price', 'Sell Price', 'Buy Size', 'Sell Size', 'Profit/Loss', 'Commission', 'Swap', 'Volume', 'Date'];
      let csvContent = headers.join(',') + '\n';

      rows.forEach(row => {
        const csvRow = [
          row.symbolref || '',
          row.refid || '',
          row.type || '',
          row.buyprice || 0,
          row.sellprice || 0,
          row.buysize || 0,
          row.sellsize || 0,
          row.profit_loss || 0,
          row.commision || 0,
          row.swap || 0,
          row.volume || 0,
          row.date || ''
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
        csvContent += csvRow + '\n';
      });

      res.send(csvContent);
    } catch (error) {
      console.error('Error exporting P&L CSV:', error);
      res.status(500).json({ success: false, message: 'CSV export failed: ' + error.message });
    } finally {
      if (conn) conn.release();
    }
  };

  // Mount routes
  router.get('/get_years', authenticateToken, getYears);
  router.get('/get_symbols', authenticateToken, getSymbols);
  router.get('/get_trading_data', authenticateToken, getTradingData);
  
  // CRUD routes
  router.post('/insert_trading_data', authenticateToken, insertTradingData);
  router.delete('/delete_trading_data', authenticateToken, deleteTradingData);
  
  // Management routes
  router.post('/finalize_day', authenticateToken, finalizeDay);
  router.get('/storage_stats', authenticateToken, getStorageStats);
  router.post('/rebuild_all', authenticateToken, rebuildMonth);
  router.post('/update_deposit_withdrawal', authenticateToken, updateDepositWithdrawal);
  router.get('/get_deposit_withdrawal', authenticateToken, getDepositWithdrawal);
  router.get('/export-csv', authenticateToken, exportCSV);

  return {
    router,
    _years: [authenticateToken, getYears],
    _symbols: [authenticateToken, getSymbols],
    _data: [authenticateToken, getTradingData],
    _exportCSV: [authenticateToken, exportCSV]
  };
};
