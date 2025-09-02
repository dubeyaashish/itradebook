const express = require('express');

module.exports = function(pool, { authenticateToken, getAllowedSymbols }) {
  const router = express.Router();

  // Get customer trading data aggregated by symbol_ref
  router.get('/trading-data', authenticateToken, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const userId = req.user.id;
      const userType = req.user.user_type;
      
      // Get user's allowed symbols
      let allowedSymbols = [];
      if (userType === 'managed') {
        allowedSymbols = await getAllowedSymbols(conn, req);
        if (allowedSymbols.length === 0) {
          return res.json([]); // No symbols assigned
        }
      }

      // Set timezone to Bangkok
      await conn.query("SET time_zone = '+07:00'");
      
      // Get start and end of current day in Bangkok time
      const now = new Date();
      const bangkokOffset = 7 * 60; // UTC+7 in minutes
      const localOffset = now.getTimezoneOffset();
      const bangkokTime = new Date(now.getTime() + (bangkokOffset + localOffset) * 60000);
      
      const year = bangkokTime.getFullYear();
      const month = String(bangkokTime.getMonth() + 1).padStart(2, '0');
      const day = String(bangkokTime.getDate()).padStart(2, '0');
      
      const startOfDay = `${year}-${month}-${day} 00:00:00`;
      const startOfNextDay = new Date(bangkokTime);
      startOfNextDay.setDate(startOfNextDay.getDate() + 1);
      const endOfDay = `${startOfNextDay.getFullYear()}-${String(startOfNextDay.getMonth() + 1).padStart(2, '0')}-${String(startOfNextDay.getDate()).padStart(2, '0')} 00:00:00`;

      // Build the WHERE clause for symbol filtering
      let symbolWhereClause = '';
      let queryParams = [startOfDay, endOfDay, startOfDay, endOfDay];
      
      if (userType === 'managed' && allowedSymbols.length > 0) {
        const placeholders = allowedSymbols.map(() => '?').join(',');
        symbolWhereClause = ` AND su.symbol_ref IN (${placeholders})`;
        queryParams.push(...allowedSymbols);
      }

      // Main query: Get aggregate values with buy/sell logic for all symbols
      const queryAggregates = `
        SELECT 
            su.symbol_ref,
            SUM(CASE 
                WHEN (cd.direction = 'out' AND cd.type = 'buy') OR (cd.direction = 'in' AND cd.type = 'sell') 
                THEN cd.volume 
                ELSE 0 
            END) AS total_buy_size,
            SUM(CASE 
                WHEN (cd.direction = 'in' AND cd.type = 'buy') OR (cd.direction = 'out' AND cd.type = 'sell') 
                THEN cd.volume 
                ELSE 0 
            END) AS total_sell_size,
            CASE
                WHEN SUM(CASE 
                    WHEN (cd.direction = 'out' AND cd.type = 'buy') OR (cd.direction = 'in' AND cd.type = 'sell') 
                    THEN cd.volume 
                    ELSE 0 
                END) > 0 
                THEN SUM(CASE 
                    WHEN (cd.direction = 'out' AND cd.type = 'buy') OR (cd.direction = 'in' AND cd.type = 'sell') 
                    THEN cd.price * cd.volume 
                    ELSE 0 
                END) / SUM(CASE 
                    WHEN (cd.direction = 'out' AND cd.type = 'buy') OR (cd.direction = 'in' AND cd.type = 'sell') 
                    THEN cd.volume 
                    ELSE 0 
                END)
                ELSE 0
            END AS weighted_avg_buy_price,
            CASE
                WHEN SUM(CASE 
                    WHEN (cd.direction = 'in' AND cd.type = 'buy') OR (cd.direction = 'out' AND cd.type = 'sell') 
                    THEN cd.volume 
                    ELSE 0 
                END) > 0 
                THEN SUM(CASE 
                    WHEN (cd.direction = 'in' AND cd.type = 'buy') OR (cd.direction = 'out' AND cd.type = 'sell') 
                    THEN cd.price * cd.volume 
                    ELSE 0 
                END) / SUM(CASE 
                    WHEN (cd.direction = 'in' AND cd.type = 'buy') OR (cd.direction = 'out' AND cd.type = 'sell') 
                    THEN cd.volume 
                    ELSE 0 
                END)
                ELSE 0
            END AS weighted_avg_sell_price
        FROM customer_data cd
        JOIN sub_users su ON cd.mt5 = su.sub_username
        WHERE cd.datetime_server_ts_tz >= ? 
          AND cd.datetime_server_ts_tz < ? 
          AND cd.price BETWEEN 2000 AND 4000
          ${symbolWhereClause}
        GROUP BY su.symbol_ref
        ORDER BY su.symbol_ref ASC
      `;

      const aggregatesResults = await conn.query(queryAggregates, queryParams);

      // Query to get the latest equity, balance, floating for each symbol_ref
      const queryLatestPerSymbol = `
        SELECT 
            su.symbol_ref,
            SUM(CAST(REGEXP_REPLACE(cd.equity, '[^0-9.]', '') AS DECIMAL(15,2))) AS total_equity,
            SUM(CAST(REGEXP_REPLACE(cd.balance, '[^0-9.]', '') AS DECIMAL(15,2))) AS total_balance,
            SUM(CAST(REGEXP_REPLACE(cd.floating, '[^0-9.]', '') AS DECIMAL(15,2))) AS total_floating,
            MAX(cd.id) as last_refid
        FROM customer_data cd
        JOIN sub_users su ON cd.mt5 = su.sub_username
        JOIN (
            SELECT 
                cd2.mt5,
                MAX(cd2.created_at) as max_created_at,
                MAX(cd2.id) as max_id
            FROM customer_data cd2
            WHERE cd2.datetime_server_ts_tz >= ? 
              AND cd2.datetime_server_ts_tz < ? 
              AND cd2.price BETWEEN 2000 AND 4000
            GROUP BY cd2.mt5
        ) latest ON cd.mt5 = latest.mt5 AND cd.created_at = latest.max_created_at AND cd.id = latest.max_id
        WHERE cd.datetime_server_ts_tz >= ? 
          AND cd.datetime_server_ts_tz < ? 
          AND cd.price BETWEEN 2000 AND 4000
          ${symbolWhereClause}
        GROUP BY su.symbol_ref
        ORDER BY su.symbol_ref ASC
      `;

      // Duplicate the date parameters for the subquery and main query
      const latestParams = [...queryParams, ...queryParams];
      const latestResults = await conn.query(queryLatestPerSymbol, latestParams);

      // Combine the results
      const combinedResults = [];
      
      // Create a map of latest data by symbol_ref
      const latestDataMap = {};
      latestResults.forEach(row => {
        latestDataMap[row.symbol_ref] = {
          total_equity: parseFloat(row.total_equity) || 0,
          total_balance: parseFloat(row.total_balance) || 0,
          total_floating: parseFloat(row.total_floating) || 0,
          last_refid: row.last_refid || ''
        };
      });

      // Merge aggregates with latest data
      aggregatesResults.forEach(row => {
        const symbolRef = row.symbol_ref;
        const latestData = latestDataMap[symbolRef] || {
          total_equity: 0,
          total_balance: 0,
          total_floating: 0,
          last_refid: ''
        };

        combinedResults.push({
          symbol_ref: symbolRef,
          total_buy_size: parseFloat(row.total_buy_size) || 0,
          total_sell_size: parseFloat(row.total_sell_size) || 0,
          weighted_avg_buy_price: parseFloat(row.weighted_avg_buy_price) || 0,
          weighted_avg_sell_price: parseFloat(row.weighted_avg_sell_price) || 0,
          total_equity: latestData.total_equity,
          total_balance: latestData.total_balance,
          total_floating: latestData.total_floating,
          last_refid: latestData.last_refid
        });
      });

      res.json(combinedResults);

    } catch (error) {
      console.error('Error getting customer trading data:', error);
      res.status(500).json({ 
        error: 'Failed to fetch customer trading data',
        details: error.message 
      });
    } finally {
      if (conn) conn.release();
    }
  });

  // Get available symbols for customer trading data
  router.get('/symbols', authenticateToken, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const userId = req.user.id;
      const userType = req.user.user_type;
      
      let symbols = [];
      
      if (userType === 'managed') {
        // Get only symbols assigned to this managed user
        symbols = await getAllowedSymbols(conn, req);
      } else {
        // Get all symbols from sub_users table
        const query = 'SELECT DISTINCT symbol_ref FROM sub_users WHERE symbol_ref IS NOT NULL ORDER BY symbol_ref';
        const results = await conn.query(query);
        symbols = results.map(row => row.symbol_ref);
      }

      // Format for react-select
      const formattedSymbols = symbols.map(symbol => ({
        value: symbol,
        label: symbol
      }));

      res.json(formattedSymbols);

    } catch (error) {
      console.error('Error getting customer trading symbols:', error);
      res.status(500).json({ 
        error: 'Failed to fetch symbols',
        details: error.message 
      });
    } finally {
      if (conn) conn.release();
    }
  });

  return router;
};
