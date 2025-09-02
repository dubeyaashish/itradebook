// Database connection utility with proper error handling and retry logic

/**
 * Graceful database connection handler with retry logic
 * @param {mariadb.Pool} pool - The database connection pool
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @returns {Promise<mariadb.Connection>} Database connection
 */
async function getDbConnection(pool, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();
      const conn = await pool.getConnection();
      const duration = Date.now() - startTime;
      
      if (duration > 1000) {
        console.warn(`⚠️  Slow connection acquisition: ${duration}ms on attempt ${attempt}`);
      }
      
      return conn;
    } catch (error) {
      lastError = error;
      console.error(`Connection attempt ${attempt} failed:`, error.message);
      
      // If it's a connection limit error, log more details
      if (error.code === 'ER_GET_CONNECTION_TIMEOUT' || error.code === 'ER_TOO_MANY_USER_CONNECTIONS') {
        console.error(`Database connection pool issue: ${error.code}`);
      }
      
      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Execute a database query with proper connection handling
 * @param {mariadb.Pool} pool - The database connection pool
 * @param {string} query - SQL query string
 * @param {Array} params - Query parameters
 * @param {Object} options - Options object
 * @param {boolean} options.transaction - Whether to use transaction
 * @returns {Promise<Array>} Query results
 */
async function executeQuery(pool, query, params = [], options = {}) {
  let conn;
  try {
    conn = await getDbConnection(pool);
    
    if (options.transaction) {
      await conn.beginTransaction();
    }
    
    const result = await conn.query(query, params);
    
    if (options.transaction) {
      await conn.commit();
    }
    
    return result;
  } catch (error) {
    if (conn && options.transaction) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
    }
    
    // Enhance error with more context
    if (error.code === 'ER_GET_CONNECTION_TIMEOUT' || error.code === 'ER_TOO_MANY_USER_CONNECTIONS') {
      throw new Error(`Database connection issue: ${error.message}. Please try again in a moment.`);
    }
    
    throw error;
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (releaseError) {
        console.error('Error releasing connection:', releaseError);
      }
    }
  }
}

/**
 * Execute multiple queries in a transaction
 * @param {mariadb.Pool} pool - The database connection pool
 * @param {Array} queries - Array of {query, params} objects
 * @returns {Promise<Array>} Array of query results
 */
async function executeTransaction(pool, queries) {
  let conn;
  try {
    conn = await getDbConnection(pool);
    await conn.beginTransaction();
    
    const results = [];
    for (const { query, params = [] } of queries) {
      const result = await conn.query(query, params);
      results.push(result);
    }
    
    await conn.commit();
    return results;
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
    }
    
    if (error.code === 'ER_GET_CONNECTION_TIMEOUT' || error.code === 'ER_TOO_MANY_USER_CONNECTIONS') {
      throw new Error(`Database connection issue: ${error.message}. Please try again in a moment.`);
    }
    
    throw error;
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (releaseError) {
        console.error('Error releasing connection:', releaseError);
      }
    }
  }
}

/**
 * Get pool statistics for monitoring
 * @param {mariadb.Pool} pool - The database connection pool
 * @returns {Object|null} Pool statistics or null if error
 */
function getPoolStats(pool) {
  try {
    return {
      activeConnections: pool.activeConnections(),
      totalConnections: pool.totalConnections(),
      idleConnections: pool.idleConnections(),
      taskQueueSize: pool.taskQueueSize()
    };
  } catch (error) {
    console.error('Error getting pool stats:', error);
    return null;
  }
}

module.exports = {
  getDbConnection,
  executeQuery,
  executeTransaction,
  getPoolStats
};
