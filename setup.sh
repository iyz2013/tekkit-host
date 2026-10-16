#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ is required."
  echo "On a Mac:  brew install node"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node 18+ required. Found $(node -v)."
  exit 1
fi

npm install

echo
echo "Dependencies installed."
echo
echo "Optional, recommended on Apple Silicon:"
echo "  brew install --cask zulu@8"
echo
echo "Start the dashboard:"
echo "  ./start.sh"
echo "  or: npm run dev"
echo
echo "The UI will be at http://127.0.0.1:3840 after a production start,"
echo "or http://127.0.0.1:5173 during npm run dev."
