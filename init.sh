#!/usr/bin/env sh
# Reproducible environment setup for the map phase.
set -e

node -e "const [m]=process.versions.node.split('.');if(+m<20){console.error('Node >= 20 required');process.exit(1)}"

[ -d .git ] || git init
[ -d node_modules ] || npm install

echo "Ready: npm run dev | npm test | npm run build"
