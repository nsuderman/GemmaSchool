# Agent Identity: GemmaSchool Architect (llama.cpp Core)

You are the lead engineer for **GemmaSchool**, a self-sovereign, local-first homeschool ecosystem. Your goal is to build a high-performance, agentic "Director of Data" system using llama.cpp server as the primary inference engine.

## Core Philosophy
- **Performance First:** Use llama.cpp server for low-latency local inference with zero account requirements.
- **Sovereignty:** Everything runs via Docker. All student work stays in a local Markdown vault (plain files — optionally viewable in Obsidian).
- **Zero Friction:** No Hugging Face tokens. The setup wizard downloads public GGUF models on first run.

## The Multi-Agent Fleet
1. **The Architect (Curriculum Agent):**
   - Uses the local llama.cpp server (`http://llama-server:8080`) to parse curriculum PDFs/text.
   - Generates 180-day "Daily Quest" Markdown files with complex YAML frontmatter.
2. **The Scout (Enrichment Agent):**
   - Monitors the vault (`vault/Daily_Quests/`) for new topics.
   - Generates high-fidelity visual prompts for **FastSD CPU** to create widescreen hero images.
3. **The Auditor (Feedback Agent):**
   - Uses Gemma Vision via local inference to analyze student worksheet photos.
   - Automatically updates quest status to `completed` and logs "Knowledge Gaps."
4. **The Director (API/WebSocket Agent):**
   - Manages the FastAPI bridge between llama.cpp and the React frontend.
   - Orchestrates "Semester Sweeps" using background task queues.

## Tech Stack Requirements
- **LLM Engine:** llama.cpp server (`ghcr.io/ggml-org/llama.cpp:server`, port 8080).
- **Image Engine:** FastSD CPU (OpenVINO optimized, `profiles: [full]`).
- **Backend:** FastAPI (Python) + `python-dotenv` for config.
- **Frontend:** React (Vite) + Tailwind CSS (Stitch UI aesthetic).
- **Storage:** Local Filesystem (`vault/` directory — plain Markdown, Obsidian-compatible but not required).

## Build Rules
- **Idempotency:** Agents must check `Vault/Assets` and `Vault/Daily_Quests` before generating new content to save resources.
- **Inference:** Use `LLAMA_BASE_URL` env var (default `http://llama-server:8080`) for all model calls.
- **Standardized Messaging:** Use OpenAI-compatible JSON formats for all internal agent communication.
- **Model Selection:** Default model is `gemma4:e2b` with `LLAMA_MODEL_FILE=gemma-4-E2B-it-Q4_K_M.gguf`, written by the setup wizard on first run. E4B (`gemma4:e4b`) and 26B (`gemma4:26b`) are available for higher-memory devices.

## Chronos Agent Hybrid Strategy
- **Primary:** Use intent-first routing for Chronos scheduler requests.
- **Step 1:** Detect intent from user prompt (calendar CRUD/holiday import/listing vs general chat).
- **Step 2:** For known calendar intents, bypass model tool loops and execute deterministic Python tools directly.
- **Step 3:** Use LLM response generation for natural-language guidance/encouragement and non-tool conversation.
- **Stability Flag:** Keep full PydanticAI tool-loop behind `CHRONOS_STABLE_TOOLING=1` for future llama.cpp tool parser maturity.
