const express = require('express');
const session = require('express-session');
const cors = require('cors');
const mariadb = require('mariadb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketIo = require('socket.io');
const { getDbConnection, executeQuery, executeTransaction, getPoolStats } = require('./utils/dbHelper');
// Load environment variables
const envPath = process.env.NODE_ENV === 'production' ? './.env' : '../.env';
require('dotenv').config({ path: envPath });

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: function(origin, callback) {
      const allowedOrigins = [
        'http://localhost:3000',
        'https://web.itradebook.com',
        'https://itradebook.com'
      ];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  }
});
const port = process.env.PORT || process.env.IISNODE_PORT || 3001;

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if(!origin) return callback(null, true);
    
    // Production domains
    const allowedOrigins = [
      'https://web.itradebook.com',
      'https://www.web.itradebook.com',
      // Add your Plesk domain here when you know it
    ];
    
    // Development origins
    if (process.env.NODE_ENV !== 'production') {
      allowedOrigins.push(
        ...['localhost', '127.0.0.1'].flatMap(host => 
          ['3000', '3001'].map(port => `http://${host}:${port}`)
        )
      );
      
      // Allow ngrok URLs in development
      if(origin.includes('ngrok-free.app')) {
        return callback(null, true);
      }
      
      // Allow any localhost in development
      if(origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
    }
    
    // TEMPORARY: Allow all origins for debugging Plesk deployment
    // Remove this after deployment is working
    if (process.env.NODE_ENV === 'production') {
      console.log('🔧 PRODUCTION: Allowing origin for debugging:', origin);
      return callback(null, true);
    }
    
    if(allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.log('CORS blocked origin:', origin);
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
      secure: false, // Temporarily disable secure for debugging - enable after HTTPS is confirmed
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      sameSite: 'lax' // Use lax for better compatibility with Plesk
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
  connectionLimit: 15,  // Increased from 5 to 15 for better performance
  acquireTimeout: 60000,  // Increased timeout for getting connections (60 seconds)
  timeout: 60000,  // Increased query timeout (60 seconds)
  idleTimeout: 1800000,  // 30 minutes idle timeout (increased from 10 minutes)
  minimumIdle: 3,  // Keep at least 3 idle connections (increased from 1)
  maxUses: 0,  // No limit on connection reuse
  reconnect: true,
  resetAfterUse: false,  // Don't reset session variables after each use
  bigIntAsNumber: true,  // Convert BigInt to Number
  supportBigNumbers: true,
  dateStrings: true,
  // Additional connection options for stability
  autoJsonMap: false,
  arrayParenthesis: false,
  permitSetMultiParamEntries: true,
  // Connection monitoring
  leakDetectionTimeout: 30000,  // Detect connection leaks after 30 seconds (increased from 20)
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

// Pool monitoring and health check functions
function logPoolStats() {
  const stats = getPoolStats(pool);
  if (stats) {
    console.log('Pool Stats:', stats);
    
    // Log warning if pool is getting full (80% capacity)
    if (stats.activeConnections >= 12) {
      console.warn('⚠️  Pool nearly full! Active connections:', stats.activeConnections);
    }
  }
  return stats;
}

// Monitor pool health every minute
setInterval(logPoolStats, 60000);

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
// JWT Middleware - FIXED VERSION
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('🔐 Auth attempt:', {
    hasAuthHeader: !!authHeader,
    hasToken: !!token,
    origin: req.headers.origin,
    userAgent: req.headers['user-agent']?.substring(0, 100),
    ip: req.ip || req.connection.remoteAddress
  });

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ error: 'Access token required' });
  }

  let conn;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
    console.log('✅ Token decoded successfully:', { userId: decoded.userId });
    
    conn = await getDbConnection(pool);
      
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
    
    // If still not found, check account_details (regular users)
    if (users.length === 0) {
      users = await conn.query(
        'SELECT id, Name as username, Email as email, COALESCE(user_type, "regular") as user_type, Verified as is_verified FROM account_details WHERE id = ?',
        [decoded.userId]
      );
    }
    
    if (users.length === 0) {
      console.log('❌ User not found in database:', decoded.userId);
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    
    const user = users[0];
    
    // Normalize user object for consistent access across all routes
    req.user = {
      id: user.id,
      userId: user.id, // Add both for compatibility
      username: user.username,
      email: user.email,
      user_type: user.user_type || 'regular',
      userType: user.user_type || 'regular', // Add both for compatibility
      is_verified: user.is_verified
    };
    
    // Also set session for legacy compatibility
    req.session = req.session || {};
    req.session.user_id = user.id;
    req.session.user_type = user.user_type || 'regular';
    
    console.log('🔐 User authenticated successfully:', {
      id: req.user.id,
      username: req.user.username,
      type: req.user.user_type
    });
    
    next();
  } catch (err) {
    console.error('❌ Token verification error:', {
      name: err.name,
      message: err.message,
      code: err.code
    });
    
    if (err.code === 'ER_GET_CONNECTION_TIMEOUT' || err.code === 'ER_TOO_MANY_USER_CONNECTIONS') {
      console.error('Database connection issue in auth middleware:', err.message);
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
    }
    
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expired' });
    }
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    
    return res.status(403).json({ error: 'Invalid or expired token' });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (releaseError) {
        console.error('Error releasing connection in auth middleware:', releaseError);
      }
    }
  }
};

