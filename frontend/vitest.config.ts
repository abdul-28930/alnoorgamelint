import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  esbuild: { jsx: 'automatic' }, // components use the new JSX transform (no React import)
  test: { include: ['server/**/*.test.ts', 'lib/**/*.test.ts', 'components/**/*.test.ts'], environment: 'node' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // `server-only` throws outside Next's bundler; tests use an empty stub.
      'server-only': path.resolve(__dirname, 'server/__tests__/server-only-stub.ts'),
    },
  },
})
