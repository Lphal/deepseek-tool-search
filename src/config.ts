export const PACKAGE_NAME = '@lphal/deepseek-tool-search'
export const PACKAGE_VERSION = '0.2.2-rc.2'

export const DEEPSEEK_DEFAULT_SEARCH_API_BASE_URL = 'https://api.deepseek.com/v1/tools'
export const DEEPSEEK_DEFAULT_MESSAGES_BASE_URL = 'https://api.deepseek.com/anthropic/v1'
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash'
export const DEEPSEEK_DEFAULT_API_VERSION = '2023-06-01'

export type SearchMode = 'api' | 'messages'

export interface Config {
  apiKey: string | undefined
  searchMode: SearchMode
  searchApiBaseUrl: string
  fetchApiBaseUrl: string
  messagesBaseUrl: string
  searchModel: string
  anthropicVersion: string
  searchMaxTokens: number
  searchMaxUses: number
  searchCount: number
  maxQueries: number
  requestsPerSecond: number
  requestTimeoutMs: number
  summaryMaxChars: number
  fetchMaxOutputChars: number
  userAgent: string
}

export interface PublicConfig {
  apiKeyConfigured: boolean
  searchMode: SearchMode
  searchApiBaseUrl: string
  fetchApiBaseUrl: string
  messagesBaseUrl: string
  searchModel: string
  searchMaxTokens: number
  searchMaxUses: number
  searchCount: number
  maxQueries: number
  requestsPerSecond: number
  requestTimeoutMs: number
  summaryMaxChars: number
  fetchMaxOutputChars: number
  nodeVersion: string
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError'
}

/**
 * Read configuration from an environment mapping. Invalid endpoints and numeric
 * limits fail at startup; a missing API key is allowed so MCP discovery still
 * works and the eventual tool call can explain how to configure the key.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = trimmed(env.DEEPSEEK_API_KEY)
  return {
    apiKey,
    searchMode: parseSearchMode(env.DEEPSEEK_SEARCH_MODE),
    searchApiBaseUrl: parseHttpBaseUrl(
      env.DEEPSEEK_SEARCH_API_BASE_URL,
      DEEPSEEK_DEFAULT_SEARCH_API_BASE_URL,
      'DEEPSEEK_SEARCH_API_BASE_URL',
    ),
    fetchApiBaseUrl: parseHttpBaseUrl(
      env.DEEPSEEK_FETCH_API_BASE_URL,
      DEEPSEEK_DEFAULT_SEARCH_API_BASE_URL,
      'DEEPSEEK_FETCH_API_BASE_URL',
    ),
    messagesBaseUrl: parseHttpBaseUrl(
      env.DEEPSEEK_MESSAGES_BASE_URL,
      DEEPSEEK_DEFAULT_MESSAGES_BASE_URL,
      'DEEPSEEK_MESSAGES_BASE_URL',
    ),
    searchModel: nonEmpty(env.DEEPSEEK_SEARCH_MODEL) ?? DEEPSEEK_DEFAULT_MODEL,
    anthropicVersion: nonEmpty(env.DEEPSEEK_ANTHROPIC_VERSION) ?? DEEPSEEK_DEFAULT_API_VERSION,
    searchMaxTokens: positiveInteger(env.DEEPSEEK_SEARCH_MAX_TOKENS, 4096, 1, 65536, 'DEEPSEEK_SEARCH_MAX_TOKENS'),
    searchMaxUses: positiveInteger(env.DEEPSEEK_SEARCH_MAX_USES, 5, 1, 20, 'DEEPSEEK_SEARCH_MAX_USES'),
    searchCount: positiveInteger(env.DEEPSEEK_SEARCH_COUNT, 10, 1, 50, 'DEEPSEEK_SEARCH_COUNT'),
    maxQueries: positiveInteger(env.DEEPSEEK_MAX_QUERIES, 10, 1, 20, 'DEEPSEEK_MAX_QUERIES'),
    requestsPerSecond: positiveInteger(env.DEEPSEEK_SEARCH_REQUESTS_PER_SECOND, 5, 1, 50, 'DEEPSEEK_SEARCH_REQUESTS_PER_SECOND'),
    requestTimeoutMs: positiveInteger(env.DEEPSEEK_HTTP_TIMEOUT_MS, 30_000, 1_000, 300_000, 'DEEPSEEK_HTTP_TIMEOUT_MS'),
    summaryMaxChars: positiveInteger(env.DEEPSEEK_SEARCH_SUMMARY_MAX_CHARS, 800, 100, 10_000, 'DEEPSEEK_SEARCH_SUMMARY_MAX_CHARS'),
    fetchMaxOutputChars: positiveInteger(
      env.DEEPSEEK_FETCH_MAX_OUTPUT_CHARS,
      200_000,
      1_000,
      1_000_000,
      'DEEPSEEK_FETCH_MAX_OUTPUT_CHARS',
    ),
    userAgent: nonEmpty(env.DEEPSEEK_MCP_USER_AGENT) ?? `${PACKAGE_NAME}/${PACKAGE_VERSION}`,
  }
}

export function publicConfig(config: Config): PublicConfig {
  return {
    apiKeyConfigured: config.apiKey !== undefined,
    searchMode: config.searchMode,
    searchApiBaseUrl: config.searchApiBaseUrl,
    fetchApiBaseUrl: config.fetchApiBaseUrl,
    messagesBaseUrl: config.messagesBaseUrl,
    searchModel: config.searchModel,
    searchMaxTokens: config.searchMaxTokens,
    searchMaxUses: config.searchMaxUses,
    searchCount: config.searchCount,
    maxQueries: config.maxQueries,
    requestsPerSecond: config.requestsPerSecond,
    requestTimeoutMs: config.requestTimeoutMs,
    summaryMaxChars: config.summaryMaxChars,
    fetchMaxOutputChars: config.fetchMaxOutputChars,
    nodeVersion: process.version,
  }
}

function parseSearchMode(value: string | undefined): SearchMode {
  const normalized = nonEmpty(value)?.toLowerCase() ?? 'api'
  if (normalized === 'api') return 'api'
  if (normalized === 'messages' || normalized === 'legacy') return 'messages'
  throw new ConfigError('DEEPSEEK_SEARCH_MODE must be "api" or "messages"')
}

function parseHttpBaseUrl(value: string | undefined, fallback: string, name: string): string {
  const raw = nonEmpty(value) ?? fallback
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new ConfigError(`${name} must be an absolute http(s) URL`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError(`${name} must use http or https`)
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new ConfigError(`${name} must not contain embedded credentials; use DEEPSEEK_API_KEY`)
  }
  return raw.replace(/\/+$/u, '')
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  const raw = nonEmpty(value)
  if (raw === undefined) return fallback
  if (!/^\d+$/u.test(raw)) throw new ConfigError(`${name} must be an integer from ${min} to ${max}`)
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ConfigError(`${name} must be an integer from ${min} to ${max}`)
  }
  return parsed
}

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim()
  return result === undefined || result.length === 0 ? undefined : result
}

function nonEmpty(value: string | undefined): string | undefined {
  return trimmed(value)
}
