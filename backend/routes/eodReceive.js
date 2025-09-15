// backend/routes/eodReceive.js
const express = require('express');

module.exports = (pool, { authenticateToken, getAllowedSymbols }, dbHelpers) => {
  const router = express.Router();

  // Get EOD Receive data with filters and pagination
  router.get('/', authenticateToken, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const userId = req.user.id;
      const userType = req.user.user_type;
      
      let allowedSymbols = [];
      if (userType === 'managed') {
        allowedSymbols = await getAllowedSymbols(conn, req);
        if (allowedSymbols.length === 0) {
          return res.json({
            success: true,
            data: [],
            pagination: { total: 0, current_page: 1, total_pages: 0 }
          });
        }
      }

      // Pagination
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      // Build WHERE clause for filters
      let whereConditions = ['1=1']; // Always true condition
      let params = [];

      // Date range filter
      if (req.query.start_date && req.query.end_date) {
        whereConditions.push('date BETWEEN ? AND ?');
        params.push(req.query.start_date, req.query.end_date);
      } else if (req.query.date) {
        whereConditions.push('date = ?');
        params.push(req.query.date);
      }

      // Symbol filter
      if (req.query.symbolref && req.query.symbolref.length > 0) {
        const symbolrefs = Array.isArray(req.query.symbolref) ? req.query.symbolref : [req.query.symbolref];
        const placeholders = symbolrefs.map(() => '?').join(',');
        whereConditions.push(`symbolref IN (${placeholders})`);
        params.push(...symbolrefs);
      }

      // Position type filter
      if (req.query.position_type) {
        whereConditions.push('position_type = ?');
        params.push(req.query.position_type);
      }

      // Managed user symbol restrictions
      if (userType === 'managed' && allowedSymbols.length > 0) {
        const symbolPlaceholders = allowedSymbols.map(() => '?').join(',');
        whereConditions.push(`symbolref IN (${symbolPlaceholders})`);
        params.push(...allowedSymbols);
      }

      const whereClause = whereConditions.join(' AND ');

      // Get total count for pagination
      const countQuery = `SELECT COUNT(*) as total FROM receive_eod WHERE ${whereClause}`;
      const countResult = await conn.query(countQuery, params);
      const total = countResult[0].total;

      // Get data with pagination
      const dataQuery = `
        SELECT 
          id,
          symbolref,
          total_buy,
          total_sell,
          avg_buy_price,
          avg_sell_price,
          net_position,
          position_type,
          date,
          created_at
        FROM receive_eod 
        WHERE ${whereClause}
        ORDER BY date DESC, created_at DESC
        LIMIT ? OFFSET ?
      `;
      
      const data = await conn.query(dataQuery, [...params, limit, offset]);

      // Get unique symbols for filter dropdown
      let symbolQuery = 'SELECT DISTINCT symbolref FROM receive_eod WHERE symbolref IS NOT NULL';
      let symbolParams = [];
      
      if (userType === 'managed' && allowedSymbols.length > 0) {
        const symbolPlaceholders = allowedSymbols.map(() => '?').join(',');
        symbolQuery += ` AND symbolref IN (${symbolPlaceholders})`;
        symbolParams = allowedSymbols;
      }
      
      symbolQuery += ' ORDER BY symbolref ASC';
      const symbolResults = await conn.query(symbolQuery, symbolParams);
      const symbolOptions = symbolResults.map(row => ({
        value: row.symbolref,
        label: row.symbolref
      }));

      res.json({
        success: true,
        data: data,
        pagination: {
          total,
          current_page: page,
          total_pages: Math.ceil(total / limit),
          records_per_page: limit
        },
        filters: {
          symbolOptions
        }
      });

    } catch (error) {
      console.error('Error getting EOD receive data:', error);
      res.status(500).json({ 
        error: 'Failed to fetch EOD receive data',
        details: error.message 
      });
    } finally {
      if (conn) conn.release();
    }
  });

  // Get available symbols for EOD receive (for dropdown)
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
          return res.json([]);
        }
      }

      // Build query to get distinct symbols
      let query = 'SELECT DISTINCT symbolref FROM receive_eod WHERE symbolref IS NOT NULL';
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
      console.error('Error getting EOD receive symbols:', error);
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