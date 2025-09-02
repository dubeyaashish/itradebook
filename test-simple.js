console.log('=== Node.js Application Starting ===');
console.log('Current directory:', __dirname);
console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', process.env.PORT);

const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

app.get('/', (req, res) => {
  console.log('Root route accessed');
  res.send('<h1>SUCCESS! Node.js is working on Plesk</h1><p>If you see this, the server is running correctly.</p>');
});

app.listen(port, () => {
  console.log(`=== Server successfully started on port ${port} ===`);
});

// Error handling
process.on('uncaughtException', (err) => {
  console.error('=== UNCAUGHT EXCEPTION ===', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('=== UNHANDLED REJECTION ===', reason);
});
