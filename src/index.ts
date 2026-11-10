#!/usr/bin/env node

import { loadConfig, PACKAGE_NAME, PACKAGE_VERSION, publicConfig } from './config.js'
import { loadLocalEnv } from './env.js'
import { runStdioServer } from './server.js'

loadLocalEnv()

const args = process.argv.slice(2)

if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(`${PACKAGE_VERSION}\n`)
} else if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(helpText())
} else if (args.includes('--check')) {
  try {
    process.stdout.write(`${JSON.stringify(publicConfig(loadConfig()), null, 2)}\n`)
  } catch (error: unknown) {
    process.stderr.write(`${PACKAGE_NAME}: ${errorText(error)}\n`)
    process.exitCode = 1
  }
} else if (args.length > 0) {
  process.stderr.write(`${PACKAGE_NAME}: unknown argument ${JSON.stringify(args[0])}\n\n${helpText()}`)
  process.exitCode = 2
} else {
  runStdioServer().catch((error: unknown) => {
    process.stderr.write(`${PACKAGE_NAME}: failed to start: ${errorText(error)}\n`)
    process.exitCode = 1
  })
}

function helpText(): string {
  return `${PACKAGE_NAME} ${PACKAGE_VERSION}

Usage:
  npx -y ${PACKAGE_NAME}
  npx -y ${PACKAGE_NAME} --check

The default mode starts an MCP stdio server exposing web_search and web_fetch.
Set DEEPSEEK_API_KEY in the MCP server environment or the working directory's .env file.

Options:
  -h, --help       Show this help.
  -v, --version    Print the package version.
  --check          Print sanitized resolved configuration without network calls.
`
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
