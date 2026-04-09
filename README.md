# 🎓 GemmaSchool
### *Sovereign Learning. Cinematic Discovery. Local First.*

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.11-blue)](backend/requirements.txt)
[![React](https://img.shields.io/badge/React-18-61dafb)](frontend/package.json)
[![llama.cpp](https://img.shields.io/badge/llama.cpp-server-green)](https://github.com/ggerganov/llama.cpp)
[![Gemma](https://img.shields.io/badge/Model-Gemma_3-orange)](https://ai.google.dev/gemma)

![GemmaSchool Header](assets/header.png)

> **GemmaSchool** is an AI-augmented, self-sovereign homeschooling ecosystem. It transforms static curriculum into an interactive "Quest" system, running entirely on local hardware via **Gemma 3/4** and **llama.cpp**.

---

## 🌟 The Vision
GemmaSchool returns educational power to the family. By leveraging the **Gemma** multimodal family, we automate the heavy lifting of homeschooling — planning, grading, and enrichment — while keeping 100% of student data private in a local Markdown vault. No cloud, no subscriptions, no tracking.

## 🏆 Competition Tracks
GemmaSchool is engineered for excellence in two primary **Gemma 4 Good** tracks:
* **Future of Education:** Transforming multi-step curriculum PDFs into adaptive, personalized "Daily Quests."
* **Technical Excellence (llama.cpp):** Demonstrating frontier multimodal performance (Vision + Text) on home hardware using optimized GGUF quants.

---

## 🚀 Key Features

### 🗺️ The Daily Quest Board
We replaced boring spreadsheets with a gamified mission hub.
* **Cinematic Discovery:** Every new topic triggers a "World Event." The **Scout Agent** uses **FastSD CPU** to generate widescreen hero images, making a History lesson feel like a movie premiere.
* **The Emerald Glow:** Real-time visual feedback. When a student completes a task, the parent's dashboard glows emerald via instant WebSocket synchronization.

### 🧠 Multimodal Agent Fleet
1. **The Architect:** Parses curriculum PDFs into structured 180-day lesson plans stored as Markdown.
2. **The Scout:** Analyzes text to find enrichment "Side Quests" and generates visual prompts.
3. **The Auditor:** Uses Gemma's native **Vision** capabilities to grade photos of physical worksheets and identify knowledge gaps.
4. **The Director:** Orchestrates the FastAPI bridge, WebSocket events, and Semester Sweeps.

### 🌿 Knowledge Grove (Built-in Graph View)
Your child's progress lives as plain Markdown in the `vault/` directory. GemmaSchool's built-in **Knowledge Grove** renders a live force-directed graph of every quest and the connections between them — no external tools required.
* Nodes coloured by **subject**, ringed by **completion status**
* Amber nodes surface **Knowledge Gaps** detected by the Auditor
* Cross-subject clusters reveal how History, Science, and Art connect in real time

> **Optional:** The `vault/` folder is fully compatible with **Obsidian**. Open it there for its native graph view and note editor — everything is standard Markdown.

---

## 🛠️ Technical Architecture

| Layer | Technology |
|---|---|
| Inference | `llama.cpp` (`llama-server`, OpenAI-compatible API) |
| Vision | Gemma GGUF via llama.cpp multimodal |
| Imaging | FastSD CPU (OpenVINO) — local 16:9 hero images |
| Backend | FastAPI + WebSockets + SSE |
| Frontend | React 18 (Vite) + Tailwind CSS (Stitch UI) |
| Graph | `react-force-graph-2d` — built-in Knowledge Grove |
| Storage | Local filesystem (`vault/` — plain Markdown) |
| Containers | Docker + Docker Compose |

---

## 📦 Installation & Setup

### Requirements
* **Docker** & **Docker Compose**
* **Hardware:** 8GB+ RAM (optimised for CPU-only inference)
* A free **Hugging Face** account with Gemma license accepted

### First Run
```bash
git clone git@github.com:nsuderman/GemmaSchool.git
cd GemmaSchool
docker-compose up --build
```

Open **http://localhost:5173** — the setup wizard guides you through:
- Connecting your Hugging Face token
- Selecting a model quantisation level for your hardware
- Configuring CPU threads and optional GPU layer offload
- Downloading GGUF models with a live progress bar
- Writing your `.env` automatically

### Full Stack (after setup)
```bash
docker-compose --profile full up
```
Adds `llama-server` and `FastSD` to the running stack.

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
| [llama.cpp](https://github.com/ggerganov/llama.cpp) | MIT | Inference engine |
| [FastSD CPU](https://github.com/rupeshs/fastsdcpu) | Apache 2.0 | Local image generation |
| [FastAPI](https://github.com/tiangolo/fastapi) | MIT | Backend framework |
| [React](https://github.com/facebook/react) | MIT | Frontend framework |
| [react-force-graph](https://github.com/vasturiano/react-force-graph) | MIT | Knowledge Grove graph |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | MIT | Styling |
| [huggingface_hub](https://github.com/huggingface/huggingface_hub) | Apache 2.0 | Model download |

---

## 🤖 AI Model Terms

**Gemma models are NOT covered by this Apache 2.0 license.**

The Gemma GGUF models downloaded and used by this application are subject to Google's
[Gemma Terms of Use](https://ai.google.dev/gemma/terms). By using GemmaSchool you agree to:

1. Accept the Gemma Terms of Use on [Hugging Face](https://huggingface.co/google) before downloading
2. Use the models only as permitted under those terms
3. Not redistribute the GGUF model weights

Model files (`.gguf`) are excluded from this repository via `.gitignore` and are never committed.

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
