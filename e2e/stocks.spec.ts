import { expect, test, type Locator, type Page } from '@playwright/test'

/*
 * Spec 008 «Страница «Остатки»» — сценарии в настоящем браузере (проекты 1440 и 375 px,
 * часть проверок — на 768 px). Данные — из фейкового API с реальным «сегодня» (≈ 1000 позиций),
 * поэтому конкретные позиции не захардкожены: проверяются раскладка, вид и инварианты
 * (бейджи, порядок, счётчики, виртуализация). Тексты строк, состояния и поиск на подменённых
 * ответах — в интеграционных тестах (src/app/stocksPage*.test.tsx).
 *
 * Цвета и размеры сравниваются с вычисленными значениями токенов из tokens.css.
 * Состояния «пусто» и «ошибка» в браузере не воспроизводятся (данные фейкового API всегда есть) —
 * их геометрия проверяется ревью и вручную по макету (см. отчёт QA).
 */

const DATA_TIMEOUT = 15_000

const STATUS = ['Критично', 'Скоро закончится', 'Норма', 'Нет продаж'] as const
type StatusText = (typeof STATUS)[number]

const STATUS_TOKEN: Record<StatusText, { color: string; soft: string; days: string }> = {
  Критично: { color: '--danger', soft: '--danger-soft', days: '--danger' },
  'Скоро закончится': { color: '--warning', soft: '--warning-soft', days: '--warning' },
  Норма: { color: '--success', soft: '--success-soft', days: '--text' },
  'Нет продаж': { color: '--neutral', soft: '--neutral-soft', days: '--text-3' },
}

const HINT: Record<StatusText, string> = {
  Критично: '< 7 дней',
  'Скоро закончится': '7–14 дней',
  Норма: '> 14 дней',
  'Нет продаж': '0 за 14 дней',
}

const HEADERS_WIDE = ['Товар', 'Площадка', 'Склад', 'Остаток', 'Продажи в день', 'Дней запаса', 'Статус']
const HEADERS_NARROW = ['Товар', 'Склад', 'Остаток', 'В день', 'Запас · статус']

// --- Локаторы ---

const main = (page: Page) => page.getByRole('main')
const tilesGroup = (page: Page) => page.getByRole('group', { name: 'Фильтр по статусу запаса' })
const tile = (page: Page, label: StatusText) => tilesGroup(page).getByRole('button', { name: new RegExp(label) })
const search = (page: Page) => page.getByRole('searchbox', { name: 'Поиск по названию, артикулу или складу' })
const counter = (page: Page) => main(page).locator('[aria-live="polite"]').filter({ hasText: 'Позиций «товар × склад»' })
const section = (page: Page) => page.getByRole('region', { name: 'Остатки по складам' })
const table = (page: Page) => section(page).getByRole('table')
const scrollArea = (page: Page) => page.getByLabel('Список остатков, прокручивается')
const tableRows = (page: Page) => scrollArea(page).locator('[role="row"]')
const cardList = (page: Page) => page.getByRole('list', { name: 'Остатки' })
const cards = (page: Page) => cardList(page).locator(':scope > li')
const moreButton = (page: Page) => page.getByRole('button', { name: /^Показать ещё/ })
const notFound = (page: Page) => main(page).getByText('Ничего не найдено', { exact: true })

const isPhone = (viewport: { width: number } | null) => (viewport?.width ?? 0) < 640

/** Данные показаны: строки таблицы, карточки или «Ничего не найдено»; скелетона нет. */
async function waitStocks(page: Page): Promise<void> {
  await expect(tableRows(page).first().or(cards(page).first()).or(notFound(page))).toBeVisible({ timeout: DATA_TIMEOUT })
  await expect(main(page).locator('[aria-busy="true"]')).toHaveCount(0, { timeout: DATA_TIMEOUT })
}

const hasHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

const toInt = (s: string) => Number(s.replace(/\D/g, ''))

// --- Чтение строк и карточек ---

type Item = { text: string; mp: string; scheme: string | null; days: string; status: string; rowIndex: number | null }

/** Строки таблицы (видимые в DOM) или карточки: значения — по тексту элементов, а не по классам. */
async function readItems(page: Page, phone: boolean): Promise<Item[]> {
  const root = phone ? cardList(page) : scrollArea(page)
  return root.evaluate((el, isPhoneLayout) => {
    const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
    const items = isPhoneLayout ? [...el.children] : [...el.querySelectorAll('[role="row"]')]
    return items.map((item) => {
      const visible = [...item.querySelectorAll('*')].filter((x) => (x as HTMLElement).checkVisibility?.() ?? true)
      const texts = visible.map((x) => n(x.textContent))
      const find = (re: RegExp) => texts.find((t) => re.test(t)) ?? ''
      const index = item.getAttribute('aria-rowindex')
      return {
        text: n(item.textContent),
        mp: find(/^(WB|Ozon)$/),
        scheme: find(/^(FBO|FBS)$/) || null,
        days: find(/^(\d[\d ]* дн\.|—)$/),
        status: find(/^(Критично|Скоро закончится|Норма|Нет продаж)$/),
        rowIndex: index === null ? null : Number(index),
      }
    })
  }, phone)
}

/** Число на плитке: самый вложенный элемент из цифр. */
async function tileNumber(page: Page, label: StatusText): Promise<number> {
  const text = await tile(page, label).evaluate((el) => {
    const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
    const all = [...el.querySelectorAll('*')].filter((x) => /^\d[\d ]*$/.test(n(x.textContent)))
    const inner = all.find((x) => !all.some((o) => o !== x && x.contains(o)))
    return inner ? n(inner.textContent) : ''
  })
  return toInt(text)
}

async function counterNumber(page: Page): Promise<number> {
  const text = (await counter(page).textContent()) ?? ''
  return toInt(text.split(':').at(-1) ?? '')
}

async function tilesTotal(page: Page): Promise<number> {
  let sum = 0
  for (const label of STATUS) sum += await tileNumber(page, label)
  return sum
}

const daysValue = (d: string) => (d === '—' ? Number.POSITIVE_INFINITY : toInt(d))

// --- Токены и стили ---

