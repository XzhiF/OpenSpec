#!/bin/bash
# Install xzf-openspec (customized version with amend workflow)

set -e

echo "🔧 Installing xzf-openspec (customized OpenSpec v1.3.0)"
echo ""

# Check if in OpenSpec source directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from OpenSpec source directory"
    exit 1
fi

echo "📦 Step 1: Building the project..."
pnpm build

echo ""
echo "📋 Step 2: Creating temporary package for xzf-openspec..."

# Backup original package.json
cp package.json package.json.backup

# Use xzf package configuration
cp package.xzf.json package.json

echo ""
echo "🎁 Step 3: Packing xzf-openspec..."
XZF_PACKAGE=$(pnpm pack 2>&1 | grep -oE 'xzf-openspec-[0-9]+\.[0-9]+\.[0-9]+\.tgz')

# Restore original package.json
mv package.json.backup package.json

echo ""
echo "📥 Step 4: Installing xzf-openspec globally..."
npm install -g "$XZF_PACKAGE"

echo ""
echo "🧹 Step 5: Cleanup..."
rm -f "$XZF_PACKAGE"

echo ""
echo "✅ Installation complete!"
echo ""
echo "Now you have two OpenSpec versions installed:"
echo ""
echo "  Official version:"
echo "    - Command: openspec"
echo "    - Version: Check with 'openspec --version'"
echo ""
echo "  Your customized version:"
echo "    - Command: xzf-openspec (or xos)"
echo "    - Version: 1.3.0 (includes amend workflow)"
echo ""
echo "Usage examples:"
echo "  # Use official version"
echo "  openspec init claude-code"
echo ""
echo "  # Use your customized version (with amend)"
echo "  xzf-openspec init claude-code"
echo "  xzf-openspec config profile core"
echo "  xzf-openspec update"
echo ""
echo "🎉 Happy coding with amend workflow!"