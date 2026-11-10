import type { DeepSeekClient } from './deepseek.js'
import { EXTERNAL_WEB_CONTENT_NOTICE } from './search.js'

export type FetchToolOutput = {
  url: string
  title?: string
  content: string
  truncated: boolean
}

export async function runFetch(
  client: DeepSeekClient,
  url: string,
  maxOutputChars: number,
  signal: AbortSignal | undefined,
): Promise<{ output: FetchToolOutput; text: string }> {
  const normalized = validateFetchUrl(url)
  const result = await client.fetch(normalized, signal)
  const header = `Fetched ${result.url}\n\n${EXTERNAL_WEB_CONTENT_NOTICE}\n\n`
  const footer = '\n\n(Content truncated. Fetch a more specific URL or section for the full text.)'
  const available = Math.max(0, maxOutputChars - header.length - footer.length)
  const contentCharacters = Array.from(result.content)
  const contentTruncated = contentCharacters.length > available
  const boundedContent = contentTruncated
    ? contentCharacters.slice(0, available).join('')
    : result.content
  const truncated = result.truncated || contentTruncated
  const text = `${header}${boundedContent}${truncated ? footer : ''}`

  return {
    output: {
      url: result.url,
      ...result.title === undefined ? {} : { title: result.title },
      content: boundedContent,
      truncated,
    },
    text,
  }
}

function validateFetchUrl(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new Error('url must be a non-empty string')
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('url must be an absolute http(s) URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('url must use http or https')
  }
  return trimmed
}
