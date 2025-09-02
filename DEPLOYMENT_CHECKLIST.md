# iTradeBook Deployment Checklist

## Pre-Deployment Setup ✅

### 1. Local Configuration
- [ ] Update `.env.production` with your production settings
- [ ] Update `frontend/.env.production` with your domain URL
- [ ] Update CORS origins in `backend/server.js` with your actual domain
- [ ] Test the application locally with production settings

### 2. Domain and Server Requirements
- [ ] Domain configured in Plesk
- [ ] SSL certificate installed
- [ ] Node.js enabled in Plesk (version 16+)
- [ ] Database (MariaDB/MySQL) available
- [ ] Email service configured

## Deployment Steps ✅

### 3. Build Application
- [ ] Run `deploy.bat` script
- [ ] Verify `dist` folder contains all necessary files
- [ ] Check that environment files are correctly placed

### 4. Server Upload
- [ ] Upload all `dist` folder contents to `httpdocs`
- [ ] Verify file structure matches expected layout
- [ ] Set correct file permissions if needed

### 5. Plesk Configuration
- [ ] Navigate to Domains → [Your Domain] → Node.js
- [ ] Enable Node.js
- [ ] Set Application startup file: `server.js`
- [ ] Set Application root: `/httpdocs`
- [ ] Install dependencies: Click "NPM install" or run `npm ci --production`

### 6. Database Setup
- [ ] Create database in Plesk
- [ ] Create database user with full privileges
- [ ] Import database schema from `migrations/` folder
- [ ] Update `.env` file with database credentials

### 7. Environment Configuration
- [ ] Edit `.env` file with production values:
  - [ ] Database connection details
  - [ ] JWT and session secrets (generate strong ones)
  - [ ] Email service configuration
  - [ ] Set NODE_ENV=production

### 8. Testing
- [ ] Visit your domain to test React frontend
- [ ] Test API health: `https://yourdomain.com/api/health`
- [ ] Test user registration and login
- [ ] Test database connectivity
- [ ] Verify email functionality

## Post-Deployment ✅

### 9. Security
- [ ] Enable HTTPS redirect
- [ ] Configure firewall rules
- [ ] Review security headers
- [ ] Update default passwords

### 10. Performance
- [ ] Enable Gzip compression
- [ ] Configure caching
- [ ] Set up CDN (optional)
- [ ] Monitor performance

### 11. Monitoring
- [ ] Check application logs
- [ ] Set up error notifications
- [ ] Configure backups
- [ ] Test recovery procedures

## Troubleshooting 🔧

### Common Issues
- **500 Error**: Check Node.js is enabled and `server.js` path is correct
- **Database Connection**: Verify credentials and server accessibility
- **CORS Issues**: Update origin URLs in server configuration
- **Static Files**: Check `web.config` URL rewrite rules

### Log Locations
- **Application**: Plesk → Domains → Node.js → Logs
- **IIS**: Plesk → Domains → Web Server Settings → Logs
- **Error**: Check `/logs` folder created by IISNode

## Important Files 📁

### Must be present in httpdocs:
- `server.js` (main application file)
- `package.json` (dependencies)
- `.env` (environment variables)
- `web.config` (IIS configuration)
- `index.html` (React app entry)
- `/static/` folder (React assets)
- `/routes/` folder (API routes)
- `/middleware/` folder (authentication)

### Update before deployment:
1. `.env.production` → production database/email settings
2. `frontend/.env.production` → your domain URL
3. `backend/server.js` → CORS origins with your domain

---

**Remember**: Always test in a staging environment before deploying to production!
