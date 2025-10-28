const express = require('express');

module.exports = function(pool, { authenticateToken, getAllowedSymbols }) {
    const router = express.Router();
    
    // Get EOD Balance data with filters and pagination
    router.get('/', authenticateToken, async (req, res) => {
        let conn;
        try {
            conn = await pool.getConnection();
            const allowed = await getAllowedSymbols(conn, req);
            
            // Pagination
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const offset = (page - 1) * limit;

            // Build WHERE clause for filters
            let whereConditions = ['1=1'];
            let params = [];

            // Date range filter
            if (req.query.start_date && req.query.end_date) {
                whereConditions.push('day_key BETWEEN ? AND ?');
                params.push(req.query.start_date, req.query.end_date);
            } else if (req.query.start_date) {
                whereConditions.push('day_key >= ?');
                params.push(req.query.start_date);
            } else if (req.query.end_date) {
                whereConditions.push('day_key <= ?');
                params.push(req.query.end_date);
            }

            // Symbol filter
            if (req.query.symbol_ref && req.query.symbol_ref.length > 0) {
                const symbolRefs = Array.isArray(req.query.symbol_ref) ? req.query.symbol_ref : [req.query.symbol_ref];
                const placeholders = symbolRefs.map(() => '?').join(',');
                whereConditions.push(`symbol_ref IN (${placeholders})`);
                params.push(...symbolRefs);
            }

            // Apply symbol restrictions for managed users
            if (allowed && allowed.length > 0) {
                const symbolPlaceholders = allowed.map(() => '?').join(',');
                whereConditions.push(`symbol_ref IN (${symbolPlaceholders})`);
                params.push(...allowed);
            } else if (allowed && allowed.length === 0) {
                // Managed user with no allowed symbols
                return res.json({
                    success: true,
                    data: [],
                    pagination: { total: 0, current_page: 1, total_pages: 0, records_per_page: limit }
                });
            }

            const whereClause = whereConditions.join(' AND ');

            // Get total count for pagination
            const countQuery = `SELECT COUNT(*) as total FROM dw_accumulator WHERE ${whereClause}`;
            const countResult = await conn.query(countQuery, params);
            const total = countResult[0].total;

            // Get data with pagination
            const dataQuery = `
                SELECT 
                    symbol_ref,
                    day_key,
                    total_deposit,
                    total_withdrawal,
                    (total_deposit - total_withdrawal) as net,
                    last_second_id,
                    last_third_id,
                    updated_at
                FROM dw_accumulator 
                WHERE ${whereClause}
                ORDER BY day_key DESC, symbol_ref ASC
                LIMIT ? OFFSET ?
            `;
            
            const data = await conn.query(dataQuery, [...params, limit, offset]);

            // Get unique symbols for filter dropdown
            let symbolQuery = 'SELECT DISTINCT symbol_ref FROM dw_accumulator WHERE symbol_ref IS NOT NULL';
            let symbolParams = [];
            
            if (allowed && allowed.length > 0) {
                const symbolPlaceholders = allowed.map(() => '?').join(',');
                symbolQuery += ` AND symbol_ref IN (${symbolPlaceholders})`;
                symbolParams = allowed;
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

        } catch (err) {
            console.error('EOD Balance error:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Server error occurred',
                details: err.message 
            });
        } finally {
            if (conn) conn.release();
        }
    });

    // Get available symbols for EOD Balance (for dropdown)
    router.get('/symbols', authenticateToken, async (req, res) => {
        let conn;
        try {
            conn = await pool.getConnection();
            const allowed = await getAllowedSymbols(conn, req);

            let query = 'SELECT DISTINCT symbol_ref FROM dw_accumulator WHERE symbol_ref IS NOT NULL';
            let queryParams = [];
            
            if (allowed && allowed.length > 0) {
                const placeholders = allowed.map(() => '?').join(',');
                query += ` AND symbol_ref IN (${placeholders})`;
                queryParams = allowed;
            } else if (allowed && allowed.length === 0) {
                return res.json([]);
            }
            
            query += ' ORDER BY symbol_ref ASC';

            const results = await conn.query(query, queryParams);
            
            const symbols = results.map(row => ({
                value: row.symbol_ref,
                label: row.symbol_ref
            }));

            res.json(symbols);

        } catch (err) {
            console.error('EOD Balance symbols error:', err);
            res.status(500).json([]);
        } finally {
            if (conn) conn.release();
        }
    });

    // Export as CSV
    router.get('/export', authenticateToken, async (req, res) => {
        let conn;
        try {
            conn = await pool.getConnection();
            const allowed = await getAllowedSymbols(conn, req);

            // Build WHERE clause for filters (same as main query)
            let whereConditions = ['1=1'];
            let params = [];

            if (req.query.start_date && req.query.end_date) {
                whereConditions.push('day_key BETWEEN ? AND ?');
                params.push(req.query.start_date, req.query.end_date);
            } else if (req.query.start_date) {
                whereConditions.push('day_key >= ?');
                params.push(req.query.start_date);
            } else if (req.query.end_date) {
                whereConditions.push('day_key <= ?');
                params.push(req.query.end_date);
            }

            if (req.query.symbol_ref && req.query.symbol_ref.length > 0) {
                const symbolRefs = Array.isArray(req.query.symbol_ref) ? req.query.symbol_ref : [req.query.symbol_ref];
                const placeholders = symbolRefs.map(() => '?').join(',');
                whereConditions.push(`symbol_ref IN (${placeholders})`);
                params.push(...symbolRefs);
            }

            if (allowed && allowed.length > 0) {
                const symbolPlaceholders = allowed.map(() => '?').join(',');
                whereConditions.push(`symbol_ref IN (${symbolPlaceholders})`);
                params.push(...allowed);
            } else if (allowed && allowed.length === 0) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const whereClause = whereConditions.join(' AND ');

            // Get all data for export (no pagination)
            const exportQuery = `
                SELECT 
                    symbol_ref as 'Symbol',
                    day_key as 'Date',
                    CAST(total_deposit as DECIMAL(20,8)) as 'Total Deposit',
                    CAST(total_withdrawal as DECIMAL(20,8)) as 'Total Withdrawal',
                    CAST((total_deposit - total_withdrawal) as DECIMAL(20,8)) as 'Net',
                    last_second_id as 'Last Second ID',
                    last_third_id as 'Last Third ID',
                    updated_at as 'Updated At'
                FROM dw_accumulator 
                WHERE ${whereClause}
                ORDER BY day_key DESC, symbol_ref ASC
            `;
            
            const data = await conn.query(exportQuery, params);

            if (data.length === 0) {
                return res.status(404).json({ error: 'No data found for export' });
            }

            // Convert to CSV
            const headers = Object.keys(data[0]);
            const csvContent = [
                headers.join(','),
                ...data.map(row => 
                    headers.map(header => {
                        const value = row[header];
                        // Handle null values and escape quotes
                        if (value === null || value === undefined) return '';
                        const stringValue = String(value);
                        // Escape quotes and wrap in quotes if contains comma, quote, or newline
                        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                            return `"${stringValue.replace(/"/g, '""')}"`;
                        }
                        return stringValue;
                    }).join(',')
                )
            ].join('\n');

            // Set headers for file download
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
            const filename = `eod_balance_${timestamp}.csv`;
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(csvContent);

        } catch (err) {
            console.error('EOD Balance export error:', err);
            res.status(500).json({ 
                error: 'Export failed',
                details: err.message 
            });
        } finally {
            if (conn) conn.release();
        }
    });

    return { router };
};