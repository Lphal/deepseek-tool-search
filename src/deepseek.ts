import { z } from 'zod'

import type { Config } from './config.js'

export interface SearchSource {
  url: string
  title?: string
  snippet?: string
  summary?: string
  publishedAt?: string
}

export interface SearchResult {
  sources: SearchSource[]
  truncated: boolean
}

export interface FetchResult {
  url: string
  title?: string
  content: string
  truncated: boolean
}

export type DeepSeekErrorCode =
  | 'MISSING_API_KEY'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'ABORTED'
  | 'TIMEOUT'
  | 'MESSAGES_NO_SEARCH_RESULTS'

export class DeepSeekError extends Error {
  override readonly name = 'DeepSeekError'

  constructor(
    message: string,
    readonly code: DeepSeekErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

const httpUrl = z.string().min(1).refine((value) => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}, 'Expected an absolute http(s) URL')

const DirectSearchItemSchema = z.object({
  title: z.string().default(''),
  url: httpUrl,
  snippet: z.string().default(''),
  summary: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
}).passthrough()

const DirectSearchResponseSchema = z.object({
  results: z.array(DirectSearchItemSchema),
}).passthrough()

const FetchResponseSchema = z.object({
  title: z.string().nullable().optional(),
  content: z.string(),
}).passthrough()

const MessagesResponseSchema = z.object({
  content: z.array(z.unknown()),
}).passthrough()

const MessagesSearchBlockSchema = z.object({
  type: z.literal('web_search_tool_result'),
  content: z.array(z.object({
    type: z.literal('web_search_result'),
    url: httpUrl,
    title: z.string().nullable().optional(),
    page_age: z.string().nullable().optional(),
  }).passthrough()).optional(),
}).passthrough()

const MessagesTextBlockSchema = z.object({
  type: z.literal('text'),
  citations: z.array(z.object({
    url: z.string().nullable().optional(),
    cited_text: z.string().nullable().optional(),
  }).passthrough()).optional(),
}).passthrough()

interface RequestJsonOptions {
  endpoint: string
  body: object
  subject: 'Search' | 'Fetch'
  signal?: AbortSignal
  messages?: boolean
  rateLimited?: boolean
}

/**
 * Thin DeepSeek adapter. It owns only the wire contract, validation, pacing,
 * cancellation, and safe error projection; MCP presentation lives elsewhere.
 */
export class DeepSeekClient {
  private readonly limiter: RateLimiter

  constructor(
    private readonly config: Config,
    limiter = new RateLimiter(config.requestsPerSecond),
  ) {
    this.limiter = limiter
  }

  async search(
    query: string,
    count: number,
    originalQuestion?: string,
    signal?: AbortSignal,
  ): Promise<SearchResult> {
    return this.config.searchMode === 'messages'
      ? this.searchMessages(query, count, signal)
      : this.searchApi(query, count, originalQuestion, signal)
  }

  async fetch(url: string, signal?: AbortSignal): Promise<FetchResult> {
    const payload = await this.requestJson({
      endpoint: `${this.config.fetchApiBaseUrl}/fetch`,
      body: { url },
      subject: 'Fetch',
      signal,
    })
    const parsed = FetchResponseSchema.safeParse(payload)
    if (!parsed.success) {
      throw new DeepSeekError(
        'DeepSeek Fetch returned an invalid response body',
        'INVALID_RESPONSE',
        { cause: parsed.error },
      )
    }
    return {
      url,
      ...nonEmpty(parsed.data.title) === undefined ? {} : { title: parsed.data.title!.trim() },
      content: parsed.data.content,
      truncated: false,
    }
  }

  private async searchApi(
    query: string,
    count: number,
    originalQuestion: string | undefined,
    signal?: AbortSignal,
  ): Promise<SearchResult> {
    const question = boundedQuestion(originalQuestion)
    const payload = await this.requestJson({
      endpoint: `${this.config.searchApiBaseUrl}/search`,
      body: {
        query,
        count,
        need_content: false,
        ...question === undefined ? {} : { ori_question: question },
      },
      subject: 'Search',
      signal,
      rateLimited: true,
    })
    const parsed = DirectSearchResponseSchema.safeParse(payload)
    if (!parsed.success) {
      throw new DeepSeekError(
        'DeepSeek Search returned an invalid response body',
        'INVALID_RESPONSE',
        { cause: parsed.error },
      )
    }
    return projectSources(parsed.data.results.map((item) => ({
      url: item.url,
      ...item.title.length > 0 ? { title: item.title } : {},
      ...item.snippet.length > 0 ? { snippet: item.snippet } : {},
      ...nonEmpty(item.summary) === undefined ? {} : { summary: item.summary!.trim() },
      ...nonEmpty(item.date) === undefined ? {} : { publishedAt: item.date!.trim() },
    })), count)
  }