// Helper functions
async function getAllowedSymbols(conn, req) {
  const userType = req.user?.user_type || req.user?.userType || req.session.user_type || 'regular';
  const userId = req.user?.id || req.user?.userId || req.session.user_id || 0;
  
  console.log('=== getAllowedSymbols DEBUG ===');
  console.log('User Type:', userType);
  console.log('User ID:', userId);
  console.log('req.user:', req.user);
  console.log('req.session:', req.session);
  
  if (userType === 'managed') {
    if (!userId) {
      console.log('No userId found for managed user - returning empty array');
      return [];
    }
    
    try {
      console.log('Querying user_symbol_permissions for user_id:', userId);
      const rows = await conn.query(
        'SELECT symbol_ref FROM user_symbol_permissions WHERE user_id = ?',
        [userId]
      );
      const symbols = rows.map((r) => r.symbol_ref);
      console.log('Found symbols:', symbols);
      console.log('===============================');
      return symbols;
    } catch (error) {
      console.error('Error getting allowed symbols:', error);
      if (error.code === 'ER_GET_CONNECTION_TIMEOUT' || error.code === 'ER_TOO_MANY_USER_CONNECTIONS') {
        throw new Error('Database connection issue. Please try again.');
      }
      return [];
    }
  }
  
  console.log('Not a managed user - returning null (no restrictions)');
  console.log('===============================');
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
    console.log('Initializing database tables...');
    conn = await getDbConnection(pool);
    
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

    // Create symbol_custom_names table
    await conn.query(`
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
      )
    `);

    // Create P&L report daily storage table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS pl_report_daily (
        id INT AUTO_INCREMENT PRIMARY KEY,
        trade_date DATE NOT NULL,
        symbol_ref VARCHAR(50) NOT NULL,
        year INT NOT NULL,
        month INT NOT NULL,
        
        mktprice DECIMAL(20,8),
        buysize1 DECIMAL(20,8),
        sellsize1 DECIMAL(20,8),
        buysize2 DECIMAL(20,8),
        sellsize2 DECIMAL(20,8),
        buyprice1 DECIMAL(20,8),
        sellprice1 DECIMAL(20,8),
        buyprice2 DECIMAL(20,8),
        sellprice2 DECIMAL(20,8),
        
        company_balance DECIMAL(20,8),
        company_equity DECIMAL(20,8),
        company_floating DECIMAL(20,8),
        company_pln DECIMAL(20,8),
        company_deposit DECIMAL(20,8) DEFAULT 0,
        company_withdrawal DECIMAL(20,8) DEFAULT 0,
        company_realized DECIMAL(20,8),
        company_unrealized DECIMAL(20,8),
        
        exp_balance DECIMAL(20,8),
        exp_equity DECIMAL(20,8),
        exp_floating DECIMAL(20,8),
        exp_pln DECIMAL(20,8),
        exp_realized DECIMAL(20,8),
        exp_unrealized DECIMAL(20,8),
        
        accn_pf DECIMAL(20,8),
        daily_company_total DECIMAL(20,8),
        daily_exp_total DECIMAL(20,8),
        daily_grand_total DECIMAL(20,8),
        
        is_finalized BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        UNIQUE KEY unique_date_symbol (trade_date, symbol_ref),
        INDEX idx_year_month (year, month),
        INDEX idx_symbol_ref (symbol_ref),
        INDEX idx_trade_date (trade_date),
        INDEX idx_finalized (is_finalized)
      )
    `);

    // Add company_pln column if it doesn't exist (for existing databases)
    try {
      await conn.query(`
        ALTER TABLE pl_report_daily 
        ADD COLUMN company_pln DECIMAL(20,8) AFTER company_floating
      `);
      console.log('✓ Added company_pln column to existing table');
    } catch (alterError) {
      // Column already exists or other error - this is expected for new installations
      if (alterError.code !== 'ER_DUP_FIELDNAME') {
        console.log('Note: company_pln column may already exist or table is new');
      }
    }

    // Add deposit and withdrawal columns if they don't exist
    try {
      await conn.query(`
        ALTER TABLE pl_report_daily 
        ADD COLUMN company_deposit DECIMAL(20,8) DEFAULT 0 AFTER company_pln,
        ADD COLUMN company_withdrawal DECIMAL(20,8) DEFAULT 0 AFTER company_deposit
      `);
      console.log('✓ Added company_deposit and company_withdrawal columns to existing table');
    } catch (alterError) {
      // Columns already exist or other error
      if (alterError.code !== 'ER_DUP_FIELDNAME') {
        console.log('Note: deposit/withdrawal columns may already exist or table is new');
      }
    }

    console.log('✓ Database tables initialized successfully');
  } catch (error) {
    console.error('✗ Error initializing tables:', error);
    if (error.code === 'ER_GET_CONNECTION_TIMEOUT' || error.code === 'ER_TOO_MANY_USER_CONNECTIONS') {
      console.error('Database connection issues during initialization. Server will continue but some features may not work.');
    }
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (releaseError) {
        console.error('Error releasing connection during table initialization:', releaseError);
      }
    }
  }
}

// Initialize tables
initializeTables();

// Import route handlers with error handling
let auth, rawData, report, comments, plReport, customerData, symbolNames, getsymbols, customerTrading, grids;

const dbHelpers = { getDbConnection, executeQuery, executeTransaction, getPoolStats };

try {
  auth = require('./routes/auth')(pool, authenticateToken, bcrypt, jwt, dbHelpers);
  console.log('✓ Auth routes loaded');
} catch (error) {
  console.error('✗ Error loading auth routes:', error.message);
}

try {
  rawData = require('./routes/rawData')(pool, { authenticateToken, getAllowedSymbols }, dbHelpers);
  console.log('✓ RawData routes loaded');
} catch (error) {
  console.error('✗ Error loading rawData routes:', error.message);
}

try {
  report = require('./routes/report')(pool, { authenticateToken, getAllowedSymbols }, dbHelpers);
  console.log('✓ Report routes loaded');
} catch (error) {
  console.error('✗ Error loading report routes:', error.message);
}

try {
  comments = require('./routes/comments')(pool, { authenticateToken, getAllowedSymbols }, dbHelpers);
  console.log('✓ Comments routes loaded');
} catch (error) {
  console.error('✗ Error loading comments routes:', error.message);
}

try {
  plReport = require('./routes/plReport')(pool, { authenticateToken, getAllowedSymbols }, dbHelpers);
  console.log('✓ PLReport routes loaded');
} catch (error) {
  console.error('✗ Error loading plReport routes:', error.message);
}

try {
  customerData = require('./routes/customerData')(pool, { authenticateToken, getAllowedSymbols }, dbHelpers);
  console.log('✓ CustomerData routes loaded');
} catch (error) {
  console.error('✗ Error loading customerData routes:', error.message);
}

try {
  symbolNames = require('./routes/symbolNames')(pool, { authenticateToken }, dbHelpers);

  // Load getsymbols route (for symbol trading data API)
  getsymbols = require('./routes/getsymbols')(pool, { authenticateToken, getAllowedSymbols }, dbHelpers);
  
  // Load customer trading route (for customer data API)
  customerTrading = require('./routes/customerTrading')(pool, { authenticateToken, getAllowedSymbols }, dbHelpers);
  
  // Load grids route (for grids data API)
  grids = require('./routes/grids')(pool, { authenticateToken, getAllowedSymbols }, dbHelpers);
  
  console.log('✓ SymbolNames routes loaded');
} catch (error) {
  console.error('✗ Error loading symbolNames routes:', error.message);
}

// Mount routes (more specific routes first to prevent conflicts)
try {
  if (auth && auth.router) {
    app.use('/api/auth', auth.router);
    console.log('✓ Auth routes mounted');
  }
} catch (error) {
  console.error('✗ Error mounting auth routes:', error.message);
}

try {
  if (rawData && rawData.router) {
    app.use('/api/raw-data', rawData.router);
    console.log('✓ RawData routes mounted');
  }
} catch (error) {
  console.error('✗ Error mounting rawData routes:', error.message);
}

try {
  if (report && report.router) {
    app.use('/api/report', report.router);
    console.log('✓ Report routes mounted');
  }
} catch (error) {
  console.error('✗ Error mounting report routes:', error.message);
}

try {
  if (comments && comments.router) {
    app.use('/api/comments', comments.router);
    console.log('✓ Comments routes mounted');
  }
} catch (error) {
  console.error('✗ Error mounting comments routes:', error.message);
}

try {
  if (symbolNames && symbolNames.router) {
    app.use('/api/symbol-names', symbolNames.router);
    console.log('✓ SymbolNames routes mounted');
  }
} catch (error) {
  console.error('✗ Error mounting symbolNames routes:', error.message);
}

try {
  if (customerData && customerData.router) {
    app.use('/api/customer-data', customerData.router);
    console.log('✓ CustomerData routes mounted');
  }
} catch (error) {
  console.error('✗ Error mounting customerData routes:', error.message);
}

// Mount additional routes at /api for frontend compatibility
try {
  if (rawData && rawData._dateRange) {
    app.get('/api/date-range', ...rawData._dateRange);
    console.log('✓ Date-range route mounted');
  }
} catch (error) {
  console.error('✗ Error mounting date-range route:', error.message);
}

try {
  if (rawData && rawData._symbols) {
    app.get('/api/symbols', ...rawData._symbols);
    console.log('✓ Symbols route mounted');
  }
} catch (error) {
  console.error('✗ Error mounting symbols route:', error.message);
}

try {
  if (rawData && rawData._data) {
    app.get('/api/trading-data', ...rawData._data);
    app.get('/api/live-data', ...rawData._data);  // Alias for /api/trading-data
    console.log('✓ Trading data routes mounted');
  }
} catch (error) {
  console.error('✗ Error mounting trading data routes:', error.message);
}

try {
  if (rawData && rawData._live) {
    app.get('/api/live', ...rawData._live);  // Live data endpoint for real-time updates
    console.log('✓ Live data route mounted');
  }
} catch (error) {
  console.error('✗ Error mounting live data route:', error.message);
}

try {
  if (report && report._data) {
    app.get('/api/data', ...report._data);  // Alias for reporting data
    console.log('✓ Report data route mounted');
  }
} catch (error) {
  console.error('✗ Error mounting report data route:', error.message);
}

try {
  if (report && report._insert) {
    app.post('/api/data', ...report._insert);  // Insert route for reporting data
    console.log('✓ Report insert route mounted');
  }
} catch (error) {
  console.error('✗ Error mounting report insert route:', error.message);
}

try {
  if (report && report._delete) {
    app.delete('/api/data', ...report._delete);  // Delete route for reporting data
    app.post('/api/data/delete', ...report._delete);  // POST delete route for IIS compatibility
    console.log('✓ Report delete routes mounted (DELETE and POST)');
  }
} catch (error) {
  console.error('✗ Error mounting report delete route:', error.message);
}

try {
  if (report && report._refids) {
    app.get('/api/refids', ...report._refids);  // Get list of reference IDs
    console.log('✓ Refids route mounted');
  }
} catch (error) {
  console.error('✗ Error mounting refids route:', error.message);
}

// Mount plReport routes (put this AFTER specific routes to avoid conflicts)
try {
  if (plReport && plReport.router) {
    app.use('/api', plReport.router); // Mount plReport at /api for existing routes like get_symbols, get_years, etc.
    app.use('/api/plreport', plReport.router); // Also mount at /api/plreport for new deposit/withdrawal routes
    console.log('✓ PLReport routes mounted at /api and /api/plreport');
  }
} catch (error) {
  console.error('✗ Error mounting plReport routes:', error.message);
}

// Mount getsymbols routes
try {
  if (getsymbols && getsymbols.router) {
    app.use('/api/getsymbols', getsymbols.router);
    console.log('✓ GetSymbols routes mounted at /api/getsymbols');
  }
} catch (error) {
  console.error('✗ Error mounting getsymbols routes:', error.message);
}

// Mount customer trading routes
try {
  if (customerTrading) {
    app.use('/api/customertrading', customerTrading);
    console.log('✓ CustomerTrading routes mounted at /api/customertrading');
  }
} catch (error) {
  console.error('✗ Error mounting customerTrading routes:', error.message);
}

// Mount grids routes
try {
  if (grids && grids.router) {
    app.use('/api/grids', grids.router);
    console.log('✓ Grids routes mounted at /api/grids');
  }
} catch (error) {
  console.error('✗ Error mounting grids routes:', error.message);
}

// Health check
app.get('/api/health', (req, res) => {
  const poolStats = logPoolStats();
  res.json({ 
    status: 'Server is running', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    poolStats
  });
});

// Pool health check endpoint
app.get('/api/pool-health', (req, res) => {
  try {
    const poolStats = logPoolStats();
    const isHealthy = poolStats && poolStats.activeConnections < 12;
    
    res.json({
      healthy: isHealthy,
      poolStats,
      warnings: poolStats?.activeConnections >= 12 ? ['Pool nearly full'] : [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Serve static files from React build
console.log('Setting up static file serving...');
console.log('Current __dirname:', __dirname);

// Try multiple possible build locations
const possibleBuildPaths = [
  path.join(__dirname, 'build'),           // Same level as server.js
  path.join(__dirname, '..', 'frontend', 'build'),  // In frontend folder
  path.join(__dirname, 'frontend', 'build'),        // Frontend subfolder
  path.join(__dirname, '..', 'build')               // Parent directory
];

let buildPath = null;
let staticPath = null;

console.log('Checking possible build locations:');
for (const testPath of possibleBuildPaths) {
  console.log(`Checking: ${testPath}`);
  if (fs.existsSync(testPath)) {
    console.log(`✓ Found build directory at: ${testPath}`);
    buildPath = testPath;
    staticPath = path.join(buildPath, 'static');
    break;
  } else {
    console.log(`✗ Not found: ${testPath}`);
  }
}

if (!buildPath) {
  console.log('✗ NO BUILD DIRECTORY FOUND!');
  console.log('Available directories in __dirname:', fs.readdirSync(__dirname));
  // Try to find any directory with 'build' in the name
  const allDirs = fs.readdirSync(__dirname, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  console.log('All directories:', allDirs);
  
  // Default to a build path anyway for debugging
  buildPath = path.join(__dirname, 'build');
  staticPath = path.join(buildPath, 'static');
} else {
  console.log('Using build path:', buildPath);
  console.log('Using static path:', staticPath);
  
  if (fs.existsSync(staticPath)) {
    console.log('✓ Static directory exists');
    const staticFiles = fs.readdirSync(staticPath);
    console.log('Static directory contents:', staticFiles);
  } else {
    console.log('✗ Static directory NOT found');
  }
}

// Serve static assets (CSS, JS, images) with /static prefix
app.use('/static', express.static(staticPath, {
  maxAge: '1y',
  etag: false,
  setHeaders: (res, filePath) => {
    console.log('✓ Serving static file:', filePath);
    // Set proper MIME types for CSS and JS files
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Serve root-level build files (manifest, favicon, etc.)
app.use(express.static(buildPath, {
  index: false, // Don't serve index.html here - we'll handle it separately
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    console.log('✓ Serving build file:', filePath);
  }
}));

console.log('Static file serving configured');

// Debug routes for testing API functionality
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API is working', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Enhanced debug route with detailed environment info
app.get('/api/debug', (req, res) => {
  try {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: process.platform,
      headers: req.headers,
      session: {
        exists: !!req.session,
        id: req.session?.id,
        user_id: req.session?.user_id,
        user_type: req.session?.user_type
      },
      cookies: req.headers.cookie ? 'Present' : 'None',
      origin: req.headers.origin || 'None',
      userAgent: req.headers['user-agent'] || 'None',
      ip: req.ip || req.connection.remoteAddress || 'Unknown',
      url: req.url,
      method: req.method
    };
    
    console.log('🔍 Debug request:', debugInfo);
    res.json(debugInfo);
  } catch (error) {
    console.error('Debug route error:', error);
    res.status(500).json({ 
      error: 'Debug route failed', 
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test authentication route
app.get('/api/auth-test', authenticateToken, (req, res) => {
  res.json({
    message: 'Authentication working',
    user: {
      id: req.user.id,
      username: req.user.username,
      user_type: req.user.user_type,
      email: req.user.email
    },
    timestamp: new Date().toISOString()
  });
});

app.post('/api/test-db', async (req, res) => {
  let conn;
  try {
    conn = await getDbConnection(pool);
    const result = await conn.query('SELECT 1 as test');
    const poolStats = logPoolStats();
    
    res.json({ 
      message: 'Database connection working',
      result: result[0],
      poolStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database test error:', error);
    const poolStats = logPoolStats();
    
    res.status(500).json({ 
      error: 'Database connection failed',
      details: error.message,
      code: error.code,
      poolStats,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (releaseError) {
        console.error('Error releasing test connection:', releaseError);
      }
    }
  }
});

// Simple status route to check server and file system
app.get('/status', (req, res) => {
  try {
    const possibleBuildPaths = [
      path.join(__dirname, 'build'),
      path.join(__dirname, '..', 'frontend', 'build'),
      path.join(__dirname, 'frontend', 'build'),
      path.join(__dirname, '..', 'build')
    ];

    let foundBuildPath = null;
    const buildPathResults = [];
    
    for (const testPath of possibleBuildPaths) {
      const exists = fs.existsSync(testPath);
      buildPathResults.push({ path: testPath, exists });
      if (exists && !foundBuildPath) {
        foundBuildPath = testPath;
      }
    }

    const allDirectories = fs.readdirSync(__dirname, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    const status = {
      timestamp: new Date().toISOString(),
      serverDirectory: __dirname,
      allDirectories,
      buildPathChecks: buildPathResults,
      foundBuildPath,
      buildContents: foundBuildPath && fs.existsSync(foundBuildPath) ? fs.readdirSync(foundBuildPath) : 'No build directory found',
      staticExists: foundBuildPath ? fs.existsSync(path.join(foundBuildPath, 'static')) : false,
      staticContents: foundBuildPath && fs.existsSync(path.join(foundBuildPath, 'static')) ? fs.readdirSync(path.join(foundBuildPath, 'static')) : 'No static directory'
    };

    res.json(status);
  } catch (error) {
    res.json({ error: error.message, stack: error.stack });
  }
});

// Direct file test routes to bypass Express static middleware
app.get('/test-css', (req, res) => {
  const cssPath = path.join(__dirname, 'build', 'static', 'css', 'main.51b8d111.css');
  console.log('Testing direct CSS file:', cssPath);
  res.sendFile(cssPath, (err) => {
    if (err) {
      console.error('CSS file error:', err);
      res.status(404).json({ error: 'CSS file not found', path: cssPath, exists: fs.existsSync(cssPath) });
    }
  });
});

app.get('/test-js', (req, res) => {
  const jsPath = path.join(__dirname, 'build', 'static', 'js', 'main.e69de8af.js');
  console.log('Testing direct JS file:', jsPath);
  res.sendFile(jsPath, (err) => {
    if (err) {
      console.error('JS file error:', err);
      res.status(404).json({ error: 'JS file not found', path: jsPath, exists: fs.existsSync(jsPath) });
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Handle React routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  
  console.log('Serving React app for route:', req.path);
  // Use the dynamically found build path instead of hardcoded path
  const indexPath = buildPath ? path.join(buildPath, 'index.html') : path.join(__dirname, 'build', 'index.html');
  
  // Read the HTML file and inject the DevTools fix
  fs.readFile(indexPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading index.html:', err);
      return res.status(500).send('Error loading application');
    }
    
    // Inject the React DevTools fix script before the main.js script
    const devToolsFix = `<script>
