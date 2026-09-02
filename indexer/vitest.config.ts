import { defineConfig } from 'vitest/config'

const integration = process.env.INTEGRATION === '1'

export default defineConfig({
  test: {
    include: integration ? ['test/**/*.test.ts'] : ['test/**/*.test.ts'],
    exclude: integration
      ? ['**/node_modules/**']
      : ['**/node_modules/**', 'test/integration/**'],
    testTimeout: integration ? 600_000 : 10_000,
    hookTimeout: 60_000,
    environment: 'node',
  },
})
