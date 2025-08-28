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
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'itradebook_secret',
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
      const users = await conn.query(
        'SELECT id, username, email, user_type, is_active FROM users WHERE id = ? AND is_active = TRUE',
        [decoded.userId]
      );
      
      if (users.length === 0) {
        return res.status(401).json({ error: 'User not found or inactive' });
      }
      
      req.user = users[0];
      req.session.user_id = users[0].id;
      req.session.user_type = users[0].user_type;
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

// Initialize database tables
async function initializeTables() {
  let conn;
  try {
    conn = await pool.getConnection();
    
    // Create users table if not exists
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

    // Create user_symbol_permissions table if not exists
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

    // Create otps table if not exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS otps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(100) NOT NULL,
        otp_code VARCHAR(10) NOT NULL,
        purpose VARCHAR(50) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
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

// Initialize tables on startup
initializeTables();

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    
    // Check if user already exists
    const existingUsers = await conn.query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await conn.query(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );

    // Generate JWT token
    const userId = Number(result.insertId);
    const token = jwt.sign(
      { userId: userId, username, email },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '24h' }
    );

    const responseData = convertBigIntToNumber({
      message: 'User created successfully',
      token,
      user: {
        id: userId,
        username,
        email,
        user_type: 'regular'
      }
    });

    res.status(201).json(responseData);
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Database error during registration' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    
    // Find user by username or email
    const users = await conn.query(
      'SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = TRUE',
      [username, username]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '24h' }
    );

    // Set session data
    req.session.user_id = user.id;
    req.session.user_type = user.user_type;

    const responseData = convertBigIntToNumber({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        user_type: user.user_type
      }
    });

    res.json(responseData);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Database error during login' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.json({ message: 'Logout successful' });
  });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    
    // Check if user exists
    const users = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.json({ message: 'If the email exists, an OTP has been sent' });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to database
    await conn.query(
      'INSERT INTO otps (email, otp_code, purpose, expires_at) VALUES (?, ?, ?, ?)',
      [email, otp, 'password_reset', expiresAt]
    );

    // Send email
    const emailSent = await sendEmail(
      email,
      'Password Reset - iTradeBook',
      `Your password reset OTP is: ${otp}\n\nThis OTP will expire in 10 minutes.`,
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e293b;">Password Reset - iTradeBook</h2>
          <p>You requested a password reset. Your OTP is:</p>
          <div style="background: #f1f5f9; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; color: #1e293b; border-radius: 8px; margin: 20px 0;">
            ${otp}
          </div>
          <p style="color: #64748b;">This OTP will expire in 10 minutes.</p>
          <p style="color: #64748b;">If you didn't request this, please ignore this email.</p>
        </div>
      `
    );

    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send email' });
    }

    res.json({ message: 'If the email exists, an OTP has been sent' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    
    // Verify OTP
    const otps = await conn.query(
      'SELECT * FROM otps WHERE email = ? AND otp_code = ? AND purpose = ? AND expires_at > NOW() AND used = FALSE ORDER BY created_at DESC LIMIT 1',
      [email, otp, 'password_reset']
    );

    if (otps.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Mark OTP as used
    await conn.query('UPDATE otps SET used = TRUE WHERE id = ?', [otps[0].id]);

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update user password
    const result = await conn.query(
      'UPDATE users SET password_hash = ? WHERE email = ?',
      [hashedPassword, email]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  const responseData = convertBigIntToNumber({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      user_type: req.user.user_type
    }
  });
  res.json(responseData);
});

// Protected Data Routes
app.get('/api/symbols', authenticateToken, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const allowed = await getAllowedSymbols(conn, req);
    
    let query = 'SELECT DISTINCT symbolref FROM `receive.itradebook` WHERE symbolref IS NOT NULL AND symbolref != ""';
    const params = [];
    
    if (allowed && allowed.length > 0) {
      query += ` AND symbolref IN (${allowed.map(() => '?').join(',')})`;
      params.push(...allowed);
    } else if (Array.isArray(allowed) && allowed.length === 0) {
      return res.json([]);
    }
    
    query += ' ORDER BY symbolref';
    const rows = await conn.query(query, params);
    const symbols = convertBigIntToNumber(rows.map((r) => r.symbolref));
    res.json(symbols);
  } catch (err) {
    console.error('Symbols error:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/refids', authenticateToken, async (req, res) => {
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
    const refids = convertBigIntToNumber(rows.map((r) => r.refid));
    res.json(refids);
  } catch (err) {
    console.error('Refids error:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/data', authenticateToken, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const allowed = await getAllowedSymbols(conn, req);
    
    const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const offset = (page - 1) * limit;
    
    const validColumns = [
      'id', 'refid', 'buysize', 'buyprice', 'sellsize', 'sellprice', 
      'symbolref', 'date', 'type'
    ];
    const orderBy = validColumns.includes(req.query.order_by) ? req.query.order_by : 'date';
    const orderDir = req.query.order_dir === 'asc' ? 'ASC' : 'DESC';

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
        // User has restrictions but no allowed symbols match
        return res.json({ total: 0, rows: [] });
      }
    } else if (Array.isArray(allowed)) {
      // Apply user's symbol restrictions
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

    // Filter type
    if (req.query.filter_type === 'snapshot') {
      filter += ' AND type LIKE ?';
      params.push('%snapshot%');
    }

    // Get total count
    const totalQuery = `SELECT COUNT(*) as count FROM \`receive.itradebook\` ${filter}`;
    const totalRows = await conn.query(totalQuery, params);
    const total = Number(totalRows[0]?.count || 0);

    // Get data
    const dataQuery = `SELECT * FROM \`receive.itradebook\` ${filter} ORDER BY \`${orderBy}\` ${orderDir} LIMIT ? OFFSET ?`;
    const rows = await conn.query(dataQuery, [...params, limit, offset]);

    const responseData = convertBigIntToNumber({ 
      total, 
      rows: rows 
    });
    
    res.json(responseData);
  } catch (err) {
    console.error('Data fetch error:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/data', authenticateToken, async (req, res) => {
  const { refid, buysize, buyprice, sellsize, sellprice, symbolref, type } = req.body;
  
  let conn;
  try {
    conn = await pool.getConnection();
    const allowed = await getAllowedSymbols(conn, req);
    
    if (!refid) {
      return res.status(400).json({ error: 'RefID is required' });
    }

    // Check symbol permissions for managed users
    if (allowed && allowed.length > 0 && symbolref && !allowed.includes(symbolref)) {
      return res.status(403).json({ error: "You don't have permission to add data for this symbol" });
    }

    // Check if refid already exists
    const countRows = await conn.query(
      'SELECT COUNT(*) as count FROM `receive.itradebook` WHERE refid = ?',
      [refid]
    );
    
    const count = Number(countRows[0].count);
    if (count > 0) {
      return res.status(400).json({ error: 'RefID already exists' });
    }

    // Insert new record
    const result = await conn.query(
      'INSERT INTO `receive.itradebook` (refid, buysize, buyprice, sellsize, sellprice, symbolref, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [refid, buysize || null, buyprice || null, sellsize || null, sellprice || null, symbolref || null, type || 'manual']
    );

    const responseData = convertBigIntToNumber({ 
      success: true, 
      message: 'Record inserted successfully',
      id: Number(result.insertId)
    });
    
    res.json(responseData);
  } catch (err) {
    console.error('Insert error:', err);
    res.status(500).json({ error: 'Database error during insert' });
  } finally {
    if (conn) conn.release();
  }
});

app.delete('/api/data', authenticateToken, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  
  if (!ids.length) {
    return res.status(400).json({ error: 'No IDs provided' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const allowed = await getAllowedSymbols(conn, req);
    
    // Build the delete query with symbol restrictions if needed
    let query = `DELETE FROM \`receive.itradebook\` WHERE id IN (${ids.map(() => '?').join(',')})`;
    let params = [...ids];
    
    if (allowed && allowed.length > 0) {
      query += ` AND symbolref IN (${allowed.map(() => '?').join(',')})`;
      params.push(...allowed);
    }
    
    const result = await conn.query(query, params);
    
    const responseData = convertBigIntToNumber({ 
      success: true, 
      message: `${Number(result.affectedRows)} records deleted successfully`,
      deletedCount: Number(result.affectedRows)
    });
    
    res.json(responseData);
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Database error during deletion' });
  } finally {
    if (conn) conn.release();
  }
});

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