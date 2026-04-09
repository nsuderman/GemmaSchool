#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# GemmaSchool — Model Downloader
# Downloads Gemma 4 GGUF files from Hugging Face into /models
#
# Requirements:
#   pip install huggingface_hub[cli]
#
# Usage:
#   HF_TOKEN=hf_xxx ./scripts/download_models.sh
#   or: set HF_TOKEN in .env and run: source .env && ./scripts/download_models.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="$(dirname "$SCRIPT_DIR")/models"

# ── Load .env if present ──────────────────────────────────────
if [ -f "$(dirname "$SCRIPT_DIR")/.env" ]; then
  export $(grep -v '^#' "$(dirname "$SCRIPT_DIR")/.env" | xargs)
fi

# ── Validate HF token ─────────────────────────────────────────
if [ -z "${HF_TOKEN:-}" ]; then
  echo ""
  echo "  ERROR: HF_TOKEN is not set."
  echo ""
  echo "  Gemma 4 models require a Hugging Face account and license acceptance."
  echo "  Steps:"
  echo "    1. Create an account at https://huggingface.co"
  echo "    2. Accept the Gemma license at https://huggingface.co/google/gemma-3-4b-it"
  echo "    3. Generate an access token at https://huggingface.co/settings/tokens"
  echo "    4. Add HF_TOKEN=hf_xxx to your .env file"
  echo ""
  exit 1
fi

# ── Check huggingface-cli ─────────────────────────────────────
if ! command -v huggingface-cli &> /dev/null; then
  echo "  huggingface-cli not found. Installing..."
  pip install -q "huggingface_hub[cli]"
fi

mkdir -p "$MODELS_DIR"

# ── Model definitions ─────────────────────────────────────────
# Format: "HF_REPO|FILENAME|PURPOSE"
# Override GGUF_LOGIC_REPO and GGUF_VISION_REPO in .env to point at
# different repos (e.g. bartowski repacks or custom quants).
LOGIC_REPO="${GGUF_LOGIC_REPO:-google/gemma-3-4b-it-qat-q4_0-gguf}"
LOGIC_FILE="${GGUF_LOGIC_FILE:-gemma-3-4b-it-q4_0.gguf}"

VISION_REPO="${GGUF_VISION_REPO:-google/gemma-3-4b-it-qat-q4_0-gguf}"
VISION_FILE="${GGUF_VISION_FILE:-gemma-3-4b-it-q4_0.gguf}"

# ── Download function ─────────────────────────────────────────
download_model() {
  local repo="$1"
  local filename="$2"
  local purpose="$3"
  local dest="$MODELS_DIR/$filename"

  if [ -f "$dest" ]; then
    echo "  [SKIP] $filename already exists."
    return
  fi

  echo ""
  echo "  Downloading: $filename"
  echo "  Repo:        $repo"
  echo "  Purpose:     $purpose"
  echo ""

  huggingface-cli download \
    --token "$HF_TOKEN" \
    --local-dir "$MODELS_DIR" \
    --local-dir-use-symlinks False \
    "$repo" "$filename"

  echo "  [OK] Saved to models/$filename"
}

# ── Run downloads ─────────────────────────────────────────────
echo ""
echo "  GemmaSchool Model Downloader"
echo "  ──────────────────────────────"
echo "  Destination: $MODELS_DIR"
echo ""

download_model "$LOGIC_REPO"  "$LOGIC_FILE"  "Architect / Scout / Director (text reasoning)"
download_model "$VISION_REPO" "$VISION_FILE" "Auditor (worksheet vision grading)"

echo ""
echo "  All models ready. Start the stack with: docker-compose up --build"
echo ""
