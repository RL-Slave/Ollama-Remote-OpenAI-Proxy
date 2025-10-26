## Ollama Remote OpenAI Proxy

### Overview

This VS Code extension emulates a local Ollama instance on `127.0.0.1:11434`, forwards every request to a remote Ollama host, and exposes an OpenAI-compatible `/v1` surface in parallel. Editors and AI assistants keep talking to “local” Ollama while the heavy lifting happens remotely.

```
VS Code / Tool ──► http://127.0.0.1:11434 ──► Remote Ollama (z. B. http://server:11434)
                      │
                      └─ OpenAI-kompatible /v1-Endpunkte
```

### Highlights

- Fully configurable remote target (protocol, host, port, base path, optional API key).
- Local listener stays Ollama-compatible (defaults to `127.0.0.1:11434`, customizable).
- Translates `/v1/chat/completions`, `/v1/completions`, `/v1/models` into the matching Ollama endpoints.
- Activity-bar view with start/stop/restart actions and remote configuration.
- Dedicated **Logs** view with timestamped history plus copy / clear buttons.
- CLI smoke test (`node scripts/run-proxy-test.js`) for fast end-to-end verification.

### Requirements

- Node.js ≥ 18
- VS Code ≥ 1.84
- Reachable Ollama server (HTTP or HTTPS)

### Installation

```bash
npm install
npm run compile
```

Launch the Extension Development Host via the included “Run Ollama Proxy Extension” configuration (`F5`, see `.vscode/launch.json`).

### Configuration

Settings live under **Settings → Ollama Remote Proxy** (or `settings.json`):

| Setting                         | Default   | Description |
|---------------------------------|-----------|--------------|
| `ollamaProxy.remote.protocol`   | `http`    | `http` or `https` |
| `ollamaProxy.remote.host`       | `127.0.0.1` | Remote host / IP |
| `ollamaProxy.remote.port`       | `11434`   | Remote port |
| `ollamaProxy.remote.basePath`   | `/`       | Optional prefix |
| `ollamaProxy.remote.apiKey`     | `""`      | Optional Bearer token forwarded upstream |
| `ollamaProxy.server.host`       | `127.0.0.1` | Local bind interface |
| `ollamaProxy.server.port`       | `11434`   | Local port |
| `ollamaProxy.openai.basePath`   | `/v1`     | Path that exposes the OpenAI facade |

The activity-bar entry additionally offers:

- Start / Stop / Restart commands
- Remote target dialog
- Live status (local + remote endpoints)
- Log inspection / copy buttons

### Usage

1. Start the proxy (auto on VS Code startup or via “Start Ollama Proxy Server”).
2. Point tools to `http://127.0.0.1:11434/v1` (OpenAI schema). Native Ollama calls continue to work at `http://127.0.0.1:11434/api/...`.
3. If something fails, open the **Logs** view, copy the entries, and share for debugging.

### CLI Smoke Test

```bash
node scripts/run-proxy-test.js \
  --remote-host http://45.11.228.163:11434 \
  --model gpt-oss:20b \
  --prompt "Say hello and mention the host."
```

Optional flags:

`--remote-host`, `--remote-port`, `--remote-protocol`, `--remote-base-path`, `--remote-api-key`,  
`--local-host`, `--local-port`, `--openai-base-path`,  
`--model`, `--prompt`, `--system-prompt`, `--verbose`, `--timeout`

The script spins up the proxy on `127.0.0.1:18000`, calls `/v1/models`, `/v1/chat/completions`, `/api/tags`, and then shuts everything down.

### Troubleshooting

1. **Check logs:** Activity bar → “Ollama Proxy” → “Logs”. Timestamps, errors, and payload snippets are captured there.
2. **Verify remote reachability:** `curl http://REMOTE:PORT/api/tags`.
3. **Use valid model names:** match whatever `/api/tags` returns (e.g., `gpt-oss:20b`, `sam860/granite-4.0:7b`).
4. **Streaming expectations:** the proxy buffers streaming responses and replies after completion; clients that require SSE need adjustments.

### Roadmap Ideas

- Translate additional OpenAI endpoints (embeddings, images, etc.).
- Offer true streaming (SSE) passthrough.
- Add auth / quota controls for multi-user setups.

### License

MIT (see `LICENSE` / `package.json`).
