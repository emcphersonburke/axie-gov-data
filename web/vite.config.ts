import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const srcDir = path.resolve(rootDir, 'src')
const stylesDir = path.resolve(srcDir, 'styles')

/**
 * Prepend the shared SCSS partials to every stylesheet so components can use
 * `$variables` and `@include mixins` without importing them. The partials
 * themselves are skipped (they would otherwise `@use` themselves).
 */
function scssAdditionalData(source: string, filename: string): string {
  const dir = path.dirname(filename)
  if (dir === stylesDir && path.basename(filename).startsWith('_'))
    return source
  let rel = path.relative(dir, stylesDir).split(path.sep).join('/')
  if (rel === '') rel = '.'
  else if (!rel.startsWith('.')) rel = `./${rel}`
  return `@use "${rel}/variables" as *;\n@use "${rel}/mixins" as *;\n${source}`
}

/** Dev-only: serve the synthetic fixture where the SPA expects the indexer's snapshot. */
function devFixturePlugin(): Plugin {
  const fixturePath = path.resolve(rootDir, 'fixtures/dashboard.json')
  return {
    name: 'axie:dev-fixture',
    apply: 'serve',
    configureServer(server) {
      if (process.env.DEV_DATA_PROXY) return
      server.middlewares.use('/data/dashboard.json', (_req, res, next) => {
        readFile(fixturePath).then(
          (body) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.setHeader('Cache-Control', 'no-cache')
            res.end(body)
          },
          () => next(),
        )
      })
    },
  }
}

const packageName = (id: string): string | undefined =>
  id.match(
    /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/,
  )?.[1]

function manualChunks(id: string): string | undefined {
  const pkg = packageName(id)
  if (!pkg) return undefined
  if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler')
    return 'react'
  if (
    /^(pixi\.js|@pixi\/.+|pixi-spine|@pixi-spine\/.+|@axieinfinity\/.+|bn\.js)$/.test(
      pkg,
    )
  )
    return 'terrarium'
  // lodash is shared by @nivo/core and the mixer; keep it in the eager group.
  if (/^(@nivo\/.+|d3-.+|@react-spring\/.+|lodash)$/.test(pkg)) return 'nivo'
  return undefined
}

const dataProxy = process.env.DEV_DATA_PROXY

export default defineConfig({
  plugins: [react(), devFixturePlugin()],
  resolve: {
    alias: { '~': srcDir },
  },
  css: {
    preprocessorOptions: {
      scss: { additionalData: scssAdditionalData },
    },
  },
  server: {
    proxy: dataProxy
      ? { '/data': { target: dataProxy, changeOrigin: true, secure: true } }
      : undefined,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: { manualChunks },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
