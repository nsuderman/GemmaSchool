# 🎓 GemmaSchool
### *Local Learning. Cinematic Discovery. Local First.*

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.11-blue)](backend/requirements.txt)
[![React](https://img.shields.io/badge/React-18-61dafb)](frontend/package.json)
[![llama.cpp](https://img.shields.io/badge/llama.cpp-latest-green)](https://github.com/ggml-org/llama.cpp)
[![Gemma](https://img.shields.io/badge/Model-Gemma_4-orange)](https://ai.google.dev/gemma)

![GemmaSchool Header](assets/header.png)

> **GemmaSchool** is an AI-augmented, self-sovereign homeschooling ecosystem. It transforms static curriculum into an interactive "Quest" system, running entirely on local hardware via **Gemma 4** and **llama.cpp** — no accounts, no tokens, no cloud.

---

## 🌟 The Vision
GemmaSchool returns educational power to the family. By leveraging the **Gemma** multimodal family, we automate the heavy lifting of homeschooling — planning, grading, and enrichment — while keeping 100% of student data private in a local Markdown vault. No cloud, no subscriptions, no tracking.

## 🏆 Competition Tracks
GemmaSchool is engineered for excellence in two primary **Gemma 4 Good** tracks:
* **Future of Education:** Transforming multi-step curriculum PDFs into adaptive, personalized "Daily Quests."
* **Technical Excellence:** Demonstrating frontier multimodal performance (Vision + Text) on home hardware using llama.cpp.

---

## 🚀 Key Features

### 🗺️ The Daily Quest Board
We replaced boring spreadsheets with a gamified mission hub.
* **Cinematic Discovery:** Every new topic triggers a "World Event." The **Scout Agent** uses **FastSD CPU** to generate widescreen hero images, making a History lesson feel like a movie premiere.
* **The Emerald Glow:** Real-time visual feedback. When a student completes a task, the parent's dashboard glows emerald via instant WebSocket synchronization.

### 🧠 Multimodal Agent Fleet

#### 1. The Architect (Curriculum Agent)
Parses curriculum PDFs into structured 180-day lesson plans stored as Markdown.

**Technical wins:**
- Idempotency check against `vault/Daily_Quests/` before generating — never wastes a model call on content that already exists
- Outputs structured YAML frontmatter (subject, grade, standards alignment) so every quest is machine-readable from day one
- Writes exclusively to `vault/architect/` — isolated from all other agents

**Value:** Turns a 300-page curriculum PDF into a full school year of gamified daily missions in one run, with zero duplicate generation across restarts.

---

#### 2. The Scout (Enrichment Agent)
Analyzes quest topics and generates high-fidelity visual prompts for **FastSD CPU** hero images.

**Technical wins:**
- Intent-first routing: topic analysis runs before image generation, so the visual prompt is semantically grounded in the lesson content
- Writes assets to `vault/scout/` — the Auditor and Architect cannot overwrite Scout outputs
- Generates 16:9 widescreen prompts optimized for FastSD CPU's OpenVINO pipeline, maximizing quality on CPU-only hardware

**Value:** Every new lesson automatically gets a cinematic hero image — no parent effort required. History feels like a movie; Science feels like a discovery.

---

#### 3. The Auditor (Feedback Agent)
Uses Gemma's native Vision capabilities to grade photos of physical worksheets and identify knowledge gaps.

**Technical wins:**
- Multimodal pipeline: accepts a raw photo path, runs Gemma Vision inference locally — no external OCR service needed
- Writes grading logs exclusively to `vault/auditor/` — a permanent, isolated audit trail per student
- Automatically patches quest frontmatter (`status: completed`, `knowledge_gaps: [...]`) after grading — the Quest Board updates without parent involvement

**Value:** A parent photographs a worksheet with their phone. The Auditor grades it, identifies gaps, and updates the student's Quest Board — all in seconds, entirely offline.

---

#### 4. The Director (API / WebSocket Agent)
Orchestrates the FastAPI bridge, WebSocket activity feed, and Semester Sweeps.

**Technical wins:**
- Single `inference_lock` semaphore serializes all LLM calls — prevents context corruption under concurrent requests
- WebSocket hub broadcasts `system.*` events (model switch, restart, online) to all connected clients in real time
- Semester Sweep background tasks use FastAPI's `BackgroundTasks` — long-running operations never block the HTTP response cycle

**Value:** The UI stays live and responsive during heavy inference. Parents see model-switch progress, agent status, and quest completions in real time without refreshing.

---

#### 5. Chronos (Calendar / Scheduling Agent)
Manages the school-year calendar, holiday imports, and per-student scheduling via natural language.

**Technical wins:**
- **Intent-first hybrid routing:** Calendar CRUD is detected from the user prompt before any LLM call. Deterministic Python tools execute directly — zero model latency for common operations like "list events" or "import US holidays."
- **Parallel read context:** `asyncio.gather()` fetches `visible_events()` and `holidays_in_school_year()` simultaneously before the model starts reasoning — pre-loading the full calendar state in a single async tick.
- **Tool classification:** Read-only tools (`list_events_tool`, `list_us_holidays_tool`) are marked in `_READ_ONLY_TOOLS` and safe for concurrent execution. Write tools (`create`, `update`, `delete`) always run serially to prevent file corruption.
- **3-tier fallback chain:** PydanticAI agent → raw `_chat_with_llama()` → deterministic `_fallback()`. Every failure path has a recovery route; the agent never returns an unhandled exception to the user.
- **Isolated vault path:** All calendar data lives in `vault/chronos/` — no other agent can read or write it. Legacy `calendar_events.json` is auto-migrated on first boot.
- **SSE streaming:** `stream_chronos()` yields `thinking` / `delta` / `final` events over a live HTTP stream — the UI shows Chronos reasoning token-by-token, not as a single delayed blob.

**Value:** A parent types "add a week off for Thanksgiving." Chronos detects the intent, skips the LLM, creates the event, and responds in natural language — all in under 200ms on local hardware.

---

### 🌿 Knowledge Grove (Built-in Graph View)
Your child's progress lives as plain Markdown in the `vault/` directory. GemmaSchool's built-in **Knowledge Grove** renders a live force-directed graph of every quest and the connections between them — no external tools required.
* Nodes coloured by **subject**, ringed by **completion status**
* Amber nodes surface **Knowledge Gaps** detected by the Auditor
* Cross-subject clusters reveal how History, Science, and Art connect in real time

> **Optional:** The `vault/` folder is fully compatible with **Obsidian**. Open it there for its native graph view and note editor — everything is standard Markdown.

---

## 🛠️ System Architecture

GemmaSchool is built in four layers. Each layer has a clear responsibility and communicates only through the interfaces defined below it.

```
┌─────────────────────────────────────────────────────────┐
│                    Layer 4 — Frontend                    │
│  React 18 (Vite) · Tailwind CSS · react-force-graph-2d  │
│  SSE streaming · WebSocket activity feed · Role-based UI │
└───────────────────────┬─────────────────────────────────┘
                        │  HTTP / WebSocket / SSE
┌───────────────────────▼─────────────────────────────────┐
│                    Layer 3 — Backend                     │
│         FastAPI · WebSocket hub · BackgroundTasks        │
│   Routers: quests · calendar · agents · setup · vault    │
│   inference_lock semaphore · 3-tier Chronos fallback     │
└───────────────────────┬─────────────────────────────────┘
                        │  OpenAI-compatible JSON (HTTP)
┌───────────────────────▼─────────────────────────────────┐
│                 Layer 2 — Inference Engine               │
│      llama.cpp server  ·  ghcr.io/ggml-org/llama.cpp     │
│    Gemma 4 E2B / E4B / 26B GGUF · Vision + Text · SSE   │
└───────────────────────┬─────────────────────────────────┘
                        │  Local filesystem (plain Markdown)
┌───────────────────────▼─────────────────────────────────┐
│                  Layer 1 — Storage (Vault)               │
│             vault/                                       │
│             ├── chronos/          ← Chronos events       │
│             ├── auditor/          ← Grading logs         │
│             ├── scout/            ← Images & research    │
│             ├── architect/        ← Curriculum plans     │
│             ├── Daily_Quests/     ← Generated quests     │
│             ├── Assets/           ← FastSD hero images   │
│             ├── system_settings.json                     │
│             └── profiles.json                            │
└─────────────────────────────────────────────────────────┘
```

### Agent Routing Architecture

Chronos uses an **intent-first hybrid strategy** that keeps the fast path deterministic:

```
User Prompt
     │
     ▼
_is_tool_intent()?  ──YES──▶  Deterministic Python tools  ──▶  _naturalize_tool_result()  ──▶  SSE stream
     │                         (zero LLM latency)
     NO
     │
     ▼
STABLE_TOOLING=1?  ──YES──▶  PydanticAI agent.run()  ──▶  ChronosResult
     │                        (parallel read context pre-loaded)
     NO
     │
     ▼
_chat_with_llama()  ──▶  raw completion  ──▶  _fallback() if needed
```

### Key Architectural Properties

| Property | Implementation |
|---|---|
| Streaming native | `stream_chronos()` yields SSE events (`thinking` / `delta` / `final`) token-by-token |
| Parallel reads | `asyncio.gather()` fetches events + holidays before model reasoning begins |
| Serial writes | `create` / `update` / `delete` tools always execute one at a time through the fallback path |
| Agent vault isolation | Each agent owns a subdirectory — cross-agent writes are structurally impossible |
| Every error has a path | PydanticAI → llm_chat → deterministic fallback — no unhandled exceptions reach the user |
| Inference serialized | Single `asyncio.Semaphore(1)` prevents concurrent model calls from corrupting context |

### Tech Stack

| Layer | Technology |
|---|---|
| Inference | llama.cpp server (`ghcr.io/ggml-org/llama.cpp:server`) |
| Vision | Gemma Vision via llama.cpp |
| Imaging | FastSD CPU (OpenVINO) — local 16:9 hero images |
| Backend | FastAPI + WebSockets + SSE |
| Frontend | React 18 (Vite) + Tailwind CSS (Stitch UI) |
| Graph | `react-force-graph-2d` — built-in Knowledge Grove |
| Storage | Local filesystem (`vault/` — plain Markdown, Obsidian-compatible) |
| Containers | Docker + Docker Compose |

---

## 📦 Installation & Setup

### Requirements
* **Docker** & **Docker Compose** (macOS: [OrbStack](https://orbstack.dev) recommended — lightweight alternative to Docker Desktop)
* **Hardware:** 8 GB+ RAM (optimised for CPU-only inference)
* No accounts or API tokens required

### macOS — Double-click launcher
1. Double-click **`Start GemmaSchool.command`** in the project folder.
2. It installs Homebrew, OrbStack (lightweight Docker), builds the stack, and opens the browser automatically.

### Manual start
```bash
git clone git@github.com:nsuderman/GemmaSchool.git
cd GemmaSchool
docker compose up --build
```

Open **http://localhost:5173** — the setup wizard guides you through:
- Selecting a Gemma model size for your hardware
- Downloading a public GGUF model (progress bar included)
- Writing your `.env` automatically

### Full Stack (with FastSD image generation)
```bash
docker compose --profile full up
```

---

## ⚖️ License

Copyright 2026 Nate Suderman

This project is licensed under the **Apache License, Version 2.0**.
See the [LICENSE](LICENSE) file for the full text.

```
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

---

## 📋 Third-Party Licenses & Attributions

This project integrates the following third-party components. Each retains its own license:

| Component | License | Notes |
|---|---|---|
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | MIT | LLM serving engine |
| [FastSD CPU](https://github.com/rupeshs/fastsdcpu) | Apache 2.0 | Local image generation |
| [FastAPI](https://github.com/tiangolo/fastapi) | MIT | Backend framework |
| [React](https://github.com/facebook/react) | MIT | Frontend framework |
| [react-force-graph](https://github.com/vasturiano/react-force-graph) | MIT | Knowledge Grove graph |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | MIT | Styling |

---

## 🤖 AI Model Terms

**Gemma models are NOT covered by this Apache 2.0 license.**

The Gemma models downloaded by the setup wizard are subject to Google's
[Gemma Terms of Use](https://ai.google.dev/gemma/terms). By using GemmaSchool you agree to
use the models only as permitted under those terms and not to redistribute model weights.

---

## 🤝 Contributing

Contributions are welcome under the Apache 2.0 license. By submitting a pull request you agree
that your contributions will be licensed under the same terms.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Open a pull request against `main`

---

## ⚠️ Disclaimer

GemmaSchool is an independent open-source project and is **not affiliated with, endorsed by,
or sponsored by Google**. "Gemma" is a trademark of Google LLC.
