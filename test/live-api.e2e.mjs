import assert from 'node:assert/strict'
import test from 'node:test'

import { loadConfig } from '../dist/config.js'
import { DeepSeekClient } from '../dist/deepseek.js'
import { loadLocalEnv } from '../dist/env.js'

loadLocalEnv()

const hasApiKey = (process.env.DEEPSEEK_API_KEY?.trim().length ?? 0) > 0
const skip = hasApiKey ? false : 'DEEPSEEK_API_KEY is not configured in .env or the process environment'

test('live DeepSeek Search API returns a valid result shape', { skip }, async () => {
  const client = new DeepSeekClient(loadConfig())
  const result = await client.search('DeepSeek API documentation', 3, 'Where is the DeepSeek API documentation?')
  assert.ok(Array.isArray(result.sources))
  assert.ok(result.sources.every((source) => source.url.startsWith('http')))
})

test('live DeepSeek Fetch API returns page content', { skip }, async () => {
  const client = new DeepSeekClient(loadConfig())
  const result = await client.fetch('https://api-docs.deepseek.com/guides/search')
  assert.equal(result.url, 'https://api-docs.deepseek.com/guides/search')
  assert.ok(result.content.trim().length > 0)
})
