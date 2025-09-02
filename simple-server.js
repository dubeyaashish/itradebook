const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

// Simple test route
app.get('/', (req, res) => {
  res.send(`
    <h1>Node.js Server is Working!</h1>
    <p>Port: ${port}</p>
    <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
    <p>Current directory: ${__dirname}</p>
    <p>Time: ${new Date()}</p>
  `);
});

app.get('/test', (req, res) => {
  res.json({ 
    message: 'API is working', 
    timestamp: new Date(),
    port: port 
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
