@echo off
REM Batch script to install xzf-openspec on Windows
REM Install xzf-openspec (customized version with amend workflow)

setlocal enabledelayedexpansion

echo.
echo 🔧 Installing xzf-openspec (customized OpenSpec v1.3.1)
echo.

REM Check if in OpenSpec source directory
if not exist package.json (
    echo ❌ Error: Please run this script from OpenSpec source directory
    exit /b 1
)

REM Check if pnpm is available
where pnpm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ❌ Error: pnpm is not installed or not in PATH
    echo Please install pnpm first: npm install -g pnpm
    exit /b 1
)

REM Check if node_modules exists
if not exist node_modules (
    echo 📦 Step 1: Installing dependencies...
    call pnpm install
    if %ERRORLEVEL% neq 0 (
        echo ❌ Failed to install dependencies
        exit /b 1
    )
    echo.
)

echo 📦 Step 2: Building the project...
call pnpm build
if %ERRORLEVEL% neq 0 (
    echo ❌ Build failed
    exit /b 1
)

echo.
echo 📋 Step 3: Creating temporary package for xzf-openspec...

REM Backup original package.json
copy package.json package.json.backup >nul

REM Use xzf package configuration
copy package.xzf.json package.json >nul

echo.
echo 🎁 Step 4: Packing xzf-openspec...

REM Run pnpm pack and capture output
for /f "tokens=*" %%i in ('pnpm pack 2^>^&1 ^| findstr "xzf-openspec"') do (
    set XZF_PACKAGE=%%i
)

if "!XZF_PACKAGE!"=="" (
    echo ❌ Error: Failed to create package
    REM Restore original package.json
    move package.json.backup package.json >nul
    exit /b 1
)

echo Created package: !XZF_PACKAGE!

REM Restore original package.json
move package.json.backup package.json >nul

echo.
echo 📥 Step 5: Installing xzf-openspec globally...
call npm install -g !XZF_PACKAGE!
if %ERRORLEVEL% neq 0 (
    echo ❌ Installation failed
    del !XZF_PACKAGE! 2>nul
    exit /b 1
)

echo.
echo 🧹 Step 6: Cleanup...
del !XZF_PACKAGE! 2>nul

echo.
echo ✅ Installation complete!
echo.
echo Now you have two OpenSpec versions installed:
echo.
echo   Official version:
echo     - Command: openspec
echo     - Version: Check with 'openspec --version'
echo.
echo   Your customized version:
echo     - Command: xzf-openspec (or xos)
echo     - Version: 1.3.1 (includes amend workflow)
echo.
echo Usage examples:
echo   # Use official version
echo   openspec init claude-code
echo.
echo   # Use your customized version (with amend)
echo   xzf-openspec init claude-code
echo   xzf-openspec config profile core
echo   xzf-openspec update
echo.
echo 🎉 Happy coding with amend workflow!

endlocal