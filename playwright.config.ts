import { defineConfig } from '@playwright/test'

const PORT = 4173

// E2E гоняются по собранной версии (как на Vercel), а не по dev-серверу:
// так проверяется то, что увидит пользователь, включая MSW в production-сборке
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
    {
      // Минимальная ширина из AGENTS.md — 375 px
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Всегда свежая сборка: уже запущенный preview мог отдавать старый dist.
    // Если порт занят, --strictPort остановит запуск с понятной ошибкой
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
