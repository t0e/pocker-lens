import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'forks',
    forceExit: true,
    teardownTimeout: 0,
    testTimeout: 10000,
    hookTimeout: 10000,
    reporters: ['verbose'],
  },
})
