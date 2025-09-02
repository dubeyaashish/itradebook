@echo off
echo Building iTradeBook for Production...

echo.
echo 1. Installing backend dependencies...
cd backend
call npm ci --production
if errorlevel 1 (
    echo Error installing backend dependencies
    pause
    exit /b 1
)

echo.
echo 2. Building frontend...
cd ..\frontend
call npm ci
if errorlevel 1 (
    echo Error installing frontend dependencies
    pause
    exit /b 1
)

set NODE_ENV=production
call npm run build
if errorlevel 1 (
    echo Error building frontend
    pause
    exit /b 1
)

echo.
echo 3. Copying files for deployment...
cd ..
if not exist "dist" mkdir dist
xcopy /E /I /Y "backend\*" "dist\" 
xcopy /E /I /Y "frontend\build\*" "dist\"
copy /Y "web.config" "dist\"
copy /Y ".env.production" "dist\.env"

echo.
echo 4. Cleaning up development files from dist...
if exist "dist\node_modules" rmdir /S /Q "dist\node_modules"
if exist "dist\package-lock.json" del "dist\package-lock.json"
if exist "dist\.env.development" del "dist\.env.development"

echo.
echo 5. Creating production package.json...
copy /Y "backend\package.json" "dist\package.json"

echo.
echo Build completed! Files are ready in the 'dist' folder.
echo.
echo Important: Before uploading to Plesk, update these settings:
echo 1. Edit dist\.env with your production database and email settings
echo 2. Update CORS origins in backend\server.js with your domain
echo 3. Update frontend\.env.production with your domain URL
echo.
echo Next steps:
echo 1. Upload the 'dist' folder contents to your Plesk domain's httpdocs folder
echo 2. Configure your database settings in the .env file
echo 3. Install Node.js modules on the server: npm ci --production
echo 4. Enable Node.js in Plesk and set startup file to server.js
echo.
pause