// Fix React DevTools error in production
if (typeof window !== 'undefined') {
  try {
    if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
        value: {
          isDisabled: true,
          supportsFiber: true,
          inject: function() {},
          onCommitFiberRoot: function() {},
          onCommitFiberUnmount: function() {}
        },
        writable: false,
        configurable: false
      });
    }
  } catch (e) {
    console.log('DevTools hook already defined or error:', e.message);
  }
}
</script>`;
    
    // Insert the fix before the main.js script
    const modifiedHtml = data.replace(
      /<script defer="defer" src="\/static\/js\/main\./,
      devToolsFix + '<script defer="defer" src="/static/js/main.'
    );
    
    // Add headers to handle caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', 'text/html');
    
    res.send(modifiedHtml);
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
  
  // Handle symbol trading data subscription
  socket.on('subscribe_trading_data', () => {
    console.log('Client subscribed to trading data updates:', socket.id);
  });
});

// Make io available to routes that might need it
app.set('io', io);

// Helper function to broadcast trading data updates
const broadcastTradingDataUpdate = async () => {
  let conn;
  try {
    conn = await pool.getConnection();
    
    if (!conn) {
      console.error('Failed to get database connection for trading data broadcast');
      return;
    }
    
    // Set timezone to Bangkok
    await conn.query("SET time_zone = '+07:00'");
      
      // Get current day data
      const now = new Date();
      const bangkokOffset = 7 * 60; // UTC+7 in minutes
      const localOffset = now.getTimezoneOffset();
      const bangkokTime = new Date(now.getTime() + (bangkokOffset + localOffset) * 60000);
      
      const year = bangkokTime.getFullYear();
      const month = String(bangkokTime.getMonth() + 1).padStart(2, '0');
      const day = String(bangkokTime.getDate()).padStart(2, '0');
      
      const startOfDay = `${year}-${month}-${day} 00:00:00`;
      const startOfNextDay = new Date(bangkokTime);
      startOfNextDay.setDate(startOfNextDay.getDate() + 1);
      const endOfDay = `${startOfNextDay.getFullYear()}-${String(startOfNextDay.getMonth() + 1).padStart(2, '0')}-${String(startOfNextDay.getDate()).padStart(2, '0')} 00:00:00`;

      // Get random symbol to update (simulate real-time change)
      const symbolQuery = 'SELECT DISTINCT symbolref FROM `receive.itradebook` WHERE `date` >= ? AND `date` < ? ORDER BY RAND() LIMIT 1';
      const symbolResult = await conn.query(symbolQuery, [startOfDay, endOfDay]);
      
      if (symbolResult.length > 0) {
        const randomSymbol = symbolResult[0].symbolref;
        
        // Get updated data for this symbol
        const dataQuery = `
          SELECT 
            symbolref,
            SUM(buysize) AS total_buy_size,
            SUM(sellsize) AS total_sell_size,
            CASE
              WHEN SUM(buysize) > 0 THEN SUM(buyprice * buysize) / SUM(buysize)
              ELSE 0
            END AS weighted_avg_buy_price,
            CASE
              WHEN SUM(sellsize) > 0 THEN SUM(sellprice * sellsize) / SUM(sellsize)
              ELSE 0
            END AS weighted_avg_sell_price,
            (SELECT refid 
             FROM \`receive.itradebook\` r2 
             WHERE r2.symbolref = r1.symbolref 
               AND r2.date >= ? 
               AND r2.date < ?
             ORDER BY r2.date DESC, r2.refid DESC 
             LIMIT 1) AS last_refid
          FROM \`receive.itradebook\` r1
          WHERE r1.date >= ? 
            AND r1.date < ?
            AND r1.symbolref = ?
          GROUP BY symbolref
        `;
        
        const dataResult = await conn.query(dataQuery, [startOfDay, endOfDay, startOfDay, endOfDay, randomSymbol]);
        
        if (dataResult.length > 0) {
          const row = dataResult[0];
          const formattedData = {
            symbolref: row.symbolref,
            total_buy_size: parseFloat(row.total_buy_size) || 0,
            total_sell_size: parseFloat(row.total_sell_size) || 0,
            weighted_avg_buy_price: parseFloat(row.weighted_avg_buy_price) || 0,
            weighted_avg_sell_price: parseFloat(row.weighted_avg_sell_price) || 0,
            last_refid: row.last_refid || '',
            net_position: (parseFloat(row.total_buy_size) || 0) - (parseFloat(row.total_sell_size) || 0)
          };
          
          // Broadcast the update
          io.emit('trading_data_update', formattedData);
          console.log(`📡 Broadcasted trading data update for symbol: ${randomSymbol}`);
        }
      }
    } catch (error) {
      console.error('Error broadcasting trading data update:', error);
    } finally {
      if (conn) conn.release();
    }
};

