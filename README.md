# @lphal/deepseek-tool-search

English | [中文](README.zh.md)

An `npx`-friendly DeepSeek MCP server exposing `web_search` and `web_fetch` to any MCP client.

The implementation follows DeepSeek Harness's web tool split:

- The default path calls DeepSeek's dedicated Search API without an auxiliary model response.
- `web_fetch` calls the DeepSeek Fetch API and returns page Markdown directly.
- An optional Messages-compatible mode mirrors Harness's legacy `web_search_20250305` server-tool flow.
- Multi-query results are merged by source rank, deduplicated by URL, and bounded by the total result limit.
- The server includes local 5 QPS pacing, request timeouts, response validation, and credential-safe errors.
- All web content is labeled as untrusted data so webpage text is not treated as instructions.

Requires Node.js 20.19 or newer.

The development toolchain is pinned to `pnpm@10.23.0` and `typescript@6.0.3`.

## Installation

After publishing to npm, an MCP client can use:

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

This is an MCP stdio configuration, not a DeepSeek REST URL for an HTTP/SSE endpoint. The MCP client starts the server through `npx`.

After publishing, register it with Codex CLI:

```bash
codex mcp add deepseek-search \
  --env DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
  -- npx -y @lphal/deepseek-tool-search
```

Use `codex mcp list` to inspect the configuration. `--env` writes the key into Codex's MCP configuration; use your client's preferred environment or secret-reference mechanism if local persistence is unsuitable.

Local development:

```bash
pnpm install
pnpm build
pnpm start -- --check
pnpm start
```

`--check` prints sanitized configuration without making network requests.

The working directory's `.env` is loaded automatically; `.env.example` documents the supported variables.

## Tools

### `web_search`

```json
{
  "queries": ["DeepSeek API documentation", "DeepSeek web search API"],
  "count": 10,
  "original_question": "How do I connect the DeepSeek search API to MCP?"
}
```

`count` is the total number of sources after merging, from 1 to 50. When omitted, `DEEPSEEK_SEARCH_COUNT` is used.

### `web_fetch`

```json
{
  "url": "https://api-docs.deepseek.com/guides/search"
}
```

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `DEEPSEEK_API_KEY` | required | DeepSeek API key from the process environment or `.env`. It is used only in server request headers and is not written to tool results or logs. |
| `DEEPSEEK_SEARCH_MODE` | `api` | `api` uses the dedicated Search API; `messages` uses compatible Messages search. |
| `DEEPSEEK_SEARCH_API_BASE_URL` | `https://api.deepseek.com/v1/tools` | Search API base URL; the program appends `/search`. |
| `DEEPSEEK_FETCH_API_BASE_URL` | `https://api.deepseek.com/v1/tools` | Fetch API base URL; the program appends `/fetch`. |
| `DEEPSEEK_MESSAGES_BASE_URL` | `https://api.deepseek.com/anthropic/v1` | Messages-compatible base URL; the program appends `/messages`. |
| `DEEPSEEK_SEARCH_MODEL` | `deepseek-v4-flash` | Model used only by Messages mode. |
| `DEEPSEEK_SEARCH_MAX_TOKENS` | `4096` | Maximum output tokens for Messages mode. |
| `DEEPSEEK_SEARCH_MAX_USES` | `5` | Maximum server-tool searches in one Messages request. |
| `DEEPSEEK_SEARCH_COUNT` | `10` | Default total number of returned sources, from 1 to 50. |
| `DEEPSEEK_MAX_QUERIES` | `10` | Maximum queries per `web_search` call, from 1 to 20. |
| `DEEPSEEK_SEARCH_REQUESTS_PER_SECOND` | `5` | Per-process Search request pacing. |
| `DEEPSEEK_HTTP_TIMEOUT_MS` | `30000` | Timeout for one network request and any pacing wait. |
| `DEEPSEEK_SEARCH_SUMMARY_MAX_CHARS` | `800` | Character limit for each source summary. |
| `DEEPSEEK_FETCH_MAX_OUTPUT_CHARS` | `200000` | Output limit for one fetched page. |

Custom proxy URLs must use `http(s)` and must not embed credentials. The API key must be a raw ASCII string without quotes, spaces, or newlines.

## Harness Mapping

| Harness | This project |
|---|---|
| `web_search` | MCP `web_search` |
| `web_fetch` | MCP `web_fetch` |
| `web-deepseek-api.searchBaseURL` | `DEEPSEEK_SEARCH_API_BASE_URL` |
| `web-deepseek-api.fetchBaseURL` | `DEEPSEEK_FETCH_API_BASE_URL` |
| `web-search-deepseek.baseURL` | `DEEPSEEK_MESSAGES_BASE_URL` |
| `web-search-deepseek.model` | `DEEPSEEK_SEARCH_MODEL` |
| `web-search-deepseek.maxUses` | `DEEPSEEK_SEARCH_MAX_USES` |

Messages-compatible mode incurs the latency and token cost of a full model call for every search, making it slower and more expensive than the dedicated Search API. Use it only when a custom gateway does not provide `/v1/tools/search`.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm test:live
pnpm pack
```

`pnpm test` uses local mocks. `pnpm test:live` calls the real DeepSeek Search and Fetch APIs and skips when `DEEPSEEK_API_KEY` is absent.
