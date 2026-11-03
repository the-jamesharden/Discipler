import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // The runtime Next compiles JSX for, so a test can render a component as the app does.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Integration tests share one local Postgres. Running files in parallel
    // against it makes isolation failures look like flakes, so they are serialised.
    fileParallelism: false,
  },
})
