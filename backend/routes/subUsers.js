const express = require('express');

module.exports = (pool, { authenticateToken, getAllowedSymbols }) => {
  const router = express.Router();

  // Get sub users by symbol_ref
  router.get('/by-symbol/:symbolRef', authenticateToken, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const { symbolRef } = req.params;
      const allowedSymbols = await getAllowedSymbols(conn, req);

      console.log('=== SUB USERS BY SYMBOL DEBUG ===');
      console.log('Requested symbolRef:', symbolRef);
      console.log('User type:', req.user?.user_type || req.user?.userType || req.session?.user_type);
      console.log('User ID:', req.user?.id || req.user?.userId || req.session?.user_id);
      console.log('Allowed symbols:', allowedSymbols);
      console.log('==================================');

      // Check if user has access to this symbol (for managed users)
      if (allowedSymbols !== null && !allowedSymbols.includes(symbolRef)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this symbol'
        });
      }

      let query;
      let params;

      if (allowedSymbols !== null) {
        // For managed users: get sub_usernames based on parent_user_id and allowed symbols
        const userId = req.user?.id || req.user?.userId || req.session?.user_id;
        
        if (userId) {
          query = `
            SELECT sub_username, status, created_at, updated_at 
            FROM sub_users 
            WHERE symbol_ref = ? 
            AND (parent_user_id = ? OR parent_user_id IS NULL)
            ORDER BY sub_username ASC
          `;
          params = [symbolRef, userId];
        } else {
          return res.status(401).json({
            success: false,
            error: 'User ID not found'
          });
        }
      } else {
        // For admin users: get all sub_usernames for the symbol
        query = `
          SELECT sub_username, status, created_at, updated_at 
          FROM sub_users 
          WHERE symbol_ref = ? 
          ORDER BY sub_username ASC
        `;
        params = [symbolRef];
      }

      const subUsers = await conn.query(query, params);

      console.log(`Found ${subUsers.length} sub users for symbol ${symbolRef}`);

      res.json({
        success: true,
        data: subUsers,
        symbol_ref: symbolRef,
        count: subUsers.length
      });

    } catch (error) {
      console.error('Error fetching sub users by symbol:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message
      });
    } finally {
      if (conn) conn.release();
    }
  });

  return { router };
};