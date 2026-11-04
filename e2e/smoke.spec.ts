import { expect, test } from '@playwright/test'

// Дымовой сценарий: приложение собирается, открывается в браузере и
// достаёт данные из фейкового backend. Проверка /api/health временная —
// уйдёт вместе с эндпоинтом в фиче 1 (docs/roadmap.md).
test('корень перенаправляет на дашборд, фейковый API отвечает', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Аналитика продавца WB + Ozon' })).toBeVisible()
  await expect(page.getByText('работает')).toBeVisible()
})
