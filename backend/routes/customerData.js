const express = require('express');

module.exports = (pool, { authenticateToken, getAllowedSymbols }) => {
  const router = express.Router();

// Get customer data
router.get('/', authenticateToken, async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const allowedSymbols = await getAllowedSymbols(conn, req);

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

        // Add symbol restriction for managed users
        if (allowedSymbols !== null && !req.query.mt5) {
            const subUsersQuery = 'SELECT DISTINCT sub_username FROM sub_users WHERE status = "active" AND parent_user_id = ?';
            const subUsersResult = await conn.query(subUsersQuery, [req.session.user_id]);
            const allowedSubUsernames = subUsersResult.map(row => row.sub_username);
            
            if (allowedSubUsernames.length > 0) {
                whereConditions.push(`mt5 IN (?${',?'.repeat(allowedSubUsernames.length - 1)})`);
                params.push(...allowedSubUsernames);
            } else {
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

        // Get unique MT5 values for dropdown
        let mt5Options = [];
        const mt5Query = 'SELECT DISTINCT sub_username AS mt5 FROM sub_users WHERE status = "active"';
        if (allowedSymbols !== null) {
            const result = await conn.query(
                mt5Query + ' AND parent_user_id = ?',
                [req.session.user_id]
            );
            mt5Options = result;
        } else {
            const result = await conn.query(mt5Query);
            mt5Options = result;
        }

        // Get unique order references
        const orderRefQuery = 'SELECT DISTINCT order_ref FROM customer_data WHERE order_ref IS NOT NULL AND order_ref != "" ORDER BY order_ref';
        const orderRefResult = await conn.query(orderRefQuery);
        const orderRefOptions = orderRefResult.filter(row => row.order_ref).map(row => ({ order_ref: row.order_ref }));

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
                orderRefOptions
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

// Delete rows
router.delete('/', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || !ids.length) {
            return res.status(400).json({
                success: false,
                error: 'No rows selected for deletion'
            });
        }

        const [result] = await connection.execute(
            'DELETE FROM customer_data WHERE id IN (?)',
            [ids]
        );

        res.json({
            success: true,
            message: 'Selected rows deleted successfully',
            affectedRows: result.affectedRows
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

// Insert new row
router.post('/', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        const query = `
            INSERT INTO customer_data (
                api_key, datetime_server_ts_tz, mt5, order_ref, direction, type,
                volume, price, swap, swap_last, balance, equity, floating,
                profit_loss, profit_loss_last, symbolrate_name, currency, volume_total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            req.body.api_key || null,
            req.body.datetime_server_ts_tz || null,
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

        const [result] = await connection.execute(query, params);

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
        if (connection) {
            await connection.end();
        }
    }
});

  return { router };
};
