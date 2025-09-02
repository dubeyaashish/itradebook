const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 8080;

// Debug info
console.log('=== DEBUG INFO ===');
console.log('Current directory:', __dirname);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Check if build directory exists
const buildPath = path.join(__dirname, 'build');
console.log('Build path:', buildPath);
console.log('Build directory exists:', fs.existsSync(buildPath));

if (fs.existsSync(buildPath)) {
  console.log('Build directory contents:');
  const files = fs.readdirSync(buildPath);
  files.forEach(file => {
    const filePath = path.join(buildPath, file);
    const stats = fs.statSync(filePath);
    console.log(`  ${file} ${stats.isDirectory() ? '(directory)' : '(file)'}`);
  });
  
  // Check static directory
  const staticPath = path.join(buildPath, 'static');
  if (fs.existsSync(staticPath)) {
    console.log('Static directory contents:');
    const staticFiles = fs.readdirSync(staticPath);
    staticFiles.forEach(file => {
      console.log(`  static/${file}`);
      const subPath = path.join(staticPath, file);
      if (fs.statSync(subPath).isDirectory()) {
        const subFiles = fs.readdirSync(subPath);
        subFiles.forEach(subFile => {
          console.log(`    static/${file}/${subFile}`);
        });
      }
    });
  }
}

// Test routes
app.get('/', (req, res) => {
  res.send(`
    <h1>File System Debug</h1>
    <p>Current directory: ${__dirname}</p>
    <p>NODE_ENV: ${process.env.NODE_ENV}</p>
    <p>Build directory exists: ${fs.existsSync(buildPath)}</p>
    <h2>Test Links:</h2>
    <a href="/test-manifest">Test manifest.json</a><br>
    <a href="/test-css">Test CSS file</a><br>
    <a href="/test-js">Test JS file</a><br>
    <a href="/list-files">List all files</a>
  `);
});

app.get('/test-manifest', (req, res) => {
  const manifestPath = path.join(__dirname, 'build', 'manifest.json');
  console.log('Trying to serve manifest from:', manifestPath);
  console.log('File exists:', fs.existsSync(manifestPath));
  
  if (fs.existsSync(manifestPath)) {
    res.sendFile(manifestPath);
  } else {
    res.status(404).send('manifest.json not found at: ' + manifestPath);
  }
});

app.get('/test-css', (req, res) => {
  const cssPath = path.join(__dirname, 'build', 'static', 'css', 'main.51b8d111.css');
  console.log('Trying to serve CSS from:', cssPath);
  console.log('File exists:', fs.existsSync(cssPath));
  
  if (fs.existsSync(cssPath)) {
    res.sendFile(cssPath);
  } else {
    res.status(404).send('CSS file not found at: ' + cssPath);
  }
});

app.get('/test-js', (req, res) => {
  const jsPath = path.join(__dirname, 'build', 'static', 'js', 'main.e69de8af.js');
  console.log('Trying to serve JS from:', jsPath);
  console.log('File exists:', fs.existsSync(jsPath));
  
  if (fs.existsSync(jsPath)) {
    res.sendFile(jsPath);
  } else {
    res.status(404).send('JS file not found at: ' + jsPath);
  }
});

app.get('/list-files', (req, res) => {
  function listDirectory(dirPath, prefix = '') {
    let result = '';
    try {
      const files = fs.readdirSync(dirPath);
      files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        const stats = fs.statSync(fullPath);
        result += `${prefix}${file} ${stats.isDirectory() ? '(dir)' : '(file)'}\n`;
        if (stats.isDirectory() && prefix.length < 20) { // Prevent infinite recursion
          result += listDirectory(fullPath, prefix + '  ');
        }
      });
    } catch (err) {
      result += `Error reading ${dirPath}: ${err.message}\n`;
    }
    return result;
  }
  
  const listing = listDirectory(__dirname);
  res.send(`<pre>${listing}</pre>`);
});

app.listen(port, () => {
  console.log(`Debug server running on port ${port}`);
});
