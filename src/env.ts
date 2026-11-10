import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

let loadedPath: string | undefined

/**
 * Load the working directory's ignored `.env` before resolving configuration.
 * Existing process environment variables take precedence over file values.
 */
export function loadLocalEnv(path = resolve(process.cwd(), '.env')): void {
  if (loadedPath === path) return
  try {
    loadEnvFile(path)
    loadedPath = path
  } catch (error: unknown) {
    if (isMissingFile(error)) return
    throw error
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT'
}
