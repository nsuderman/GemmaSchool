#!/usr/bin/env bash
# Pull a Gemma model into the running Ollama container.
# Usage: ./scripts/ollama_pull.sh [model]
# Default model: gemma4:4b

set -euo pipefail

MODEL="${1:-gemma4:4b}"
OLLAMA_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"

echo "Pulling ${MODEL} via Ollama at ${OLLAMA_URL}..."
curl -fsSL "${OLLAMA_URL}/api/pull" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"${MODEL}\"}" | \
  while IFS= read -r line; do
    status=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || true)
    [ -n "$status" ] && echo "  $status"
  done

echo "Done. Model '${MODEL}' is ready."