// Helper function to broadcast customer trading data updates
const broadcastCustomerTradingUpdate = async () => {
  let conn;
  try {
    conn = await pool.getConnection();
    
    if (!conn) {
      console.error('Failed to get database connection for customer trading broadcast');
      return;
    }
    
    // Set timezone to Bangkok
    await conn.query("SET time_zone = '+07:00'");
      
      // Get current day data
      const now = new Date();
      const bangkokOffset = 7 * 60; // UTC+7 in minutes
      const localOffset = now.getTimezoneOffset();
      const bangkokTime = new Date(now.getTime() + (bangkokOffset + localOffset) * 60000);
      
      const year = bangkokTime.getFullYear();
      const month = String(bangkokTime.getMonth() + 1).padStart(2, '0');
      const day = String(bangkokTime.getDate()).padStart(2, '0');
      
      const startOfDay = `${year}-${month}-${day} 00:00:00`;
      const startOfNextDay = new Date(bangkokTime);
      startOfNextDay.setDate(startOfNextDay.getDate() + 1);
      const endOfDay = `${startOfNextDay.getFullYear()}-${String(startOfNextDay.getMonth() + 1).padStart(2, '0')}-${String(startOfNextDay.getDate()).padStart(2, '0')} 00:00:00`;

      // Get random symbol from customer data
      const symbolQuery = 'SELECT DISTINCT su.symbol_ref FROM sub_users su JOIN customer_data cd ON su.sub_username = cd.mt5 WHERE cd.datetime_server_ts_tz >= ? AND cd.datetime_server_ts_tz < ? ORDER BY RAND() LIMIT 1';
      const symbolResult = await conn.query(symbolQuery, [startOfDay, endOfDay]);
      
      if (symbolResult.length > 0) {
        const randomSymbol = symbolResult[0].symbol_ref;
        
        // Get updated customer trading data for this symbol
        const aggregateQuery = `
          SELECT 
              su.symbol_ref,
              SUM(CASE 
                  WHEN (cd.direction = 'out' AND cd.type = 'buy') OR (cd.direction = 'in' AND cd.type = 'sell') 
                  THEN cd.volume 
                  ELSE 0 
              END) AS total_buy_size,
              SUM(CASE 
                  WHEN (cd.direction = 'in' AND cd.type = 'buy') OR (cd.direction = 'out' AND cd.type = 'sell') 
                  THEN cd.volume 
                  ELSE 0 
              END) AS total_sell_size,
              CASE
                  WHEN SUM(CASE 
                      WHEN (cd.direction = 'out' AND cd.type = 'buy') OR (cd.direction = 'in' AND cd.type = 'sell') 
                      THEN cd.volume 
                      ELSE 0 
                  END) > 0 
                  THEN SUM(CASE 
                      WHEN (cd.direction = 'out' AND cd.type = 'buy') OR (cd.direction = 'in' AND cd.type = 'sell') 
                      THEN cd.price * cd.volume 
                      ELSE 0 
                  END) / SUM(CASE 
                      WHEN (cd.direction = 'out' AND cd.type = 'buy') OR (cd.direction = 'in' AND cd.type = 'sell') 
                      THEN cd.volume 
                      ELSE 0 
                  END)
                  ELSE 0
              END AS weighted_avg_buy_price,
              CASE
                  WHEN SUM(CASE 
                      WHEN (cd.direction = 'in' AND cd.type = 'buy') OR (cd.direction = 'out' AND cd.type = 'sell') 
                      THEN cd.volume 
                      ELSE 0 
                  END) > 0 
                  THEN SUM(CASE 
                      WHEN (cd.direction = 'in' AND cd.type = 'buy') OR (cd.direction = 'out' AND cd.type = 'sell') 
                      THEN cd.price * cd.volume 
                      ELSE 0 
                  END) / SUM(CASE 
                      WHEN (cd.direction = 'in' AND cd.type = 'buy') OR (cd.direction = 'out' AND cd.type = 'sell') 
                      THEN cd.volume 
                      ELSE 0 
                  END)
                  ELSE 0
              END AS weighted_avg_sell_price
          FROM customer_data cd
          JOIN sub_users su ON cd.mt5 = su.sub_username
          WHERE cd.datetime_server_ts_tz >= ? 
            AND cd.datetime_server_ts_tz < ? 
            AND cd.price BETWEEN 2000 AND 4000
            AND su.symbol_ref = ?
          GROUP BY su.symbol_ref
        `;
        
        const aggregateResult = await conn.query(aggregateQuery, [startOfDay, endOfDay, randomSymbol]);
        
        if (aggregateResult.length > 0) {
          const row = aggregateResult[0];
          const formattedData = {
            symbol_ref: row.symbol_ref,
            total_buy_size: parseFloat(row.total_buy_size) || 0,
            total_sell_size: parseFloat(row.total_sell_size) || 0,
            weighted_avg_buy_price: parseFloat(row.weighted_avg_buy_price) || 0,
            weighted_avg_sell_price: parseFloat(row.weighted_avg_sell_price) || 0,
            total_equity: Math.random() * 10000, // Simulate changing equity
            total_balance: Math.random() * 8000, // Simulate changing balance  
            total_floating: (Math.random() - 0.5) * 1000, // Simulate changing floating
            last_refid: Date.now().toString(),
            net_position: (parseFloat(row.total_buy_size) || 0) - (parseFloat(row.total_sell_size) || 0)
          };
          
          // Broadcast the update
          io.emit('customer_trading_update', formattedData);
          console.log(`📡 Broadcasted customer trading update for symbol: ${randomSymbol}`);
        }
      }
  } catch (error) {
    console.error('Error broadcasting customer trading update:', error);
  } finally {
    if (conn) conn.release();
  }
};

