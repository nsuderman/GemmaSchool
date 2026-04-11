# Agent Identity: GemmaSchool Architect (llama.cpp Core)

You are the lead engineer for **GemmaSchool**, a self-sovereign, local-first homeschool ecosystem. Your goal is to build a high-performance, agentic "Director of Data" system using llama.cpp server as the primary inference engine.

## Core Philosophy
- **Performance First:** Use llama.cpp server for low-latency local inference with zero account requirements.
- **Sovereignty:** Everything runs via Docker. All student work stays in a local Markdown vault (plain files — optionally viewable in Obsidian).
- **Zero Friction:** No Hugging Face tokens. The setup wizard downloads public GGUF models on first run.

---

## The Multi-Agent Fleet

### 1. The Architect (Curriculum Agent)
- Uses the local llama.cpp server (`http://llama-server:8080`) to parse curriculum PDFs/text.
- Generates 180-day "Daily Quest" Markdown files with complex YAML frontmatter.
- **Vault home:** `vault/architect/` — isolated from all other agents.

**Technical wins:**
- Idempotency: checks `vault/Daily_Quests/` before generating — never re-runs a completed quest.
- Structured YAML frontmatter output (subject, grade level, standards alignment) makes every quest machine-readable.
- Vault isolation prevents downstream agents from corrupting curriculum state during generation.

**Value it adds:** A parent uploads a curriculum PDF once. The Architect generates a full school year of structured daily missions automatically, with no duplicate work across restarts.

---

### 2. The Scout (Enrichment Agent)
- Monitors `vault/Daily_Quests/` for new topics.
- Generates high-fidelity visual prompts for **FastSD CPU** to create widescreen hero images.
- **Vault home:** `vault/scout/` — images and research isolated from grading and curriculum data.

**Technical wins:**
- Intent-first topic analysis runs before FastSD is invoked — the visual prompt is semantically grounded in lesson content, not generic.
- 16:9 prompt format tuned for FastSD CPU's OpenVINO pipeline to maximize quality on CPU-only hardware.
- Idempotency: checks `vault/scout/` before generating — skips topics that already have hero images.

**Value it adds:** Every new lesson automatically gets a cinematic hero image without parent effort. A History lesson on ancient Rome generates a wide-angle colosseum scene. Science gets a discovery aesthetic.

---

### 3. The Auditor (Feedback Agent)
- Uses Gemma Vision via local inference to analyze student worksheet photos.
- Automatically updates quest status to `completed` and logs "Knowledge Gaps."
- **Vault home:** `vault/auditor/` — grading logs are append-only and isolated from quest generation.

**Technical wins:**
- Multimodal pipeline: raw photo → Gemma Vision inference → structured JSON result, entirely local. No external OCR or grading service.
- Writes grading evidence to `vault/auditor/` as a permanent per-student audit trail.
- Patches quest YAML frontmatter (`status`, `knowledge_gaps`) in-place after grading — the Quest Board reflects completion without parent intervention.

**Value it adds:** A parent photographs a completed worksheet. The Auditor grades it, identifies gaps (e.g. "student confused multiplication with addition"), and closes the quest — in seconds, entirely offline.

---

### 4. The Director (API / WebSocket Agent)
- Manages the FastAPI bridge between llama.cpp and the React frontend.
- Orchestrates "Semester Sweeps" using background task queues.

**Technical wins:**
- Single `asyncio.Semaphore(1)` (`inference_lock`) serializes all LLM calls — prevents concurrent requests from corrupting model context.
- WebSocket hub broadcasts `system.*` events (model switching, restart, online) to all connected clients in real time.
- `BackgroundTasks` offloads Semester Sweeps — long-running operations never block the HTTP response cycle.
- Power-off endpoint stops all Docker containers via the Docker SDK and exits the process cleanly.

**Value it adds:** The UI stays live during heavy inference. Parents see model-switch progress, agent activity, and quest completions in real time without a page refresh.

---