  private async searchMessages(
    query: string,
    count: number,
    signal?: AbortSignal,
  ): Promise<SearchResult> {
    const payload = await this.requestJson({
      endpoint: `${this.config.messagesBaseUrl}/messages`,
      body: {
        model: this.config.searchModel,
        max_tokens: this.config.searchMaxTokens,
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: `Perform a web search for the query: ${query}` }],
        }],
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: this.config.searchMaxUses,
        }],
        thinking: { type: 'disabled' },
      },
      subject: 'Search',
      signal,
      messages: true,
      rateLimited: true,
    })
    return projectMessagesResponse(payload, count)
  }

  private async requestJson(options: RequestJsonOptions): Promise<unknown> {
    const apiKey = requireValidApiKey(this.config.apiKey)
    const timeout = timeoutSignal(options.signal, this.config.requestTimeoutMs)
    try {
      if (options.rateLimited === true) await this.limiter.wait(timeout.signal)
      throwIfAborted(options.signal, timeout.timedOut())

      let response: Response
      try {
        response = await globalThis.fetch(options.endpoint, {
          method: 'POST',
          redirect: 'error',
          headers: {
            'authorization': `Bearer ${apiKey}`,
            ...options.messages === true ? { 'x-api-key': apiKey } : {},
            ...options.messages === true ? { 'anthropic-version': this.config.anthropicVersion } : {},
            'content-type': 'application/json',
            'accept': 'application/json',
            'user-agent': this.config.userAgent,
          },
          body: JSON.stringify(options.body),
          signal: timeout.signal,
        })
      } catch (error: unknown) {
        throwIfAborted(options.signal, timeout.timedOut(), error)
        throw new DeepSeekError(
          `${options.subject} request failed at ${options.endpoint}: ${safeErrorText(error)}`,
          'HTTP_ERROR',
          { cause: error },
        )
      }

      const body = await readResponseBody(response, options.signal, timeout.timedOut())
      if (!response.ok) {
        const detail = errorDetail(body)
        throw new DeepSeekError(
          `${options.subject} request failed at ${options.endpoint} with HTTP ${response.status}`
            + `${detail === undefined ? '' : `: ${detail}`}`,
          'HTTP_ERROR',
        )
      }
      try {
        return JSON.parse(body) as unknown
      } catch (error: unknown) {
        if (options.signal?.aborted === true || timeout.timedOut()) {
          throwIfAborted(options.signal, timeout.timedOut(), error)
        }
        throw new DeepSeekError(
          `${options.subject} returned a response that was not valid JSON`,
          'INVALID_RESPONSE',
          { cause: error },
        )
      }
    } finally {
      timeout.cleanup()
    }
  }
}

class RateLimiter {
  private readonly starts: number[] = []

  constructor(private readonly requestsPerSecond: number) {}

  async wait(signal?: AbortSignal): Promise<void> {
    for (;;) {
      if (signal?.aborted === true) throw abortError(signal)
      const now = performance.now()
      while (this.starts[0] !== undefined && this.starts[0] < now - 1000) this.starts.shift()
      const oldest = this.starts[0]
      if (oldest === undefined || this.starts.length < this.requestsPerSecond) {
        this.starts.push(now)
        return
      }
      await delay(oldest + 1001 - now, signal)
    }
  }
}

function projectMessagesResponse(payload: unknown, count: number): SearchResult {
  const parsed = MessagesResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new DeepSeekError(
      'DeepSeek Messages returned an invalid response body',
      'INVALID_RESPONSE',
      { cause: parsed.error },
    )
  }

  const snippets = new Map<string, string>()
  const items: Array<{ url: string; title?: string; publishedAt?: string }> = []
  let foundSearchBlock = false

  for (const block of parsed.data.content) {
    const textBlock = MessagesTextBlockSchema.safeParse(block)
    if (textBlock.success) {
      for (const citation of textBlock.data.citations ?? []) {
        if (citation.url !== null && citation.url !== undefined
          && citation.cited_text !== null && citation.cited_text !== undefined
          && !snippets.has(citation.url)) {
          snippets.set(citation.url, citation.cited_text)
        }
      }
      continue
    }

    const resultBlock = MessagesSearchBlockSchema.safeParse(block)
    if (!resultBlock.success) continue
    foundSearchBlock = true
    for (const item of resultBlock.data.content ?? []) {
      items.push({
        url: item.url,
        ...nonEmpty(item.title) === undefined ? {} : { title: item.title!.trim() },
        ...nonEmpty(item.page_age) === undefined ? {} : { publishedAt: item.page_age!.trim() },
      })
    }
  }

  if (!foundSearchBlock) {
    throw new DeepSeekError(
      'DeepSeek Messages returned no web_search_tool_result block; native web search may not have run',
      'MESSAGES_NO_SEARCH_RESULTS',
    )
  }

  return projectSources(items.map((item) => ({
    ...item,
    ...nonEmpty(snippets.get(item.url)) === undefined ? {} : { snippet: snippets.get(item.url)! },
  })), count)
}

