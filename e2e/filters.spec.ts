import { expect, test, type Page } from '@playwright/test'

/*
 * Spec 002 «Фильтры в URL» — сценарии в настоящем браузере.
 * Даты здесь зависят от реального «сегодня», поэтому проверяются только
 * параметры URL, состояние кнопок и форма сводки, но не конкретные числа.
 */

// Первая генерация данных в браузере может занять несколько секунд
const META_TIMEOUT = 15_000

/** Параметры текущего адреса, отсортированные по ключу (порядок повторов cat сохраняется). */
function sortedParams(page: Page): [string, string][] {
  return [...new URL(page.url()).searchParams].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

function pathname(page: Page): string {
  return new URL(page.url()).pathname
}

test.describe('Панель фильтров (десктоп)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 640, 'Панель — только на ширине ≥ 640 px')

  const panel = (page: Page) => page.getByRole('search', { name: 'Фильтры' })
  const preset = (page: Page, name: string) =>
    panel(page).getByRole('group', { name: 'Период' }).getByRole('button', { name, exact: true })
  const marketplace = (page: Page, name: string) =>
    panel(page).getByRole('group', { name: 'Маркетплейс' }).getByRole('button', { name, exact: true })
  const compare = (page: Page) => panel(page).getByRole('switch', { name: 'Сравнить с прошлым периодом' })
  const categories = (page: Page) => panel(page).getByRole('button', { name: /^Категории/ })

  test('AC-11: /?mp=wb → /dashboard?mp=wb', async ({ page }) => {
    await page.goto('/?mp=wb')

    await expect(page).toHaveURL(/\/dashboard\?mp=wb$/)
    await expect(marketplace(page, 'WB')).toHaveAttribute('aria-pressed', 'true')
    await expect(marketplace(page, 'Все')).toHaveAttribute('aria-pressed', 'false')
  })

  test('AC-10: мусор удаляется заменой записи истории — «Назад» не возвращает грязный адрес', async ({ page }) => {
    await page.goto('/dashboard?period=30&mp=hack&cat=shoes&cat=shoes&cmp=yes')

    await expect(page).toHaveURL(/\/dashboard\?cat=shoes$/)

    await preset(page, '7 дней').click()
    await expect.poll(() => sortedParams(page)).toEqual([
      ['cat', 'shoes'],
      ['period', '7'],
    ])

    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard\?cat=shoes$/)
    await expect(preset(page, '30 дней')).toHaveAttribute('aria-pressed', 'true')
  })

  test('AC-12: клики пишут URL новыми записями, «Назад» возвращает прошлые фильтры и состояние панели', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    await expect(preset(page, '30 дней')).toHaveAttribute('aria-pressed', 'true')

    await preset(page, '7 дней').click()
    await expect(page).toHaveURL(/\/dashboard\?period=7$/)

    await marketplace(page, 'WB').click()
    await expect.poll(() => sortedParams(page)).toEqual([
      ['mp', 'wb'],
      ['period', '7'],
    ])

    await compare(page).click()
    await expect.poll(() => sortedParams(page)).toEqual([
      ['cmp', '0'],
      ['mp', 'wb'],
      ['period', '7'],
    ])
    await expect(compare(page)).toHaveAttribute('aria-checked', 'false')

    await page.goBack()
    await expect.poll(() => sortedParams(page)).toEqual([
      ['mp', 'wb'],
      ['period', '7'],
    ])
    await expect(compare(page)).toHaveAttribute('aria-checked', 'true')

    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard\?period=7$/)
    await expect(marketplace(page, 'WB')).toHaveAttribute('aria-pressed', 'false')
    await expect(marketplace(page, 'Все')).toHaveAttribute('aria-pressed', 'true')
    await expect(preset(page, '7 дней')).toHaveAttribute('aria-pressed', 'true')

    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(preset(page, '30 дней')).toHaveAttribute('aria-pressed', 'true')
    await expect(preset(page, '7 дней')).toHaveAttribute('aria-pressed', 'false')
  })

  test('AC-12, AC-19: «Применить» в категориях пишет URL, «Назад» возвращает прежние категории', async ({ page }) => {
    await page.goto('/dashboard')

    await expect(categories(page)).toBeEnabled({ timeout: META_TIMEOUT })
    await categories(page).click()
    const categoryList = page.getByRole('group', { name: 'Категории', exact: true })
    await categoryList.getByRole('checkbox', { name: /^Спорт/ }).check()
    await categoryList.getByRole('checkbox', { name: /^Обувь/ }).check()
    // Черновик: URL пока прежний
    await expect(page).toHaveURL(/\/dashboard$/)

    await categoryList.getByRole('button', { name: 'Применить', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard\?cat=shoes&cat=sports$/)
    await expect(categories(page)).toContainText('Обувь, Спорт')

    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(categories(page)).toContainText('все')
  })

  test('AC-19: клик вне списка закрывает его без применения, фокус — на «Категории»', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(categories(page)).toBeEnabled({ timeout: META_TIMEOUT })

    await categories(page).click()
    const categoryList = page.getByRole('group', { name: 'Категории', exact: true })
    await categoryList.getByRole('checkbox', { name: /^Обувь/ }).check()
    // Клик в пустое место страницы ниже панели
    await page.mouse.click(700, 800)

    await expect(categoryList).toBeHidden()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(categories(page)).toBeFocused()
  })

  test('AC-14: перезагрузка и открытие ссылки в новой вкладке восстанавливают все фильтры', async ({
    page,
    context,
  }) => {
    const url = '/dashboard?period=q&mp=ozon&cat=shoes&cat=sports&cmp=0'

    const expectRestored = async (p: Page) => {
      await expect(preset(p, 'Квартал')).toHaveAttribute('aria-pressed', 'true')
      await expect(marketplace(p, 'Ozon')).toHaveAttribute('aria-pressed', 'true')
      await expect(compare(p)).toHaveAttribute('aria-checked', 'false')
      await expect(categories(p)).toContainText('Обувь, Спорт', { timeout: META_TIMEOUT })
      expect(pathname(p)).toBe('/dashboard')
      expect(sortedParams(p)).toEqual([
        ['cat', 'shoes'],
        ['cat', 'sports'],
        ['cmp', '0'],
        ['mp', 'ozon'],
        ['period', 'q'],
      ])
    }

    await page.goto(url)
    await expectRestored(page)

    await page.reload()
    await expectRestored(page)

    const tab = await context.newPage()
    await tab.goto(url)
    await expectRestored(tab)
  })

  test('AC-15: «Сбросить фильтры» удаляет параметры из URL', async ({ page }) => {
    await page.goto('/dashboard?period=7&mp=wb&cat=shoes&cmp=0')
    await expect(preset(page, '7 дней')).toHaveAttribute('aria-pressed', 'true')

    await panel(page).getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()

    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(preset(page, '30 дней')).toHaveAttribute('aria-pressed', 'true')
    await expect(marketplace(page, 'Все')).toHaveAttribute('aria-pressed', 'true')
    await expect(compare(page)).toHaveAttribute('aria-checked', 'true')
  })

  test('AC-8 / T4: мусор в URL не ломает страницу и не внедряет разметку', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let dialogShown = false
    page.on('dialog', async (dialog) => {
      dialogShown = true
      await dialog.dismiss()
    })

    const script = encodeURIComponent('<script>alert(1)</script>')
    await page.goto(`/dashboard?period=${script}&mp=hack&cat=unknown&cmp=yes&from=${script}&to=2026-10-10`)

    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(preset(page, '30 дней')).toHaveAttribute('aria-pressed', 'true')
    await expect(marketplace(page, 'Все')).toHaveAttribute('aria-pressed', 'true')
    expect(dialogShown).toBe(false)
    expect(errors).toEqual([])
  })
})

