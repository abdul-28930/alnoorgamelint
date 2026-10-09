import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: { include: ['server/**/*.test.ts', 'lib/**/*.test.ts'], environment: 'node' },
  resolve: {
    alias: {
      // `server-only` throws outside Next's bundler; tests use an empty stub.
      'server-only': path.resolve(__dirname, 'server/__tests__/server-only-stub.ts'),
    },
  },
})
