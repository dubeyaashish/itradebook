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
// Live data handler - OPTIMIZED VERSION
async function liveDataHandler(req, res) {
    let conn;
    try {
        // Add timeout for this endpoint
        conn = await pool.getConnection();
        
        const allowed = await getAllowedSymbols(conn, req);
        
        if (Array.isArray(allowed) && allowed.length === 0) {
            return res.json([]);
        }

        let params = [];
        let symbolFilterSql = '';

        // Add today's date filter
        const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format
        params.push(today);

        if (allowed !== null && allowed.length > 0) {
            symbolFilterSql = ` AND symbol_ref IN (${allowed.map(() => '?').join(',')})`;
            params.push(...allowed);
        }

        // Optimized query - remove the expensive COUNT subquery
        const query = `
            SELECT t.*,
                   UNIX_TIMESTAMP(t.date) as timestamp
            FROM (
                SELECT *,
                       ROW_NUMBER() OVER (PARTITION BY symbol_ref ORDER BY date DESC, id DESC) as row_num
                FROM trading_data
                WHERE DATE(date) = ?
                ${symbolFilterSql}
            ) t
            WHERE t.row_num <= 2
            ORDER BY t.symbol_ref, t.date DESC
        `;
        
        console.log('🔍 Starting optimized live data query for user:', req.user?.username);
        const startTime = Date.now();
        const rows = await conn.query(query, params);
        const duration = Date.now() - startTime;
        console.log(`✅ Live data query completed in ${duration}ms, returned ${rows.length} raw rows for today (${today})`);
        
        // Group by symbol and pick the right record for each
        const resultMap = new Map();
        rows.forEach(row => {
            const symbolRef = row.symbol_ref;
            const existing = resultMap.get(symbolRef);
            
            if (!existing) {
                // First record for this symbol
                resultMap.set(symbolRef, row);
            } else if (row.row_num === 2 && existing.row_num === 1) {
                // We found the 2nd record, replace the 1st record
                resultMap.set(symbolRef, row);
            }
            // If we already have row_num = 2, keep it (ignore any row_num = 1)
        });

        // Convert back to array
        const finalRows = Array.from(resultMap.values());
        console.log(`📊 Filtered to ${finalRows.length} final rows (second latest per symbol)`);
        
        res.json(finalRows);
    } catch (err) {
        console.error('Live data fetch error:', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
}

    // Comment functionality has been moved to dedicated /routes/comments.js
    // All comment operations are now handled by /api/comments endpoints

    // Mount handlers on router for /raw-data/* paths (backward compatibility)
    router.get('/date-range', authenticateToken, dateRangeHandler);
    router.get('/data', authenticateToken, dataHandler);
    router.get('/symbols', authenticateToken, symbolsHandler);

    // Mount additional handlers
    router.get('/live', authenticateToken, liveDataHandler);

    // Insert trading data handler
    async function insertTradingDataHandler(req, res) {
        let conn;
        try {
            conn = await pool.getConnection();
            
            const {
                symbol_ref, mktprice, buysize1, buyprice1, sellsize1, sellprice1,
                buysize2, buyprice2, sellsize2, sellprice2, type, balance, equity, 
                profit_and_loss, floating
            } = req.body;
            
            if (!symbol_ref) {
                return res.status(400).json({ success: false, message: 'Symbol is required' });
            }

            const allowed = await getAllowedSymbols(conn, req);
            if (allowed !== null && !allowed.includes(symbol_ref)) {
                return res.status(403).json({ success: false, message: 'Access denied to this symbol' });
            }

            const query = `
                INSERT INTO trading_data (
                    symbol_ref, mktprice, buysize1, buyprice1, sellsize1, sellprice1,
                    buysize2, buyprice2, sellsize2, sellprice2, type, balance, equity,
                    profit_and_loss, floating, date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `;

            const params = [
                symbol_ref,
                parseFloat(mktprice) || 0,
                parseFloat(buysize1) || 0,
                parseFloat(buyprice1) || 0,
                parseFloat(sellsize1) || 0,
                parseFloat(sellprice1) || 0,
                parseFloat(buysize2) || 0,
                parseFloat(buyprice2) || 0,
                parseFloat(sellsize2) || 0,
                parseFloat(sellprice2) || 0,
                type || null,
                parseFloat(balance) || 0,
                parseFloat(equity) || 0,
                parseFloat(profit_and_loss) || 0,
                parseFloat(floating) || 0
            ];

            const result = await conn.query(query, params);

            res.json({
                success: true,
                message: 'Trading data inserted successfully',
                id: result.insertId
            });

        } catch (err) {
            console.error('Insert trading data error:', err);
            res.status(500).json({ success: false, message: 'Server error occurred' });
        } finally {
            if (conn) conn.release();
        }
    }

    // Delete trading data handler
    async function deleteTradingDataHandler(req, res) {
        let conn;
        try {
            conn = await pool.getConnection();
            
            const { ids } = req.body;
            
            if (!Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ success: false, message: 'No IDs provided' });
            }

            // NO PERMISSION CHECKS - ALLOW EVERYONE TO DELETE

            const deleteQuery = `DELETE FROM trading_data WHERE id IN (${ids.map(() => '?').join(',')})`;
            const result = await conn.query(deleteQuery, ids);

            res.json({
                success: true,
                message: `${result.affectedRows} records deleted successfully`,
                affectedRows: result.affectedRows
            });

        } catch (err) {
            console.error('Delete trading data error:', err);
            res.status(500).json({ success: false, message: 'Server error occurred' });
        } finally {
            if (conn) conn.release();
        }
    }

    // CSV Export handler for Trading Data - exports all data based on filters (not paginated)
    async function csvExportHandler(req, res) {
        let conn;
        try {
            conn = await pool.getConnection();
            const allowed = await getAllowedSymbols(conn, req);
            
            if (Array.isArray(allowed) && allowed.length === 0) {
                return res.json([]);
            }

            let filter = ' WHERE 1=1';
            let params = [];

            // Date range filter
            if (req.query.start_date && req.query.end_date) {
                filter += ' AND date BETWEEN ? AND ?';
                params.push(req.query.start_date, req.query.end_date);
            }

            // Symbol filter with permission check
            if (req.query.symbols && req.query.symbols.length > 0) {
                const symbols = Array.isArray(req.query.symbols) ? req.query.symbols : [req.query.symbols];
                const allowedSymbols = allowed === null ? symbols : symbols.filter(s => allowed.includes(s));
                
                if (allowedSymbols.length > 0) {
                    filter += ` AND symbol_ref IN (${allowedSymbols.map(() => '?').join(',')})`;
                    params.push(...allowedSymbols);
                } else if (allowed !== null) {
                    return res.json([]);
                }
            } else if (allowed !== null && allowed.length > 0) {
                filter += ` AND symbol_ref IN (${allowed.map(() => '?').join(',')})`;
                params.push(...allowed);
            }

            const query = `
                SELECT 
                    symbol_ref, 
                    DATE_FORMAT(date, '%Y-%m-%d %H:%i:%s') as date,
                    type, price, volume, profit_loss, commission, swap
                FROM trading_data
                ${filter}
                ORDER BY date DESC
            `;
            
            const rows = await conn.query(query, params);

            // Set CSV headers
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="trading_data.csv"');

            // Create CSV content
            const headers = ['Symbol Ref', 'Date', 'Type', 'Price', 'Volume', 'Profit/Loss', 'Commission', 'Swap'];
            let csvContent = headers.join(',') + '\n';

            rows.forEach(row => {
                const csvRow = [
                    row.symbol_ref || '',
                    row.date || '',
                    row.type || '',
                    row.price || 0,
                    row.volume || 0,
                    row.profit_loss || 0,
                    row.commission || 0,
                    row.swap || 0
                ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
                csvContent += csvRow + '\n';
            });

            res.send(csvContent);
        } catch (err) {
            console.error('Trading data CSV export error:', err);
            res.status(500).json({ error: 'CSV export failed' });
        } finally {
            if (conn) conn.release();
        }
    }

    // Comment routes removed - now handled by dedicated /api/comments endpoints
    router.get('/export-csv', authenticateToken, csvExportHandler);
    
    // Mount trading data CRUD routes
    router.post('/', authenticateToken, insertTradingDataHandler);
    router.delete('/', authenticateToken, deleteTradingDataHandler);
    router.post('/delete', authenticateToken, deleteTradingDataHandler); // POST delete route for IIS compatibility

    // Return both the router and individual handlers
    return {
        // Express router for mounting at /api/raw-data
        router,
        
        // Individual handlers for mounting directly at /api
        _dateRange: [authenticateToken, dateRangeHandler],
        _data: [authenticateToken, dataHandler],
        _symbols: [authenticateToken, symbolsHandler],
        _live: [authenticateToken, liveDataHandler],
        _exportCSV: [authenticateToken, csvExportHandler]
    };
};