async function readTokens(page: Page, pairs: [string, string][]): Promise<Record<string, string>> {
  return main(page).evaluate((root, list) => {
    const out: Record<string, string> = {}
    for (const [property, token] of list) {
      const probe = document.createElement('div')
      probe.style.setProperty(property, `var(${token})`)
      root.append(probe)
      out[`${property} ${token}`] = getComputedStyle(probe).getPropertyValue(property)
      probe.remove()
    }
    return out
  }, pairs)
}

const colorsOf = async (page: Page, tokens: string[]) => {
  const t = await readTokens(
    page,
    tokens.map((x) => ['color', x]),
  )
  return Object.fromEntries(tokens.map((x) => [x, t[`color ${x}`] as string]))
}

async function styleOf(locator: Locator, properties: string[]): Promise<Record<string, string>> {
  return locator.evaluate(
    (el, props) => Object.fromEntries(props.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])),
    properties,
  )
}

// --- Фильтры ---

async function pickMarketplace(page: Page, name: 'WB' | 'Ozon', phone: boolean): Promise<void> {
  if (!phone) {
    await page
      .getByRole('search', { name: 'Фильтры' })
      .getByRole('group', { name: 'Маркетплейс' })
      .getByRole('button', { name, exact: true })
      .click()
    return
  }
  await page.getByRole('button', { name: /^Фильтры\s*\(\d+\)$/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Фильтры' })
  await sheet.getByRole('group', { name: 'Маркетплейс' }).getByRole('button', { name, exact: true }).click()
  await sheet.getByRole('button', { name: 'Показать результаты', exact: true }).click()
}

// =====================================================================================

test.describe('AC-26: сценарии страницы «Остатки» (1440 и 375 px)', () => {
  test('AC-26, AC-2: со дашборда по «Все остатки» — /stocks с теми же фильтрами, без перезагрузки', async ({ page }) => {
    await page.goto('/dashboard?period=7&cmp=0')
    const link = page.getByRole('region', { name: 'Скоро закончится' }).getByRole('link', { name: 'Все остатки' })
    await expect(link).toBeVisible({ timeout: DATA_TIMEOUT })
    // Метка в window переживает только переход без перезагрузки
    await page.evaluate(() => {
      ;(window as unknown as Record<string, unknown>).__stocksNoReload = true
    })

    await link.click()

    await expect(page).toHaveURL(/\/stocks\?/)
    const url = new URL(page.url())
    expect(url.pathname).toBe('/stocks')
    expect([...url.searchParams].sort()).toEqual([
      ['cmp', '0'],
      ['period', '7'],
    ])
    await expect(page.getByRole('heading', { level: 1, name: 'Остатки' })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__stocksNoReload)).toBe(true)
    await waitStocks(page)
  })

  test('AC-26, AC-12, AC-10: на 1440 — таблица с колонками AC-12, строки по возрастанию дней', async ({ page, viewport }) => {
    test.skip(isPhone(viewport), 'Таблица — на ≥ 640 px')
    await page.goto('/stocks')
    await waitStocks(page)

    const headers = await table(page).evaluate((t) =>
      [...t.querySelectorAll('[role="columnheader"]')]
        .filter((h) => (h as HTMLElement).checkVisibility())
        .map((h) => (h.textContent ?? '').replace(/\s+/g, ' ').trim()),
    )
    expect(headers).toEqual(HEADERS_WIDE)
    await expect(table(page).getByRole('columnheader', { name: 'Дней запаса' })).toHaveAttribute('aria-sort', 'ascending')

    const items = await readItems(page, false)
    expect(items.length).toBeGreaterThan(0)
    const days = items.map((i) => daysValue(i.days))
    for (let i = 1; i < days.length; i += 1) expect(days[i], `строка ${i}`).toBeGreaterThanOrEqual(days[i - 1] as number)
  })

  test('AC-26, AC-6, AC-9: «Критично» — у всех строк бейдж «Критично», счётчик = числу на плитке; повторное нажатие возвращает все', async ({
    page,
    viewport,
  }) => {
    const phone = isPhone(viewport)
    await page.goto('/stocks')
    await waitStocks(page)
    const total = await counterNumber(page)
    expect(total).toBe(await tilesTotal(page))
    const critical = await tileNumber(page, 'Критично')
    test.skip(critical === 0, 'В данных нет позиций «Критично»')

    await tile(page, 'Критично').click()

    await expect(tile(page, 'Критично')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => counterNumber(page)).toBe(critical)
    const shown = await readItems(page, phone)
    expect(shown.length).toBeGreaterThan(0)
    for (const item of shown) expect(item.status).toBe('Критично')

    await tile(page, 'Критично').click()

    await expect(tile(page, 'Критично')).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(async () => counterNumber(page)).toBe(total)
  })

  test('AC-26, AC-8: поиск по складу «Коледино» — у всех строк этот склад', async ({ page, viewport }) => {
    const phone = isPhone(viewport)
    await page.goto('/stocks')
    await waitStocks(page)

    await search(page).fill('Коледино')

    await expect
      .poll(async () => {
        const items = await readItems(page, phone)
        return items.length > 0 && items.every((i) => i.text.includes('Коледино'))
      }, { timeout: DATA_TIMEOUT })
      .toBe(true)
    expect(await counterNumber(page)).toBeGreaterThan(0)
    expect(await counterNumber(page)).toBe(await tilesTotal(page))
    // Поиск не попадает в URL
    expect(page.url()).not.toMatch(/%D0%9A%D0%BE%D0%BB|Коледино/i)
  })

  test('AC-26, AC-3: выбор «WB» — у всех строк бейдж «WB» и нет бейджа схемы', async ({ page, viewport }) => {
    const phone = isPhone(viewport)
    await page.goto('/stocks')
    await waitStocks(page)

    await pickMarketplace(page, 'WB', phone)

    await expect(page).toHaveURL(/\/stocks\?(.*&)?mp=wb(&|$)/)
    await expect
      .poll(async () => {
        const items = await readItems(page, phone)
        return items.length > 0 && items.every((i) => i.mp === 'WB')
      }, { timeout: DATA_TIMEOUT })
      .toBe(true)
    await waitStocks(page)
    for (const item of await readItems(page, phone)) {
      expect(item.mp).toBe('WB')
      expect(item.scheme).toBeNull()
    }
  })

  test('AC-26, AC-11: прокрутка таблицы до конца — последняя строка «нет продаж»; в DOM только часть строк', async ({ page, viewport }) => {
    test.skip(isPhone(viewport), 'Таблица — на ≥ 640 px')
    await page.goto('/stocks')
    await waitStocks(page)

    const rowCount = Number(await table(page).getAttribute('aria-rowcount'))
    const total = await counterNumber(page)
    expect(rowCount).toBe(total + 1)
    if (total > 60) expect(await tableRows(page).count(), 'виртуализация: в DOM меньше строк, чем всего').toBeLessThan(total)

    await scrollArea(page).evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })

    await expect(scrollArea(page).locator(`[role="row"][aria-rowindex="${rowCount}"]`)).toBeVisible({ timeout: DATA_TIMEOUT })
    const items = await readItems(page, false)
    const last = items.find((i) => i.rowIndex === rowCount)
    if (!last) throw new Error('Нет последней строки')
    if ((await tileNumber(page, 'Нет продаж')) > 0) {
      expect(last.status).toBe('Нет продаж')
      expect(last.days).toBe('—')
    }
  })

  test('AC-26, AC-17, AC-18: на 375 — карточки; «Показать ещё» добавляет карточки', async ({ page, viewport }) => {
    test.skip(!isPhone(viewport), 'Только для ширины < 640 px')
    await page.goto('/stocks')
    await waitStocks(page)

    await expect(table(page)).toHaveCount(0)
    const total = await counterNumber(page)
    await expect(cards(page)).toHaveCount(Math.min(8, total))
    test.skip(total <= 8, 'Позиций не больше 8 — кнопки нет')

    const k = Math.min(20, total - 8)
    await expect(moreButton(page)).toHaveText(new RegExp(`^Показать ещё\\s${k}$`))
    await moreButton(page).click()
    await expect(cards(page)).toHaveCount(8 + k)
  })

  test('AC-26, AC-24: на 375 нет горизонтальной прокрутки страницы', async ({ page, viewport }) => {
    test.skip(!isPhone(viewport), 'Только для ширины < 640 px')
    await page.goto('/stocks')
    await waitStocks(page)

    expect(await hasHorizontalScroll(page)).toBe(false)
    const box = await main(page).boundingBox()
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375)
  })
})

