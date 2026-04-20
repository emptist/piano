#!/bin/bash
# Write current git hash to version file
cd "$(dirname "$0")"
git rev-parse --short HEAD > .git-hash
echo "Git hash: $(cat .git-hash)"