const express = require('express');

module.exports = function(pool, { authenticateToken, getAllowedSymbols }) {
    const router = express.Router();

    // Date range handler
    async function dateRangeHandler(req, res) {
        let conn;
        try {
            conn = await pool.getConnection();
            const allowed = await getAllowedSymbols(conn, req);
            
            let query = `
                SELECT 
                    MIN(DATE(date)) as minDate,
                    MAX(DATE(date)) as maxDate
                FROM trading_data
                WHERE date IS NOT NULL
                  AND (type IS NULL OR type <> 'snapshot')
            `;
            const params = [];

            if (allowed && allowed.length > 0) {
                query += ` AND symbol_ref IN (${allowed.map(() => '?').join(',')})`;
                params.push(...allowed);
            } else if (Array.isArray(allowed) && allowed.length === 0) {
                return res.json({ minDate: null, maxDate: null });
            }

            const rows = await conn.query(query, params);
            const today = new Date().toISOString().split('T')[0];
            res.json({
                minDate: rows[0]?.minDate || today,
                maxDate: rows[0]?.maxDate || today
            });
        } catch (err) {
            console.error('Date range error:', err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (conn) conn.release();
        }
    }

    // Trading data handler
    async function dataHandler(req, res) {
        let conn;
        try {
            conn = await pool.getConnection();
            const allowed = await getAllowedSymbols(conn, req);
            
            const recordsPerPage = Math.min(parseInt(req.query.limit || '50', 10), 100);
            const currentPage = Math.max(parseInt(req.query.page || '1', 10), 1);
            const offset = (currentPage - 1) * recordsPerPage;
            
            const validColumns = [
                'id', 'buysize1', 'buyprice1', 'sellsize1', 'sellprice1', 
                'buysize2', 'buyprice2', 'sellsize2', 'sellprice2', 
                'symbol_ref', 'mktprice', 'date', 'type', 'buylot', 
                'avgbuy', 'selllot', 'avgsell', 'difflot', 'profit_total', 
                'profit_ratio', 'eq_ratio', 'sal', 'bal', 'sald', 'bald', 
                'balance', 'equity', 'profit_and_loss', 'floating'
            ];
            
            const sortColumn = validColumns.includes(req.query.sort) ? req.query.sort : 'date';
            const sortDirection = req.query.dir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

            // Get default dates if not provided
            const today = new Date().toISOString().split('T')[0];
            const startDate = req.query.start_date || today;
            const endDate = req.query.end_date || today;
            const startTime = req.query.start_time || '00:00';
            const endTime = req.query.end_time || '23:59';
            
            const startOfRange = `${startDate} ${startTime}:00`;
            const endOfRange = `${endDate} ${endTime}:59`;

            let filter = ' WHERE date >= ? AND date <= ? AND (type IS NULL OR type <> ?)';
            const params = [startOfRange, endOfRange, 'snapshot'];

            // Symbol filter with permissions check
            if (req.query.symbol_ref && req.query.symbol_ref.length > 0) {
                const symbols = Array.isArray(req.query.symbol_ref) ? req.query.symbol_ref : [req.query.symbol_ref];
                const allowedSymbols = allowed === null ? symbols : symbols.filter(s => allowed.includes(s));
                
                if (allowedSymbols.length > 0) {
                    filter += ` AND symbol_ref IN (${allowedSymbols.map(() => '?').join(',')})`;
                    params.push(...allowedSymbols);
                } else if (Array.isArray(allowed)) {
                    return res.json({ total: 0, rows: [], summary: {} });
                }
            } else if (Array.isArray(allowed)) {
                if (allowed.length > 0) {
                    filter += ` AND symbol_ref IN (${allowed.map(() => '?').join(',')})`;
                    params.push(...allowed);
                } else {
                    return res.json({ total: 0, rows: [], summary: {} });
                }
            }

            // Get total count
            const totalQuery = `SELECT COUNT(*) as count FROM trading_data ${filter}`;
            const totalRows = await conn.query(totalQuery, params);
            const total = Number(totalRows[0]?.count || 0);

            // Get paginated data with calculated fields
            const dataQuery = `
                SELECT 
                    id, 
                    buysize1, buyprice1, sellsize1, sellprice1,
                    buysize2, buyprice2, sellsize2, sellprice2,
                    symbol_ref, mktprice, date, type,
                    buylot, avgbuy, selllot, avgsell,
                    difflot, profit_total, profit_ratio,
                    eq_ratio, sal, bal, sald, bald,
                    balance, equity, profit_and_loss, floating
                FROM trading_data 
                ${filter} 
                ORDER BY \`${sortColumn}\` ${sortDirection}, \`date\` DESC
                LIMIT ? OFFSET ?
            `;
            
            const rows = await conn.query(dataQuery, [...params, recordsPerPage, offset]);

            // Calculate summary for current page
            const summary = {
                records: rows.length,
                uniqueSymbols: new Set(rows.map(r => r.symbol_ref)).size,
                totalProfit: rows.reduce((sum, r) => sum + (parseFloat(r.profit_total) || 0), 0),
                avgProfit: rows.length ? rows.reduce((sum, r) => sum + (parseFloat(r.profit_total) || 0), 0) / rows.length : 0,
                startDate,
                endDate,
                startTime,
                endTime
            };

            res.json({
                total,
                currentPage,
                totalPages: Math.ceil(total / recordsPerPage),
                recordsPerPage,
                rows,
                summary,
                filters: {
                    startDate,
                    endDate,
                    startTime,
                    endTime,
                    sort: sortColumn,
                    direction: sortDirection.toLowerCase()
                }
            });
        } catch (err) {
            console.error('Trading data fetch error:', err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (conn) conn.release();
        }
    }

    // Symbols handler
    async function symbolsHandler(req, res) {
        let conn;
        try {
            conn = await pool.getConnection();
            const allowed = await getAllowedSymbols(conn, req);
            
            let query = `
                SELECT DISTINCT symbol_ref 
                FROM trading_data 
                WHERE symbol_ref IS NOT NULL 
                  AND symbol_ref != ''
                  AND (type IS NULL OR type <> 'snapshot')
            `;
            const params = [];
            
            if (allowed && allowed.length > 0) {
                query += ` AND symbol_ref IN (${allowed.map(() => '?').join(',')})`;
                params.push(...allowed);
            } else if (Array.isArray(allowed) && allowed.length === 0) {
                return res.json([]);
            }
            
            query += ' ORDER BY symbol_ref';
            const rows = await conn.query(query, params);
            const symbols = rows.map((r) => r.symbol_ref);
            res.json(symbols);
        } catch (err) {
            console.error('Symbols error:', err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (conn) conn.release();
        }
    }

    // Live data handler
    async function liveDataHandler(req, res) {
        let conn;
        try {
            conn = await pool.getConnection();
            const allowed = await getAllowedSymbols(conn, req);
            
            if (Array.isArray(allowed) && allowed.length === 0) {
                return res.json([]);
            }

            let params = [];
            let symbolFilterSql = '';

            if (allowed !== null && allowed.length > 0) {
                symbolFilterSql = ` WHERE symbol_ref IN (${allowed.map(() => '?').join(',')})`;
                params = allowed;
            }

            // Optimized query to get latest data efficiently
            const query = `
    WITH LatestIDs AS (
        SELECT symbol_ref, 
               MAX(id) as latest_id,
               (
                   SELECT id 
                   FROM trading_data t2 
                   WHERE t2.symbol_ref = t1.symbol_ref 
                     AND t2.id < MAX(t1.id)
                   ORDER BY id DESC 
                   LIMIT 1
               ) as prev_id
        FROM trading_data t1
        ${symbolFilterSql}
        GROUP BY symbol_ref
    )
    SELECT t.*,
           UNIX_TIMESTAMP(t.date) as timestamp
    FROM trading_data t
    INNER JOIN LatestIDs l ON t.id = COALESCE(l.prev_id, l.latest_id)
    ORDER BY symbol_ref, timestamp DESC
            `;
            
            const rows = await conn.query(query, params);
            res.json(rows);
        } catch (err) {
            console.error('Live data fetch error:', err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (conn) conn.release();
        }
    }

    // Comments handlers
    async function ensureCommentsTableExists(conn) {
        try {
            await conn.query(`
                CREATE TABLE IF NOT EXISTS trading_comments (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    symbol_ref VARCHAR(64) NOT NULL,
                    comment TEXT NOT NULL,
                    user_id INT DEFAULT 0,
                    username VARCHAR(50) DEFAULT '',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } catch (err) {
            console.error('Comments table setup failed:', err);
        }
    }

    // Add comment handler
    async function addCommentHandler(req, res) {
        let conn;
        try {
            conn = await pool.getConnection();
            
            const { symbol_ref, comment } = req.body;
            if (!symbol_ref || !comment) {
                return res.status(400).json({ success: false, message: 'Missing data' });
            }

            const allowed = await getAllowedSymbols(conn, req);
            if (allowed !== null && !allowed.includes(symbol_ref)) {
                return res.status(403).json({ success: false, message: 'Access denied to this symbol' });
            }

            await ensureCommentsTableExists(conn);

            const user_id = req.user?.id || 0;
            const username = req.user?.username || 'Unknown';

            await conn.query(
                'INSERT INTO trading_comments (symbol_ref, comment, user_id, username) VALUES (?, ?, ?, ?)',
                [symbol_ref, comment, user_id, username]
            );

            res.json({ success: true });
        } catch (err) {
            console.error('Add comment error:', err);
            res.status(500).json({ success: false, message: 'Server error occurred' });
        } finally {
            if (conn) conn.release();
        }
    }

    // Delete comment handler
    async function deleteCommentHandler(req, res) {
        let conn;
        try {
            conn = await pool.getConnection();
            
            const { id } = req.body;
            if (!id) {
                return res.status(400).json({ success: false, message: 'Missing id' });
            }

            await ensureCommentsTableExists(conn);

            const user_id = req.user?.id || 0;
            const is_admin = req.user?.user_type === 'admin';

            if (is_admin) {
                await conn.query('DELETE FROM trading_comments WHERE id = ?', [id]);
            } else {
                await conn.query('DELETE FROM trading_comments WHERE id = ? AND user_id = ?', [id, user_id]);
            }

            res.json({ success: true });
        } catch (err) {
            console.error('Delete comment error:', err);
            res.status(500).json({ success: false, message: 'Server error occurred' });
        } finally {
            if (conn) conn.release();
        }
    }

    // Get comments handler
    async function getCommentsHandler(req, res) {
        let conn;
        try {
            conn = await pool.getConnection();
            
            const { symbol_ref } = req.query;
            if (!symbol_ref) {
                return res.json([]);
            }

            const allowed = await getAllowedSymbols(conn, req);
            if (allowed !== null && !allowed.includes(symbol_ref)) {
                return res.json([]);
            }

            await ensureCommentsTableExists(conn);

            const comments = await conn.query(
                'SELECT id, symbol_ref, comment, user_id, username, created_at FROM trading_comments WHERE symbol_ref = ? ORDER BY created_at DESC',
                [symbol_ref]
            );

            res.json(comments);
        } catch (err) {
            console.error('Get comments error:', err);
            res.status(500).json([]);
        } finally {
            if (conn) conn.release();
        }
    }

    // Mount handlers on router for /raw-data/* paths (backward compatibility)
    router.get('/date-range', authenticateToken, dateRangeHandler);
    router.get('/data', authenticateToken, dataHandler);
    router.get('/symbols', authenticateToken, symbolsHandler);

    // Mount additional handlers
    router.get('/live', authenticateToken, liveDataHandler);

    // Mount comments routes
    router.post('/comments', authenticateToken, addCommentHandler);
    router.delete('/comments', authenticateToken, deleteCommentHandler);
    router.get('/comments', authenticateToken, getCommentsHandler);

    // Return both the router and individual handlers
    return {
        // Express router for mounting at /api/raw-data
        router,
        
        // Individual handlers for mounting directly at /api
        _dateRange: [authenticateToken, dateRangeHandler],
        _data: [authenticateToken, dataHandler],
        _symbols: [authenticateToken, symbolsHandler],
        _live: [authenticateToken, liveDataHandler]
    };
};