test.describe('AC-24: раскладка страницы', () => {
  const LAYOUT = [
    { width: 1440, pad: ['24px', '32px', '32px', '32px'], gap: '16px', h1: ['24px', '32px'], cols: 4, tileGap: '16px', tileH: 72, tilePad: ['12px', '16px'], icon: 36, num: ['20px', '28px'], ctlH: 36 },
    { width: 768, pad: ['20px', '24px', '32px', '24px'], gap: '16px', h1: ['24px', '32px'], cols: 4, tileGap: '12px', tileH: 64, tilePad: ['10px', '12px'], icon: 32, num: ['18px', '24px'], ctlH: 36 },
    { width: 375, pad: ['16px', '16px', '24px', '16px'], gap: '12px', h1: ['20px', '28px'], cols: 2, tileGap: '8px', tileH: 60, tilePad: ['10px', '12px'], icon: 32, num: ['18px', '24px'], ctlH: 44 },
  ] as const

  for (const L of LAYOUT) {
    test(`AC-24, AC-5, AC-8: ${L.width} px — main, h1, плитки ${L.cols} в ряд, поле поиска ${L.ctlH}`, async ({ page, viewport }) => {
      const phone = isPhone(viewport)
      test.skip(phone !== L.width < 640, 'Ширина — в своём проекте')
      if (!phone) await page.setViewportSize({ width: L.width, height: 1000 })
      await page.goto('/stocks')
      await waitStocks(page)

      const m = await styleOf(main(page), ['max-width', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'row-gap', 'display', 'flex-direction'])
      expect(m['max-width']).toBe('1440px')
      expect([m['padding-top'], m['padding-right'], m['padding-bottom'], m['padding-left']]).toEqual([...L.pad])
      expect(m['row-gap']).toBe(L.gap)

      const h1 = await styleOf(page.getByRole('heading', { level: 1, name: 'Остатки' }), ['font-size', 'line-height', 'font-weight', 'letter-spacing'])
      expect([h1['font-size'], h1['line-height']]).toEqual([...L.h1])
      expect(h1['font-weight']).toBe('600')
      // −0,015em от размера шрифта
      expect(Number.parseFloat(h1['letter-spacing'] ?? '0')).toBeCloseTo(-0.015 * Number.parseFloat(L.h1[0]), 2)

      const grid = await styleOf(tilesGroup(page), ['display', 'grid-template-columns', 'column-gap', 'row-gap'])
      expect(grid.display).toBe('grid')
      expect((grid['grid-template-columns'] ?? '').split(' ')).toHaveLength(L.cols)
      expect(grid['column-gap']).toBe(L.tileGap)

      for (const label of STATUS) {
        const t = tile(page, label)
        const s = await styleOf(t, ['min-height', 'padding-top', 'padding-left'])
        expect(s['min-height'], label).toBe(`${L.tileH}px`)
        expect([s['padding-top'], s['padding-left']], label).toEqual([...L.tilePad])
        const icon = await t.locator('[aria-hidden="true"]').first().boundingBox()
        expect(icon?.width, label).toBeCloseTo(L.icon, 0)
        expect(icon?.height, label).toBeCloseTo(L.icon, 0)
      }
      // На < 640 — две колонки: третья плитка под первой
      const first = await tile(page, 'Критично').boundingBox()
      const third = await tile(page, 'Норма').boundingBox()
      if (L.cols === 2) expect(Math.abs((third?.x ?? 0) - (first?.x ?? 0))).toBeLessThanOrEqual(1)
      else expect(Math.abs((third?.y ?? 0) - (first?.y ?? 0))).toBeLessThanOrEqual(1)

      // Поле поиска: label — рамка; высота по ширине
      const field = search(page).locator('xpath=ancestor::label[1]')
      const fieldBox = await field.boundingBox()
      expect(fieldBox?.height).toBeCloseTo(L.ctlH, 0)
      const mainBox = await main(page).boundingBox()
      const inner = (mainBox?.width ?? 0) - Number.parseFloat(L.pad[1]) - Number.parseFloat(L.pad[3])
      // По макету (Stock.dc.html, L.searchMax): на ≥ 1200 до 420; на 640–1199 поле и счётчик
      // в одном ряду, поле растягивается до счётчика; на < 640 поле на всю ширину, счётчик ниже
      const counterBox = await counter(page).boundingBox()
      if (L.width >= 1200) expect(fieldBox?.width ?? 0).toBeLessThanOrEqual(420.5)
      else if (L.width >= 640) {
        const fieldMid = (fieldBox?.y ?? 0) + (fieldBox?.height ?? 0) / 2
        expect(counterBox?.y ?? 0).toBeLessThan(fieldMid)
        expect((counterBox?.y ?? 0) + (counterBox?.height ?? 0)).toBeGreaterThan(fieldMid)
        expect((fieldBox?.x ?? 0) + (fieldBox?.width ?? 0) + 16).toBeCloseTo(counterBox?.x ?? 0, 0)
      } else {
        expect(Math.abs((fieldBox?.width ?? 0) - inner)).toBeLessThanOrEqual(1)
        expect(counterBox?.y ?? 0).toBeGreaterThan((fieldBox?.y ?? 0) + (fieldBox?.height ?? 0))
      }

      // Ряд «поиск + счётчик»: flex с переносом, зазор 12px 16px
      const row = await field.evaluate((el) => {
        const cs = getComputedStyle(el.parentElement as Element)
        return { display: cs.display, wrap: cs.flexWrap, rowGap: cs.rowGap, columnGap: cs.columnGap, flex: getComputedStyle(el).flex }
      })
      expect(row).toMatchObject({ display: 'flex', wrap: 'wrap', rowGap: '12px', columnGap: '16px' })
      expect(row.flex).toBe('1 1 320px')

      expect(await hasHorizontalScroll(page)).toBe(false)
    })
  }

  test('AC-24: number на плитке — 20/28 на 1440, 600, tabular', async ({ page, viewport }) => {
    test.skip(isPhone(viewport), 'Только 1440')
    await page.goto('/stocks')
    await waitStocks(page)

    for (const label of STATUS) {
      const num = await tile(page, label).evaluate((el) => {
        const n = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim()
        const all = [...el.querySelectorAll('*')].filter((x) => /^\d[\d ]*$/.test(n(x.textContent)))
        const inner = all.find((x) => !all.some((o) => o !== x && x.contains(o)))
        if (!inner) return null
        const cs = getComputedStyle(inner)
        return { size: cs.fontSize, lh: cs.lineHeight, weight: cs.fontWeight, numeric: cs.fontVariantNumeric }
      })
      expect(num, label).toMatchObject({ size: '20px', lh: '28px', weight: '600' })
      expect(num?.numeric).toContain('tabular-nums')
    }
  })
})

