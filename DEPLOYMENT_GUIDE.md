# iTradeBook Deployment Guide for Plesk Windows

## Prerequisites

1. **Plesk Windows Server** with Node.js support
2. **Domain** configured in Plesk
3. **Database** (MariaDB/MySQL) access
4. **Email** service configuration

## Step-by-Step Deployment Process

### Phase 1: Prepare Your Local Environment

1. **Update Configuration Files**
   - Edit `.env.production` with your production settings
   - Update CORS origins in `backend/server.js` with your domain
   - Set strong JWT and session secrets

2. **Build the Application**
   ```cmd
   # Run the deployment script
   deploy.bat
   ```

### Phase 2: Server Configuration

#### 2.1 Enable Node.js in Plesk
1. Log into your Plesk control panel
2. Go to **Domains** → Select your domain → **Node.js**
3. Enable Node.js (version 16+ recommended)
4. Set the **Application startup file** to: `server.js`
5. Set **Application root** to your domain's httpdocs folder

#### 2.2 Configure IIS and URL Rewriting
1. In Plesk, go to **Domains** → **Web Server Settings**
2. Ensure **IIS URL Rewrite** module is installed
3. The `web.config` file will handle URL rewriting automatically

### Phase 3: File Upload and Setup

#### 3.1 Upload Files
1. Connect to your server via FTP/SFTP or use Plesk File Manager
2. Upload all contents from the `dist` folder to your domain's `httpdocs` folder
3. Ensure the following structure:
   ```
   httpdocs/
   ├── server.js
   ├── package.json
   ├── web.config
   ├── .env
   ├── routes/
   ├── middleware/
   ├── utils/
   ├── migrations/
   ├── static/ (React build files)
   ├── index.html
   └── ... (other React build files)
   ```

#### 3.2 Install Dependencies
1. In Plesk, go to **Domains** → **Node.js**
2. Click **NPM install** or use SSH/terminal:
   ```bash
   cd /path/to/your/httpdocs
   npm ci --production
   ```

**Important**: The server.js file is configured to serve the React build files directly when NODE_ENV=production, so all files should be in the same directory (httpdocs).

### Phase 4: Database Setup

#### 4.1 Create Database
1. In Plesk, go to **Databases** → **Add Database**
2. Create a new database (e.g., `itradebook`)
3. Create a database user with full privileges

#### 4.2 Import Database Schema
1. Use the SQL files in the `migrations/` folder
2. Import via phpMyAdmin or command line:
   ```sql
   -- Run the SQL commands from migrations/otp_table.sql
   -- and any other migration files
   ```

#### 4.3 Update Environment Variables
Edit the `.env` file in httpdocs with your production values:
```env
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASS=your_db_password
DB_NAME=itradebook
JWT_SECRET=your_strong_jwt_secret
SESSION_SECRET=your_strong_session_secret
EMAIL_HOST=your_smtp_host
EMAIL_PORT=587
EMAIL_USER=your_email
EMAIL_PASS=your_email_password
PORT=3001
```

### Phase 5: Final Configuration

#### 5.1 Start the Application
1. In Plesk **Node.js** section, click **Enable Node.js**
2. Click **Restart App** to start your application
3. Monitor the **Logs** section for any errors

#### 5.2 Configure Domain Settings
1. **SSL Certificate**: Enable SSL/TLS certificate
2. **Redirects**: Set up HTTP to HTTPS redirect
3. **DNS**: Ensure domain points to your server

#### 5.3 Test the Deployment
1. Visit `https://yourdomain.com` to test the React frontend
2. Test API endpoints: `https://yourdomain.com/api/health`
3. Test authentication and database connectivity

### Phase 6: Production Optimizations

#### 6.1 Performance Settings
- Enable **Gzip compression** in Plesk
- Configure **static file caching**
- Set up **CloudFlare** or similar CDN (optional)

#### 6.2 Security Settings
- Configure **firewall rules**
- Set up **SSL certificate** (Let's Encrypt)
- Enable **security headers** (already in web.config)
- Regular **security updates**

#### 6.3 Monitoring and Logs
- Monitor **application logs** in Plesk
- Set up **error notifications**
- Configure **backup schedules**

## Troubleshooting

### Common Issues

1. **500 Internal Server Error**
   - Check Node.js is enabled and running
   - Verify `server.js` path is correct
   - Check application logs for errors

2. **Database Connection Issues**
   - Verify database credentials in `.env`
   - Check database server is accessible
   - Ensure MariaDB/MySQL is running

3. **API Endpoints Not Working**
   - Verify `web.config` URL rewrite rules
   - Check CORS configuration
   - Test API directly: `/api/health`

4. **Static Files Not Loading**
   - Check file permissions
   - Verify static file rules in `web.config`
   - Clear browser cache

### Log Locations
- **Application Logs**: Plesk → Domains → Node.js → Logs
- **IIS Logs**: Plesk → Domains → Web Server Settings → Logs
- **Error Logs**: Check the `logs` folder created by IISNode

## Maintenance

### Regular Tasks
- **Update Dependencies**: Regularly update Node.js packages
- **Database Backups**: Set up automated backups
- **Security Updates**: Keep server and Plesk updated
- **Monitor Performance**: Check application performance regularly

### Updating the Application
1. Build new version locally using `deploy.bat`
2. Upload new files to `httpdocs`
3. Run `npm ci --production` if dependencies changed
4. Restart the Node.js application in Plesk

## Support Resources

- **Plesk Documentation**: [plesk.com/docs](https://docs.plesk.com)
- **Node.js Support**: Check Plesk Node.js extension documentation
- **IIS URL Rewrite**: Microsoft IIS documentation

---

**Note**: Replace `yourdomain.com` with your actual domain name throughout the configuration files and settings.