// Helper function to broadcast live data updates for DailySavedDataPage
const broadcastLiveDataUpdate = async () => {
  let conn;
  try {
    conn = await pool.getConnection();
    
    if (!conn) {
      console.error('Failed to get database connection for live data broadcast');
      return;
    }
    
    // Set timezone to Bangkok
    await conn.query("SET time_zone = '+07:00'");
      
      // Get current day data
      const now = new Date();
      const bangkokOffset = 7 * 60; // UTC+7 in minutes
      const localOffset = now.getTimezoneOffset();
      const bangkokTime = new Date(now.getTime() + (bangkokOffset + localOffset) * 60000);
      
      const year = bangkokTime.getFullYear();
      const month = String(bangkokTime.getMonth() + 1).padStart(2, '0');
      const day = String(bangkokTime.getDate()).padStart(2, '0');
      
      const startOfDay = `${year}-${month}-${day} 00:00:00`;
      const startOfNextDay = new Date(bangkokTime);
      startOfNextDay.setDate(startOfNextDay.getDate() + 1);
      const endOfDay = `${startOfNextDay.getFullYear()}-${String(startOfNextDay.getMonth() + 1).padStart(2, '0')}-${String(startOfNextDay.getDate()).padStart(2, '0')} 00:00:00`;

      // Get random symbol to update (simulate real-time change)
      const symbolQuery = 'SELECT DISTINCT symbolref FROM `receive.itradebook` WHERE `date` >= ? AND `date` < ? ORDER BY RAND() LIMIT 1';
      const symbolResult = await conn.query(symbolQuery, [startOfDay, endOfDay]);
      
      if (symbolResult.length > 0) {
        const randomSymbol = symbolResult[0].symbolref;
        
        // Get comprehensive live data for this symbol
        const liveDataQuery = `
          SELECT 
            symbolref as symbol_ref,
            SUM(buysize) AS total_buy_size,
            SUM(sellsize) AS total_sell_size,
            CASE
              WHEN SUM(buysize) > 0 THEN SUM(buyprice * buysize) / SUM(buysize)
              ELSE 0
            END AS weighted_avg_buy_price,
            CASE
              WHEN SUM(sellsize) > 0 THEN SUM(sellprice * sellsize) / SUM(sellsize)
              ELSE 0
            END AS weighted_avg_sell_price,
            UNIX_TIMESTAMP(MAX(date)) as timestamp,
            MAX(refid) as latest_refid,
            COUNT(*) as trade_count
          FROM \`receive.itradebook\`
          WHERE symbolref = ? 
            AND date >= ? 
            AND date < ?
          GROUP BY symbolref
        `;
        
        const liveDataResult = await conn.query(liveDataQuery, [randomSymbol, startOfDay, endOfDay]);
        
        if (liveDataResult.length > 0) {
          const row = liveDataResult[0];
          const netPosition = (parseFloat(row.total_buy_size) || 0) - (parseFloat(row.total_sell_size) || 0);
          
          const formattedLiveData = {
            symbol_ref: row.symbol_ref,
            total_buy_size: parseFloat(row.total_buy_size) || 0,
            total_sell_size: parseFloat(row.total_sell_size) || 0,
            weighted_avg_buy_price: parseFloat(row.weighted_avg_buy_price) || 0,
            weighted_avg_sell_price: parseFloat(row.weighted_avg_sell_price) || 0,
            net_position: netPosition,
            timestamp: row.timestamp,
            latest_refid: row.latest_refid || '',
            trade_count: parseInt(row.trade_count) || 0,
            // Add some calculated fields that might be useful for the UI
            profit_loss: netPosition * ((parseFloat(row.weighted_avg_sell_price) || 0) - (parseFloat(row.weighted_avg_buy_price) || 0)),
            last_updated: new Date().toISOString()
          };
          
          // Broadcast the live data update
          io.emit('live_data_update', formattedLiveData);
          console.log(`📡 Broadcasted live data update for symbol: ${randomSymbol}`);
        }
      }
  } catch (error) {
    console.error('Error broadcasting live data update:', error);
  } finally {
    if (conn) conn.release();
  }
};

