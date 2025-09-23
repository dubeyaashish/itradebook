const mariadb = require('mariadb');

// Database configuration
const pool = mariadb.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'itradebook_db',
  connectionLimit: 5,
  acquireTimeout: 30000,
  timeout: 30000
});

async function rebuildMonth(year, month) {
  let conn;
  try {
    console.log(`🔄 Starting rebuild for ${year}-${String(month).padStart(2, '0')}`);
    
    conn = await pool.getConnection();
    
    // Delete existing data for the month
    const deleteResult = await conn.query(
      'DELETE FROM pl_report_daily WHERE year = ? AND month = ?', 
      [year, month]
    );
    console.log(`✅ Deleted ${deleteResult.affectedRows} existing records`);
    
    // Get all trading dates in this month
    const datesQuery = `
      SELECT DISTINCT DATE(date) as trade_date
      FROM trading_data 
      WHERE YEAR(date) = ? AND MONTH(date) = ?
      ORDER BY trade_date
    `;
    
    const dates = await conn.query(datesQuery, [year, month]);
    console.log(`📅 Found ${dates.length} trading days to recalculate`);
    
    // Import the PLReport module functions
    const fs = require('fs');
    const path = require('path');
    
    // We'll manually rebuild the data by calling the same logic
    let processedCount = 0;
    for (const dateRow of dates) {
      const dateStr = dateRow.trade_date;
      console.log(`📊 Processing ${dateStr}...`);
      
      try {
        // Call the storeDataForDate equivalent logic
        await storeDataForDate(conn, dateStr, year, month);
        processedCount++;
        console.log(`✅ Completed ${dateStr}`);
      } catch (error) {
        console.error(`❌ Error processing ${dateStr}:`, error.message);
      }
    }
    
    console.log(`🎉 Rebuild complete! Processed ${processedCount}/${dates.length} dates`);
    
  } catch (error) {
    console.error('❌ Rebuild failed:', error);
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

// Simplified version of storeDataForDate function
async function storeDataForDate(conn, dateStr, year, month) {
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
    WHERE DATE(t.date) = ?
    GROUP BY DATE(t.date), t.symbol_ref
  `;
  
  const result = await conn.query(sql, [dateStr]);
  
  if (result.length === 0) {
    return;
  }
  
  // Get Exp data
  const expData = await getExpDataForDate(conn, dateStr);
  
  // Get yesterday's balances
  const yesterdayBalances = await getYesterdayBalancesForDate(conn, dateStr);
  
  // Process each row
  for (const row of result) {
    const processed = await processTradeRowCommon(row, expData, yesterdayBalances);
    
    // Insert into pl_report_daily
    const insertSql = `
      INSERT INTO pl_report_daily (
        trade_date, symbol_ref, year, month,
        mktprice, buysize1, sellsize1, buysize2, sellsize2,
        buyprice1, sellprice1, buyprice2, sellprice2,
        company_balance, company_equity, company_floating, company_pln,
        company_realized, company_unrealized,
        exp_balance, exp_equity, exp_floating, exp_profit_loss, exp_pln,
        exp_realized, exp_unrealized,
        accn_pf, daily_company_total, daily_exp_total, daily_grand_total,
        is_finalized
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await conn.query(insertSql, [
      processed.trade_date,
      processed.symbol_ref,
      year,
      month,
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
      processed.company_realized,
      processed.company_unrealized,
      processed.exp_balance,
      processed.exp_equity,
      processed.exp_floating,
      processed.exp_profit_loss,
      processed.exp_pln,
      processed.exp_realized,
      processed.exp_unrealized,
      processed.accn_pf,
      processed.daily_company_total,
      processed.daily_exp_total,
      processed.daily_grand_total,
      true // is_finalized
    ]);
  }
}

// Helper functions (simplified versions)
// Updated function in backend/rebuild_month.js
async function getExpDataForDate(conn, date) {
  const expData = {};
  
  const sql = `
    SELECT 
      su.symbol_ref,
      SUM(COALESCE(cd.balance, 0)) as total_exp_balance,
      SUM(COALESCE(cd.equity, 0)) as total_exp_equity,
      SUM(COALESCE(cd.floating, 0)) as total_exp_floating,
      SUM(COALESCE(cd.profit_loss, 0)) as total_exp_pln
    FROM sub_users su
    LEFT JOIN (
      SELECT 
        mt5,
        balance,
        equity,
        floating,
        profit_loss,
        ROW_NUMBER() OVER (PARTITION BY mt5 ORDER BY created_at DESC) as rn
      FROM customer_data
      WHERE DATE(created_at) <= ?
    ) cd ON su.sub_username = cd.mt5 AND cd.rn = 1
    WHERE su.symbol_ref IS NOT NULL AND su.symbol_ref != ''
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
async function getYesterdayBalancesForDate(conn, date) {
  const yesterdayBalances = {
    company: {},
    exp: {}
  };

  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Get company balances and equity
  const sqlCompany = `
    SELECT 
      symbol_ref, 
      COALESCE(Balance, 0) as balance,
      COALESCE(equity, 0) as equity
    FROM trading_data 
    WHERE DATE(date) = ?
    GROUP BY symbol_ref
  `;

  const companyResult = await conn.query(sqlCompany, [yesterdayStr]);
  
  for (const row of companyResult) {
    yesterdayBalances.company[row.symbol_ref] = {
      balance: parseFloat(row.balance) || 0,
      equity: parseFloat(row.equity) || 0
    };
  }

  // Get exp balances
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
    GROUP BY su.symbol_ref
  `;

  const expResult = await conn.query(sqlExp, [yesterdayStr]);
  
  for (const row of expResult) {
    yesterdayBalances.exp[row.symbol_ref] = parseFloat(row.total_exp_balance) || 0;
  }

  return yesterdayBalances;
}

async function processTradeRowCommon(row, expData, yesterdayBalances) {
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
  const expPln = expData[row.symbol_ref]?.pln || 0;

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
  
  // Calculate Company PLN = Today's Equity - Yesterday's Equity
  const companyPln = companyEquity - yesterdayCompanyEquity;
  
  // Debug logging
  console.log(`  📊 ${row.symbol_ref}: Company PLN = ${companyEquity} - ${yesterdayCompanyEquity} = ${companyPln}`);

  return {
    trade_date: row.trade_date,
    symbol_ref: row.symbol_ref,
    mktprice: Math.round(mktprice * 100) / 100,
    buysize1: Math.round(buysize1 * 100) / 100,
    sellsize1: Math.round(sellsize1 * 100) / 100,
    buysize2: Math.round(buysize2 * 100) / 100,
    sellsize2: Math.round(sellsize2 * 100) / 100,
    buyprice1: Math.round((parseFloat(row.buyprice1) || 0) * 100) / 100,
    sellprice1: Math.round((parseFloat(row.sellprice1) || 0) * 100) / 100,
    buyprice2: Math.round((parseFloat(row.buyprice2) || 0) * 100) / 100,
    sellprice2: Math.round((parseFloat(row.sellprice2) || 0) * 100) / 100,
    company_balance: Math.round(companyBalance * 100) / 100,
    company_equity: Math.round(companyEquity * 100) / 100,
    company_floating: Math.round(companyFloating * 100) / 100,
    company_pln: Math.round(companyPln * 100) / 100,
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
    daily_grand_total: Math.round((companyRealized + companyUnrealized - expRealized - expUnrealized) * 100) / 100
  };
}

// Run the rebuild for current month
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

console.log(`🚀 Starting rebuild script for ${currentYear}-${String(currentMonth).padStart(2, '0')}`);
rebuildMonth(currentYear, currentMonth);
