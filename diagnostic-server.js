console.log('=== DIAGNOSTIC SERVER STARTING ===');
console.log('Current directory:', __dirname);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);

// Test .env loading
console.log('Testing .env file...');
const envPath = process.env.NODE_ENV === 'production' ? './.env' : '../.env';
console.log('Env path:', envPath);

try {
  require('dotenv').config({ path: envPath });
  console.log('✓ .env loaded successfully');
  console.log('DB_HOST:', process.env.DB_HOST ? 'SET' : 'NOT SET');
  console.log('DB_USER:', process.env.DB_USER ? 'SET' : 'NOT SET');
  console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'NOT SET');
} catch (error) {
  console.error('✗ Error loading .env:', error.message);
}

// Test database connection
console.log('Testing database connection...');
const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST || '119.59.101.83',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  user: process.env.DB_USER || 'itradebook_db',
  password: process.env.DB_PASS || 'v264^jx1W',
  database: process.env.DB_NAME || 'itradebook',
  connectionLimit: 1,
  acquireTimeout: 5000,
  timeout: 5000
});

async function testDatabase() {
  let conn;
  try {
    console.log('Attempting database connection...');
    conn = await pool.getConnection();
    console.log('✓ Database connected successfully');
    
    const result = await conn.query('SELECT 1 as test');
    console.log('✓ Database query test successful:', result);
  } catch (error) {
    console.error('✗ Database connection error:', error.message);
  } finally {
    if (conn) conn.release();
  }
}

// Test Express
console.log('Testing Express server...');
const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.json({
    message: 'Diagnostic server working!',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date(),
    directory: __dirname
  });
});

app.get('/test-db', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query('SELECT NOW() as current_time');
    res.json({ success: true, result });
  } catch (error) {
    res.json({ success: false, error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

app.listen(port, () => {
  console.log(`✓ Express server started on port ${port}`);
  testDatabase();
});

process.on('uncaughtException', (err) => {
  console.error('=== UNCAUGHT EXCEPTION ===', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('=== UNHANDLED REJECTION ===', reason);
});