// Simple interval to simulate real-time updates (for now)
// In production, this would be triggered by actual database changes
let lastDataChecksum = null;
let isCheckingForChanges = false;

const checkForDataChanges = async () => {
  if (isCheckingForChanges) return;
  
  isCheckingForChanges = true;
  let conn;
  try {
    conn = await pool.getConnection();
    
    // Get a checksum of today's data to detect changes
    const checksumQuery = `
      SELECT 
        COUNT(*) as total_records,
        MAX(id) as latest_id,
        SUM(UNIX_TIMESTAMP(date)) as date_sum
      FROM trading_data 
      WHERE DATE(date) = CURDATE()
    `;
    
    const result = await conn.query(checksumQuery);
    const currentChecksum = `${result[0].total_records}-${result[0].latest_id}-${result[0].date_sum}`;
    
    // If data has changed, broadcast update
    if (lastDataChecksum && lastDataChecksum !== currentChecksum) {
      console.log('📡 Data changes detected - broadcasting update');
      io.emit('data_changed', { 
        timestamp: new Date().toISOString(),
        reason: 'live_data_update'
      });
    }
    
    lastDataChecksum = currentChecksum;
    
  } catch (error) {
    console.error('Error checking for data changes:', error);
  } finally {
    if (conn) conn.release();
    isCheckingForChanges = false;
  }
};

