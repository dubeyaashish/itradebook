-- Create table for custom symbol names
CREATE TABLE IF NOT EXISTS symbol_custom_names (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    symbol_ref VARCHAR(50) NOT NULL,
    custom_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_symbol (user_id, symbol_ref),
    INDEX idx_user_id (user_id),
    INDEX idx_symbol_ref (symbol_ref)
);
