import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

test('--check reports sanitized configuration without a network call', () => {
  const result = spawnSync(process.execPath, ['dist/index.js', '--check'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: 'sk-do-not-print',
      DEEPSEEK_SEARCH_MODE: 'api',
    },
  })
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.equal(output.apiKeyConfigured, true)
  assert.equal(output.searchMode, 'api')
  assert.equal(result.stdout.includes('sk-do-not-print'), false)
})

test('--help and --version do not start a stdio server', () => {
  const help = spawnSync(process.execPath, ['dist/index.js', '--help'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.equal(help.status, 0)
  assert.match(help.stdout, /web_search and web_fetch/)

  const version = spawnSync(process.execPath, ['dist/index.js', '--version'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.equal(version.status, 0)
  assert.match(version.stdout, /^0\.2\.2-rc\.1/)
})

test('the CLI loads DEEPSEEK_API_KEY from the working directory .env', () => {
  const directory = mkdtempSync(join(tmpdir(), 'deepseek-tool-search-'))
  const env = { ...process.env }
  delete env.DEEPSEEK_API_KEY
  try {
    writeFileSync(join(directory, '.env'), 'DEEPSEEK_API_KEY=sk-from-dotenv\n')
    const result = spawnSync(process.execPath, [resolve('dist/index.js'), '--check'], {
      cwd: directory,
      encoding: 'utf8',
      env,
    })
    assert.equal(result.status, 0, result.stderr)
    const output = JSON.parse(result.stdout)
    assert.equal(output.apiKeyConfigured, true)
    assert.equal(result.stdout.includes('sk-from-dotenv'), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
