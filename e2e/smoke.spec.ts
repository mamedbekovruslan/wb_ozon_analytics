import { expect, test } from '@playwright/test'

// Дымовой сценарий: приложение собирается, открывается в браузере и достаёт данные
// из фейкового backend. Spec 001 AC-28 (корень → дашборд, фейковый API отвечает) теперь
// проверяется через настоящий контент страницы (spec 004 AC-3): заголовок «Дашборд»
// и KPI с числами вместо временной строки «Фейковый API: работает».
test('AC-3 (spec 004), AC-28 (spec 001): корень перенаправляет на дашборд, KPI показывают числа из фейкового API', async ({
  page,
}) => {
  const requestedPaths: string[] = []
  page.on('request', (request) => {
    requestedPaths.push(new URL(request.url()).pathname)
  })
  // Ответ MSW приходит из Service Worker — Playwright видит его как обычный ответ страницы
  const metaResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/meta')
  const kpiResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/kpi')

  await page.goto('/')

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Дашборд' })).toBeVisible()
  expect((await metaResponse).status()).toBe(200)
  expect((await kpiResponse).status()).toBe(200)

  // Первая генерация данных в браузере может занять несколько секунд
  const cards = page.getByRole('region', { name: 'Ключевые показатели' }).getByRole('article')
  await expect(cards).toHaveCount(8, { timeout: 15_000 })
  const revenue = cards.filter({ has: page.getByRole('heading', { level: 3, name: 'Выручка', exact: true }) })
  await expect(revenue).toContainText(/\d/)

  // Временного содержимого больше нет
  await expect(page.getByText(/Фейковый API/)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Аналитика продавца WB + Ozon' })).toHaveCount(0)
  expect(requestedPaths).not.toContain('/api/health')
})
