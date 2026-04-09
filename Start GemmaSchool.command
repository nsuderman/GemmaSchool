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

clear 2>/dev/null || true
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

# ── Detect real host RAM (before Docker, so we see actual hardware) ──
step "Detecting system hardware..."
HOST_RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
HOST_RAM_GB=$(( HOST_RAM_BYTES / 1024 / 1024 / 1024 ))
HOST_CPU_CORES=$(sysctl -n hw.physicalcpu 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 0)
VM_LINE=$(vm_stat 2>/dev/null | awk '/^Mach Virtual Memory Statistics/ {gsub("[^0-9]", "", $8); print $8; exit}')
PAGE_SIZE=${VM_LINE:-16384}
FREE_PAGES=$(vm_stat 2>/dev/null | awk '/Pages free/ {gsub("\.", "", $3); print $3; exit}')
INACTIVE_PAGES=$(vm_stat 2>/dev/null | awk '/Pages inactive/ {gsub("\.", "", $3); print $3; exit}')
SPECULATIVE_PAGES=$(vm_stat 2>/dev/null | awk '/Pages speculative/ {gsub("\.", "", $3); print $3; exit}')
FREE_PAGES=${FREE_PAGES:-0}
INACTIVE_PAGES=${INACTIVE_PAGES:-0}
SPECULATIVE_PAGES=${SPECULATIVE_PAGES:-0}
HOST_AVAILABLE_BYTES=$(( (FREE_PAGES + INACTIVE_PAGES + SPECULATIVE_PAGES) * PAGE_SIZE ))
HOST_AVAILABLE_GB=$(( HOST_AVAILABLE_BYTES / 1024 / 1024 / 1024 ))
export HOST_RAM_GB HOST_AVAILABLE_GB HOST_CPU_CORES
ok "${HOST_RAM_GB} GB RAM · ${HOST_CPU_CORES} CPU cores detected"

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
echo "  Closing this window in 3 seconds..."
sleep 3
osascript -e 'tell application "Terminal" to close front window' &
