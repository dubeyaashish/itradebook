const express = require('express');

module.exports = (pool, { authenticateToken, getAllowedSymbols }) => {
  const router = express.Router();

// Get customer data
router.get('/', authenticateToken, async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const allowedSymbols = await getAllowedSymbols(conn, req);
        
        // Comprehensive debug logging for managed users
        console.log('=== CUSTOMER DATA DEBUG ===');
        console.log('req.user:', req.user);
        console.log('req.session:', req.session);
        console.log('User Type:', req.user?.user_type || req.user?.userType || req.session?.user_type);
        console.log('User ID:', req.user?.id || req.user?.userId || req.session?.user_id);
        console.log('Allowed Symbols from getAllowedSymbols:', allowedSymbols);
        console.log('allowedSymbols !== null:', allowedSymbols !== null);
        console.log('Array.isArray(allowedSymbols):', Array.isArray(allowedSymbols));
        console.log('allowedSymbols.length:', allowedSymbols?.length);
        console.log('==============================');

        // Pagination setup
        const limit = 30;
        const page = parseInt(req.query.page) || 1;
        const offset = (page - 1) * limit;

        // Sorting setup
        const validColumns = [
            'id', 'api_key', 'datetime_server_ts_tz', 'mt5', 'order_ref', 'direction', 
            'type', 'volume', 'price', 'swap', 'swap_last', 'balance', 'equity', 
            'floating', 'profit_loss', 'profit_loss_last', 'symbolrate_name', 
            'currency', 'volume_total', 'created_at'
        ];
        const orderBy = validColumns.includes(req.query.order_by) ? req.query.order_by : 'id';
        const orderDir = req.query.order_dir === 'asc' ? 'asc' : 'desc';

        // Build WHERE clause
        const whereConditions = [];
        const params = [];

        // Date range filter
        if (req.query.start_date && req.query.end_date) {
            const startTime = req.query.start_time || '00:00:00';
            const endTime = req.query.end_time || '23:59:59';
            whereConditions.push('created_at BETWEEN ? AND ?');
            params.push(`${req.query.start_date} ${startTime}`, `${req.query.end_date} ${endTime}`);
        }

        // MT5 filter
        if (req.query.mt5) {
            const mt5Values = Array.isArray(req.query.mt5) ? req.query.mt5 : [req.query.mt5];
            if (allowedSymbols !== null) {
                const validMt5Values = mt5Values.filter(mt5 => allowedSymbols.includes(mt5));
                if (validMt5Values.length > 0) {
                    whereConditions.push(`mt5 IN (?${',?'.repeat(validMt5Values.length - 1)})`);
                    params.push(...validMt5Values);
                } else {
                    whereConditions.push('1=0'); // No valid MT5 values
                }
            } else {
                whereConditions.push(`mt5 IN (?${',?'.repeat(mt5Values.length - 1)})`);
                params.push(...mt5Values);
            }
        }

        // Order reference filter
        if (req.query.order_ref) {
            const orderRefs = Array.isArray(req.query.order_ref) ? req.query.order_ref : [req.query.order_ref];
            whereConditions.push(`order_ref IN (?${',?'.repeat(orderRefs.length - 1)})`);
            params.push(...orderRefs);
        }

        // Order reference starts with filter (for 2025 orders)
        if (req.query.order_ref_starts_with) {
            whereConditions.push('order_ref LIKE ?');
            params.push(`${req.query.order_ref_starts_with}%`);
        }

        // Symbol reference filter (join with sub_users to get symbol_ref from mt5)
        if (req.query.symbol_ref) {
            const symbolRefs = Array.isArray(req.query.symbol_ref) ? req.query.symbol_ref : [req.query.symbol_ref];
            // Join with sub_users to filter by symbol_ref
            whereConditions.push(`mt5 IN (SELECT sub_username FROM sub_users WHERE symbol_ref IN (?${',?'.repeat(symbolRefs.length - 1)}) AND status = 'active')`);
            params.push(...symbolRefs);
        }

        // Add symbol restriction for managed users - use BOTH parent_user_id AND allowed symbols
        if (allowedSymbols !== null && !req.query.mt5) {
            let allowedSubUsernames = [];
            const userId = req.user?.id || req.user?.userId || req.session.user_id;
            
            if (userId) {
                // Debug: Check what sub_users exist for this parent_user_id
                const debugSubUsersQuery = 'SELECT sub_username, symbol_ref FROM sub_users WHERE status = "active" AND parent_user_id = ?';
                const debugSubUsersResult = await conn.query(debugSubUsersQuery, [userId]);
                console.log('Debug - All sub_users for parent_user_id', userId, ':', debugSubUsersResult);
                
                // Debug: Check what symbols are in sub_users table
                const debugSymbolsQuery = 'SELECT DISTINCT symbol_ref FROM sub_users WHERE status = "active" AND symbol_ref IS NOT NULL';
                const debugSymbolsResult = await conn.query(debugSymbolsQuery);
                console.log('Debug - All distinct symbols in sub_users table:', debugSymbolsResult.map(r => r.symbol_ref));
                
                // Base query: get sub_users by parent_user_id first
                let subUsersQuery = 'SELECT DISTINCT sub_username FROM sub_users WHERE status = "active" AND parent_user_id = ?';
                let queryParams = [userId];
                
                // Then filter by allowed symbols if available
                if (Array.isArray(allowedSymbols) && allowedSymbols.length > 0) {
                    const symbolPlaceholders = allowedSymbols.map(() => '?').join(',');
                    subUsersQuery += ` AND symbol_ref IN (${symbolPlaceholders})`;
                    queryParams.push(...allowedSymbols);
                    console.log('Final query:', subUsersQuery);
                    console.log('Query params:', queryParams);
                    console.log('Managed user - Using BOTH parent_user_id AND allowed symbols:', allowedSymbols);
                } else {
                    console.log('Managed user - Using only parent_user_id (no symbol restrictions)');
                }
                
                const subUsersResult = await conn.query(subUsersQuery, queryParams);
                allowedSubUsernames = subUsersResult.map(row => row.sub_username);
                
                console.log('Managed user - Final allowed MT5 usernames:', allowedSubUsernames);
            } else if (req.user?.allowedSubUsers && Array.isArray(req.user.allowedSubUsers)) {
                // Fallback: use allowedSubUsers from JWT token
                allowedSubUsernames = req.user.allowedSubUsers;
                console.log('Using allowedSubUsers from JWT:', allowedSubUsernames);
            }
            
            if (allowedSubUsernames.length > 0) {
                whereConditions.push(`mt5 IN (?${',?'.repeat(allowedSubUsernames.length - 1)})`);
                params.push(...allowedSubUsernames);
            } else {
                console.log('No allowed sub usernames found - showing no data');
                whereConditions.push('1=0');
            }
        }

        // Snapshot filter
        if (req.query.filter_type === 'snapshot') {
            whereConditions.push('type LIKE ?');
            params.push('%snapshot%');
        }

        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

        // Get total count for pagination
        const [countResult] = await conn.query(
            `SELECT COUNT(*) as total FROM customer_data ${whereClause}`,
            params
        );
        const total = countResult.total;

        // Get paginated data
        const data = await conn.query(
            `SELECT * FROM customer_data ${whereClause} ORDER BY ${orderBy} ${orderDir} LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        // Get unique MT5 values for dropdown - use BOTH parent_user_id AND allowed symbols
        let mt5Options = [];
        if (allowedSymbols !== null) {
            // For managed users: get MT5 options using both parent_user_id and allowed symbols
            const userId = req.user?.id || req.user?.userId || req.session.user_id;
            if (userId) {
                let mt5Query = 'SELECT DISTINCT sub_username AS mt5 FROM sub_users WHERE status = "active" AND parent_user_id = ?';
                let queryParams = [userId];
                
                if (Array.isArray(allowedSymbols) && allowedSymbols.length > 0) {
                    const symbolPlaceholders = allowedSymbols.map(() => '?').join(',');
                    mt5Query += ` AND symbol_ref IN (${symbolPlaceholders})`;
                    queryParams.push(...allowedSymbols);
                }
                
                const result = await conn.query(mt5Query, queryParams);
                mt5Options = result;
            } else if (req.user?.allowedSubUsers && Array.isArray(req.user.allowedSubUsers)) {
                // Fallback: use allowedSubUsers from JWT
                const userPlaceholders = req.user.allowedSubUsers.map(() => '?').join(',');
                const result = await conn.query(
                    `SELECT DISTINCT sub_username AS mt5 FROM sub_users WHERE status = 'active' AND sub_username IN (${userPlaceholders})`,
                    req.user.allowedSubUsers
                );
                mt5Options = result;
            }
        } else {
            // Admin users: get all MT5 options
            const result = await conn.query('SELECT DISTINCT sub_username AS mt5 FROM sub_users WHERE status = "active"');
            mt5Options = result;
        }

        // Get unique order references - use BOTH parent_user_id AND allowed symbols 
        const orderRefQuery = 'SELECT DISTINCT order_ref FROM customer_data WHERE order_ref IS NOT NULL AND order_ref != "" ORDER BY order_ref';
        const orderRefResult = await conn.query(orderRefQuery);
        const orderRefOptions = orderRefResult.filter(row => row.order_ref).map(row => ({ order_ref: row.order_ref }));

        // Get unique symbol references for the logged-in user - use BOTH parent_user_id AND allowed symbols
        let symbolRefOptions = [];
        if (allowedSymbols !== null) {
            // For managed users: get symbols using both parent_user_id and allowed symbols filter
            const userId = req.user?.id || req.user?.userId || req.session.user_id;
            if (userId) {
                let symbolRefQuery = 'SELECT DISTINCT symbol_ref FROM sub_users WHERE status = "active" AND parent_user_id = ? AND symbol_ref IS NOT NULL AND symbol_ref != ""';
                let queryParams = [userId];
                
                if (Array.isArray(allowedSymbols) && allowedSymbols.length > 0) {
                    const symbolPlaceholders = allowedSymbols.map(() => '?').join(',');
                    symbolRefQuery += ` AND symbol_ref IN (${symbolPlaceholders})`;
                    queryParams.push(...allowedSymbols);
                }
                
                symbolRefQuery += ' ORDER BY symbol_ref';
                const symbolRefResult = await conn.query(symbolRefQuery, queryParams);
                symbolRefOptions = symbolRefResult.map(row => ({ symbol_ref: row.symbol_ref }));
            } else if (req.user?.allowedSubUsers && Array.isArray(req.user.allowedSubUsers)) {
                // Fallback: get symbol_ref from allowedSubUsers
                const userPlaceholders = req.user.allowedSubUsers.map(() => '?').join(',');
                const symbolRefResult = await conn.query(
                    `SELECT DISTINCT symbol_ref FROM sub_users WHERE status = 'active' AND sub_username IN (${userPlaceholders}) AND symbol_ref IS NOT NULL AND symbol_ref != '' ORDER BY symbol_ref`,
                    req.user.allowedSubUsers
                );
                symbolRefOptions = symbolRefResult.map(row => ({ symbol_ref: row.symbol_ref }));
            }
        } else {
            // For admin users, get all symbol_ref from sub_users
            const symbolRefQuery = `
                SELECT DISTINCT s.symbol_ref 
                FROM sub_users s 
                WHERE s.status = 'active' 
                AND s.symbol_ref IS NOT NULL 
                AND s.symbol_ref != ''
                ORDER BY s.symbol_ref
            `;
            const symbolRefResult = await conn.query(symbolRefQuery);
            symbolRefOptions = symbolRefResult.map(row => ({ symbol_ref: row.symbol_ref }));
        }

        res.json({
            success: true,
            data: data,
            pagination: {
                total,
                current_page: page,
                total_pages: Math.ceil(total / limit)
            },
            filters: {
                mt5Options,
                orderRefOptions,
                symbolRefOptions
            }
        });
    } catch (error) {
        console.error('Error fetching customer data:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// CSV Export endpoint - exports all customer data based on filters (not paginated)
router.get('/export-csv', authenticateToken, async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();

        let whereConditions = [];
        let params = [];

        // Date range filter
        if (req.query.start_date && req.query.end_date) {
            const start = `${req.query.start_date} ${req.query.start_time || '00:00:00'}`;
            const end = `${req.query.end_date} ${req.query.end_time || '23:59:59'}`;
            whereConditions.push('datetime_server_ts_tz BETWEEN ? AND ?');
            params.push(start, end);
        }

        // Filters
        if (req.query.mt5) {
            const mt5s = Array.isArray(req.query.mt5) ? req.query.mt5 : [req.query.mt5];
            whereConditions.push(`mt5 IN (?${',?'.repeat(mt5s.length - 1)})`);
            params.push(...mt5s);
        }

        if (req.query.order_ref) {
            const orderRefs = Array.isArray(req.query.order_ref) ? req.query.order_ref : [req.query.order_ref];
            whereConditions.push(`order_ref IN (?${',?'.repeat(orderRefs.length - 1)})`);
            params.push(...orderRefs);
        }

        // Order ref starts with filter (for 2025 button)
        if (req.query.order_ref_starts_with) {
            whereConditions.push('order_ref LIKE ?');
            params.push(`${req.query.order_ref_starts_with}%`);
        }

        if (req.query.symbol_ref) {
            const symbolRefs = Array.isArray(req.query.symbol_ref) ? req.query.symbol_ref : [req.query.symbol_ref];
            whereConditions.push(`symbol_ref IN (?${',?'.repeat(symbolRefs.length - 1)})`);
            params.push(...symbolRefs);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        const query = `
            SELECT 
                mt5, order_ref, symbolrate_name, direction, type, volume, price,
                DATE_FORMAT(datetime_server_ts_tz, '%Y-%m-%d %H:%i:%s') as datetime_server_ts_tz,
                swap, profit_loss
            FROM customer_data 
            ${whereClause}
            ORDER BY datetime_server_ts_tz DESC
        `;

        const rows = await conn.query(query, params);

        // Set CSV headers
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="customer_data.csv"');

        // Create CSV content
        const headers = ['MT5', 'Order Ref', 'Symbol', 'Direction', 'Type', 'Volume', 'Price', 'DateTime', 'Swap', 'Profit Loss'];
        let csvContent = headers.join(',') + '\n';

        rows.forEach(row => {
            const csvRow = [
                row.mt5 || '',
                row.order_ref || '',
                row.symbolrate_name || '',
                row.direction || '',
                row.type || '',
                row.volume || 0,
                row.price || 0,
                row.datetime_server_ts_tz || '',
                row.swap || 0,
                row.profit_loss || 0
            ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
            csvContent += csvRow + '\n';
        });

        res.send(csvContent);
    } catch (error) {
        console.error('Error exporting customer data to CSV:', error);
        res.status(500).json({
            success: false,
            error: 'CSV export failed',
            details: error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// Delete rows - allow everyone to delete (no authentication required)
router.delete('/', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();

        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || !ids.length) {
            return res.status(400).json({
                success: false,
                error: 'No rows selected for deletion'
            });
        }

        const result = await conn.query(
            `DELETE FROM customer_data WHERE id IN (${ids.map(() => '?').join(',')})`,
            ids
        );

        res.json({
            success: true,
            message: 'Selected rows deleted successfully',
            affectedRows: result.affectedRows
        });

    } catch (error) {
        console.error('Error deleting customer data:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    } finally {
        if (conn) conn.release();
    }
});

// POST delete route for IIS compatibility - same logic as DELETE
router.post('/delete', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();

        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || !ids.length) {
            return res.status(400).json({
                success: false,
                error: 'No rows selected for deletion'
            });
        }

        const result = await conn.query(
            `DELETE FROM customer_data WHERE id IN (${ids.map(() => '?').join(',')})`,
            ids
        );

        res.json({
            success: true,
            message: 'Selected rows deleted successfully',
            affectedRows: result.affectedRows
        });

    } catch (error) {
        console.error('Error deleting customer data:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    } finally {
        if (conn) conn.release();
    }
});

// Insert new row
router.post('/', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();

        const query = `
            INSERT INTO customer_data (
                api_key, datetime_server_ts_tz, mt5, order_ref, direction, type,
                volume, price, swap, swap_last, balance, equity, floating,
                profit_loss, profit_loss_last, symbolrate_name, currency, volume_total
            ) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            req.body.api_key || null,
            // datetime_server_ts_tz is now set automatically to current timestamp with NOW()
            req.body.mt5 || null,
            req.body.order_ref || null,
            req.body.direction || null,
            req.body.type || null,
            parseFloat(req.body.volume) || null,
            parseFloat(req.body.price) || null,
            parseFloat(req.body.swap) || null,
            parseFloat(req.body.swap_last) || null,
            parseFloat(req.body.balance) || null,
            parseFloat(req.body.equity) || null,
            parseFloat(req.body.floating) || null,
            parseFloat(req.body.profit_loss) || null,
            parseFloat(req.body.profit_loss_last) || null,
            req.body.symbolrate_name || null,
            req.body.currency || null,
            parseFloat(req.body.volume_total) || null
        ];

        const result = await conn.query(query, params);

        res.json({
            success: true,
            message: 'Row inserted successfully',
            id: result.insertId
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    } finally {
        if (conn) conn.release();
    }
});

  return { router };
};
