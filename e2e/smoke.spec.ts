import { expect, test } from '@playwright/test'

// Дымовой сценарий: приложение собирается, открывается в браузере и
// достаёт данные из фейкового backend. С фичи 1 (AC-28) проверка идёт
// через /api/meta; временный /api/health удалён.
test('AC-28: корень перенаправляет на дашборд, фейковый API отвечает через /api/meta', async ({ page }) => {
  const requestedPaths: string[] = []
  page.on('request', (request) => {
    requestedPaths.push(new URL(request.url()).pathname)
  })
  // Ответ MSW приходит из Service Worker — Playwright видит его как обычный ответ страницы
  const metaResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/meta')

  await page.goto('/')

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Аналитика продавца WB + Ozon' })).toBeVisible()
  expect((await metaResponse).status()).toBe(200)
  // Первая генерация данных в браузере может занять несколько секунд
  await expect(page.getByText('работает')).toBeVisible({ timeout: 15_000 })
  expect(requestedPaths).not.toContain('/api/health')
})
