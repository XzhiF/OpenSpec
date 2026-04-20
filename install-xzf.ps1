# PowerShell script to install xzf-openspec on Windows
# Install xzf-openspec (customized version with amend workflow)

$ErrorActionPreference = "Stop"

Write-Host "🔧 Installing xzf-openspec (customized OpenSpec v1.3.1)"
Write-Host ""

# Check if in OpenSpec source directory
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Please run this script from OpenSpec source directory" -ForegroundColor Red
    exit 1
}

# Check if pnpm is available
try {
    $pnpmVersion = pnpm --version
    Write-Host "✓ Found pnpm version: $pnpmVersion"
} catch {
    Write-Host "❌ Error: pnpm is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install pnpm first: npm install -g pnpm" -ForegroundColor Yellow
    exit 1
}

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Step 1: Installing dependencies..."
    pnpm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Error: Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
}

Write-Host "📦 Step 2: Building the project..."
pnpm build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Build failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📋 Step 3: Creating temporary package for xzf-openspec..."

# Backup original package.json
Copy-Item package.json package.json.backup

# Use xzf package configuration
Copy-Item package.xzf.json package.json

Write-Host ""
Write-Host "🎁 Step 4: Packing xzf-openspec..."
$packOutput = pnpm pack 2>&1 | Out-String
$xzfPackage = ($packOutput -split "`n" | Where-Object { $_ -match "xzf-openspec-[0-9]+\.[0-9]+\.[0-9]+\.tgz" }).Trim()

if (-not $xzfPackage) {
    Write-Host "❌ Error: Failed to create package" -ForegroundColor Red
    # Restore original package.json
    Move-Item package.json.backup package.json -Force
    exit 1
}

Write-Host "Created package: $xzfPackage"

# Restore original package.json
Move-Item package.json.backup package.json -Force

Write-Host ""
Write-Host "📥 Step 5: Installing xzf-openspec globally..."
npm install -g $xzfPackage
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Installation failed" -ForegroundColor Red
    Remove-Item $xzfPackage -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Host ""
Write-Host "🧹 Step 6: Cleanup..."
Remove-Item $xzfPackage -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "✅ Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Now you have two OpenSpec versions installed:"
Write-Host ""
Write-Host "  Official version:"
Write-Host "    - Command: openspec"
Write-Host "    - Version: Check with 'openspec --version'"
Write-Host ""
Write-Host "  Your customized version:"
Write-Host "    - Command: xzf-openspec (or xos)"
Write-Host "    - Version: 1.3.1 (includes amend workflow)"
Write-Host ""
Write-Host "Usage examples:"
Write-Host "  # Use official version"
Write-Host "  openspec init claude-code"
Write-Host ""
Write-Host "  # Use your customized version (with amend)"
Write-Host "  xzf-openspec init claude-code"
Write-Host "  xzf-openspec config profile core"
Write-Host "  xzf-openspec update"
Write-Host ""
Write-Host "🎉 Happy coding with amend workflow!" -ForegroundColor Green