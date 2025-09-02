const express = require('express');

module.exports = function(pool, { authenticateToken, getAllowedSymbols }) {
    const router = express.Router();
    // Get comments for a symbol
    router.get('/:symbol_ref', authenticateToken, async (req, res) => {
        const { symbol_ref } = req.params;
        
        if (!symbol_ref) {
            return res.json([]);
        }

        let conn;
        try {
            conn = await pool.getConnection();
            const allowed = await getAllowedSymbols(conn, req);
            
            if (allowed && !allowed.includes(symbol_ref)) {
                return res.json([]);
            }

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
    });

    // Add a comment
    router.post('/', authenticateToken, async (req, res) => {
        const { symbol_ref, comment } = req.body;
        
        if (!symbol_ref || !comment?.trim()) {
            return res.status(400).json({ success: false, message: 'Missing data' });
        }

        let conn;
        try {
            conn = await pool.getConnection();
            const allowed = await getAllowedSymbols(conn, req);
            
            if (allowed && !allowed.includes(symbol_ref)) {
                return res.status(403).json({ success: false, message: 'Access denied to this symbol' });
            }

            await conn.query(
                'INSERT INTO trading_comments (symbol_ref, comment, user_id, username) VALUES (?, ?, ?, ?)',
                [symbol_ref, comment.trim(), req.user.id, req.user.username]
            );

            res.json({ success: true });
        } catch (err) {
            console.error('Add comment error:', err);
            res.status(500).json({ success: false, message: 'Server error occurred' });
        } finally {
            if (conn) conn.release();
        }
    });

    // Delete a comment
    router.delete('/:id', async (req, res) => {
        console.log('🔍 Delete comment - BEFORE auth middleware:', {
            id: req.params.id,
            authHeader: req.headers.authorization ? 'Token present' : 'No token',
            url: req.url,
            method: req.method
        });
        
        // Call authenticateToken manually to see where it fails
        try {
            await new Promise((resolve, reject) => {
                authenticateToken(req, res, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        } catch (authError) {
            console.log('❌ Authentication failed:', authError);
            return res.status(403).json({ success: false, message: 'Authentication failed', error: authError.message });
        }
        
        const { id } = req.params;
        
        console.log('🔍 Delete comment - AFTER auth middleware:', {
            id,
            user: req.user ? { id: req.user.id, username: req.user.username, type: req.user.user_type } : 'NO USER'
        });
        
        if (!id) {
            console.log('❌ Missing comment ID');
            return res.status(400).json({ success: false, message: 'Missing id' });
        }

        let conn;
        try {
            conn = await pool.getConnection();
            
            // First, check if the comment exists
            const commentCheck = await conn.query(
                'SELECT id, user_id, username FROM trading_comments WHERE id = ?',
                [id]
            );
            
            console.log('🔍 Comment check result:', commentCheck);
            
            if (commentCheck.length === 0) {
                console.log('❌ Comment not found in database');
                return res.status(404).json({ success: false, message: 'Comment not found' });
            }
            
            // Allow all authenticated users to delete any comment
            const result = await conn.query('DELETE FROM trading_comments WHERE id = ?', [id]);
            
            console.log('✅ Delete result:', { affectedRows: result.affectedRows });
            
            res.json({ success: true });
        } catch (err) {
            console.error('❌ Delete comment error:', err);
            res.status(500).json({ success: false, message: 'Server error occurred' });
        } finally {
            if (conn) conn.release();
        }
    });

    return { router };
};
