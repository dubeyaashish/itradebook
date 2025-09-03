const express = require('express');

module.exports = function(pool, { authenticateToken, getAllowedSymbols }) {
  const router = express.Router();

  // Get grids data (implementing the PHP logic)
  router.get('/grids-data', authenticateToken, async (req, res) => {
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

      // Get distinct symbols from gridorder table
      let symbolQuery = 'SELECT DISTINCT symbolref FROM gridorder WHERE symbolref IS NOT NULL';
      let symbolParams = [];
      
      if (userType === 'managed' && allowedSymbols.length > 0) {
        const placeholders = allowedSymbols.map(() => '?').join(',');
        symbolQuery += ` AND symbolref IN (${placeholders})`;
        symbolParams = allowedSymbols;
      }
      
      symbolQuery += ' ORDER BY symbolref ASC';

      const symbolResults = await conn.query(symbolQuery, symbolParams);
      
      if (symbolResults.length === 0) {
        return res.json([]);
      }

      const results = [];

      // Process each symbol
      for (const symbolRow of symbolResults) {
        const symbolref = symbolRow.symbolref;

        // Step 1: Get the latest gridorder > 21 for this symbolref
        const latestGridQuery = `
          SELECT gridorder
          FROM gridorder
          WHERE symbolref = ? AND gridorder > 21
          ORDER BY date DESC, id DESC
          LIMIT 1
        `;
        
        const latestGridResult = await conn.query(latestGridQuery, [symbolref]);
        
        if (latestGridResult.length === 0) {
          // No gridorder > 21 found, add entry with zeros
          results.push({
            symbolref: symbolref,
            total_buy_size: 0,
            total_sell_size: 0,
            weighted_avg_buy_price: 0,
            weighted_avg_sell_price: 0,
            difference: 0,
            gridorder: 0
          });
          continue;
        }

        const latestGridOrder = latestGridResult[0].gridorder;

        // Step 2: Aggregate data for that gridorder and symbolref across all dates
        const aggregateQuery = `
          SELECT 
            SUM(CAST(buysize AS DECIMAL(20,6))) AS total_buy_size,
            SUM(CAST(sellsize AS DECIMAL(20,6))) AS total_sell_size,
            CASE
              WHEN SUM(CAST(buysize AS DECIMAL(20,6))) > 0 
              THEN SUM(CAST(buyprice AS DECIMAL(20,6)) * CAST(buysize AS DECIMAL(20,6))) / SUM(CAST(buysize AS DECIMAL(20,6)))
              ELSE 0
            END AS weighted_avg_buy_price,
            CASE
              WHEN SUM(CAST(sellsize AS DECIMAL(20,6))) > 0 
              THEN SUM(CAST(sellprice AS DECIMAL(20,6)) * CAST(sellsize AS DECIMAL(20,6))) / SUM(CAST(sellsize AS DECIMAL(20,6)))
              ELSE 0
            END AS weighted_avg_sell_price
          FROM gridorder
          WHERE symbolref = ? AND gridorder = ?
        `;

        const aggregateResult = await conn.query(aggregateQuery, [symbolref, latestGridOrder]);
        
        if (aggregateResult.length > 0) {
          const agg = aggregateResult[0];
          
          // Sanitize and calculate
          const totalBuySize = Math.max(0, agg.total_buy_size || 0);
          const totalSellSize = Math.max(0, agg.total_sell_size || 0);
          const weightedBuy = Math.max(0, agg.weighted_avg_buy_price || 0);
          const weightedSell = Math.max(0, agg.weighted_avg_sell_price || 0);
          const difference = totalBuySize - totalSellSize;

          results.push({
            symbolref: symbolref,
            total_buy_size: totalBuySize,
            total_sell_size: totalSellSize,
            weighted_avg_buy_price: weightedBuy,
            weighted_avg_sell_price: weightedSell,
            difference: difference,
            gridorder: latestGridOrder
          });
        } else {
          // No data found for this combination
          results.push({
            symbolref: symbolref,
            total_buy_size: 0,
            total_sell_size: 0,
            weighted_avg_buy_price: 0,
            weighted_avg_sell_price: 0,
            difference: 0,
            gridorder: latestGridOrder
          });
        }
      }

      // Sort results by symbolref
      results.sort((a, b) => a.symbolref.localeCompare(b.symbolref));

      res.json(results);

    } catch (error) {
      console.error('Error getting grids data:', error);
      res.status(500).json({ 
        error: 'Failed to fetch grids data',
        details: error.message 
      });
    } finally {
      if (conn) conn.release();
    }
  });

  // Get all available symbols for grids (for dropdown)
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

      // Build query to get distinct symbols from gridorder table
      let query = 'SELECT DISTINCT symbolref FROM gridorder WHERE symbolref IS NOT NULL';
      let queryParams = [];
      
      if (userType === 'managed' && allowedSymbols.length > 0) {
        const placeholders = allowedSymbols.map(() => '?').join(',');
        query += ` AND symbolref IN (${placeholders})`;
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
      console.error('Error getting grids symbols:', error);
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
