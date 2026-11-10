import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

async function startMockDeepSeek() {
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    if (request.url === '/v1/tools/search') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        results: [{
          title: 'MCP',
          url: 'https://modelcontextprotocol.io/',
          snippet: 'Model Context Protocol',
          date: null,
        }],
      }))
      return
    }
    if (request.url === '/v1/tools/fetch') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ title: 'MCP', content: '# Model Context Protocol' }))
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { message: 'not found' } }))
  })
  server.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error))
    }),
  }
}

function cleanEnvironment(extra) {
  return Object.fromEntries(
    Object.entries({ ...process.env, ...extra })
      .filter((entry) => entry[1] !== undefined),
  )
}

test('the built npx entry speaks MCP stdio and calls search/fetch tools', async () => {
  const mock = await startMockDeepSeek()
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    cwd: process.cwd(),
    env: cleanEnvironment({
      DEEPSEEK_API_KEY: 'sk-mcp-test',
      DEEPSEEK_SEARCH_API_BASE_URL: `${mock.baseUrl}/v1/tools`,
      DEEPSEEK_FETCH_API_BASE_URL: `${mock.baseUrl}/v1/tools`,
      DEEPSEEK_SEARCH_REQUESTS_PER_SECOND: '50',
      DEEPSEEK_HTTP_TIMEOUT_MS: '5000',
    }),
    stderr: 'pipe',
  })
  const client = new Client({ name: 'deepseek-tool-search-test', version: '1.0.0' })
  try {
    await client.connect(transport)
    const tools = await client.listTools()
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ['web_fetch', 'web_search'])

    const search = await client.callTool({
      name: 'web_search',
      arguments: { queries: ['model context protocol'] },
    })
    assert.equal(search.isError, undefined)
    assert.equal(search.structuredContent.results[0].title, 'MCP')
    assert.match(search.content[0].text, /Cite the relevant URLs/)

    const fetch = await client.callTool({
      name: 'web_fetch',
      arguments: { url: 'https://modelcontextprotocol.io/' },
    })
    assert.equal(fetch.isError, undefined)
    assert.equal(fetch.structuredContent.content, '# Model Context Protocol')
    assert.match(fetch.content[0].text, /External web content follows/)
  } finally {
    await client.close()
    await mock.close()
  }
})

test('a missing API key is returned as a discoverable tool error', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    cwd: process.cwd(),
    env: cleanEnvironment({
      DEEPSEEK_API_KEY: '',
    }),
    stderr: 'pipe',
  })
  const client = new Client({ name: 'deepseek-tool-search-missing-key-test', version: '1.0.0' })
  try {
    await client.connect(transport)
    const result = await client.callTool({
      name: 'web_search',
      arguments: { queries: ['missing key'] },
    })
    assert.equal(result.isError, true)
    assert.match(result.content[0].text, /MISSING_API_KEY/)
    assert.match(result.content[0].text, /DEEPSEEK_API_KEY/)
  } finally {
    await client.close()
  }
})
