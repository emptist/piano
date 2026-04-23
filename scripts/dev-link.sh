#!/bin/bash
# Build, verify, and link Piano to global
# Usage: ./scripts/dev-link.sh

set -e

cd "$(dirname "$0")/.."

echo "=== Piano Development Link ==="

# 1. Clean dist
echo "[1/5] Cleaning dist..."
rm -rf dist

# 2. Build
echo "[2/5] Building..."
npm run build

# 3. Verify local hash
LOCAL_HASH=$(grep -o 'GIT_HASH = "\([^"]*\)"' dist/src/extension.js | cut -d'"' -f2)
echo "[3/5] Local hash: $LOCAL_HASH"

# 4. Link to global
echo "[4/5] Linking to global..."
npm link

# 5. Verify global hash
GLOBAL_PATH=$(npm root -g)
GLOBAL_HASH=$(grep -o 'GIT_HASH = "\([^"]*\)"' "$GLOBAL_PATH/@nezha/piano/dist/src/extension.js" | cut -d'"' -f2)
echo "[5/5] Global hash: $GLOBAL_HASH"

# Compare
if [ "$LOCAL_HASH" = "$GLOBAL_HASH" ]; then
    echo ""
    echo "✅ Hash verification PASSED"
    echo "   Local:  $LOCAL_HASH"
    echo "   Global: $GLOBAL_HASH"
    echo ""
    echo "Run 'piano' to test"
else
    echo ""
    echo "❌ Hash mismatch!"
    echo "   Local:  $LOCAL_HASH"
    echo "   Global: $GLOBAL_HASH"
    echo ""
    echo "Try: rm -rf $(npm root -g)/@nezha/piano && npm link"
    exit 1
fi