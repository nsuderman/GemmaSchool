#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# GemmaSchool — macOS launcher (double-click to start)
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

FRONTEND_URL="http://localhost:5173"
BOLD="\033[1m"; GREEN="\033[0;32m"; BLUE="\033[0;34m"
YELLOW="\033[0;33m"; RED="\033[0;31m"; RESET="\033[0m"

step()  { echo -e "\n${BLUE}${BOLD}▶ $1${RESET}"; }
ok()    { echo -e "  ${GREEN}✓ $1${RESET}"; }
info()  { echo -e "  ${YELLOW}→ $1${RESET}"; }
abort() { echo -e "\n${RED}${BOLD}✗ $1${RESET}\n"; exit 1; }

clear
echo -e "${BOLD}"
echo "  ╔════════════════════════════════════╗"
echo "  ║      🎓  GemmaSchool               ║"
echo "  ║      Sovereign Learning            ║"
echo "  ╚════════════════════════════════════╝"
echo -e "${RESET}"

# ── Homebrew ──────────────────────────────────────────────────
step "Checking Homebrew..."
if ! command -v brew &>/dev/null; then
  info "Installing Homebrew (you may be asked for your Mac password)..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  [[ -f /opt/homebrew/bin/brew ]] && eval "$(/opt/homebrew/bin/brew shellenv)"
  ok "Homebrew installed"
else
  ok "Homebrew ready"
fi

# ── OrbStack (Docker runtime) ─────────────────────────────────
step "Checking Docker runtime (OrbStack)..."
if ! command -v docker &>/dev/null; then
  info "Installing OrbStack — lightweight Docker runtime for Mac..."
  brew install orbstack
  ok "OrbStack installed"
fi

if ! docker info &>/dev/null 2>&1; then
  info "Starting OrbStack..."
  open -a OrbStack 2>/dev/null || true
  echo -n "  Waiting for Docker"
  until docker info &>/dev/null 2>&1; do printf "."; sleep 1; done
  echo ""
  ok "Docker ready"
else
  ok "Docker already running"
fi

# ── Start GemmaSchool ─────────────────────────────────────────
step "Starting GemmaSchool..."
docker compose up --build -d

step "Waiting for the app..."
echo -n "  "
until curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null | grep -q "200\|304"; do
  printf "."; sleep 1
done
echo ""
ok "Ready at ${FRONTEND_URL}"

step "Opening in your browser..."
open "$FRONTEND_URL"

echo -e "\n  ${GREEN}${BOLD}GemmaSchool is running.${RESET}"
echo -e "  Visit ${BLUE}${FRONTEND_URL}${RESET} anytime.\n"
echo "  To stop: quit OrbStack from the menu bar, or run 'make stop'."
echo ""
