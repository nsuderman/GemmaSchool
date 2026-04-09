BROWSER_URL   := http://localhost:5173
FRONTEND_PORT := 5173
BACKEND_PORT  := 8000

# Detect OS for browser open command
UNAME := $(shell uname)
ifeq ($(UNAME), Darwin)
  OPEN := open
else ifeq ($(UNAME), Linux)
  OPEN := xdg-open
else
  OPEN := start
endif

.DEFAULT_GOAL := start

# ── Start base stack (setup wizard + frontend) ────────────────
.PHONY: start
start:
	@echo "  Starting GemmaSchool..."
	@docker-compose up --build -d
	@echo "  Waiting for frontend..."
	@until curl -s -o /dev/null -w "%{http_code}" http://localhost:$(FRONTEND_PORT) | grep -q "200\|304"; do \
		printf "."; sleep 1; \
	done
	@echo ""
	@echo "  Opening http://localhost:$(FRONTEND_PORT)"
	@$(OPEN) $(BROWSER_URL)

# ── Full stack (adds llama-server + FastSD) ───────────────────
.PHONY: full
full:
	@echo "  Starting full GemmaSchool stack..."
	@docker-compose --profile full up --build -d
	@echo "  Waiting for frontend..."
	@until curl -s -o /dev/null -w "%{http_code}" http://localhost:$(FRONTEND_PORT) | grep -q "200\|304"; do \
		printf "."; sleep 1; \
	done
	@echo ""
	@echo "  Opening http://localhost:$(FRONTEND_PORT)"
	@$(OPEN) $(BROWSER_URL)

# ── Stop all containers ───────────────────────────────────────
.PHONY: stop
stop:
	@echo "  Stopping GemmaSchool..."
	@docker-compose --profile full down

# ── Follow logs ───────────────────────────────────────────────
.PHONY: logs
logs:
	@docker-compose --profile full logs -f

.PHONY: logs-backend
logs-backend:
	@docker-compose logs -f backend

.PHONY: logs-frontend
logs-frontend:
	@docker-compose logs -f frontend

# ── Rebuild without cache ─────────────────────────────────────
.PHONY: rebuild
rebuild:
	@docker-compose up --build --force-recreate -d
	@$(OPEN) $(BROWSER_URL)

# ── Bypass setup wizard (dummy model for UI testing) ─────────
.PHONY: mock-model
mock-model:
	@touch models/gemma-3-4b-it-q4_0.gguf
	@docker-compose restart backend
	@echo "  Mock model created — refresh http://localhost:$(FRONTEND_PORT) to skip setup wizard."

# ── Quick API health check ────────────────────────────────────
.PHONY: health
health:
	@echo "\n  /health"
	@curl -s http://localhost:$(BACKEND_PORT)/health | python3 -m json.tool
	@echo "\n  /setup/status"
	@curl -s http://localhost:$(BACKEND_PORT)/setup/status | python3 -m json.tool
	@echo "\n  /agents/status"
	@curl -s http://localhost:$(BACKEND_PORT)/agents/status | python3 -m json.tool

# ── Clean everything (containers + volumes) ───────────────────
.PHONY: clean
clean:
	@echo "  Removing containers and volumes..."
	@docker-compose --profile full down -v --remove-orphans
