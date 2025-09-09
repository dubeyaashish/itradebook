// Debug script for Plesk deployment issues
const fs = require('fs');
const path = require('path');

// Create a simple log file that you can read from Plesk
const logFile = path.join(__dirname, 'plesk-debug.log');

function log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    // Write to console
    console.log(logEntry.trim());
    
    // Write to file (append)
    try {
        fs.appendFileSync(logFile, logEntry);
    } catch (error) {
        console.error('Failed to write to log file:', error);
    }
}

// Test basic functionality
log('=== PLESK DEBUG SCRIPT STARTED ===');
log(`Node.js version: ${process.version}`);
log(`Platform: ${process.platform}`);
log(`Working directory: ${process.cwd()}`);
log(`Script directory: ${__dirname}`);

// Test environment variables
log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
log(`PORT: ${process.env.PORT || 'not set'}`);
log(`IISNODE_PORT: ${process.env.IISNODE_PORT || 'not set'}`);

// Test database connection
log('Testing database connection...');
const mariadb = require('mariadb');

const pool = mariadb.createPool({
    host: process.env.DB_HOST || '119.59.101.83',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
    user: process.env.DB_USER || 'itradebook_db',
    password: process.env.DB_PASS || 'v264^jx1W',
    database: process.env.DB_NAME || 'itradebook',
    connectionLimit: 5,
    acquireTimeout: 30000,
    timeout: 30000
});

async function testDB() {
    let conn;
    try {
        log('Attempting database connection...');
        conn = await pool.getConnection();
        log('✅ Database connection successful');
        
        const result = await conn.query('SELECT 1 as test');
        log(`✅ Database query successful: ${JSON.stringify(result[0])}`);
        
    } catch (error) {
        log(`❌ Database error: ${error.message}`);
        log(`❌ Database error code: ${error.code}`);
    } finally {
        if (conn) {
            try {
                conn.release();
                log('Database connection released');
            } catch (releaseError) {
                log(`❌ Error releasing connection: ${releaseError.message}`);
            }
        }
    }
}

// Test file system permissions
log('Testing file system permissions...');
try {
    const testFile = path.join(__dirname, 'test-write.txt');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    log('✅ File system write permissions OK');
} catch (error) {
    log(`❌ File system permission error: ${error.message}`);
}

// Run database test
testDB().then(() => {
    log('=== DEBUG SCRIPT COMPLETED ===');
    process.exit(0);
}).catch((error) => {
    log(`❌ Fatal error: ${error.message}`);
    process.exit(1);
});
