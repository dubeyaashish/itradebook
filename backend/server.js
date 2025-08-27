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
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'itradebook_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  })
);

// Database connection
const pool = mariadb.createPool({
  host: process.env.DB_HOST || '119.59.101.83',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  user: process.env.DB_USER || 'itradebook_db',
  password: process.env.DB_PASS || 'v264^jx1W',
  database: process.env.DB_NAME || 'itradebook',
  connectionLimit: 10,
});

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
    
    // Get user from database to ensure they still exist and are active
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
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Helper functions
async function getAllowedSymbols(conn, req) {
  const userType = req.user?.user_type || req.session.user_type || 'regular';
  if (userType === 'managed') {
    const userId = req.user?.id || req.session.user_id || 0;
    if (!userId) return [];
    const rows = await conn.query(
      'SELECT symbol_ref FROM user_symbol_permissions WHERE user_id = ?',
      [userId]
    );
    return rows.map((r) => r.symbol_ref);
  }
  return null; // null -> no restriction
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

    // Generate JWT token - Convert BigInt to Number
    const userId = Number(result.insertId);
    const token = jwt.sign(
      { userId: userId, username, email },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: userId,
        username,
        email,
        user_type: 'regular'
      }
    });
  } catch (err) {
    console.error(err);
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

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        user_type: user.user_type
      }
    });
  } catch (err) {
    console.error(err);
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
      // Don't reveal if email exists or not for security
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
    console.error(err);
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
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      user_type: req.user.user_type
    }
  });
});

// Protected Data Routes
app.get('/api/symbols', authenticateToken, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const allowed = await getAllowedSymbols(conn, req);
    let query = 'SELECT DISTINCT symbolref FROM `receive.itradebook`';
    const params = [];
    if (allowed && allowed.length) {
      query += ` WHERE symbolref IN (${allowed.map(() => '?').join(',')})`;
      params.push(...allowed);
    } else if (Array.isArray(allowed) && allowed.length === 0) {
      return res.json([]);
    }
    const rows = await conn.query(query, params);
    res.json(rows.map((r) => r.symbolref));
  } catch (err) {
    console.error(err);
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
    let query =
      'SELECT DISTINCT refid FROM `receive.itradebook` WHERE refid IS NOT NULL AND refid != ""';
    const params = [];
    if (allowed && allowed.length) {
      query += ` AND symbolref IN (${allowed.map(() => '?').join(',')})`;
      params.push(...allowed);
    } else if (Array.isArray(allowed) && allowed.length === 0) {
      return res.json([]);
    }
    query += ' ORDER BY refid';
    const rows = await conn.query(query, params);
    res.json(rows.map((r) => r.refid));
  } catch (err) {
    console.error(err);
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
    const orderBy = [
      'id',
      'refid',
      'buysize',
      'buyprice',
      'sellsize',
      'sellprice',
      'symbolref',
      'date',
      'type',
    ].includes(req.query.order_by)
      ? req.query.order_by
      : 'id';
    const orderDir = req.query.order_dir === 'asc' ? 'ASC' : 'DESC';

    let filter = ' WHERE 1=1';
    const params = [];

    if (req.query.start_date && req.query.end_date) {
      const start = `${req.query.start_date} ${req.query.start_time || '00:00:00'}`;
      const end = `${req.query.end_date} ${req.query.end_time || '23:59:59'}`;
      filter += ' AND date BETWEEN ? AND ?';
      params.push(start, end);
    }

    if (req.query.symbolref) {
      const symbols = Array.isArray(req.query.symbolref)
        ? req.query.symbolref
        : req.query.symbolref.split(',');
      const allowedSymbols =
        allowed === null
          ? symbols
          : symbols.filter((s) => allowed.includes(s));
      if (allowedSymbols.length) {
        filter += ` AND symbolref IN (${allowedSymbols.map(() => '?').join(',')})`;
        params.push(...allowedSymbols);
      }
    } else if (Array.isArray(allowed) && allowed.length) {
      filter += ` AND symbolref IN (${allowed.map(() => '?').join(',')})`;
      params.push(...allowed);
    } else if (Array.isArray(allowed) && allowed.length === 0) {
      return res.json({ total: 0, rows: [] });
    }

    if (req.query.refid) {
      const refids = Array.isArray(req.query.refid)
        ? req.query.refid
        : req.query.refid.split(',');
      filter += ` AND refid IN (${refids.map(() => '?').join(',')})`;
      params.push(...refids);
    }

    if (req.query.filter_type === 'snapshot') {
      filter += ' AND type LIKE ?';
      params.push('%snapshot%');
    }

    const totalQuery = `SELECT COUNT(*) as count FROM ` +
      '`receive.itradebook`' +
      filter;
    const totalRows = await conn.query(totalQuery, params);
    const total = totalRows[0]?.count || 0;

    const dataQuery =
      `SELECT * FROM ` +
      '`receive.itradebook`' +
      filter +
      ` ORDER BY ${orderBy} ${orderDir} LIMIT ? OFFSET ?`;
    const rows = await conn.query(dataQuery, [...params, limit, offset]);

    res.json({ total, rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/data', authenticateToken, async (req, res) => {
  const { refid, buysize, buyprice, sellsize, sellprice, symbolref, type } =
    req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    const allowed = await getAllowedSymbols(conn, req);
    if (!refid) return res.status(400).json({ error: 'Refid is required' });
    if (allowed && allowed.length && !allowed.includes(symbolref)) {
      return res.status(403).json({ error: "Symbol not permitted" });
    }
    const countRows = await conn.query(
      'SELECT COUNT(*) as count FROM `receive.itradebook` WHERE refid = ?',
      [refid]
    );
    if (countRows[0].count > 0) {
      return res.status(400).json({ error: 'Refid already exists' });
    }
    await conn.query(
      'INSERT INTO `receive.itradebook` (refid, buysize, buyprice, sellsize, sellprice, symbolref, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [refid, buysize, buyprice, sellsize, sellprice, symbolref, type || 'manual']
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

app.delete('/api/data', authenticateToken, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: 'No ids provided' });
  let conn;
  try {
    conn = await pool.getConnection();
    const placeholders = ids.map(() => '?').join(',');
    await conn.query(
      `DELETE FROM \`receive.itradebook\` WHERE id IN (${placeholders})`,
      ids
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`🚀 iTradeBook Server running on port ${port}`);
  console.log(`📊 Dashboard: http://localhost:${port}`);
});