// Check for changes every 5 seconds (lightweight check)
setInterval(checkForDataChanges, 5000);

// Broadcast live data updates every 5 seconds for DailySavedDataPage
setInterval(broadcastLiveDataUpdate, 5000);

console.log('🔍 Real-time change detection enabled (5s intervals)');
console.log('📡 Live data WebSocket broadcasts enabled (5s intervals)');
console.log('� Simple WebSocket heartbeat enabled (30s intervals)');

server.listen(port, () => {
  console.log(`🚀 iTradeBook Server running on port ${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: http://localhost:3000`);
  console.log(`🔗 API Health Check: http://localhost:${port}/api/health`);
  console.log(`📊 Pool Health Check: http://localhost:${port}/api/pool-health`);
  
  // Log initial pool stats
  setTimeout(() => {
    console.log('Initial pool stats:');
    logPoolStats();
  }, 1000);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${port} is already in use. In Plesk/IIS, this is normal - the server will use the assigned port.`);
  } else {
    console.error('Server error:', err);
  }
});

// Graceful shutdown handling
async function gracefulShutdown(signal) {
  console.log(`\n📤 Received ${signal}. Starting graceful shutdown...`);
  
  // Stop accepting new requests
  server.close(async () => {
    console.log('🛑 HTTP server closed.');
    
    try {
      // Close database pool
      await pool.end();
      console.log('✅ Database pool closed.');
      
      console.log('✅ Graceful shutdown completed.');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force exit after 30 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});