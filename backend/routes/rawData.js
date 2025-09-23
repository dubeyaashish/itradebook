const express = require('express');

module.exports = function(pool, { authenticateToken, getAllowedSymbols }, dbHelpers) {
    const router = express.Router();
    // Simple in-memory cache for symbols endpoint
    const symbolsCache = new Map(); // key -> { at: number, data: string[] }
    const { getDbConnection } = dbHelpers || {};

    // Live time‑series handler (inside module scope so helpers/pool are available)
    const liveSeriesHandler = async (req, res) => {
        let conn;
        try {
            conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
            await conn.query("SET time_zone = '+07:00'");

            const allowed = await getAllowedSymbols(conn, req);
            if (Array.isArray(allowed) && allowed.length === 0) {
                return res.json([]);
            }

            const limitPerSymbol = Math.min(parseInt(req.query.limit || '60', 10), 500);
            let symbolFilterSql = '';
            const params = [];

            let querySymbols = [];
            if (req.query.symbol_ref) {
                querySymbols = Array.isArray(req.query.symbol_ref) ? req.query.symbol_ref : [req.query.symbol_ref];
            }
            if (allowed !== null && Array.isArray(allowed)) {
                querySymbols = (querySymbols.length ? querySymbols : allowed).filter(s => allowed.includes(s));
            }
            if (querySymbols.length > 0) {
                symbolFilterSql = ` AND t.symbol_ref IN (${querySymbols.map(() => '?').join(',')})`;
                params.push(...querySymbols);
            } else if (Array.isArray(allowed) && allowed.length > 0) {
                symbolFilterSql = ` AND t.symbol_ref IN (${allowed.map(() => '?').join(',')})`;
                params.push(...allowed);
            }

            const todayStr = new Date().toISOString().split('T')[0];
            const startDate = req.query.start_date || todayStr;
            const endDate = req.query.end_date || startDate;
            const startTime = req.query.start_time || '00:00:00';
            const endTime = req.query.end_time || '23:59:59';
            const startTs = `${startDate} ${startTime}`;
            const endTs = `${endDate} ${endTime}`;

            const sql = `
                SELECT * FROM (
                    SELECT 
                        t.symbol_ref,
                        t.date,
                        UNIX_TIMESTAMP(t.date) as ts,
                        t.buylot, t.avgbuy, t.selllot, t.avgsell,
                        t.profit_total, t.profit_ratio, t.difflot,
                        ROW_NUMBER() OVER (PARTITION BY t.symbol_ref ORDER BY t.date DESC, t.id DESC) as rn
                    FROM trading_data t
                    WHERE t.date >= ? AND t.date <= ?
                      AND (t.type IS NULL OR t.type <> 'snapshot')
                      ${symbolFilterSql}
                ) x
                WHERE x.rn <= ?
                ORDER BY x.symbol_ref ASC, x.date ASC
            `;
            params.unshift(startTs, endTs);
            params.push(limitPerSymbol);

            let rows = await conn.query(sql, params);

            // Fallback: if no rows in requested range, fetch most recent N points across all time
            if (!rows || rows.length === 0) {
                const sqlFallback = `
                    SELECT * FROM (
                        SELECT 
                            t.symbol_ref,
                            t.date,
                            UNIX_TIMESTAMP(t.date) as ts,
                            t.buylot, t.avgbuy, t.selllot, t.avgsell,
                            t.profit_total, t.profit_ratio, t.difflot,
                            ROW_NUMBER() OVER (PARTITION BY t.symbol_ref ORDER BY t.date DESC, t.id DESC) as rn
                        FROM trading_data t
                        WHERE (t.type IS NULL OR t.type <> 'snapshot')
                        ${symbolFilterSql}
                    ) x
                    WHERE x.rn <= ?
                    ORDER BY x.symbol_ref ASC, x.date ASC
                `;
                const fbParams = [];
                if (querySymbols.length > 0) fbParams.push(...querySymbols);
                else if (Array.isArray(allowed) && allowed.length > 0) fbParams.push(...allowed);
                fbParams.push(limitPerSymbol);
                rows = await conn.query(sqlFallback, fbParams);
            }

            const map = new Map();
            for (const r of rows || []) {
                if (!r.symbol_ref) continue;
                if (!map.has(r.symbol_ref)) map.set(r.symbol_ref, []);
                map.get(r.symbol_ref).push({
                    ts: Number(r.ts) || 0,
                    profit_ratio: parseFloat(r.profit_ratio ?? (((parseFloat(r.selllot)||0)*(parseFloat(r.avgsell)||0)) / Math.max(1,(parseFloat(r.buylot)||0)*(parseFloat(r.avgbuy)||0)) - 1) * 100) || 0,
                    difflot: parseFloat(r.difflot ?? ((parseFloat(r.buylot)||0) - (parseFloat(r.selllot)||0))) || 0,
                    profit_total: parseFloat(r.profit_total ?? (((parseFloat(r.selllot)||0)*(parseFloat(r.avgsell)||0)) - ((parseFloat(r.buylot)||0)*(parseFloat(r.avgbuy)||0)))) || 0,
                });
            }

            const result = Array.from(map.entries()).map(([symbol_ref, points]) => ({ symbol_ref, points }));
            res.json(result);
        } catch (err) {
            console.error('Live series fetch error:', err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (conn) conn.release();
        }
    };

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
            conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
            await conn.query("SET time_zone = '+07:00'");
            const allowed = await getAllowedSymbols(conn, req);

            // Compose cache key (per user + date range)
            const userId = req.user?.id || 0;
            const sDate = req.query.start_date || '';
            const eDate = req.query.end_date || '';
            const cacheKey = `${Array.isArray(allowed) ? `u:${userId}` : 'all'}|${sDate}|${eDate}`;
            const ttlMs = Math.max(5000, parseInt(process.env.SYMBOLS_CACHE_TTL_MS || '30000', 10));
            const now = Date.now();
            const cached = symbolsCache.get(cacheKey);
            if (cached && (now - cached.at) < ttlMs) {
                return res.json(cached.data);
            }
            
            let query = `
                SELECT DISTINCT symbol_ref 
                FROM trading_data 
                WHERE symbol_ref IS NOT NULL 
                  AND symbol_ref != ''
                  AND (type IS NULL OR type <> 'snapshot')
            `;
            const params = [];

            // If managed and we have explicit allowed list, just return it (fast path)
            if (Array.isArray(allowed)) {
                if (allowed.length === 0) {
                    symbolsCache.set(cacheKey, { at: now, data: [] });
                    return res.json([]);
                }
                const out = [...new Set(allowed)].sort((a,b)=>String(a).localeCompare(String(b)));
                symbolsCache.set(cacheKey, { at: now, data: out });
                return res.json(out);
            }

            // Optional date filters; if not provided, limit to recent N days to avoid full table scans
            if (req.query.start_date && req.query.end_date) {
                query += ' AND date BETWEEN ? AND ?';
                const startTime = req.query.start_time || '00:00:00';
                const endTime = req.query.end_time || '23:59:59';
                params.push(`${req.query.start_date} ${startTime}`, `${req.query.end_date} ${endTime}`);
            } else {
                // Default recent range (configurable). Embed numeric to avoid driver issues with INTERVAL parameter.
                const recentDays = Math.max(1, parseInt(process.env.SYMBOLS_DEFAULT_DAYS || '7', 10));
                query += ` AND date >= (CURDATE() - INTERVAL ${recentDays} DAY)`;
            }
            
            // Note: when allowed === null (no restriction), we skip symbol_ref filter
            
            query += ' ORDER BY symbol_ref';
            const rows = await conn.query(query, params);
            const symbols = rows.map((r) => r.symbol_ref);
            symbolsCache.set(cacheKey, { at: now, data: symbols });
            res.json(symbols);
        } catch (err) {
            console.error('Symbols error:', err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (conn) conn.release();
        }
    }

    // Live data handler (returns second-latest per symbol)
async function liveDataHandler(req, res) {
    let conn;
    try {
        // Use robust connection helper when available
        conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
        // Align timezone with rest of app (Bangkok)
        await conn.query("SET time_zone = '+07:00'");
        
        const allowed = await getAllowedSymbols(conn, req);
        
        if (Array.isArray(allowed) && allowed.length === 0) {
            return res.json([]);
        }

        // Build date range using session time zone (+07:00) and CURDATE for index-friendly filtering
        // Avoid DATE() on column to keep index usage
        let params = [];
        let symbolFilterSql = '';
        if (allowed !== null && allowed.length > 0) {
            symbolFilterSql = ` AND symbol_ref IN (${allowed.map(() => '?').join(',')})`;
            params.push(...allowed);
        }

        // Main query: today only (fast path)
        const queryToday = `
            SELECT * FROM (
                SELECT t.*,
                       UNIX_TIMESTAMP(t.date) as timestamp,
                       ROW_NUMBER() OVER (PARTITION BY symbol_ref ORDER BY date DESC, id DESC) as row_num
                FROM trading_data t
                WHERE t.date >= CURDATE() AND t.date < (CURDATE() + INTERVAL 1 DAY)
                ${symbolFilterSql}
            ) x
            WHERE x.row_num <= 2
            ORDER BY x.symbol_ref, x.date DESC, x.id DESC
        `;
        console.log('🔍 /api/live today query start', { user: req.user?.username, tz: '+07:00', symbols: Array.isArray(allowed) ? allowed.length : 'all' });
        const startTime = Date.now();
        let rows = await conn.query(queryToday, params);
        let duration = Date.now() - startTime;
        console.log(`✅ /api/live today in ${duration}ms, rows=${rows.length}`);

        // Fallback: if no rows for today, return second-latest across all time (index on symbol_ref,date,id helps)
        if (!rows || rows.length === 0) {
            const fallbackStart = Date.now();
            const queryAll = `
                SELECT * FROM (
                    SELECT t.*,
                           UNIX_TIMESTAMP(t.date) as timestamp,
                           ROW_NUMBER() OVER (PARTITION BY symbol_ref ORDER BY date DESC, id DESC) as row_num
                    FROM trading_data t
                    ${symbolFilterSql ? `WHERE 1=1 ${symbolFilterSql}` : ''}
                ) x
                WHERE x.row_num <= 2
                ORDER BY x.symbol_ref, x.date DESC, x.id DESC
            `;
            rows = await conn.query(queryAll, params);
            duration = Date.now() - fallbackStart;
            console.log(`↩️  /api/live fallback(all-time) in ${duration}ms, rows=${rows.length}`);
        }
        
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
    router.get('/live-series', authenticateToken, liveSeriesHandler);

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

            // Live alert evaluation for this symbol (non-blocking)
            try {
                const alerts = req.app && req.app.get('alerts');
                if (alerts && typeof alerts.evaluate === 'function') {
                    // Evaluate only this symbol to avoid scanning all rules
                    setImmediate(() => {
                        alerts.evaluate([symbol_ref]).catch((e)=>console.error('Alert live eval error:', e?.message));
                    });
                }
            } catch (e) {
                console.error('Alert live eval dispatch failed:', e?.message);
            }

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
        _liveSeries: [authenticateToken, liveSeriesHandler],
        _exportCSV: [authenticateToken, csvExportHandler]
    };
};

// Live time-series handler: returns last N points for today per symbol
async function liveSeriesHandler(req, res) {
    let conn;
    try {
        conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
        await conn.query("SET time_zone = '+07:00'");

        const allowed = await getAllowedSymbols(conn, req);
        if (Array.isArray(allowed) && allowed.length === 0) {
            return res.json([]);
        }

        const limitPerSymbol = Math.min(parseInt(req.query.limit || '60', 10), 500);
        let symbolFilterSql = '';
        const params = [];

        // Symbol filters from query
        let querySymbols = [];
        if (req.query.symbol_ref) {
            querySymbols = Array.isArray(req.query.symbol_ref) ? req.query.symbol_ref : [req.query.symbol_ref];
        }
        if (allowed !== null) {
            // Intersect with allowed
            if (Array.isArray(allowed)) {
                querySymbols = (querySymbols.length ? querySymbols : allowed).filter(s => allowed.includes(s));
            }
        }
        if (querySymbols.length > 0) {
            symbolFilterSql = ` AND t.symbol_ref IN (${querySymbols.map(() => '?').join(',')})`;
            params.push(...querySymbols);
        } else if (Array.isArray(allowed) && allowed.length > 0) {
            symbolFilterSql = ` AND t.symbol_ref IN (${allowed.map(() => '?').join(',')})`;
            params.push(...allowed);
        }

        // Date range
        const todayStr = new Date().toISOString().split('T')[0];
        const startDate = req.query.start_date || todayStr;
        const endDate = req.query.end_date || startDate;
        const startTime = req.query.start_time || '00:00:00';
        const endTime = req.query.end_time || '23:59:59';
        const startTs = `${startDate} ${startTime}`;
        const endTs = `${endDate} ${endTime}`;

        const sql = `
          SELECT * FROM (
            SELECT 
              t.symbol_ref,
              t.date,
              UNIX_TIMESTAMP(t.date) as ts,
              t.buylot, t.avgbuy, t.selllot, t.avgsell,
              t.profit_total, t.profit_ratio, t.difflot,
              ROW_NUMBER() OVER (PARTITION BY t.symbol_ref ORDER BY t.date DESC, t.id DESC) as rn
            FROM trading_data t
            WHERE t.date >= ? AND t.date <= ?
              AND (t.type IS NULL OR t.type <> 'snapshot')
              ${symbolFilterSql}
          ) x
          WHERE x.rn <= ?
          ORDER BY x.symbol_ref ASC, x.date ASC
        `;
        params.unshift(startTs, endTs);
        params.push(limitPerSymbol);

        const rows = await conn.query(sql, params);

        // Group into series per symbol with the three metrics
        const map = new Map();
        for (const r of rows) {
            if (!r.symbol_ref) continue;
            if (!map.has(r.symbol_ref)) map.set(r.symbol_ref, []);
            map.get(r.symbol_ref).push({
                ts: Number(r.ts) || 0,
                profit_ratio: parseFloat(r.profit_ratio ?? (((parseFloat(r.selllot)||0)*(parseFloat(r.avgsell)||0)) / Math.max(1,(parseFloat(r.buylot)||0)*(parseFloat(r.avgbuy)||0)) - 1) * 100) || 0,
                difflot: parseFloat(r.difflot ?? ((parseFloat(r.buylot)||0) - (parseFloat(r.selllot)||0))) || 0,
                profit_total: parseFloat(r.profit_total ?? (((parseFloat(r.selllot)||0)*(parseFloat(r.avgsell)||0)) - ((parseFloat(r.buylot)||0)*(parseFloat(r.avgbuy)||0)))) || 0,
            });
        }

        const result = Array.from(map.entries()).map(([symbol_ref, points]) => ({ symbol_ref, points }));
        res.json(result);
    } catch (err) {
        console.error('Live series fetch error:', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
}
