const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 8080;

console.log('=== MINIMAL STATIC SERVER ===');
console.log('Directory:', __dirname);

// VERY simple static serving - no other routes to interfere
app.use('/static', (req, res, next) => {
  console.log('Static request for:', req.url);
  console.log('Full path would be:', path.join(__dirname, 'build', 'static', req.url));
  next();
}, express.static(path.join(__dirname, 'build', 'static')));

// Manual CSS route for testing
app.get('/static/css/main.51b8d111.css', (req, res) => {
  console.log('Manual CSS route hit');
  const cssPath = path.join(__dirname, 'build', 'static', 'css', 'main.51b8d111.css');
  console.log('Serving CSS from:', cssPath);
  res.sendFile(cssPath, (err) => {
    if (err) {
      console.error('CSS file error:', err);
      res.status(404).send('CSS file error: ' + err.message);
    } else {
      console.log('CSS file served successfully');
    }
  });
});

// Test page
app.get('/', (req, res) => {
  res.send(`
    <h1>Static File Debug</h1>
    <p>Testing CSS file serving</p>
    <a href="/static/css/main.51b8d111.css" target="_blank">Direct CSS Link</a>
    
    <style>
      body { background-color: #f0f0f0; }
    </style>
    
    <script>
      // Test loading the CSS file via JavaScript
      fetch('/static/css/main.51b8d111.css')
        .then(response => {
          console.log('CSS fetch response:', response.status);
          document.body.innerHTML += '<p>CSS fetch status: ' + response.status + '</p>';
        })
        .catch(error => {
          console.error('CSS fetch error:', error);
          document.body.innerHTML += '<p>CSS fetch error: ' + error + '</p>';
        });
    </script>
  `);
});

// Log all requests
app.use((req, res, next) => {
  console.log('Request:', req.method, req.url);
  next();
});

app.listen(port, () => {
  console.log(`Minimal static server running on port ${port}`);
  
  // Log the exact path we're looking for
  const cssPath = path.join(__dirname, 'build', 'static', 'css', 'main.51b8d111.css');
  console.log('CSS file should be at:', cssPath);
});
