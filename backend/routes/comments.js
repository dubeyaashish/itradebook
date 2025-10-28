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

    // Delete a comment
router.delete('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    
    if (!id) {
        return res.status(400).json({ success: false, message: 'Missing id' });
    }

    let conn;
    try {
        conn = await pool.getConnection();
        
        // Check if comment exists and get owner info
        const existingComment = await conn.query(
            'SELECT user_id FROM trading_comments WHERE id = ?',
            [id]
        );
        
        if (existingComment.length === 0) {
            return res.status(404).json({ success: false, message: 'Comment not found' });
        }
        
        // Only allow users to delete their own comments (or admins to delete any)
        const isOwner = existingComment[0].user_id === (req.user.id || req.user.userId);
        const isAdmin = req.user.user_type === 'admin' || req.user.userType === 'admin';
        
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'You can only delete your own comments' });
        }
        
        // Delete the comment
        const result = await conn.query('DELETE FROM trading_comments WHERE id = ?', [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Comment not found or already deleted' });
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Delete comment error:', err);
        res.status(500).json({ success: false, message: 'Server error occurred' });
    } finally {
        if (conn) conn.release();
    }
});

router.post('/delete', authenticateToken, async (req, res) => {
    const { id } = req.body;
    
    if (!id) {
        return res.status(400).json({ success: false, message: 'Missing id' });
    }

    let conn;
    try {
        conn = await pool.getConnection();
        
        // Check if comment exists and get owner info
        const existingComment = await conn.query(
            'SELECT user_id FROM trading_comments WHERE id = ?',
            [id]
        );
        
        if (existingComment.length === 0) {
            return res.status(404).json({ success: false, message: 'Comment not found' });
        }
        
        // Only allow users to delete their own comments (or admins to delete any)
        const isOwner = existingComment[0].user_id === (req.user.id || req.user.userId);
        const isAdmin = req.user.user_type === 'admin' || req.user.userType === 'admin';
        
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'You can only delete your own comments' });
        }
        
        // Delete the comment
        const result = await conn.query('DELETE FROM trading_comments WHERE id = ?', [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Comment not found or already deleted' });
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Delete comment error:', err);
        res.status(500).json({ success: false, message: 'Server error occurred' });
    } finally {
        if (conn) conn.release();
    }
});

    return { router };
};
