// backend/routes/eodCustomerData.js
const express = require('express');

module.exports = (pool, { authenticateToken, getAllowedSymbols }, dbHelpers) => {
  const router = express.Router();

  // Get EOD Customer Data with filters and pagination
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
      if (req.query.symbol_ref && req.query.symbol_ref.length > 0) {
        const symbolRefs = Array.isArray(req.query.symbol_ref) ? req.query.symbol_ref : [req.query.symbol_ref];
        const placeholders = symbolRefs.map(() => '?').join(',');
        whereConditions.push(`symbol_ref IN (${placeholders})`);
        params.push(...symbolRefs);
      }

      // Position type filter
      if (req.query.position_type) {
        whereConditions.push('position_type = ?');
        params.push(req.query.position_type);
      }

      // Managed user symbol restrictions
      if (userType === 'managed' && allowedSymbols.length > 0) {
        const symbolPlaceholders = allowedSymbols.map(() => '?').join(',');
        whereConditions.push(`symbol_ref IN (${symbolPlaceholders})`);
        params.push(...allowedSymbols);
      }

      const whereClause = whereConditions.join(' AND ');

      // Get total count for pagination
      const countQuery = `SELECT COUNT(*) as total FROM customer_data_eod WHERE ${whereClause}`;
      const countResult = await conn.query(countQuery, params);
      const total = countResult[0].total;

      // Get data with pagination
      const dataQuery = `
        SELECT 
          id,
          symbol_ref,
          total_buy_size,
          total_sell_size,
          weighted_avg_buy_price,
          weighted_avg_sell_price,
          net_position,
          position_type,
          date,
          created_at
        FROM customer_data_eod 
        WHERE ${whereClause}
        ORDER BY date DESC, created_at DESC
        LIMIT ? OFFSET ?
      `;
      
      const data = await conn.query(dataQuery, [...params, limit, offset]);

      // Get unique symbols for filter dropdown
      let symbolQuery = 'SELECT DISTINCT symbol_ref FROM customer_data_eod WHERE symbol_ref IS NOT NULL';
      let symbolParams = [];
      
      if (userType === 'managed' && allowedSymbols.length > 0) {
        const symbolPlaceholders = allowedSymbols.map(() => '?').join(',');
        symbolQuery += ` AND symbol_ref IN (${symbolPlaceholders})`;
        symbolParams = allowedSymbols;
      }
      
      symbolQuery += ' ORDER BY symbol_ref ASC';
      const symbolResults = await conn.query(symbolQuery, symbolParams);
      const symbolOptions = symbolResults.map(row => ({
        value: row.symbol_ref,
        label: row.symbol_ref
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
      console.error('Error getting EOD customer data:', error);
      res.status(500).json({ 
        error: 'Failed to fetch EOD customer data',
        details: error.message 
      });
    } finally {
      if (conn) conn.release();
    }
  });

  // Get available symbols for EOD customer data (for dropdown)
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
      let query = 'SELECT DISTINCT symbol_ref FROM customer_data_eod WHERE symbol_ref IS NOT NULL';
      let queryParams = [];
      
      if (userType === 'managed' && allowedSymbols.length > 0) {
        const placeholders = allowedSymbols.map(() => '?').join(',');
        query += ` AND symbol_ref IN (${placeholders})`;
        queryParams = allowedSymbols;
      }
      
      query += ' ORDER BY symbol_ref ASC';

      const results = await conn.query(query, queryParams);
      
      const symbols = results.map(row => ({
        value: row.symbol_ref,
        label: row.symbol_ref
      }));

      res.json(symbols);

    } catch (error) {
      console.error('Error getting EOD customer data symbols:', error);
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