test.describe('Плитки и поиск: вид и состояния', () => {
  test('AC-5: иконка в квадрате --r-md, фон --{статус}-soft, цвет статуса; подпись 13/18 --text-2; подсказка 12 --text-3 на 1440', async ({ page, viewport }) => {
    test.skip(isPhone(viewport), 'Подсказки — на ≥ 1200')
    await page.goto('/stocks')
    await waitStocks(page)
    const tokens = Object.values(STATUS_TOKEN).flatMap((t) => [t.color, t.soft])
    const c = await colorsOf(page, [...tokens, '--text-2', '--text-3'])
    const radius = (await readTokens(page, [['border-top-left-radius', '--r-md']]))['border-top-left-radius --r-md']

    for (const label of STATUS) {
      const t = tile(page, label)
      const icon = await styleOf(t.locator('[aria-hidden="true"]').first(), ['background-color', 'color', 'border-top-left-radius'])
      expect(icon['background-color'], label).toBe(c[STATUS_TOKEN[label].soft])
      expect(icon.color, label).toBe(c[STATUS_TOKEN[label].color])
      expect(icon['border-top-left-radius'], label).toBe(radius)
      const caption = await styleOf(t.getByText(label, { exact: true }), ['font-size', 'line-height', 'color', 'text-overflow', 'white-space'])
      expect(caption).toMatchObject({ 'font-size': '13px', 'line-height': '18px', color: c['--text-2'], 'text-overflow': 'ellipsis', 'white-space': 'nowrap' })
      const hint = t.getByText(HINT[label], { exact: true })
      await expect(hint).toBeVisible()
      expect(await styleOf(hint, ['font-size', 'color'])).toMatchObject({ 'font-size': '12px', color: c['--text-3'] })
    }
  })

  test('AC-5: на 768 подсказок порога нет', async ({ page, viewport }) => {
    test.skip(isPhone(viewport), 'В проекте 1440 меняем ширину окна')
    await page.setViewportSize({ width: 768, height: 1000 })
    await page.goto('/stocks')
    await waitStocks(page)

    for (const label of STATUS) await expect(tile(page, label).getByText(HINT[label], { exact: true })).toBeHidden()
  })

  test('AC-6: невыбранная — рамка --border и --shadow-sm; наведение — --border-strong и --shadow-md; выбранная — рамка и кольцо цветом статуса', async ({
    page,
    viewport,
  }) => {
    test.skip(isPhone(viewport), 'Наведение — на десктопе')
    await page.goto('/stocks')
    await waitStocks(page)
    const t = await readTokens(page, [
      ['border-top-color', '--border'],
      ['border-top-color', '--border-strong'],
      ['box-shadow', '--shadow-sm'],
      ['box-shadow', '--shadow-md'],
      ...Object.values(STATUS_TOKEN).map((x): [string, string] => ['border-top-color', x.color]),
    ])

    await page.mouse.move(0, 0)
    for (const label of STATUS) {
      const s = await styleOf(tile(page, label), ['border-top-color', 'border-top-width', 'box-shadow'])
      expect(s, label).toMatchObject({ 'border-top-color': t['border-top-color --border'], 'border-top-width': '1px', 'box-shadow': t['box-shadow --shadow-sm'] })
    }

    await tile(page, 'Норма').hover()
    await expect
      .poll(async () => (await styleOf(tile(page, 'Норма'), ['border-top-color']))['border-top-color'])
      .toBe(t['border-top-color --border-strong'])
    expect((await styleOf(tile(page, 'Норма'), ['box-shadow']))['box-shadow']).toBe(t['box-shadow --shadow-md'])

    for (const label of STATUS) {
      await tile(page, label).click()
      await page.mouse.move(0, 0)
      const color = t[`border-top-color ${STATUS_TOKEN[label].color}`] as string
      await expect.poll(async () => (await styleOf(tile(page, label), ['border-top-color']))['border-top-color']).toBe(color)
      const shadow = (await styleOf(tile(page, label), ['box-shadow']))['box-shadow'] ?? ''
      expect(shadow, label).toContain(color)
      expect(shadow, label).toContain('0px 0px 0px 1px')
      await tile(page, label).click()
    }
  })

  test('AC-6: видимое кольцо фокуса у плитки при работе с клавиатуры', async ({ page, viewport }) => {
    test.skip(isPhone(viewport), 'Клавиатура — на десктопе')
    await page.goto('/stocks')
    await waitStocks(page)
    const focus = (await colorsOf(page, ['--focus']))['--focus'] as string

    await page.keyboard.press('Shift')
    await tile(page, 'Критично').focus()
    const ring = await styleOf(tile(page, 'Критично'), ['outline-style', 'outline-color', 'outline-width', 'box-shadow'])
    const outlined = ring['outline-style'] !== 'none' && ring['outline-color'] === focus
    const shadowed = (ring['box-shadow'] ?? '').includes(focus)
    expect(outlined || shadowed, JSON.stringify(ring)).toBe(true)
  })

  test('AC-8: поле — рамка --border-strong, --r-sm; при фокусе — рамка --accent и кольцо 3 px --accent-soft; подпись скрыта, лупа 16 --text-3', async ({ page }) => {
    await page.goto('/stocks')
    await waitStocks(page)
    const t = await readTokens(page, [
      ['border-top-color', '--border-strong'],
      ['border-top-color', '--accent'],
      ['border-top-left-radius', '--r-sm'],
      ['color', '--accent-soft'],
      ['color', '--text-3'],
    ])
    const field = search(page).locator('xpath=ancestor::label[1]')

    const idle = await styleOf(field, ['border-top-color', 'border-top-left-radius'])
    expect(idle['border-top-color']).toBe(t['border-top-color --border-strong'])
    expect(idle['border-top-left-radius']).toBe(t['border-top-left-radius --r-sm'])
    await expect(search(page)).toHaveAttribute('placeholder', 'Товар, артикул или склад')

    const caption = await field.getByText('Поиск по названию, артикулу или складу', { exact: true }).boundingBox()
    expect((caption?.width ?? 0) <= 1 && (caption?.height ?? 0) <= 1, 'подпись визуально скрыта').toBe(true)
    const icon = await field.locator('svg').first().boundingBox()
    expect(icon?.width).toBeCloseTo(16, 0)
    expect((await styleOf(field.locator('svg').first(), ['color'])).color).toBe(t['color --text-3'])

    await search(page).focus()
    await expect.poll(async () => (await styleOf(field, ['border-top-color']))['border-top-color']).toBe(t['border-top-color --accent'])
    const shadow = (await styleOf(field, ['box-shadow']))['box-shadow'] ?? ''
    expect(shadow).toContain(t['color --accent-soft'] as string)
    expect(shadow).toContain('3px')
  })

  test('AC-9: счётчик 13 --text-2, N — 600 --text', async ({ page }) => {
    await page.goto('/stocks')
    await waitStocks(page)
    const c = await colorsOf(page, ['--text', '--text-2'])

    expect(await styleOf(counter(page), ['font-size', 'color'])).toMatchObject({ 'font-size': '13px', color: c['--text-2'] })
    const n = await counter(page).evaluate((el) => {
      const inner = [...el.querySelectorAll('*')].find((x) => /^\d[\d\s]*$/.test((x.textContent ?? '').trim()))
      return inner ? { weight: getComputedStyle(inner).fontWeight, color: getComputedStyle(inner).color } : null
    })
    expect(n).toEqual({ weight: '600', color: c['--text'] })
  })
})

