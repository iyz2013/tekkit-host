#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ is required. On a Mac: brew install node"
  exit 1
fi

if [ ! -d node_modules ]; then
  ./setup.sh
fi

if [ ! -d dist ]; then
  npm run build
fi

echo "Tekkit Host: http://127.0.0.1:3840"
echo "Sign in with admin / admin"

if command -v open >/dev/null 2>&1; then
  (sleep 1 && open "http://127.0.0.1:3840") &
fi

npm start
