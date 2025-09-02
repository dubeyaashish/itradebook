@echo off
echo Preparing files for Plesk deployment...

REM Create deployment directory
if exist "plesk-deployment" rmdir /s /q "plesk-deployment"
mkdir "plesk-deployment"

echo Copying React build files to web root...
xcopy "frontend\build\*" "plesk-deployment\" /E /I /Y

echo Copying backend files...
xcopy "backend" "plesk-deployment\backend\" /E /I /Y

echo Copying web.config...
copy "web.config" "plesk-deployment\"

echo Copying .env file...
if exist ".env" copy ".env" "plesk-deployment\backend\"

echo.
echo =====================================================
echo Deployment files ready in 'plesk-deployment' folder
echo =====================================================
echo.
echo Upload these files to your Plesk web root:
echo 1. All files from plesk-deployment folder
echo 2. Make sure Node.js is enabled in Plesk
echo 3. Set startup file to: backend/server.js
echo 4. Install npm packages if needed
echo.
pause
