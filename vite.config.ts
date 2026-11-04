/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Большинство будущих тестов — компоненты, поэтому jsdom по умолчанию;
    // тесты без DOM помечаются `// @vitest-environment node`
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // e2e/ — сценарии Playwright, Vitest их не запускает
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
