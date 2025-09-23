// migrate_historical_data.js - Safer approach using JavaScript
const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST || '119.59.101.83',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  user: process.env.DB_USER || 'itradebook_db',
  password: process.env.DB_PASS || 'v264^jx1W',
  database: process.env.DB_NAME || 'itradebook',
});

async function migrateHistoricalData() {
  let conn;
  try {
    conn = await pool.getConnection();
    
    console.log('🔄 Starting migration of historical data...');
    
    // Step 1: Add new column if needed
    try {
      await conn.query(`
        ALTER TABLE pl_report_daily 
        ADD COLUMN exp_profit_loss DECIMAL(20,8) AFTER exp_floating
      `);
      console.log('✓ Added exp_profit_loss column');
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
      console.log('✓ exp_profit_loss column already exists');
    }
    
    // Step 2: Get all records that need updating
    const recordsQuery = `
      SELECT trade_date, symbol_ref, company_deposit, company_withdrawal
      FROM pl_report_daily 
      WHERE exp_profit_loss IS NULL
      ORDER BY trade_date ASC
    `;
    
    const records = await conn.query(recordsQuery);
    console.log(`📊 Found ${records.length} records to update`);
    
    let updated = 0;
    
    // Step 3: Update each record
    for (const record of records) {
      const { trade_date, symbol_ref, company_deposit, company_withdrawal } = record;
      
      try {
        // Get today's exp_profit_loss
        const todayExpQuery = `
          SELECT COALESCE(SUM(cd.profit_loss), 0) as total_exp_profit_loss
          FROM sub_users su
          LEFT JOIN (
            SELECT 
              mt5,
              profit_loss,
              ROW_NUMBER() OVER (PARTITION BY mt5 ORDER BY created_at DESC) as rn
            FROM customer_data
            WHERE DATE(created_at) <= ?
          ) cd ON su.sub_username = cd.mt5 AND cd.rn = 1
          WHERE su.symbol_ref = ? AND su.status = 'active'
        `;
        
        const todayResult = await conn.query(todayExpQuery, [trade_date, symbol_ref]);
        const todayExpProfitLoss = parseFloat(todayResult[0]?.total_exp_profit_loss || 0);
        
        // Get yesterday's exp_profit_loss
        const yesterday = new Date(trade_date);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        const yesterdayResult = await conn.query(todayExpQuery, [yesterdayStr, symbol_ref]);
        const yesterdayExpProfitLoss = parseFloat(yesterdayResult[0]?.total_exp_profit_loss || 0);
        
        // Calculate new PLN
        const deposit = parseFloat(company_deposit || 0);
        const withdrawal = parseFloat(company_withdrawal || 0);
        const newExpPln = todayExpProfitLoss - yesterdayExpProfitLoss - deposit + withdrawal;
        
        // Update the record
        const updateQuery = `
          UPDATE pl_report_daily 
          SET 
            exp_profit_loss = ?,
            exp_pln = ?
          WHERE trade_date = ? AND symbol_ref = ?
        `;
        
        await conn.query(updateQuery, [
          Math.round(todayExpProfitLoss * 100) / 100,
          Math.round(newExpPln * 100) / 100,
          trade_date,
          symbol_ref
        ]);
        
        updated++;
        
        if (updated % 100 === 0) {
          console.log(`📈 Updated ${updated}/${records.length} records...`);
        }
        
      } catch (error) {
        console.error(`❌ Error updating ${trade_date} ${symbol_ref}:`, error.message);
      }
    }
    
    console.log(`✅ Migration completed! Updated ${updated}/${records.length} records`);
    
    // Step 4: Verify some results
    const verifyQuery = `
      SELECT trade_date, symbol_ref, exp_profit_loss, exp_pln
      FROM pl_report_daily 
      WHERE exp_profit_loss IS NOT NULL
      ORDER BY trade_date DESC
      LIMIT 5
    `;
    
    const verifyResults = await conn.query(verifyQuery);
    console.log('📊 Sample updated records:');
    console.table(verifyResults);
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    throw error;
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

// Run the migration
if (require.main === module) {
  migrateHistoricalData()
    .then(() => {
      console.log('🎉 Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateHistoricalData };