const express = require('express');
const session = require('express-session');
const cors = require('cors');
const mariadb = require('mariadb');
require('dotenv').config({ path: '../.env' });

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'itradebook_secret',
    resave: false,
    saveUninitialized: true,
  })
);

const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  user: process.env.DB_USER || 'itradebook_lg',
  password: process.env.DB_PASS || 'v264^jx1W',
  database: process.env.DB_NAME || 'itradebook',
  connectionLimit: 5,
});

async function getAllowedSymbols(conn, req) {
  const userType = req.session.user_type || 'regular';
  if (userType === 'managed') {
    const userId = req.session.user_id || 0;
    if (!userId) return [];
    const rows = await conn.query(
      'SELECT symbol_ref FROM user_symbol_permissions WHERE user_id = ?',
      [userId]
    );
    return rows.map((r) => r.symbol_ref);
  }
  return null; // null -> no restriction
}

app.get('/api/symbols', async (req, res) => {
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

app.get('/api/refids', async (req, res) => {
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

app.get('/api/data', async (req, res) => {
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

app.post('/api/data', async (req, res) => {
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

app.delete('/api/data', async (req, res) => {
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