test.describe('Таблица: вид', () => {
  test.skip(({ viewport }) => isPhone(viewport), 'Таблица — на ≥ 640 px')

  for (const width of [1440, 768] as const) {
    test(`AC-11: ${width} px — карточка, шапка 40, прокрутка до ${width >= 1200 ? 620 : 700}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto('/stocks')
      await waitStocks(page)
      const t = await readTokens(page, [
        ['background-color', '--surface'],
        ['background-color', '--surface-2'],
        ['border-top-color', '--border'],
        ['border-top-left-radius', '--r-lg'],
        ['box-shadow', '--shadow-sm'],
        ['color', '--text-3'],
      ])

      expect(await styleOf(section(page), ['background-color', 'border-top-color', 'border-top-width', 'border-top-left-radius', 'box-shadow', 'overflow-x'])).toMatchObject({
        'background-color': t['background-color --surface'],
        'border-top-color': t['border-top-color --border'],
        'border-top-width': '1px',
        'border-top-left-radius': t['border-top-left-radius --r-lg'],
        'box-shadow': t['box-shadow --shadow-sm'],
        'overflow-x': 'hidden',
      })

      const header = table(page).locator('[role="row"]').filter({ has: page.getByRole('columnheader') }).first()
      const hb = await header.boundingBox()
      expect(hb?.height).toBeCloseTo(40, 0)
      expect(await styleOf(header, ['background-color', 'border-bottom-color', 'font-size', 'font-weight', 'color', 'padding-left', 'padding-right', 'column-gap'])).toMatchObject({
        'background-color': t['background-color --surface-2'],
        'border-bottom-color': t['border-top-color --border'],
        'font-size': '12px',
        'font-weight': '600',
        color: t['color --text-3'],
        'padding-left': '20px',
        'padding-right': '20px',
        'column-gap': '16px',
      })

      const scroll = await styleOf(scrollArea(page), ['max-height', 'overflow-y'])
      expect(scroll['max-height']).toBe(width >= 1200 ? '620px' : '700px')
      expect(scroll['overflow-y']).toBe('auto')
      await expect(scrollArea(page)).toHaveAttribute('tabindex', '0')
    })
  }

  test('AC-12: 1440 — сетка колонок, строка 52, padding 6px 20px; товар, площадка 20, склад со схемой 20 и title, остаток, скорость, статус 22', async ({ page }) => {
    await page.goto('/stocks')
    await waitStocks(page)
    const t = await readTokens(page, [
      ['border-top-color', '--border'],
      ['color', '--text-2'],
      ['color', '--text-3'],
      ['color', '--text'],
    ])

    const header = table(page).locator('[role="row"]').filter({ has: page.getByRole('columnheader') }).first()
    const headerCols = ((await styleOf(header, ['grid-template-columns']))['grid-template-columns'] ?? '').split(' ')
    expect(headerCols.slice(1)).toEqual(['80px', '220px', '88px', '120px', '180px', '160px'])

    const daysHeader = table(page).getByRole('columnheader', { name: 'Дней запаса' })
    expect((await styleOf(daysHeader, ['color'])).color).toBe(t['color --text'])
    expect((await daysHeader.locator('svg').first().boundingBox())?.width).toBeCloseTo(12, 0)

    const rows = await scrollArea(page).evaluate((el) => {
      const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
      const css = (x: Element | null | undefined, props: string[]) => (x ? Object.fromEntries(props.map((p) => [p, getComputedStyle(x).getPropertyValue(p)])) : null)
      const innermost = (root: Element, re: RegExp) => {
        const all = [...root.querySelectorAll('*')].filter((x) => re.test(n(x.textContent)) && (x as HTMLElement).checkVisibility())
        return all.find((x) => !all.some((o) => o !== x && x.contains(o))) ?? null
      }
      return [...el.querySelectorAll('[role="row"]')].slice(0, 12).map((row) => {
        const cells = [...row.querySelectorAll('[role="cell"]')].filter((c) => (c as HTMLElement).checkVisibility())
        const art = innermost(row, /^Арт\. \d+$/)
        // Название — строкой выше «Арт. …» в той же колонке
        const name = art?.previousElementSibling ?? null
        const mp = innermost(row, /^(WB|Ozon)$/)
        const scheme = innermost(row, /^(FBO|FBS)$/)
        const statusText = innermost(row, /^(Критично|Скоро закончится|Норма|Нет продаж)$/)
        const status = statusText && !statusText.querySelector('svg') && statusText.parentElement?.querySelector('svg') ? statusText.parentElement : statusText
        const preview = [...row.querySelectorAll('[aria-hidden="true"]')].find((x) => x.querySelector('svg') && n(x.textContent) === '')
        return {
          height: row.getBoundingClientRect().height,
          row: css(row, ['grid-template-columns', 'padding-top', 'padding-left', 'border-bottom-width', 'border-bottom-color', 'font-size', 'line-height']),
          cells: cells.length,
          preview: preview ? { w: preview.getBoundingClientRect().width, h: preview.getBoundingClientRect().height } : null,
          name: css(name, ['font-size', 'line-height', 'font-weight', 'white-space', 'text-overflow']),
          art: css(art, ['font-size', 'line-height', 'color']),
          mpBox: mp ? mp.getBoundingClientRect().height : 0,
          mp: css(mp, ['font-size', 'font-weight']),
          mpText: n(mp?.textContent),
          scheme: scheme ? { h: scheme.getBoundingClientRect().height, title: scheme.closest('[title]')?.getAttribute('title') ?? null, text: n(scheme.textContent) } : null,
          stock: css(cells[3], ['text-align', 'font-weight']),
          speed: css(cells[4], ['text-align', 'color']),
          statusText: n(status?.textContent),
          status: status ? { h: status.getBoundingClientRect().height, ...css(status, ['font-size', 'font-weight', 'padding-left', 'padding-right', 'column-gap']) } : null,
          statusIcon: status?.querySelector('svg')?.getBoundingClientRect().width ?? 0,
        }
      })
    })
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.cells).toBe(7)
      expect(r.height).toBeCloseTo(52, 0)
      expect((r.row?.['grid-template-columns'] ?? '').split(' ').slice(1)).toEqual(['80px', '220px', '88px', '120px', '180px', '160px'])
      expect(r.row).toMatchObject({ 'padding-top': '6px', 'padding-left': '20px', 'border-bottom-width': '1px', 'border-bottom-color': t['border-top-color --border'], 'font-size': '13px', 'line-height': '18px' })
      expect(r.preview?.w).toBeCloseTo(36, 0)
      expect(r.name).toMatchObject({ 'font-size': '14px', 'line-height': '20px', 'font-weight': '500', 'white-space': 'nowrap', 'text-overflow': 'ellipsis' })
      expect(r.art).toMatchObject({ 'font-size': '12px', 'line-height': '16px', color: t['color --text-3'] })
      expect(r.mpBox).toBeCloseTo(20, 0)
      expect(r.mp).toMatchObject({ 'font-size': '12px', 'font-weight': '600' })
      if (r.mpText === 'Ozon') {
        if (!r.scheme) throw new Error('У Ozon нет бейджа схемы')
        expect(r.scheme.h).toBeCloseTo(20, 0)
        expect(r.scheme.title).toBe(r.scheme.text === 'FBO' ? 'Хранение и доставка — Ozon' : 'Хранение и сборка — продавец')
      } else {
        expect(r.scheme).toBeNull()
      }
      expect(r.stock).toMatchObject({ 'text-align': 'right', 'font-weight': '500' })
      expect(r.speed).toMatchObject({ 'text-align': 'right', color: t['color --text-2'] })
      expect(r.status?.h).toBeCloseTo(22, 0)
      expect(r.status).toMatchObject({ 'font-size': '12px', 'font-weight': '600', 'padding-left': '6px', 'padding-right': '8px', 'column-gap': '4px' })
      expect(r.statusIcon).toBeCloseTo(12, 0)
    }
  })

  test('AC-12: при наведении строка — фон --surface-2', async ({ page }) => {
    await page.goto('/stocks')
    await waitStocks(page)
    const bg = (await readTokens(page, [['background-color', '--surface-2']]))['background-color --surface-2']

    const row = tableRows(page).first()
    await row.hover()
    await expect.poll(async () => (await styleOf(row, ['background-color']))['background-color']).toBe(bg)
  })

  test('AC-13: 768 — колонки Товар · Склад · Остаток · В день · Запас · статус, строка 68; площадка в «Складе», статус в «Запасе»', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1000 })
    await page.goto('/stocks')
    await waitStocks(page)

    const headers = await table(page).evaluate((tb) =>
      [...tb.querySelectorAll('[role="columnheader"]')]
        .filter((h) => (h as HTMLElement).checkVisibility())
        .map((h) => (h.textContent ?? '').replace(/\s+/g, ' ').trim()),
    )
    expect(headers).toEqual(HEADERS_NARROW)

    const rows = await scrollArea(page).evaluate((el) => {
      const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
      return [...el.querySelectorAll('[role="row"]')].slice(0, 10).map((row) => {
        const cells = [...row.querySelectorAll('[role="cell"]')].filter((c) => (c as HTMLElement).checkVisibility())
        const visibleTexts = (cell: Element | undefined) =>
          cell ? [...cell.querySelectorAll('*')].filter((x) => (x as HTMLElement).checkVisibility()).map((x) => n(x.textContent)) : []
        const rect = row.getBoundingClientRect()
        return {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          cols: getComputedStyle(row).gridTemplateColumns,
          cells: cells.length,
          mpInWarehouse: visibleTexts(cells[1]).some((x) => /^(WB|Ozon)$/.test(x)),
          statusInDays: visibleTexts(cells[4]).some((x) => /^(Критично|Скоро закончится|Норма|Нет продаж)$/.test(x)),
        }
      })
    })
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.cells).toBe(5)
      // По макету min-height 68: склад с бейджами может перенестись в три строки — строка растёт
      expect(r.height).toBeGreaterThanOrEqual(67.5)
      expect(r.cols.split(' ').slice(1)).toEqual(['150px', '64px', '60px', '148px'])
      expect(r.mpInWarehouse).toBe(true)
      expect(r.statusInDays).toBe(true)
    }
    // Строки не налезают друг на друга и не оставляют щелей: верх каждой — низ предыдущей.
    // Высоту виртуализатор измеряет после отрисовки — ждём, пока смещения устоятся
    await expect
      .poll(() =>
        scrollArea(page).evaluate((el) => {
          const rects = [...el.querySelectorAll('[role="row"]')].map((row) => row.getBoundingClientRect())
          return Math.max(0, ...rects.slice(1).map((rect, i) => Math.abs(rect.top - rects[i].bottom)))
        }),
      )
      .toBeLessThanOrEqual(1)
    expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test('AC-14, AC-15: дни — 600, min-width 44, цвет по статусу; полоса 6 px --surface-3, заполнение min(100, дни / 30) цветом статуса', async ({ page }) => {
    await page.goto('/stocks')
    await waitStocks(page)
    const tokens = await readTokens(page, [
      ['background-color', '--surface-3'],
      ...Object.values(STATUS_TOKEN).flatMap((x): [string, string][] => [
        ['color', x.color],
        ['color', x.days],
        ['background-color', x.soft],
      ]),
    ])

    for (const label of STATUS) {
      if ((await tileNumber(page, label)) === 0) continue
      await tile(page, label).click()
      await expect.poll(async () => (await readItems(page, false)).every((i) => i.status === label)).toBe(true)

      const rows = await scrollArea(page).evaluate((el) => {
        const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
        return [...el.querySelectorAll('[role="row"]')].slice(0, 6).map((row) => {
          const all = [...row.querySelectorAll('*')].filter((x) => /^(\d[\d ]* дн\.|—)$/.test(n(x.textContent)))
          const days = all.find((x) => !all.some((o) => o !== x && x.contains(o)))
          const cell = days?.closest('[role="cell"]')
          const track = cell ? [...cell.querySelectorAll('[aria-hidden="true"]')].find((x) => !x.querySelector('svg') && x.tagName !== 'svg' && n(x.textContent) === '') : undefined
          const fill = track?.firstElementChild ?? null
          const matches = [...row.querySelectorAll('*')].filter((x) => /^(Критично|Скоро закончится|Норма|Нет продаж)$/.test(n(x.textContent)) && (x as HTMLElement).checkVisibility())
          const statusText = matches.find((x) => !matches.some((o) => o !== x && x.contains(o)))
          const badge = statusText && !statusText.querySelector('svg') && statusText.parentElement?.querySelector('svg') ? statusText.parentElement : statusText
          return {
            days: n(days?.textContent),
            daysCss: days ? { weight: getComputedStyle(days).fontWeight, minWidth: getComputedStyle(days).minWidth, color: getComputedStyle(days).color, numeric: getComputedStyle(days).fontVariantNumeric } : null,
            track: track ? { h: track.getBoundingClientRect().height, w: track.getBoundingClientRect().width, bg: getComputedStyle(track).backgroundColor, radius: getComputedStyle(track).borderTopLeftRadius } : null,
            fill: fill ? { w: fill.getBoundingClientRect().width, bg: getComputedStyle(fill).backgroundColor } : null,
            badge: badge ? { color: getComputedStyle(badge).color, bg: getComputedStyle(badge).backgroundColor } : null,
          }
        })
      })
      for (const r of rows) {
        expect(r.daysCss).toMatchObject({ weight: '600', minWidth: '44px', color: tokens[`color ${STATUS_TOKEN[label].days}`] })
        expect(r.daysCss?.numeric).toContain('tabular-nums')
        if (!r.track) throw new Error(`${label}: нет полосы запаса`)
        expect(r.track.h).toBeCloseTo(6, 0)
        expect(r.track.bg).toBe(tokens['background-color --surface-3'])
        expect(r.track.radius).toBe('999px')
        const ratio = (r.fill?.w ?? 0) / r.track.w
        if (r.days === '—') {
          expect(label).toBe('Нет продаж')
          expect(ratio).toBeLessThanOrEqual(0.01)
        } else {
          const d = Number(r.days.replace(/\D/g, ''))
          // Точные дни — в [d; d + 1): заполнение между d / 30 и (d + 1) / 30, не больше 1
          expect(ratio).toBeGreaterThanOrEqual(Math.min(1, d / 30) - 0.01)
          expect(ratio).toBeLessThanOrEqual(Math.min(1, (d + 1) / 30) + 0.01)
          expect(r.fill?.bg).toBe(tokens[`color ${STATUS_TOKEN[label].color}`])
        }
        expect(r.badge).toEqual({ color: tokens[`color ${STATUS_TOKEN[label].color}`], bg: tokens[`background-color ${STATUS_TOKEN[label].soft}`] })
      }
      await tile(page, label).click()
    }
  })
})

test.describe('Карточки на телефоне: вид', () => {
  test.skip(({ viewport }) => !isPhone(viewport), 'Только для ширины < 640 px')

  test('AC-17: карточка — --surface, рамка, --r-lg, padding 12px 14px, зазоры 8 / 10; превью 44; название в две строки; сетка 3 колонки', async ({ page }) => {
    await page.goto('/stocks')
    await waitStocks(page)
    const t = await readTokens(page, [
      ['background-color', '--surface'],
      ['border-top-color', '--border'],
      ['border-top-left-radius', '--r-lg'],
      ['color', '--text-2'],
      ['color', '--text-3'],
    ])

    expect((await styleOf(cardList(page), ['row-gap']))['row-gap']).toBe('8px')
    const data = await cardList(page).evaluate((ul) => {
      const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
      return [...ul.children].slice(0, 4).map((li) => {
        const css = (x: Element | null | undefined, props: string[]) => (x ? Object.fromEntries(props.map((p) => [p, getComputedStyle(x).getPropertyValue(p)])) : null)
        const preview = [...li.querySelectorAll('[aria-hidden="true"]')].find((x) => x.querySelector('svg') && n(x.textContent) === '')
        const label = (text: string) => [...li.querySelectorAll('*')].find((x) => n(x.textContent) === text && x.children.length === 0)
        const stockLabel = label('Остаток')
        const gridEl = stockLabel?.parentElement?.parentElement
        const all = [...li.querySelectorAll('*')].filter((x) => /^(WB|Ozon)$/.test(n(x.textContent)))
        const mp = all.find((x) => !all.some((o) => o !== x && x.contains(o)))
        return {
          li: css(li, ['background-color', 'border-top-color', 'border-top-width', 'border-top-left-radius', 'padding-top', 'padding-left', 'row-gap']),
          preview: preview ? preview.getBoundingClientRect().width : 0,
          meta: css(mp?.parentElement, ['font-size', 'line-height', 'color', 'flex-wrap']),
          grid: css(gridEl, ['display', 'grid-template-columns', 'column-gap']),
          label: css(stockLabel, ['font-size', 'line-height', 'color']),
          value: css(stockLabel?.nextElementSibling, ['font-size', 'line-height', 'font-weight']),
        }
      })
    })
    expect(data.length).toBeGreaterThan(0)
    for (const c of data) {
      expect(c.li).toMatchObject({
        'background-color': t['background-color --surface'],
        'border-top-color': t['border-top-color --border'],
        'border-top-width': '1px',
        'border-top-left-radius': t['border-top-left-radius --r-lg'],
        'padding-top': '12px',
        'padding-left': '14px',
        'row-gap': '10px',
      })
      expect(c.preview).toBeCloseTo(44, 0)
      expect(c.meta).toMatchObject({ 'font-size': '12px', 'line-height': '16px', color: t['color --text-2'], 'flex-wrap': 'wrap' })
      expect(c.grid?.display).toBe('grid')
      expect((c.grid?.['grid-template-columns'] ?? '').split(' ')).toHaveLength(3)
      expect(c.grid?.['column-gap']).toBe('8px')
      expect(c.label).toMatchObject({ 'font-size': '12px', 'line-height': '16px', color: t['color --text-3'] })
      expect(c.value).toMatchObject({ 'font-size': '14px', 'line-height': '20px', 'font-weight': '600' })
    }
  })

  test('AC-18: «Показать ещё» — вторичная кнопка 44 на всю ширину', async ({ page }) => {
    await page.goto('/stocks')
    await waitStocks(page)
    test.skip((await moreButton(page).count()) === 0, 'Позиций не больше 8')

    const box = await moreButton(page).boundingBox()
    const list = await cardList(page).boundingBox()
    expect(box?.height).toBeCloseTo(44, 0)
    expect(Math.abs((box?.width ?? 0) - (list?.width ?? 0))).toBeLessThanOrEqual(1)
  })

  test('AC-18: смена плитки возвращает к 8 карточкам', async ({ page }) => {
    await page.goto('/stocks')
    await waitStocks(page)
    test.skip((await moreButton(page).count()) === 0, 'Позиций не больше 8')
    await moreButton(page).click()
    await expect.poll(async () => cards(page).count()).toBeGreaterThan(8)

    const label = STATUS.find((s) => s !== 'Нет продаж') ?? 'Критично'
    await tile(page, label).click()
    const n = await tileNumber(page, label)
    await expect(cards(page)).toHaveCount(Math.min(8, n))
  })
})

test.describe('Загрузка', () => {
  test('AC-20: скелетон (если успели застать) — 10 строк, квадрат 36, полосы, --skeleton без шиммера', async ({ page, viewport }) => {
    const phone = isPhone(viewport)
    await page.goto('/stocks')
    const busy = main(page).getByLabel('Загружаем остатки')
    const caught = await busy.waitFor({ state: 'attached', timeout: 3_000 }).then(
      () => true,
      () => false,
    )
    test.skip(!caught, 'Данные пришли раньше, чем появился скелетон — состояние проверено интеграционными тестами')

    const snapshot = await main(page).evaluate((root) => {
      const el = root.querySelector('[aria-label="Загружаем остатки"]')
      if (!el) return null
      const probe = document.createElement('div')
      probe.style.backgroundColor = 'var(--skeleton)'
      root.append(probe)
      const skeleton = getComputedStyle(probe).backgroundColor
      probe.remove()
      const boxes = [...el.querySelectorAll('*')]
        .filter((b) => getComputedStyle(b).backgroundColor === skeleton)
        .map((b) => {
          const r = b.getBoundingClientRect()
          return { w: Math.round(r.width), h: Math.round(r.height), animation: getComputedStyle(b).animationName }
        })
      return { busy: el.getAttribute('aria-busy'), boxes, search: Boolean(root.querySelector('input[type="search"]:not([disabled])')) }
    })
    test.skip(snapshot === null, 'Скелетон исчез до снимка')
    if (!snapshot) return

    expect(snapshot.busy).toBe('true')
    expect(snapshot.search).toBe(true)
    expect(snapshot.boxes.filter((b) => b.w === 36 && b.h === 36)).toHaveLength(10)
    expect(snapshot.boxes.filter((b) => b.h === 10).length).toBeGreaterThanOrEqual(10)
    if (!phone) {
      expect(snapshot.boxes.filter((b) => b.h === 6 && b.w === 120)).toHaveLength(10)
      expect(snapshot.boxes.filter((b) => b.h === 22 && b.w === 96)).toHaveLength(10)
    } else {
      expect(snapshot.boxes.filter((b) => b.h === 22 && b.w === 96)).toHaveLength(0)
    }
    for (const box of snapshot.boxes) expect(box.animation).toBe('none')
  })
})
