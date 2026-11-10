# @lphal/deepseek-tool-search

通过 `npx` 启动的 DeepSeek MCP 工具，向任意 MCP 客户端提供 `web_search` 与 `web_fetch`。

实现参考 DeepSeek Harness 的 web 工具拆分：

- 默认直接调用新版 DeepSeek Search API，不额外生成模型回复。
- `web_fetch` 调用 DeepSeek Fetch API，直接返回页面 Markdown。
- 可选 Messages 兼容模式，复刻 Harness 旧版 `web_search_20250305` 服务端工具调用。
- 多查询按来源排名合并，按 URL 去重，并受总量上限约束。
- 内置账号级 5 QPS 的本地限速、请求超时、响应结构校验和错误信息脱敏。
- 所有网络内容都标记为不可信数据，避免把网页文本当成指令执行。

要求 Node.js 20.19 或更高版本。

仓库开发工具链固定为 `pnpm@10.23.0` 和 `typescript@6.0.3`。

## 安装与启动

发布到 npm 后，MCP 客户端可直接使用：

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

这是 MCP stdio 配置，不是把 DeepSeek REST URL 直接填入 HTTP/SSE 地址栏。服务由 MCP 客户端通过 `npx` 启动。

Codex CLI 可以在发布后直接注册：

```bash
codex mcp add deepseek-search \
  --env DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
  -- npx -y @lphal/deepseek-tool-search
```

随后用 `codex mcp list` 检查。`--env` 会把密钥写入 Codex 的 MCP 配置；如果本机不适合持久化密钥，请改用客户端支持的环境变量引用方式。

本地开发可直接运行：

```bash
pnpm install
pnpm build
pnpm start -- --check
pnpm start
```

`--check` 只显示脱敏后的配置，不发起网络请求。

## 工具

### `web_search`

```json
{
  "queries": ["DeepSeek API documentation", "DeepSeek web search API"],
  "count": 10,
  "original_question": "DeepSeek 的搜索接口怎么接入 MCP？"
}
```

`count` 是合并后的来源总量，范围 1 到 50。未填写时使用 `DEEPSEEK_SEARCH_COUNT`。

### `web_fetch`

```json
{
  "url": "https://api-docs.deepseek.com/zh-cn/guides/search"
}
```

## 配置

| 环境变量 | 默认值 | 说明 |
|---|---:|---|
| `DEEPSEEK_API_KEY` | 无 | 必填。只在服务端请求头中使用，不写入工具结果或日志。 |
| `DEEPSEEK_SEARCH_MODE` | `api` | `api` 使用新版 Search API；`messages` 使用兼容 Messages 搜索。 |
| `DEEPSEEK_SEARCH_API_BASE_URL` | `https://api.deepseek.com/v1/tools` | Search API 基础地址，程序追加 `/search`。 |
| `DEEPSEEK_FETCH_API_BASE_URL` | `https://api.deepseek.com/v1/tools` | Fetch API 基础地址，程序追加 `/fetch`。 |
| `DEEPSEEK_MESSAGES_BASE_URL` | `https://api.deepseek.com/anthropic/v1` | Messages 兼容模式基础地址，程序追加 `/messages`。 |
| `DEEPSEEK_SEARCH_MODEL` | `deepseek-v4-flash` | Messages 兼容模式使用的模型。 |
| `DEEPSEEK_SEARCH_MAX_TOKENS` | `4096` | Messages 兼容模式的最大输出 token。 |
| `DEEPSEEK_SEARCH_MAX_USES` | `5` | 单次 Messages 请求最多执行的搜索次数。 |
| `DEEPSEEK_SEARCH_COUNT` | `10` | 默认返回来源总量，1 到 50。 |
| `DEEPSEEK_MAX_QUERIES` | `10` | 单次 `web_search` 最多查询数，1 到 20。 |
| `DEEPSEEK_SEARCH_REQUESTS_PER_SECOND` | `5` | 本进程 Search 请求限速。 |
| `DEEPSEEK_HTTP_TIMEOUT_MS` | `30000` | 单次网络请求及限速等待的超时。 |
| `DEEPSEEK_SEARCH_SUMMARY_MAX_CHARS` | `800` | 每个来源摘要的字符上限。 |
| `DEEPSEEK_FETCH_MAX_OUTPUT_CHARS` | `200000` | 单次抓取返回内容上限。 |

自定义代理地址只接受 `http(s)`，且不能把密钥嵌入 URL。API Key 必须是裸 ASCII 字符串，不能包含引号、空格或换行。

## 与 Harness 的对应关系

| Harness | 本项目 |
|---|---|
| `web_search` | MCP `web_search` |
| `web_fetch` | MCP `web_fetch` |
| `web-deepseek-api.searchBaseURL` | `DEEPSEEK_SEARCH_API_BASE_URL` |
| `web-deepseek-api.fetchBaseURL` | `DEEPSEEK_FETCH_API_BASE_URL` |
| `web-search-deepseek.baseURL` | `DEEPSEEK_MESSAGES_BASE_URL` |
| `web-search-deepseek.model` | `DEEPSEEK_SEARCH_MODEL` |
| `web-search-deepseek.maxUses` | `DEEPSEEK_SEARCH_MAX_USES` |

Messages 兼容模式每次搜索都会产生一次完整模型调用的延迟与 token，成本和延迟都高于新版 Search API。只有自定义网关不提供 `/v1/tools/search` 时才建议使用。

## 开发

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm pack
```

测试使用本地模拟 DeepSeek 服务，覆盖 Search、Fetch、Messages 解析和真实 MCP stdio 往返。
