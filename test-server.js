const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h1>Node.js is working!</h1><p>This confirms Node.js is running on Plesk.</p>');
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Test server running on port ${port}`);
});
