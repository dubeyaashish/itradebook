const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 8080;

console.log('=== SIMPLE STATIC FILE TEST ===');
console.log('Directory:', __dirname);

// Test if build folder exists
const buildPath = path.join(__dirname, 'build');
console.log('Build path:', buildPath);
console.log('Build exists:', fs.existsSync(buildPath));

// Test specific files
const manifestPath = path.join(__dirname, 'build', 'manifest.json');
const cssPath = path.join(__dirname, 'build', 'static', 'css', 'main.51b8d111.css');
const jsPath = path.join(__dirname, 'build', 'static', 'js', 'main.e69de8af.js');

console.log('Manifest exists:', fs.existsSync(manifestPath));
console.log('CSS exists:', fs.existsSync(cssPath));
console.log('JS exists:', fs.existsSync(jsPath));

// Simple static serving
app.use('/static', express.static(path.join(__dirname, 'build', 'static')));

// Test routes
app.get('/', (req, res) => {
  res.send(`
    <h1>Static File Test</h1>
    <p>Build folder exists: ${fs.existsSync(buildPath)}</p>
    <p>Manifest exists: ${fs.existsSync(manifestPath)}</p>
    <p>CSS exists: ${fs.existsSync(cssPath)}</p>
    <p>JS exists: ${fs.existsSync(jsPath)}</p>
    
    <h2>Direct File Tests:</h2>
    <a href="/manifest.json" target="_blank">Test manifest.json</a><br>
    <a href="/static/css/main.51b8d111.css" target="_blank">Test CSS</a><br>
    <a href="/static/js/main.e69de8af.js" target="_blank">Test JS</a><br>
    
    <h2>Manual HTML Test:</h2>
    <div>
      <link rel="stylesheet" href="/static/css/main.51b8d111.css">
      <script src="/static/js/main.e69de8af.js"></script>
      <p>CSS and JS should load above (check browser console)</p>
    </div>
  `);
});

app.get('/manifest.json', (req, res) => {
  console.log('Manifest requested');
  res.sendFile(manifestPath, (err) => {
    if (err) {
      console.error('Manifest error:', err);
      res.status(404).send('Manifest not found');
    }
  });
});

app.listen(port, () => {
  console.log(`Test server running on port ${port}`);
});
