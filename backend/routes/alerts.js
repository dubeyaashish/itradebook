const express = require('express');

const http = require('http');
const https = require('https');

module.exports = function (pool, { authenticateToken, getAllowedSymbols }, dbHelpers) {
  const router = express.Router();
  const { getDbConnection } = dbHelpers || {};
  const ensureNotManaged = (req, res, next) => {
    if (req.user?.user_type === 'managed') {
      return res.status(403).json({ error: 'Not allowed' });
    }
    next();
  };

  async function ensureTables(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS alert_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        symbol_ref VARCHAR(64) NOT NULL,
        minutes INT NOT NULL,
        percent DECIMAL(10,4) NOT NULL,
        enabled TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_symbol (user_id, symbol_ref)
      )`);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS alert_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rule_id INT NULL,
        user_id INT NOT NULL,
        symbol_ref VARCHAR(64) NOT NULL,
        evaluated_at DATETIME NOT NULL,
        current_value DECIMAL(20,8) NULL,
        past_value DECIMAL(20,8) NULL,
        percent_change DECIMAL(20,8) NULL,
        delivered TINYINT(1) DEFAULT 0,
        response_code INT NULL,
        response_body TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_symbol_date (user_id, symbol_ref, evaluated_at)
      )`);
  }

  // Helper: compute profit_ratio number from a row (fallback if null)
  function computeProfitRatioLike(row) {
    let v = Number(row?.profit_ratio);
    if (Number.isFinite(v)) return v;
    const buylot = Number(row?.buylot) || 0;
    const avgbuy = Number(row?.avgbuy) || 0;
    const selllot = Number(row?.selllot) || 0;
    const avgsell = Number(row?.avgsell) || 0;
    const denom = buylot * avgbuy;
    return denom > 0 ? (((selllot * avgsell) / denom) - 1) * 100 : 0;
  }

  // Helper: HTTP call (GET with query or POST with body)
  async function requestAlert({ urlStr, method = 'GET', bodyText = '', headers = {}, queryParam = 'q', pathOnly = false }) {
    return new Promise((resolve, reject) => {
      try {
        // Support relative paths like '/api/alerts' by prefixing localhost and current port
        let finalUrlStr = urlStr;
        if (finalUrlStr.startsWith('/')) {
          const port = Number(process.env.PORT || process.env.IISNODE_PORT || 3001);
          finalUrlStr = `http://127.0.0.1:${port}${finalUrlStr}`;
        }
        if (method === 'GET' && !pathOnly) {
          const sep = finalUrlStr.includes('?') ? '&' : '?';
          finalUrlStr = `${finalUrlStr}${sep}${encodeURIComponent(queryParam)}=${encodeURIComponent(bodyText)}`;
        }
        const urlObj = new URL(finalUrlStr);
        const isHttps = urlObj.protocol === 'https:';
        const lib = isHttps ? https : http;
        const req = lib.request({
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + (urlObj.search || ''),
          method,
          headers: method === 'POST' ? {
            'Content-Type': headers['Content-Type'] || 'text/plain',
            'Content-Length': Buffer.byteLength(bodyText),
            ...headers
          } : headers,
          timeout: Number(process.env.ALERT_POST_TIMEOUT_MS || 5000)
        }, (res) => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => resolve({ status: res.statusCode, body: data, url: finalUrlStr }));
        });
        req.on('error', reject);
        if (method === 'POST') {
          req.write(bodyText);
        }
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  // Evaluate all enabled rules once
  async function evaluateRulesOnce(filterSymbols = null) {
    let conn;
    const results = [];
    try {
      conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
      await conn.query("SET time_zone = '+07:00'");
      await ensureTables(conn);

      let rulesSql = 'SELECT * FROM alert_rules WHERE enabled = 1';
      const rParams = [];
      if (Array.isArray(filterSymbols) && filterSymbols.length > 0) {
        rulesSql += ` AND symbol_ref IN (${filterSymbols.map(()=>'?').join(',')})`;
        rParams.push(...filterSymbols);
      }
      const rules = await conn.query(rulesSql, rParams);
      if (!rules.length) return results;

      // Simple cooldown in minutes (env or rule.minutes)
      const defaultCooldown = Number(process.env.ALERTS_COOLDOWN_MIN || 5);
      const method = String(process.env.ALERT_METHOD || 'GET').toUpperCase();
      const alertBase = process.env.ALERT_GET_URL || process.env.ALERT_POST_URL || '';
      const getParam = process.env.ALERT_GET_PARAM || 'q';
      const pathOnly = String(process.env.ALERT_PATH_ONLY || 'true').toLowerCase() === 'true';
      const extraHeader = process.env.ALERT_POST_AUTH ? { 'Authorization': process.env.ALERT_POST_AUTH } : {};

      for (const r of rules) {
        try {
          const minutes = Number(r.minutes) || 0;
          const thresholdPct = Number(r.percent) || 0;
          if (minutes <= 0 || thresholdPct <= 0) continue;

          // Get current = second latest per symbol
          const currentRows = await conn.query(
            `SELECT profit_ratio, buylot, avgbuy, selllot, avgsell, date
             FROM trading_data WHERE symbol_ref = ?
             ORDER BY date DESC, id DESC LIMIT 2`,
            [r.symbol_ref]
          );
          if (!currentRows.length) continue;
          const cRow = currentRows.length > 1 ? currentRows[1] : currentRows[0];
          const current = computeProfitRatioLike(cRow);

          // Past point at or before NOW() - minutes
          const pastRows = await conn.query(
            `SELECT profit_ratio, buylot, avgbuy, selllot, avgsell, date
             FROM trading_data WHERE symbol_ref = ? AND date <= (NOW() - INTERVAL ? MINUTE)
             ORDER BY date DESC, id DESC LIMIT 1`,
            [r.symbol_ref, minutes]
          );
          if (!pastRows.length) continue;
          const past = computeProfitRatioLike(pastRows[0]);
          if (!Number.isFinite(past) || past === 0) continue;

          const pctChange = ((current - past) / Math.abs(past)) * 100;
          const triggered = pctChange >= thresholdPct;

          const cooldownMin = Number(process.env.ALERTS_COOLDOWN_MIN || defaultCooldown) || minutes;
          let recent = [];
          if (triggered) {
            recent = await conn.query(
              `SELECT id FROM alert_events
               WHERE user_id = ? AND symbol_ref = ? AND delivered = 1
                 AND evaluated_at >= (NOW() - INTERVAL ? MINUTE)
               ORDER BY evaluated_at DESC LIMIT 1`,
              [r.user_id, r.symbol_ref, cooldownMin]
            );
          }

          let delivery = { status: 0, body: '' };
          let delivered = 0;
          if (triggered && recent.length === 0) {
            // Payload is a constant numeric string followed by symbol, with a space after comma
            const constValue = String(process.env.ALERT_POST_CONST || '0.5');
            const payload = `${constValue},${r.symbol_ref}`;
            if (alertBase) {
              try {
                // Build URL as <alertBase>/<symbol_ref>
                const base = alertBase.endsWith('/') ? alertBase.slice(0, -1) : alertBase;
                const urlWithSymbol = `${base}/${encodeURIComponent(r.symbol_ref)}`;
                delivery = await requestAlert({ urlStr: urlWithSymbol, method, bodyText: payload, headers: { 'Content-Type': 'text/plain', ...extraHeader }, queryParam: getParam, pathOnly });
                delivered = 1;
              } catch (postErr) {
                delivery = { status: 0, body: String(postErr?.message || postErr) };
              }
              // Record event only when a URL is configured
              await conn.query(
                `INSERT INTO alert_events (rule_id, user_id, symbol_ref, evaluated_at, current_value, past_value, percent_change, delivered, response_code, response_body)
                 VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)` ,
                [r.id || null, r.user_id, r.symbol_ref, current, past, pctChange, delivered, delivery.status || null, delivery.body || null]
              );
            }
          }

          results.push({
            rule_id: r.id,
            user_id: r.user_id,
            symbol_ref: r.symbol_ref,
            minutes,
            threshold: thresholdPct,
            current,
            past,
            percent_change: pctChange,
            triggered,
            delivered: Boolean(delivered)
          });
        } catch (innerErr) {
          console.error('Alert evaluation error (rule loop):', innerErr);
        }
      }

    } catch (e) {
      console.error('alerts evaluateRulesOnce error:', e);
    } finally {
      if (conn) conn.release();
    }
    return results;
  }

  // Scheduler handle
  let intervalHandle = null;
  function startScheduler() {
    const enabled = String(process.env.ALERTS_ENABLED || 'true').toLowerCase() !== 'false';
    const everySec = Math.max(5, Number(process.env.ALERTS_POLL_SEC || 30));
    if (!enabled) {
      console.log('🔕 Alerts scheduler disabled (ALERTS_ENABLED=false)');
      return;
    }
    if (intervalHandle) return;
    intervalHandle = setInterval(() => {
      evaluateRulesOnce().then((res) => {
        if ((process.env.ALERTS_LOG_VERBOSE || 'false') === 'true') {
          console.log(`⏱️ Alerts evaluated (${res.length} rules processed)`);
        }
      }).catch(err => console.error('Alerts interval error:', err));
    }, everySec * 1000);
    console.log(`🔔 Alerts scheduler started (every ${everySec}s)`);
  }

  // Admin/diagnostic endpoints
  router.post('/evaluate-now', authenticateToken, ensureNotManaged, async (req, res) => {
    try {
      const out = await evaluateRulesOnce();
      res.json({ ok: true, processed: out.length, results: out.slice(0, 100) });
    } catch (e) {
      console.error('alerts evaluate-now error:', e);
      res.status(500).json({ error: 'Failed to evaluate now' });
    }
  });

  // Public GET receiver: /api/alerts/:symbol_ref
  // Returns CSV only if a recent delivered alert_event exists for this symbol (no headers needed).
  router.get('/:symbol_ref', async (req, res, next) => {
    try {
      const symbol = req.params.symbol_ref;
      // Avoid catching real routes like /rules, /evaluate-now, /test
      const reserved = new Set(['rules','evaluate-now','test','evaluate']);
      if (reserved.has(symbol)) return next();
      // Only show CSV if an alert was delivered recently for this symbol
      let conn;
      try {
        conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
        const ttlSec = Math.max(5, parseInt(process.env.ALERT_EVENT_TTL_SEC || '120', 10));
        const rows = await conn.query(
          `SELECT id FROM alert_events 
             WHERE symbol_ref = ? AND delivered = 1 
               AND evaluated_at >= (NOW() - INTERVAL ? SECOND)
             ORDER BY evaluated_at DESC, id DESC LIMIT 1`,
          [symbol, ttlSec]
        );
        if (rows && rows.length > 0) {
          const constVal = String(process.env.ALERT_POST_CONST || '0.5');
          const body = `${constVal},${symbol}`;
          console.log('📥 Alert GET: recent event found, delivering CSV', { symbol });
          res.setHeader('Content-Type', 'text/plain');
          return res.send(body);
        }
      } catch (e) {
        console.error('Receiver check error:', e?.message);
      } finally {
        if (conn) conn.release();
      }
      // No recent event: return no content
      return res.status(204).end();
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Lightweight evaluate hooks (no auth):
  // GET /api/alerts/evaluate/:symbol_ref -> evaluates only that symbol and returns JSON
  router.get('/evaluate/:symbol_ref', async (req, res) => {
    try {
      const sym = req.params.symbol_ref;
      const out = await evaluateRulesOnce([sym]);
      res.json({ ok: true, symbol_ref: sym, processed: out.length, triggered: out.some(r => r.symbol_ref === sym && r.triggered) });
    } catch (e) {
      console.error('alerts GET evaluate error:', e);
      res.status(500).json({ ok: false, error: 'Evaluate failed' });
    }
  });

  // POST /api/alerts/evaluate { symbol_ref: '...' } (also accepts ?symbol=)
  router.post('/evaluate', async (req, res) => {
    try {
      const sym = req.body?.symbol_ref || req.query?.symbol || req.query?.symbol_ref;
      if (!sym) return res.status(400).json({ ok: false, error: 'symbol_ref required' });
      const out = await evaluateRulesOnce([String(sym)]);
      res.json({ ok: true, symbol_ref: String(sym), processed: out.length, triggered: out.some(r => r.symbol_ref === String(sym) && r.triggered) });
    } catch (e) {
      console.error('alerts POST evaluate error:', e);
      res.status(500).json({ ok: false, error: 'Evaluate failed' });
    }
  });

  // List rules (show ALL saved configurations for non‑managed users)
  router.get('/rules', authenticateToken, ensureNotManaged, async (req, res) => {
    let conn; try {
      conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
      await ensureTables(conn);
      // Return all configurations regardless of owner
      const rows = await conn.query('SELECT * FROM alert_rules ORDER BY symbol_ref');
      res.json(rows);
    } catch (e) {
      console.error('alerts GET rules error:', e);
      res.status(500).json({ error: 'Failed to fetch rules' });
    } finally { if (conn) conn.release(); }
  });

  // Bulk upsert rules
  router.post('/rules/bulk', authenticateToken, ensureNotManaged, async (req, res) => {
    let conn; try {
      conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
      await ensureTables(conn);
      const rules = Array.isArray(req.body.rules) ? req.body.rules : [];
      if (!rules.length) return res.json({ success: true, affected: 0 });
      // Optional permission filter
      let allowed = null;
      try { allowed = await getAllowedSymbols(conn, req); } catch {}
      for (const r of rules) {
        if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(r.symbol_ref)) {
          continue; // skip symbols not permitted
        }
        await conn.query(`
          INSERT INTO alert_rules (user_id, symbol_ref, minutes, percent, enabled)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE minutes = VALUES(minutes), percent = VALUES(percent), enabled = VALUES(enabled), updated_at = CURRENT_TIMESTAMP
        `, [req.user.id, r.symbol_ref, Number(r.minutes)||0, Number(r.percent)||0, r.enabled ? 1 : 0]);
      }
      res.json({ success: true, affected: rules.length });
    } catch (e) {
      console.error('alerts BULK UPSERT error:', e);
      res.status(500).json({ error: 'Failed to save rules' });
    } finally { if (conn) conn.release(); }
  });

  // Update one rule
  router.put('/rules/:id', authenticateToken, ensureNotManaged, async (req, res) => {
    let conn; try {
      conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
      await ensureTables(conn);
      const { id } = req.params;
      const { minutes, percent, enabled } = req.body;
      const result = await conn.query('UPDATE alert_rules SET minutes=?, percent=?, enabled=? WHERE id=? AND user_id=?', [Number(minutes)||0, Number(percent)||0, enabled?1:0, id, req.user.id]);
      res.json({ success: result.affectedRows > 0 });
    } catch (e) {
      console.error('alerts UPDATE error:', e);
      res.status(500).json({ error: 'Failed to update rule' });
    } finally { if (conn) conn.release(); }
  });

  // Delete one rule
  router.delete('/rules/:id', authenticateToken, ensureNotManaged, async (req, res) => {
    let conn; try {
      conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
      await ensureTables(conn);
      const { id } = req.params;
      const result = await conn.query('DELETE FROM alert_rules WHERE id=? AND user_id=?', [id, req.user.id]);
      res.json({ success: result.affectedRows > 0 });
    } catch (e) {
      console.error('alerts DELETE error:', e);
      res.status(500).json({ error: 'Failed to delete rule' });
    } finally { if (conn) conn.release(); }
  });

  // Test rule (evaluate now; no outbound POST yet)
  router.post('/test', authenticateToken, ensureNotManaged, async (req, res) => {
    let conn; try {
      const { symbol_ref, minutes = 5, percent = 20 } = req.body;
      if (!symbol_ref) return res.status(400).json({ error: 'symbol_ref required' });
      conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
      await conn.query("SET time_zone = '+07:00'");
      // current = second latest
      const currentRows = await conn.query(`
        SELECT profit_ratio, buylot, avgbuy, selllot, avgsell, date
        FROM trading_data WHERE symbol_ref = ? ORDER BY date DESC, id DESC LIMIT 2
      `, [symbol_ref]);
      if (!currentRows.length) return res.json({ triggered: false, reason: 'no data' });
      const cRow = currentRows.length > 1 ? currentRows[1] : currentRows[0];
      let current = Number(cRow.profit_ratio);
      if (!Number.isFinite(current)) {
        const buylot = Number(cRow.buylot)||0, avgbuy = Number(cRow.avgbuy)||0, selllot = Number(cRow.selllot)||0, avgsell = Number(cRow.avgsell)||0;
        const denom = buylot*avgbuy; current = denom>0 ? (((selllot*avgsell)/denom)-1)*100 : 0;
      }
      // past <= now - minutes
      const pastRows = await conn.query(`
        SELECT profit_ratio, buylot, avgbuy, selllot, avgsell, date
        FROM trading_data WHERE symbol_ref = ? AND date <= (NOW() - INTERVAL ? MINUTE)
        ORDER BY date DESC, id DESC LIMIT 1
      `, [symbol_ref, Number(minutes)||0]);
      if (!pastRows.length) return res.json({ triggered: false, reason: 'no past data' });
      const pRow = pastRows[0];
      let past = Number(pRow.profit_ratio);
      if (!Number.isFinite(past)) {
        const buylot = Number(pRow.buylot)||0, avgbuy = Number(pRow.avgbuy)||0, selllot = Number(pRow.selllot)||0, avgsell = Number(pRow.avgsell)||0;
        const denom = buylot*avgbuy; past = denom>0 ? (((selllot*avgsell)/denom)-1)*100 : 0;
      }
      if (!Number.isFinite(past) || past === 0) return res.json({ triggered: false, reason: 'past zero/invalid', current, past });
      const pctChange = ((current - past) / Math.abs(past)) * 100;
      const triggered = pctChange >= (Number(percent)||0);
      res.json({ triggered, symbol_ref, minutes: Number(minutes)||0, threshold: Number(percent)||0, current, past, percent_change: pctChange });
    } catch (e) {
      console.error('alerts TEST error:', e);
      res.status(500).json({ error: 'Failed to evaluate', message: e.message });
    } finally { if (conn) conn.release(); }
  });

  return { router, start: startScheduler, evaluate: evaluateRulesOnce };
};
