const express = require('express');
const router = express.Router();

module.exports = function(pool, { authenticateToken, getAllowedSymbols }) {
    // Data handler
    async function dataHandler(req, res) {
        let conn;
        try {
            conn = await pool.getConnection();
            const allowed = await getAllowedSymbols(conn, req);
            
            const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);
            const page = Math.max(parseInt(req.query.page || '1', 10), 1);
            const offset = (page - 1) * limit;

            let filter = ' WHERE 1=1';
            const params = [];

            // Date range filter
            if (req.query.start_date && req.query.end_date) {
                const start = `${req.query.start_date} ${req.query.start_time || '00:00:00'}`;
                const end = `${req.query.end_date} ${req.query.end_time || '23:59:59'}`;
                filter += ' AND date BETWEEN ? AND ?';
                params.push(start, end);
            }

            // Symbol filter with permissions check
            if (req.query.symbolref && req.query.symbolref.length > 0) {
                const symbols = Array.isArray(req.query.symbolref) ? req.query.symbolref : [req.query.symbolref];
                const allowedSymbols = allowed === null ? symbols : symbols.filter(s => allowed.includes(s));
                
                if (allowedSymbols.length > 0) {
                    filter += ` AND symbolref IN (${allowedSymbols.map(() => '?').join(',')})`;
                    params.push(...allowedSymbols);
                } else if (Array.isArray(allowed)) {
                    return res.json({ total: 0, rows: [] });
                }
            } else if (Array.isArray(allowed)) {
                if (allowed.length > 0) {
                    filter += ` AND symbolref IN (${allowed.map(() => '?').join(',')})`;
                    params.push(...allowed);
                } else {
                    return res.json({ total: 0, rows: [] });
                }
            }

            // RefID filter
            if (req.query.refid && req.query.refid.length > 0) {
                const refids = Array.isArray(req.query.refid) ? req.query.refid : [req.query.refid];
                filter += ` AND refid IN (${refids.map(() => '?').join(',')})`;
                params.push(...refids);
            }

            // Type filter
            if (req.query.filter_type === 'snapshot') {
                filter += ' AND type = ?';
                params.push('snapshot');
            }

            // Get total count
            const totalQuery = `SELECT COUNT(*) as count FROM \`receive.itradebook\` ${filter}`;
            const totalRows = await conn.query(totalQuery, params);
            const total = Number(totalRows[0]?.count || 0);

            // Sort handling
            const validColumns = [
                'id', 'refid', 'buysize', 'buyprice', 'sellsize', 'sellprice', 
                'symbolref', 'date', 'type'
            ];
            const orderBy = validColumns.includes(req.query.order_by) ? req.query.order_by : 'date';
            const orderDir = req.query.order_dir === 'asc' ? 'ASC' : 'DESC';

            // Get paginated data with calculated fields
            const dataQuery = `
                SELECT 
                    id, refid,
                    buysize, buyprice, sellsize, sellprice,
                    symbolref, date, type,
                    buysize as buysize1, buyprice as buyprice1,
                    sellsize as sellsize1, sellprice as sellprice1,
                    0 as buysize2, 0 as buyprice2,
                    0 as sellsize2, 0 as sellprice2,
                    0 as mktprice,
                    buysize as buylot, buyprice as avgbuy,
                    sellsize as selllot, sellprice as avgsell,
                    (buysize - sellsize) as difflot,
                    ((sellsize * sellprice) - (buysize * buyprice)) as profit_total,
                    CASE 
                        WHEN (buysize * buyprice) > 0 
                        THEN (((sellsize * sellprice) / (buysize * buyprice)) - 1) * 100
                        ELSE 0 
                    END as profit_ratio,
                    0 as eq_ratio,
                    0 as equity, 0 as balance, 0 as pnl, 0 as floating
                FROM \`receive.itradebook\`
                ${filter} 
                ORDER BY \`${orderBy}\` ${orderDir} 
                LIMIT ? OFFSET ?
            `;
            
            const rows = await conn.query(dataQuery, [...params, limit, offset]);
            res.json({ total, rows });
        } catch (err) {
            console.error('Report data fetch error:', err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (conn) conn.release();
        }
    }

    // Refids handler
    async function refidsHandler(req, res) {
        let conn;
        try {
            conn = await pool.getConnection();
            const allowed = await getAllowedSymbols(conn, req);
            
            let query = 'SELECT DISTINCT refid FROM `receive.itradebook` WHERE refid IS NOT NULL AND refid != ""';
            const params = [];
            
            if (allowed && allowed.length > 0) {
                query += ` AND symbolref IN (${allowed.map(() => '?').join(',')})`;
                params.push(...allowed);
            } else if (Array.isArray(allowed) && allowed.length === 0) {
                return res.json([]);
            }
            
            query += ' ORDER BY refid';
            const rows = await conn.query(query, params);
            const refids = rows.map((r) => r.refid);
            res.json(refids);
        } catch (err) {
            console.error('Refids error:', err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (conn) conn.release();
        }
    }

    // Mount handlers on router for /report/* paths
    router.get('/data', authenticateToken, dataHandler);
    router.get('/refids', authenticateToken, refidsHandler);

    // Return both the router and individual handlers
    return {
        router,
        _data: [authenticateToken, dataHandler],
        _refids: [authenticateToken, refidsHandler]
    };
};
