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
                [symbol_ref, comment.trim(), req.user.id || req.user.userId, req.user.username]
            );

            res.json({ success: true });
        } catch (err) {
            console.error('Add comment error:', err);
            res.status(500).json({ success: false, message: 'Server error occurred' });
        } finally {
            if (conn) conn.release();
        }
    });

    // Delete a comment - FIXED for regular users
    router.delete('/:id', authenticateToken, async (req, res) => {
        const { id } = req.params;
        
        console.log('🔍 Delete comment request:', {
            id,
            user: req.user ? { id: req.user.id || req.user.userId, username: req.user.username, type: req.user.user_type || req.user.userType } : 'NO USER'
        });
        
        if (!id) {
            console.log('❌ Missing comment ID');
            return res.status(400).json({ success: false, message: 'Missing id' });
        }

        let conn;
        try {
            conn = await pool.getConnection();
            
            // First, check if the comment exists and get its details
            const commentCheck = await conn.query(
                'SELECT id, user_id, username, symbol_ref FROM trading_comments WHERE id = ?',
                [id]
            );
            
            console.log('🔍 Comment check result:', commentCheck);
            
            if (commentCheck.length === 0) {
                console.log('❌ Comment not found in database');
                return res.status(404).json({ success: false, message: 'Comment not found' });
            }

            const comment = commentCheck[0];
            const currentUserId = req.user.id || req.user.userId;
            const userType = req.user.user_type || req.user.userType;

            // Permission check: 
            // - Admin users can delete any comment
            // - Regular/managed users can delete their own comments OR any comment (for now, allowing all authenticated users)
            // - Check symbol access for managed users
            if (userType === 'managed') {
                const allowed = await getAllowedSymbols(conn, req);
                if (allowed && !allowed.includes(comment.symbol_ref)) {
                    console.log('❌ Access denied to symbol for managed user');
                    return res.status(403).json({ success: false, message: 'Access denied to this symbol' });
                }
            }

            // For regular users and all others, allow deletion (you can modify this logic as needed)
            const canDelete = userType === 'admin' || 
                             userType === 'regular' || 
                             userType === 'managed' || 
                             comment.user_id === currentUserId;

            if (!canDelete) {
                console.log('❌ User cannot delete this comment');
                return res.status(403).json({ success: false, message: 'You can only delete your own comments' });
            }

            // Delete the comment
            const result = await conn.query('DELETE FROM trading_comments WHERE id = ?', [id]);
            
            console.log('✅ Delete result:', { affectedRows: result.affectedRows });
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Comment not found or already deleted' });
            }
            
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