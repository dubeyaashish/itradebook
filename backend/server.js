const express = require('express');
const session = require('express-session');
const cors = require('cors');
const mariadb = require('mariadb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config({ path: '../.env' });

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if(!origin) return callback(null, true);
    
    // Allow all ngrok URLs and localhost
    if(origin.includes('ngrok-free.app') || 
       origin.includes('localhost') || 
       origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'itradebort4r3etghyje5t4regasre4t5wy465trtge',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true
    }
  })
);

// Database connection with BigInt handling
const pool = mariadb.createPool({
  host: process.env.DB_HOST || '119.59.101.83',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  user: process.env.DB_USER || 'itradebook_db',
  password: process.env.DB_PASS || 'v264^jx1W',
  database: process.env.DB_NAME || 'itradebook',
  connectionLimit: 10,
  acquireTimeout: 10000,
  timeout: 10000,
  reconnect: true,
  bigIntAsNumber: true,  // Convert BigInt to Number
  supportBigNumbers: true,
  dateStrings: true
});

// Helper function to convert BigInt values to Numbers recursively
function convertBigIntToNumber(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'bigint') {
    return Number(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToNumber);
  }
  
  if (typeof obj === 'object') {
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertBigIntToNumber(value);
    }
    return converted;
  }
  
  return obj;
}

// Global BigInt JSON serialization fix
JSON.stringify = ((originalStringify) => {
  return function(value, replacer, space) {
    return originalStringify.call(this, value, function(key, val) {
      if (typeof val === 'bigint') {
        return Number(val);
      }
      return replacer ? replacer(key, val) : val;
    }, space);
  };
})(JSON.stringify);

// Email configuration
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// JWT Middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
    
    let conn;
    try {
      conn = await pool.getConnection();
      
      // Check admin_users first
      let users = await conn.query(
        'SELECT id, username, email, "admin" as user_type FROM admin_users WHERE id = ? AND status = "active"',
        [decoded.userId]
      );
      
      // If not found, check managed_users
      if (users.length === 0) {
        users = await conn.query(
          'SELECT id, username, email, "managed" as user_type FROM managed_users WHERE id = ? AND status = "active"',
          [decoded.userId]
        );
      }
      
      // If still not found, check account_details
      if (users.length === 0) {
        users = await conn.query(
          'SELECT id, Name as username, Email as email, user_type, Verified as is_verified FROM account_details WHERE id = ?',
          [decoded.userId]
        );
      }
      
      if (users.length === 0) {
        return res.status(401).json({ error: 'User not found or inactive' });
      }
      
      const user = users[0];
      req.user = user;
      req.session.user_id = user.id;
      req.session.user_type = user.user_type;
      next();
    } finally {
      if (conn) conn.release();
    }
  } catch (err) {
    console.error('Token verification error:', err);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Helper functions
async function getAllowedSymbols(conn, req) {
  const userType = req.user?.user_type || req.session.user_type || 'regular';
  
  if (userType === 'managed') {
    const userId = req.user?.id || req.session.user_id || 0;
    if (!userId) return [];
    
    try {
      const rows = await conn.query(
        'SELECT symbol_ref FROM user_symbol_permissions WHERE user_id = ?',
        [userId]
      );
      return rows.map((r) => r.symbol_ref);
    } catch (error) {
      console.error('Error getting allowed symbols:', error);
      return [];
    }
  }
  
  return null; // null means no restriction
}

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

async function sendEmail(to, subject, text, html) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@itradebook.com',
      to,
      subject,
      text,
      html
    });
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    return false;
  }
}

// Initialize tables on startup
async function initializeTables() {
  let conn;
  try {
    conn = await pool.getConnection();
    
    // Create users table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        user_type ENUM('regular', 'managed', 'admin') DEFAULT 'regular',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create user_symbol_permissions table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS user_symbol_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        symbol_ref VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_symbol (user_id, symbol_ref)
      )
    `);

    // Create trading_comments table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS trading_comments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        symbol_ref VARCHAR(64) NOT NULL,
        comment TEXT NOT NULL,
        user_id INT DEFAULT 0,
        username VARCHAR(50) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create customer_data table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS customer_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        api_key VARCHAR(255),
        datetime_server_ts_tz DATETIME,
        mt5 VARCHAR(50),
        order_ref VARCHAR(50),
        direction VARCHAR(10),
        type VARCHAR(50),
        volume DECIMAL(20,8),
        price DECIMAL(20,8),
        swap DECIMAL(20,8),
        swap_last DECIMAL(20,8),
        balance DECIMAL(20,8),
        equity DECIMAL(20,8),
        floating DECIMAL(20,8),
        profit_loss DECIMAL(20,8),
        profit_loss_last DECIMAL(20,8),
        symbolrate_name VARCHAR(50),
        currency VARCHAR(10),
        volume_total DECIMAL(20,8),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables initialized');
  } catch (error) {
    console.error('Error initializing tables:', error);
  } finally {
    if (conn) conn.release();
  }
}

// Initialize tables
initializeTables();

// Import route handlers
const auth = require('./routes/auth')(pool, authenticateToken, bcrypt, jwt);
const rawData = require('./routes/rawData')(pool, { authenticateToken, getAllowedSymbols });
const report = require('./routes/report')(pool, { authenticateToken, getAllowedSymbols });
const comments = require('./routes/comments')(pool, { authenticateToken, getAllowedSymbols });
const plReport = require('./routes/plReport')(pool, { authenticateToken, getAllowedSymbols });
const customerData = require('./routes/customerData')(pool, { authenticateToken, getAllowedSymbols });

// Mount routes
app.use('/api/auth', auth.router);
app.use('/api/raw-data', rawData.router);
app.use('/api/report', report.router);
app.use('/api/comments', comments.router);
app.use('/api', plReport.router); // Mount plReport at /api for direct access to /api/get_years, etc.
app.use('/api/customer-data', customerData.router);

// Mount additional routes at /api for frontend compatibility
app.get('/api/date-range', ...rawData._dateRange);
app.get('/api/symbols', ...rawData._symbols);
app.get('/api/trading-data', ...rawData._data);
app.get('/api/live-data', ...rawData._data);  // Alias for /api/trading-data
app.get('/api/live', ...rawData._live);  // Live data endpoint for real-time updates
app.get('/api/data', ...report._data);  // Alias for reporting data
app.get('/api/refids', ...report._refids);  // Get list of reference IDs

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server is running', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(port, () => {
  console.log(`🚀 iTradeBook Server running on port ${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: http://localhost:3000`);
  console.log(`🔗 API Health Check: http://localhost:${port}/api/health`);
});