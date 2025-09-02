const express = require('express');

module.exports = function(pool, { authenticateToken, getAllowedSymbols }) {
  const router = express.Router();

  // Get trading data for all symbols (real-time aggregated data)
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
      let queryParams = [startOfDay, endOfDay];
      
      if (userType === 'managed' && allowedSymbols.length > 0) {
        const placeholders = allowedSymbols.map(() => '?').join(',');
        symbolWhereClause = ` AND symbolref IN (${placeholders})`;
        queryParams.push(...allowedSymbols);
      }

      // Query to get aggregated data for all symbols
      const query = `
        SELECT 
          symbolref,
          SUM(buysize) AS total_buy_size,
          SUM(sellsize) AS total_sell_size,
          CASE
            WHEN SUM(buysize) > 0 THEN SUM(buyprice * buysize) / SUM(buysize)
            ELSE 0
          END AS weighted_avg_buy_price,
          CASE
            WHEN SUM(sellsize) > 0 THEN SUM(sellprice * sellsize) / SUM(sellsize)
            ELSE 0
          END AS weighted_avg_sell_price,
          (SELECT refid 
           FROM \`receive.itradebook\` r2 
           WHERE r2.symbolref = r1.symbolref 
             AND r2.date >= ? 
             AND r2.date < ?
             ${symbolWhereClause}
           ORDER BY r2.date DESC, r2.refid DESC 
           LIMIT 1) AS last_refid
        FROM \`receive.itradebook\` r1
        WHERE r1.date >= ? 
          AND r1.date < ?
          ${symbolWhereClause}
        GROUP BY symbolref
        ORDER BY symbolref ASC
      `;

      // Duplicate the date parameters for the subquery
      const finalParams = [...queryParams, ...queryParams];

      const results = await conn.query(query, finalParams);

      // Format the results
      const formattedResults = results.map(row => ({
        symbolref: row.symbolref,
        total_buy_size: parseFloat(row.total_buy_size) || 0,
        total_sell_size: parseFloat(row.total_sell_size) || 0,
        weighted_avg_buy_price: parseFloat(row.weighted_avg_buy_price) || 0,
        weighted_avg_sell_price: parseFloat(row.weighted_avg_sell_price) || 0,
        last_refid: row.last_refid || ''
      }));

      res.json(formattedResults);

    } catch (error) {
      console.error('Error getting symbol trading data:', error);
      res.status(500).json({ 
        error: 'Failed to fetch symbol trading data',
        details: error.message 
      });
    } finally {
      if (conn) conn.release();
    }
  });

  // Get all available symbols for the user (for dropdown)
  router.get('/symbols', authenticateToken, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const userId = req.user.id;
      const userType = req.user.user_type;
      
      let allowedSymbols = [];
      if (userType === 'managed') {
        allowedSymbols = await getAllowedSymbols(conn, req);
        if (allowedSymbols.length === 0) {
          return res.json([]); // No symbols assigned
        }
      }

      // Build query to get distinct symbols
      let query = 'SELECT DISTINCT symbolref FROM `receive.itradebook`';
      let queryParams = [];
      
      if (userType === 'managed' && allowedSymbols.length > 0) {
        const placeholders = allowedSymbols.map(() => '?').join(',');
        query += ` WHERE symbolref IN (${placeholders})`;
        queryParams = allowedSymbols;
      }
      
      query += ' ORDER BY symbolref ASC';

      const results = await conn.query(query, queryParams);
      
      const symbols = results.map(row => ({
        value: row.symbolref,
        label: row.symbolref
      }));

      res.json(symbols);

    } catch (error) {
      console.error('Error getting symbols:', error);
      res.status(500).json({ 
        error: 'Failed to fetch symbols',
        details: error.message 
      });
    } finally {
      if (conn) conn.release();
    }
  });

  return { router };
};
