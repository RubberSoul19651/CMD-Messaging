@echo off
cd /d "%~dp0"
echo Installing dependencies...
call npm.cmd install

echo.
echo Building executables...
call npm.cmd run build

echo.
echo Build complete. Press any key to close.
pause
