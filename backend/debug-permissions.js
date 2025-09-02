const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'itradebook',
  connectionLimit: 10,
  acquireTimeout: 30000,
  timeout: 30000
});

async function debugPermissions() {
  let conn;
  try {
    conn = await pool.getConnection();
    
    console.log('=== CHECKING USER SYMBOL PERMISSIONS ===');
    const permissions = await conn.query('SELECT * FROM user_symbol_permissions ORDER BY user_id, symbol_ref');
    console.log('All permissions:', permissions);
    
    console.log('\n=== CHECKING MANAGED USERS ===');
    const users = await conn.query('SELECT id, username, user_type FROM users WHERE user_type = ?', ['managed']);
    console.log('Managed users:', users);
    
    console.log('\n=== CHECKING DISTINCT SYMBOLS IN DATABASE ===');
    const symbols = await conn.query('SELECT DISTINCT symbolref FROM `receive.itradebook` ORDER BY symbolref');
    console.log('Available symbols:', symbols.map(s => s.symbolref));
    
    // Test a specific managed user if one exists
    if (users.length > 0) {
      const testUser = users[0];
      console.log(`\n=== TESTING PERMISSIONS FOR USER ${testUser.username} (ID: ${testUser.id}) ===`);
      const userPermissions = await conn.query('SELECT symbol_ref FROM user_symbol_permissions WHERE user_id = ?', [testUser.id]);
      console.log('Allowed symbols for this user:', userPermissions.map(p => p.symbol_ref));
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

debugPermissions();