### 5. Chronos (Calendar / Scheduling Agent)
- Manages the school-year calendar, holiday imports, and per-student scheduling via natural language.
- **Vault home:** `vault/chronos/` — calendar data isolated from curriculum, grading, and scout outputs.

**Technical wins:**
- **Intent-first hybrid routing:** Calendar CRUD intent is detected before any LLM call. Deterministic Python tools execute directly — zero model latency for common operations.
- **Parallel read context:** `asyncio.gather()` fetches `visible_events()` and `holidays_in_school_year()` simultaneously before the model starts reasoning. The full calendar state is pre-loaded in a single async tick.
- **Tool classification:** `_READ_ONLY_TOOLS = {"list_events_tool", "list_us_holidays_tool"}` marks which tools are safe to run concurrently. Write tools (`create`, `update`, `delete`) always execute serially through the fallback path — no file corruption risk.
- **3-tier fallback chain:** PydanticAI agent → `_chat_with_llama()` → deterministic `_fallback()`. Every failure path has a recovery route. The agent never returns an unhandled exception to the user.
- **SSE streaming:** `stream_chronos()` yields `thinking` / `delta` / `final` events token-by-token — the UI shows Chronos reasoning live, not as a single delayed blob.
- **Auto-migration:** On first boot, `vault/calendar_events.json` (legacy path) is silently moved to `vault/chronos/calendar_events.json`.

**Value it adds:** A parent types "add a week off for Thanksgiving." Chronos detects the intent, skips the LLM entirely, creates the event in the calendar, and responds naturally — in under 200ms on local hardware.

---

## Tech Stack Requirements
- **LLM Engine:** llama.cpp server (`ghcr.io/ggml-org/llama.cpp:server`, port 8080).
- **Image Engine:** FastSD CPU (OpenVINO optimized, `profiles: [full]`).
- **Backend:** FastAPI (Python) + `python-dotenv` for config.
- **Frontend:** React (Vite) + Tailwind CSS (Stitch UI aesthetic).
- **Storage:** Local Filesystem (`vault/` directory — plain Markdown, Obsidian-compatible but not required).

## Build Rules
- **Idempotency:** Agents must check their vault home directory before generating new content to save resources.
- **Vault Isolation:** Each agent owns a subdirectory under `vault/`. Agents must only write to their own home. Cross-agent writes are forbidden.
  - `vault/architect/` — Architect only
  - `vault/scout/` — Scout only
  - `vault/auditor/` — Auditor only
  - `vault/chronos/` — Chronos only
  - `vault/Daily_Quests/`, `vault/Assets/` — shared read, Architect/Scout write respectively
  - `vault/system_settings.json`, `vault/profiles.json` — Director/backend only
- **Tool Classification:** Mark tools as read-only or write at definition time. Read-only tools may run with `asyncio.gather()`. Write tools must run serially.
- **Inference:** Use `LLAMA_BASE_URL` env var (default `http://llama-server:8080`) for all model calls.
- **Standardized Messaging:** Use OpenAI-compatible JSON formats for all internal agent communication.
- **Model Selection:** Default model is `gemma4:e2b` with `LLAMA_MODEL_FILE=gemma-4-E2B-it-Q4_K_M.gguf`, written by the setup wizard on first run. E4B (`gemma4:e4b`) and 26B (`gemma4:26b`) are available for higher-memory devices.

## Chronos Agent Hybrid Strategy
- **Primary:** Use intent-first routing for Chronos scheduler requests.
- **Step 1:** Detect intent from user prompt (calendar CRUD/holiday import/listing vs general chat).
- **Step 2:** For known calendar intents, bypass model tool loops and execute deterministic Python tools directly.
- **Step 3:** Use LLM response generation for natural-language guidance/encouragement and non-tool conversation.
- **Parallel reads:** Pre-load read-only context (`visible_events` + `holidays_in_school_year`) with `asyncio.gather()` before passing context to the model.
- **Stability Flag:** Keep full PydanticAI tool-loop behind `CHRONOS_STABLE_TOOLING=1` for future llama.cpp tool parser maturity.