test.describe('Мобильные фильтры (375 px)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 640, 'Bottom sheet — только на ширине < 640 px')

  const filtersButton = (page: Page) => page.getByRole('button', { name: /^Фильтры\s*\(\d+\)$/ })
  const sheet = (page: Page) => page.getByRole('dialog', { name: 'Фильтры' })
  const sheetButton = (page: Page, group: string, name: string) =>
    sheet(page).getByRole('group', { name: group }).getByRole('button', { name, exact: true })

  test('AC-20, AC-21: «Фильтры (N)» → bottom sheet → «Показать результаты» меняет URL', async ({ page }) => {
    await page.goto('/dashboard')

    await expect(filtersButton(page)).toHaveAccessibleName(/^Фильтры\s*\(2\)$/)
    await expect(page.getByText(/^30 дней · \d{2}\.\d{2}–\d{2}\.\d{2}$/)).toBeVisible({ timeout: META_TIMEOUT })
    await expect(page.getByText('Все площадки · все категории · сравнение', { exact: true })).toBeVisible()
    await expect(page.getByRole('search', { name: 'Фильтры' }).getByRole('group', { name: 'Период' })).toHaveCount(0)

    await filtersButton(page).click()
    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page)).toHaveAttribute('aria-modal', 'true')

    await sheetButton(page, 'Период', '7 дней').click()
    await sheetButton(page, 'Маркетплейс', 'WB').click()
    // Черновик: URL пока прежний
    await expect(page).toHaveURL(/\/dashboard$/)

    await sheet(page).getByRole('button', { name: 'Показать результаты', exact: true }).click()

    await expect(sheet(page)).toBeHidden()
    await expect.poll(() => sortedParams(page)).toEqual([
      ['mp', 'wb'],
      ['period', '7'],
    ])
    // N = 1 (период) + 1 (сравнение) + 1 (WB)
    await expect(filtersButton(page)).toHaveAccessibleName(/^Фильтры\s*\(3\)$/)
    await expect(filtersButton(page)).toBeFocused()
    await expect(page.getByText(/^7 дней · \d{2}\.\d{2}–\d{2}\.\d{2}$/)).toBeVisible()
    await expect(page.getByText('WB · все категории · сравнение', { exact: true })).toBeVisible()
  })

  test('AC-21: клик по затемнению закрывает лист без применения, фокус — на «Фильтры (N)»', async ({ page }) => {
    await page.goto('/dashboard')
    await filtersButton(page).click()
    await expect(sheet(page)).toBeVisible()

    await sheetButton(page, 'Маркетплейс', 'Ozon').click()
    // Лист занимает не больше 90 % высоты снизу — верх экрана всегда затемнение
    await page.mouse.click(187, 20)

    await expect(sheet(page)).toBeHidden()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(filtersButton(page)).toBeFocused()
  })

  test('AC-14: перезагрузка на телефоне восстанавливает фильтры', async ({ page }) => {
    await page.goto('/dashboard?period=90&mp=ozon&cmp=0')
    // N = 1 (период) + 0 (сравнение выкл.) + 1 (Ozon)
    await expect(filtersButton(page)).toHaveAccessibleName(/^Фильтры\s*\(2\)$/)

    await page.reload()

    await expect(filtersButton(page)).toHaveAccessibleName(/^Фильтры\s*\(2\)$/)
    await expect(page.getByText(/^90 дней · \d{2}\.\d{2}–\d{2}\.\d{2}$/)).toBeVisible({ timeout: META_TIMEOUT })
    await expect(page.getByText('Ozon · все категории', { exact: true })).toBeVisible()
    await filtersButton(page).click()
    await expect(sheetButton(page, 'Период', '90 дней')).toHaveAttribute('aria-pressed', 'true')
    await expect(sheetButton(page, 'Маркетплейс', 'Ozon')).toHaveAttribute('aria-pressed', 'true')
    await expect(sheet(page).getByRole('switch', { name: 'Сравнить с прошлым периодом' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })
})
