import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    config: 'src/config.ts',
    deepseek: 'src/deepseek.ts',
    search: 'src/search.ts',
    fetch: 'src/fetch.ts',
    server: 'src/server.ts',
  },
  format: ['esm'],
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: {
    sourcemap: true,
  },
  deps: {
    neverBundle: true,
  },
  outExtensions: () => ({ js: '.js' }),
})
