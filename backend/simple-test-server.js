// Minimal test server for Plesk deployment debugging
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || process.env.IISNODE_PORT || 3001;

// Enable CORS for all origins (debugging only)
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Simple logging function
const logFile = path.join(__dirname, 'simple-debug.log');
function log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    console.log(logEntry.trim());
    
    try {
        fs.appendFileSync(logFile, logEntry);
    } catch (error) {
        console.error('Log write failed:', error);
    }
}

// Basic health check
app.get('/health', (req, res) => {
    const health = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        port: port,
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime()
    };
    
    log(`Health check accessed: ${JSON.stringify(health)}`);
    res.json(health);
});

// Debug endpoint
app.get('/debug', (req, res) => {
    const debug = {
        timestamp: new Date().toISOString(),
        headers: req.headers,
        url: req.url,
        method: req.method,
        ip: req.ip || req.connection.remoteAddress,
        environment: {
            NODE_ENV: process.env.NODE_ENV,
            PORT: process.env.PORT,
            IISNODE_PORT: process.env.IISNODE_PORT
        }
    };
    
    log(`Debug accessed: ${JSON.stringify(debug, null, 2)}`);
    res.json(debug);
});

// Test database connection
app.get('/test-db', async (req, res) => {
    try {
        const mariadb = require('mariadb');
        
        const pool = mariadb.createPool({
            host: process.env.DB_HOST || '119.59.101.83',
            port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
            user: process.env.DB_USER || 'itradebook_db',
            password: process.env.DB_PASS || 'v264^jx1W',
            database: process.env.DB_NAME || 'itradebook',
            connectionLimit: 2,
            acquireTimeout: 10000,
            timeout: 10000
        });
        
        const conn = await pool.getConnection();
        const result = await conn.query('SELECT 1 as test, NOW() as timestamp');
        conn.release();
        await pool.end();
        
        const response = {
            success: true,
            result: result[0],
            timestamp: new Date().toISOString()
        };
        
        log(`Database test successful: ${JSON.stringify(response)}`);
        res.json(response);
        
    } catch (error) {
        const errorResponse = {
            success: false,
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString()
        };
        
        log(`Database test failed: ${JSON.stringify(errorResponse)}`);
        res.status(500).json(errorResponse);
    }
});

// Serve logs (for debugging)
app.get('/logs', (req, res) => {
    try {
        if (fs.existsSync(logFile)) {
            const logs = fs.readFileSync(logFile, 'utf8');
            res.setHeader('Content-Type', 'text/plain');
            res.send(logs);
        } else {
            res.setHeader('Content-Type', 'text/plain');
            res.send('No logs found');
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Catch all route
app.get('*', (req, res) => {
    const info = {
        message: 'Simple test server is running',
        timestamp: new Date().toISOString(),
        url: req.url,
        method: req.method
    };
    
    log(`Catch-all route accessed: ${req.url}`);
    res.json(info);
});

// Error handler
app.use((err, req, res, next) => {
    const error = {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
    };
    
    log(`Error occurred: ${JSON.stringify(error)}`);
    res.status(500).json(error);
});

// Start server
app.listen(port, () => {
    const startMessage = `Simple test server running on port ${port}`;
    log(startMessage);
    console.log(startMessage);
}).on('error', (err) => {
    const errorMessage = `Server error: ${err.message}`;
    log(errorMessage);
    console.error(errorMessage);
});

// Log startup info
log('=== SIMPLE TEST SERVER STARTED ===');
log(`Node.js version: ${process.version}`);
log(`Platform: ${process.platform}`);
log(`Environment: ${process.env.NODE_ENV || 'development'}`);
log(`Port: ${port}`);
log(`Working directory: ${process.cwd()}`);
