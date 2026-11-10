# @lphal/deepseek-tool-search

An `npx`-friendly MCP server exposing DeepSeek-backed `web_search` and `web_fetch` tools.

The default path calls DeepSeek's dedicated Search and Fetch APIs without an auxiliary model response.
An optional Messages-compatible search mode mirrors DeepSeek Harness's legacy
`web_search_20250305` server-tool flow.

## Quick Start

Requires Node.js 20.19 or newer.

The development toolchain is pinned to `pnpm@10.23.0` and `typescript@6.0.3`.

```json
{
  "mcpServers": {
    "deepseek-search": {
      "command": "npx",
      "args": ["-y", "@lphal/deepseek-tool-search"],
      "env": {
        "DEEPSEEK_API_KEY": "sk-your-key"
      }
    }
  }
}
```

This is a stdio MCP server. The MCP client starts it through `npx`; the DeepSeek REST URL is not used as an HTTP/SSE MCP endpoint.

After publishing, register it with Codex CLI:

```bash
codex mcp add deepseek-search \
  --env DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
  -- npx -y @lphal/deepseek-tool-search
```

`codex mcp list` shows the configured server. The `--env` option writes the key into the Codex MCP configuration, so use your client's preferred secret-injection mechanism if local persistence is unsuitable.

Local development:

```bash
pnpm install
pnpm build
pnpm start -- --check
pnpm test
```

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `DEEPSEEK_API_KEY` | required | DeepSeek API key. |
| `DEEPSEEK_SEARCH_MODE` | `api` | `api` for `/v1/tools/search`; `messages` for Anthropic-compatible server-tool search. |
| `DEEPSEEK_SEARCH_API_BASE_URL` | `https://api.deepseek.com/v1/tools` | Search API base; `/search` is appended. |
| `DEEPSEEK_FETCH_API_BASE_URL` | `https://api.deepseek.com/v1/tools` | Fetch API base; `/fetch` is appended. |
| `DEEPSEEK_MESSAGES_BASE_URL` | `https://api.deepseek.com/anthropic/v1` | Messages base; `/messages` is appended. |
| `DEEPSEEK_SEARCH_MODEL` | `deepseek-v4-flash` | Model used only by Messages mode. |
| `DEEPSEEK_SEARCH_MAX_TOKENS` | `4096` | Messages output token cap. |
| `DEEPSEEK_SEARCH_MAX_USES` | `5` | Maximum server-tool searches in one Messages request. |
| `DEEPSEEK_SEARCH_COUNT` | `10` | Default combined result count (1-50). |
| `DEEPSEEK_MAX_QUERIES` | `10` | Maximum queries per `web_search` call (1-20). |
| `DEEPSEEK_SEARCH_REQUESTS_PER_SECOND` | `5` | Per-process Search request pacing. |
| `DEEPSEEK_HTTP_TIMEOUT_MS` | `30000` | Request and pacing timeout. |
| `DEEPSEEK_SEARCH_SUMMARY_MAX_CHARS` | `800` | Per-source summary cap. |
| `DEEPSEEK_FETCH_MAX_OUTPUT_CHARS` | `200000` | Page Markdown output cap. |

See [README.zh.md](README.zh.md) for Chinese documentation.