function projectSources(sources: SearchSource[], count: number): SearchResult {
  const deduplicated: SearchSource[] = []
  const seen = new Set<string>()
  for (const source of sources) {
    if (seen.has(source.url)) continue
    seen.add(source.url)
    deduplicated.push(source)
  }
  return {
    sources: deduplicated.slice(0, count),
    truncated: deduplicated.length > count,
  }
}

function requireValidApiKey(apiKey: string | undefined): string {
  if (apiKey === undefined) {
    throw new DeepSeekError(
      'DEEPSEEK_API_KEY is not configured. Add it to the MCP server environment and restart the server.',
      'MISSING_API_KEY',
    )
  }
  if (!/^[\x21-\x7e]+$/u.test(apiKey)) {
    throw new DeepSeekError(
      'DEEPSEEK_API_KEY contains whitespace, control characters, or non-ASCII text. '
        + 'Set it to the raw DeepSeek API key without quotes or newlines.',
      'MISSING_API_KEY',
    )
  }
  return apiKey
}

function boundedQuestion(question: string | undefined): string | undefined {
  const collapsed = question?.replace(/\s+/gu, ' ').trim() ?? ''
  if (collapsed.length === 0) return undefined
  return Array.from(collapsed).slice(0, 128).join('')
}

function timeoutSignal(parent: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal
  timedOut: () => boolean
  cleanup: () => void
} {
  const controller = new AbortController()
  let didTimeOut = false
  const timer = setTimeout(() => {
    didTimeOut = true
    controller.abort(new Error(`timed out after ${timeoutMs}ms`))
  }, timeoutMs)
  timer.unref()
  const signal = parent === undefined
    ? controller.signal
    : AbortSignal.any([parent, controller.signal])
  return {
    signal,
    timedOut: () => didTimeOut,
    cleanup: () => clearTimeout(timer),
  }
}

function throwIfAborted(
  callerSignal: AbortSignal | undefined,
  timedOut: boolean,
  cause?: unknown,
): void {
  if (callerSignal?.aborted === true) throw abortError(callerSignal, cause)
  if (timedOut) {
    throw new DeepSeekError(
      'DeepSeek request timed out',
      'TIMEOUT',
      cause === undefined ? undefined : { cause },
    )
  }
}

function abortError(signal: AbortSignal, cause?: unknown): DeepSeekError {
  return new DeepSeekError('DeepSeek request aborted by the MCP client', 'ABORTED', {
    cause: cause ?? signal.reason,
  })
}

async function readResponseBody(
  response: Response,
  callerSignal: AbortSignal | undefined,
  timedOut: boolean,
): Promise<string> {
  try {
    return await response.text()
  } catch (error: unknown) {
    throwIfAborted(callerSignal, timedOut || isAbortError(error), error)
    throw new DeepSeekError('Failed to read the DeepSeek response body', 'INVALID_RESPONSE', { cause: error })
  }
}

function errorDetail(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as unknown
    if (isRecord(parsed)) {
      if (typeof parsed.error === 'string') return truncate(parsed.error.trim(), 500)
      if (isRecord(parsed.error) && typeof parsed.error.message === 'string') {
        return truncate(parsed.error.message.trim(), 500)
      }
      if (typeof parsed.message === 'string') return truncate(parsed.message.trim(), 500)
    }
  } catch {
    // Fall through to the bounded plain-text detail.
  }
  const fallback = body.trim()
  return fallback.length === 0 ? undefined : truncate(fallback.replace(/\s+/gu, ' '), 500)
}

function safeErrorText(error: unknown): string {
  if (isAbortError(error)) return 'the request was interrupted'
  return truncate(error instanceof Error ? error.message : String(error), 500)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmpty(value: string | null | undefined): string | undefined {
  const result = value?.trim()
  return result === undefined || result.length === 0 ? undefined : result
}

function truncate(value: string, maxChars: number): string {
  const characters = Array.from(value)
  return characters.length <= maxChars ? value : `${characters.slice(0, maxChars - 1).join('')}\u2026`
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(abortError(signal))
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(abortError(signal!))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
