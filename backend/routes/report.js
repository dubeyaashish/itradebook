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

            // RefID starts with filter (for 2025 orders)
            if (req.query.refid_starts_with) {
                filter += ' AND refid LIKE ?';
                params.push(`${req.query.refid_starts_with}%`);
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

    // Insert handler for receive.itradebook
    async function insertHandler(req, res) {
        let conn;
        try {
            conn = await pool.getConnection();
            const allowed = await getAllowedSymbols(conn, req);
            
            // Check if user has permission for this symbol
            if (allowed && allowed.length > 0 && !allowed.includes(req.body.symbolref)) {
                return res.status(403).json({ error: 'Permission denied for this symbol' });
            } else if (Array.isArray(allowed) && allowed.length === 0) {
                return res.status(403).json({ error: 'No symbol permissions' });
            }

            const {
                refid,
                buysize,
                buyprice,
                sellsize,
                sellprice,
                symbolref,
                type
            } = req.body;

            // Validate required fields
            if (!symbolref) {
                return res.status(400).json({ error: 'symbolref is required' });
            }

            const query = `
                INSERT INTO \`receive.itradebook\` 
                (refid, buysize, buyprice, sellsize, sellprice, symbolref, type, date)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            `;

            await conn.query(query, [
                refid || null,
                parseFloat(buysize) || 0,
                parseFloat(buyprice) || 0,
                parseFloat(sellsize) || 0,
                parseFloat(sellprice) || 0,
                symbolref,
                type || null
            ]);

            res.json({ success: true, message: 'Record inserted successfully' });
        } catch (err) {
            console.error('Insert error:', err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (conn) conn.release();
        }
    }

    // Delete handler for receive.itradebook
    async function deleteHandler(req, res) {
        let conn;
        try {
            conn = await pool.getConnection();
            const allowed = await getAllowedSymbols(conn, req);
            
            const ids = req.body.ids;
            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ error: 'No IDs provided' });
            }

            // Check permissions for all records being deleted
            let permissionQuery = 'SELECT id, symbolref FROM `receive.itradebook` WHERE id IN (';
            permissionQuery += ids.map(() => '?').join(',') + ')';
            
            const records = await conn.query(permissionQuery, ids);
            
            if (allowed && allowed.length > 0) {
                const unauthorizedRecords = records.filter(record => !allowed.includes(record.symbolref));
                if (unauthorizedRecords.length > 0) {
                    return res.status(403).json({ error: 'Permission denied for some records' });
                }
            } else if (Array.isArray(allowed) && allowed.length === 0) {
                return res.status(403).json({ error: 'No symbol permissions' });
            }

            // Delete the records
            let deleteQuery = 'DELETE FROM `receive.itradebook` WHERE id IN (';
            deleteQuery += ids.map(() => '?').join(',') + ')';
            
            const result = await conn.query(deleteQuery, ids);
            
            res.json({ 
                success: true, 
                message: `${result.affectedRows} record(s) deleted successfully`,
                deletedCount: result.affectedRows
            });
        } catch (err) {
            console.error('Delete error:', err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (conn) conn.release();
        }
    }

    // CSV Export handler - exports all data based on filters (not paginated)
    async function csvExportHandler(req, res) {
        let conn;
        try {
            conn = await pool.getConnection();
            const allowed = await getAllowedSymbols(conn, req);

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
                } else if (allowed !== null) {
                    return res.json([]); // No allowed symbols
                }
            } else if (allowed !== null && allowed.length > 0) {
                filter += ` AND symbolref IN (${allowed.map(() => '?').join(',')})`;
                params.push(...allowed);
            } else if (Array.isArray(allowed) && allowed.length === 0) {
                return res.json([]);
            }

            // RefID starts with filter (for 2025 button)
            if (req.query.refid_starts_with) {
                filter += ' AND refid LIKE ?';
                params.push(`${req.query.refid_starts_with}%`);
            }

            const query = `
                SELECT 
                    symbolref, refid, type, buyprice, sellprice, 
                    buysize, sellsize, profit_loss, 
                    DATE_FORMAT(date, '%Y-%m-%d %H:%i:%s') as date,
                    commision, swap, volume
                FROM \`receive.itradebook\`
                ${filter}
                ORDER BY date DESC
            `;

            const rows = await conn.query(query, params);

            // Set CSV headers
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="report_data.csv"');

            // Create CSV content
            const headers = ['Symbol Ref', 'Ref ID', 'Type', 'Buy Price', 'Sell Price', 'Buy Size', 'Sell Size', 'Profit/Loss', 'Date', 'Commission', 'Swap', 'Volume'];
            let csvContent = headers.join(',') + '\n';

            rows.forEach(row => {
                const csvRow = [
                    row.symbolref || '',
                    row.refid || '',
                    row.type || '',
                    row.buyprice || 0,
                    row.sellprice || 0,
                    row.buysize || 0,
                    row.sellsize || 0,
                    row.profit_loss || 0,
                    row.date || '',
                    row.commision || 0,
                    row.swap || 0,
                    row.volume || 0
                ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
                csvContent += csvRow + '\n';
            });

            res.send(csvContent);
        } catch (err) {
            console.error('CSV export error:', err);
            res.status(500).json({ error: 'Export failed' });
        } finally {
            if (conn) conn.release();
        }
    }

    // Mount handlers on router for /report/* paths
    router.get('/data', authenticateToken, dataHandler);
    router.get('/export-csv', authenticateToken, csvExportHandler);
    router.get('/refids', authenticateToken, refidsHandler);
    router.post('/data', authenticateToken, insertHandler);
    router.delete('/data', authenticateToken, deleteHandler);

    // Return both the router and individual handlers
    return {
        router,
        _data: [authenticateToken, dataHandler],
        _refids: [authenticateToken, refidsHandler],
        _insert: [authenticateToken, insertHandler],
        _delete: [authenticateToken, deleteHandler]
    };
};
