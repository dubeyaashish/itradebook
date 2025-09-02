const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');

module.exports = function(pool, { authenticateToken }) {
    const router = express.Router();

    // Get custom names for user's symbols
    router.get('/', authenticateToken, async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        
        let customNames;
        
        // For regular users, get names from a shared pool (user_id = 0)
        // For managed/admin users, get user-specific names
        if (req.user.user_type === 'regular') {
            customNames = await conn.query(
                'SELECT symbol_ref, custom_name FROM symbol_custom_names WHERE user_id = 0',
                []
            );
        } else {
            customNames = await conn.query(
                'SELECT symbol_ref, custom_name FROM symbol_custom_names WHERE user_id = ?',
                [req.user.id]
            );
        }
        
        // Convert to object for easier lookup
        const namesMap = {};
        customNames.forEach(row => {
            namesMap[row.symbol_ref] = row.custom_name;
        });
        
        res.json(namesMap);
    } catch (error) {
        console.error('Error fetching custom names:', error);
        res.status(500).json({ error: 'Failed to fetch custom names' });
    } finally {
        if (conn) conn.release();
    }
});

// Set custom name for a symbol
router.post('/', authenticateToken, async (req, res) => {
    const { symbol_ref, custom_name } = req.body;
    
    if (!symbol_ref || !custom_name) {
        return res.status(400).json({ error: 'Symbol reference and custom name are required' });
    }
    
    if (custom_name.length > 100) {
        return res.status(400).json({ error: 'Custom name must be 100 characters or less' });
    }
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        // For regular users, store with user_id = 0 (shared)
        // For managed/admin users, store with their actual user_id
        const userId = req.user.user_type === 'regular' ? 0 : req.user.id;
        
        // Use INSERT ... ON DUPLICATE KEY UPDATE to handle both insert and update
        await conn.query(
            `INSERT INTO symbol_custom_names (user_id, symbol_ref, custom_name) 
             VALUES (?, ?, ?) 
             ON DUPLICATE KEY UPDATE 
             custom_name = VALUES(custom_name), 
             updated_at = CURRENT_TIMESTAMP`,
            [userId, symbol_ref, custom_name.trim()]
        );
        
        res.json({ 
            success: true, 
            message: 'Custom name saved successfully',
            symbol_ref,
            custom_name: custom_name.trim(),
            shared: req.user.user_type === 'regular'
        });
    } catch (error) {
        console.error('Error saving custom name:', error);
        res.status(500).json({ error: 'Failed to save custom name' });
    } finally {
        if (conn) conn.release();
    }
});

// Delete custom name for a symbol
router.delete('/:symbol_ref', authenticateToken, async (req, res) => {
    const { symbol_ref } = req.params;
    
    let conn;
    try {
        conn = await pool.getConnection();
        
        // For regular users, delete from shared pool (user_id = 0)
        // For managed/admin users, delete from their specific data
        const userId = req.user.user_type === 'regular' ? 0 : req.user.id;
        
        const result = await conn.query(
            'DELETE FROM symbol_custom_names WHERE user_id = ? AND symbol_ref = ?',
            [userId, symbol_ref]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Custom name not found' });
        }
        
        res.json({ 
            success: true, 
            message: 'Custom name deleted successfully',
            shared: req.user.user_type === 'regular'
        });
    } catch (error) {
        console.error('Error deleting custom name:', error);
        res.status(500).json({ error: 'Failed to delete custom name' });
    } finally {
        if (conn) conn.release();
    }
});

    return { router };
};
