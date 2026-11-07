import { expect, test, type Locator, type Page } from '@playwright/test'

/*
 * Spec 006 «Топ товаров» — сценарии в настоящем браузере (проекты 1440 и 375 px,
 * часть проверок — ещё на 768 и 640 px). Данные — из фейкового API с реальным «сегодня»,
 * поэтому конкретные товары не захардкожены: ожидания считаются из самой страницы
 * (порядок строк до и после смены направления, бейджи площадок). Значения ячеек и
 * порядки по метрикам проверены интеграционными тестами (src/app/topProducts*.test.tsx).
 *
 * Цвета и размеры сравниваются с вычисленными значениями токенов из tokens.css.
 */

// Первая генерация данных в браузере может занять несколько секунд
const DATA_TIMEOUT = 15_000

// --- Локаторы ---

const top = (page: Page) => page.getByRole('region', { name: 'Топ-10 товаров' })
const topTable = (page: Page) => top(page).getByRole('table')
const topCards = (page: Page) => top(page).locator('ol > li')
const chart = (page: Page) => page.getByRole('region', { name: 'Продажи по дням' })
const kpiRegion = (page: Page) => page.getByRole('region', { name: 'Ключевые показатели' })
const headerCell = (page: Page, label: string) => topTable(page).locator('th', { hasText: label })
const sortButton = (page: Page, label: string) => headerCell(page, label).getByRole('button')
const cycleButton = (page: Page) => top(page).getByRole('button', { name: /^Сменить сортировку, сейчас:/ })
const subtitle = (page: Page, text: string) => top(page).getByText(text, { exact: true })

const isPhone = (viewport: { width: number } | null) => (viewport?.width ?? 0) < 640

/** Ждём данных топа: таблица (≥ 640) или карточки (< 640), без aria-busy. */
async function waitTop(page: Page, phone: boolean): Promise<void> {
  if (phone) await expect(topCards(page).first()).toBeVisible({ timeout: DATA_TIMEOUT })
  else await expect(topTable(page)).toBeVisible({ timeout: DATA_TIMEOUT })
  await expect(top(page).locator('[aria-busy="true"]')).toHaveCount(0, { timeout: DATA_TIMEOUT })
}

const hasHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

/** Считает запросы /api/top-products (ответ фейкового API виден как обычный запрос страницы). */
function countTopRequests(page: Page): { count: number; sorts: string[] } {
  const counter = { count: 0, sorts: [] as string[] }
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname !== '/api/top-products') return
    counter.count += 1
    counter.sorts.push(url.searchParams.get('sort') ?? '')
  })
  return counter
}

// --- Чтение строк / карточек ---

type Item = { rank: string; sku: string; badge: string; buyoutNull: boolean }

async function readItems(page: Page, phone: boolean): Promise<Item[]> {
  return top(page).evaluate((section, asCards) => {
    const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
    const skuOf = (el: Element) => /Арт\.\s*(\d+)/.exec(n(el.textContent))?.[1] ?? ''
    if (!asCards) {
      const rows = [...section.querySelectorAll('table tr')].filter((r) => !r.closest('thead') && r.querySelector('td'))
      return rows.map((row) => {
        const cells = [...row.querySelectorAll('th, td')]
        return {
          rank: n(cells[0]?.textContent),
          sku: skuOf(row),
          badge: n(cells[2]?.textContent),
          buyoutNull: n(cells[5]?.textContent).startsWith('—'),
        }
      })
    }
    return [...section.querySelectorAll('ol > li')].map((li) => {
      const badge = [...li.querySelectorAll('*')].find((el) => el.children.length === 0 && /^(WB|Ozon)$/.test(n(el.textContent)))
      const terms = [...li.querySelectorAll('dt')].map((dt) => n(dt.textContent))
      const buyout = li.querySelectorAll('dd')[terms.indexOf('% выкупа')]
      return {
        rank: /№\s*(\d+)/.exec(n(li.textContent))?.[1] ?? '',
        sku: skuOf(li),
        badge: n(badge?.textContent),
        buyoutNull: n(buyout?.textContent).startsWith('—'),
      }
    })
  }, phone)
}

const skusOf = (items: Item[]) => items.map((i) => i.sku)
const oneToN = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

// --- Токены и стили ---

/** Вычисленные значения токенов: ключ `${свойство} ${токен}`. */
async function readTokens(page: Page, pairs: [string, string][]): Promise<Record<string, string>> {
  return top(page).evaluate((section, list) => {
    const out: Record<string, string> = {}
    for (const [property, token] of list) {
      const probe = document.createElement('div')
      probe.style.setProperty(property, `var(${token})`)
      section.append(probe)
      out[`${property} ${token}`] = getComputedStyle(probe).getPropertyValue(property)
      probe.remove()
    }
    return out
  }, pairs)
}

async function colorTokens(page: Page, tokens: string[]): Promise<Record<string, string>> {
  const values = await readTokens(
    page,
    tokens.map((t) => ['color', t]),
  )
  return Object.fromEntries(tokens.map((t) => [t, values[`color ${t}`] as string]))
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

/**
 * Ожидаемый порядок «по возрастанию» (spec 006, «Сортировка»): ответ наоборот;
 * только при сортировке по % выкупа товары без значения остаются в конце в исходном порядке.
 */
function ascendingOf(desc: Item[], byBuyoutRate: boolean): string[] {
  const reversed = [...desc].reverse()
  if (!byBuyoutRate) return skusOf(reversed)
  return [...skusOf(reversed.filter((i) => !i.buyoutNull)), ...skusOf(desc.filter((i) => i.buyoutNull))]
}

// =====================================================================================

test.describe('AC-21: сценарии на дашборде (1440 и 375 px)', () => {
  test('AC-21, AC-1: топ из 10 товаров под графиком, на всю ширину, с видимым h2', async ({ page, viewport }) => {
    const phone = isPhone(viewport)
    await page.goto('/dashboard')
    await waitTop(page, phone)

    const items = await readItems(page, phone)
    expect(items).toHaveLength(10)
    expect(items.map((i) => i.rank)).toEqual(oneToN(10))
    for (const item of items) expect(item.sku, 'у каждой строки есть «Арт. …»').toMatch(/^\d+$/)
    await expect(top(page).getByRole('heading', { level: 2, name: 'Топ-10 товаров' })).toBeVisible()

    const kpi = await kpiRegion(page).boundingBox()
    const graph = await chart(page).boundingBox()
    const section = await top(page).boundingBox()
    if (!kpi || !graph || !section) throw new Error('Нет KPI, графика или топа')
    expect(Math.abs(section.width - kpi.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(section.x - kpi.x)).toBeLessThanOrEqual(1)
    expect(section.y).toBeGreaterThan(graph.y + graph.height - 1)
  })

  test('AC-21, AC-8: на 1440 «Заказы» → «по заказам за период» и aria-sort; второй клик — по возрастанию и обратный порядок', async ({
    page,
    viewport,
  }) => {
    test.skip(isPhone(viewport), 'Таблица — только на ≥ 640 px')
    const requests = countTopRequests(page)
    await page.goto('/dashboard')
    await waitTop(page, false)
    await expect(subtitle(page, 'по выручке за период')).toBeVisible()
    await expect(headerCell(page, 'Выручка')).toHaveAttribute('aria-sort', 'descending')
    const byRevenue = skusOf(await readItems(page, false))

    await sortButton(page, 'Заказы').click()

    await expect(subtitle(page, 'по заказам за период')).toBeVisible()
    await expect(headerCell(page, 'Заказы')).toHaveAttribute('aria-sort', 'descending')
    await expect(headerCell(page, 'Выручка')).toHaveAttribute('aria-sort', 'none')
    await expect.poll(() => requests.sorts.includes('orders'), { timeout: DATA_TIMEOUT }).toBe(true)
    await expect
      .poll(async () => skusOf(await readItems(page, false)).join(), { timeout: DATA_TIMEOUT })
      .not.toBe(byRevenue.join())
    await waitTop(page, false)
    const desc = await readItems(page, false)
    expect(desc.map((i) => i.rank)).toEqual(oneToN(desc.length))
    const before = requests.count

    await sortButton(page, 'Заказы').click()

    await expect(subtitle(page, 'по заказам, по возрастанию за период')).toBeVisible()
    await expect(headerCell(page, 'Заказы')).toHaveAttribute('aria-sort', 'ascending')
    const asc = await readItems(page, false)
    // «Заказы» — простой разворот, товары без % выкупа разворачиваются со всеми
    expect(skusOf(asc)).toEqual(ascendingOf(desc, false))
    expect(asc.map((i) => i.rank)).toEqual(oneToN(asc.length))
    // Направление — без нового запроса
    expect(requests.count).toBe(before)
  })

  test('AC-21, AC-11: на 375 — карточки; кнопка сортировки меняет подпись на «По прибыли»', async ({ page, viewport }) => {
    test.skip(!isPhone(viewport), 'Только для ширины < 640 px')
    await page.goto('/dashboard')
    await waitTop(page, true)
    await expect(topTable(page)).toHaveCount(0)
    await expect(cycleButton(page)).toHaveAccessibleName('Сменить сортировку, сейчас: По выручке')
    await expect(cycleButton(page)).toHaveText('По выручке')

    await cycleButton(page).click()

    await expect(cycleButton(page)).toHaveAccessibleName('Сменить сортировку, сейчас: По прибыли')
    await expect(cycleButton(page)).toHaveText('По прибыли')
    await expect(subtitle(page, 'по прибыли за период')).toBeVisible()
    await waitTop(page, true)
    const items = await readItems(page, true)
    expect(items.length).toBeGreaterThan(0)
    expect(items.map((i) => i.rank)).toEqual(oneToN(items.length))
  })

  test('AC-21, AC-2: выбор «WB» в фильтре — у всех строк бейдж «WB»', async ({ page, viewport }) => {
    const phone = isPhone(viewport)
    await page.goto('/dashboard')
    await waitTop(page, phone)
    // По умолчанию в топе обе площадки — иначе проверка была бы пустой
    const before = await readItems(page, phone)
    for (const item of before) expect(['WB', 'Ozon']).toContain(item.badge)

    await pickMarketplace(page, 'WB', phone)

    await expect(page).toHaveURL(/[?&]mp=wb(&|$)/)
    // Ждём новые строки: все бейджи — «WB» (старые строки с Ozon сменятся после ответа)
    await expect
      .poll(
        async () => {
          const shown = await readItems(page, phone)
          return shown.length > 0 && shown.every((i) => i.badge === 'WB')
        },
        { timeout: DATA_TIMEOUT },
      )
      .toBe(true)
    await waitTop(page, phone)
    const items = await readItems(page, phone)
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) expect(item.badge, item.sku).toBe('WB')
  })

  test('AC-21, AC-12: на 375 нет горизонтальной прокрутки страницы (и после смены сортировки)', async ({ page, viewport }) => {
    test.skip(!isPhone(viewport), 'Только для ширины < 640 px')
    await page.goto('/dashboard')
    await waitTop(page, true)

    expect(await hasHorizontalScroll(page)).toBe(false)
    await cycleButton(page).click()
    await waitTop(page, true)
    expect(await hasHorizontalScroll(page)).toBe(false)
  })
})

test.describe('Раскладка дашборда', () => {
  test('AC-1: зазор между графиком и топом — 24 на 1440, 16 на 768, 12 на 375', async ({ page, viewport }) => {
    const widths: [number, number][] = isPhone(viewport) ? [[375, 12]] : [[1440, 24], [768, 16]]
    for (const [width, gap] of widths) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/dashboard')
      await waitTop(page, width < 640)
      // Скелетон графика другой высоты: замеряем, когда график уже нарисован
      await expect(chart(page).getByRole('img', { name: /^Столбцы по дням/ })).toBeVisible({ timeout: DATA_TIMEOUT })
      const graph = await chart(page).boundingBox()
      const section = await top(page).boundingBox()
      if (!graph || !section) throw new Error('Нет графика или топа')
      expect(Math.abs(section.y - (graph.y + graph.height) - gap), `${width} px`).toBeLessThanOrEqual(1)
    }
  })

  test('AC-12: 768 px — таблица мин. ширины 680, страница не прокручивается по X', async ({ page, viewport }) => {
    test.skip(isPhone(viewport), 'Только в проекте 1440 px')
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/dashboard')
    await waitTop(page, false)

    expect((await styleOf(topTable(page), ['min-width']))['min-width']).toBe('680px')
    const box = await topTable(page).boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(680 - 0.5)
    expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test('AC-12: 640 px — места меньше 680: прокрутка по X внутри блока, без прокрутки страницы', async ({ page, viewport }) => {
    test.skip(isPhone(viewport), 'Только в проекте 1440 px')
    await page.setViewportSize({ width: 640, height: 900 })
    await page.goto('/dashboard')
    await waitTop(page, false)

    const scroll = await topTable(page).evaluate((table) => {
      const section = table.closest('section')
      let el: HTMLElement | null = table.parentElement
      while (el && el !== section) {
        const overflowX = getComputedStyle(el).overflowX
        if (overflowX === 'auto' || overflowX === 'scroll') {
          return { overflowX, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
        }
        el = el.parentElement
      }
      return null
    })
    expect(scroll, 'контейнер с overflow-x: auto внутри секции').not.toBeNull()
    expect(scroll?.scrollWidth ?? 0).toBeGreaterThan(scroll?.clientWidth ?? 0)
    expect(await hasHorizontalScroll(page)).toBe(false)
    // Секция не шире страницы
    const section = await top(page).boundingBox()
    expect((section?.x ?? 0) + (section?.width ?? 0)).toBeLessThanOrEqual(640)
  })
})

test.describe('Таблица: ячейки и заголовки', () => {
  test.skip(({ viewport }) => isPhone(viewport), 'Таблица — в проекте 1440 px')

  /** Стили первой строки и её частей. */
  async function readRowStyles(page: Page) {
    return topTable(page).evaluate((table) => {
      const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
      type Picked = { css: Record<string, string>; width: number; height: number }
      const pick = (el: Element | null | undefined, props: string[]): Picked | null => {
        if (!el) return null
        const cs = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        return { css: Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)])), width: r.width, height: r.height }
      }
      const row = [...table.querySelectorAll('tr')].find((r) => !r.closest('thead') && r.querySelector('td'))
      if (!row) return null
      const cells = [...row.querySelectorAll('th, td')]
      const product = cells[1]
      const preview = product?.querySelector('[aria-hidden="true"]')
      const leaves = product ? [...product.querySelectorAll('*')].filter((el) => el.children.length === 0 && n(el.textContent) !== '') : []
      const name = leaves.find((el) => !/^Арт\./.test(n(el.textContent)))
      const sub = leaves.find((el) => /^Арт\./.test(n(el.textContent)))
      const badge = cells[2] ? [...cells[2].querySelectorAll('*')].find((el) => /^(WB|Ozon)$/.test(n(el.textContent)) && el.children.length === 0) ?? cells[2] : null
      const props = ['color', 'font-size', 'line-height', 'font-weight', 'text-align', 'font-variant-numeric', 'padding-left', 'padding-right']
      return {
        rank: pick(cells[0], props),
        preview: pick(preview, ['background-color', 'border-top-left-radius']),
        name: pick(name, ['font-size', 'line-height', 'font-weight', 'white-space', 'overflow-x', 'text-overflow', 'max-width']),
        sub: pick(sub, ['font-size', 'line-height', 'color']),
        badgeText: n(badge?.textContent),
        badge: pick(badge, ['background-color', 'color', 'border-top-left-radius', 'font-size', 'font-weight']),
        numbers: cells.slice(3, 7).map((c) => pick(c, props)),
      }
    })
  }

  test('AC-5: #, превью 36 × 36, название с многоточием (макс. 520), «Арт.» 12/16 --text-3, числа справа tabular', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    await waitTop(page, false)
    const tokens = await readTokens(page, [
      ['color', '--text-3'],
      ['background-color', '--surface-2'],
      ['border-top-left-radius', '--r-md'],
    ])
    const s = await readRowStyles(page)
    if (!s || !s.rank || !s.preview || !s.name || !s.sub) throw new Error('Не нашлись части строки')

    expect(s.rank.css.color).toBe(tokens['color --text-3'])
    expect(s.preview.width).toBeCloseTo(36, 0)
    expect(s.preview.height).toBeCloseTo(36, 0)
    expect(s.preview.css['background-color']).toBe(tokens['background-color --surface-2'])
    expect(s.preview.css['border-top-left-radius']).toBe(tokens['border-top-left-radius --r-md'])
    expect(s.name.css).toMatchObject({
      'font-size': '14px',
      'line-height': '20px',
      'font-weight': '500',
      'white-space': 'nowrap',
      'overflow-x': 'hidden',
      'text-overflow': 'ellipsis',
      'max-width': '520px',
    })
    expect(s.sub.css).toMatchObject({ 'font-size': '12px', 'line-height': '16px', color: tokens['color --text-3'] })

    expect(s.numbers).toHaveLength(4)
    const [revenue, orders, buyout, profit] = s.numbers
    for (const cell of s.numbers) {
      expect(cell?.css['text-align']).toBe('right')
      expect(cell?.css['font-variant-numeric']).toContain('tabular-nums')
    }
    expect(revenue?.css['font-weight']).toBe('500')
    expect(profit?.css['font-weight']).toBe('500')
    expect(orders?.css['font-weight']).toBe('400')
    expect(buyout?.css['font-weight']).toBe('400')
  })

  test('AC-5: на 768 px название — не шире 260', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/dashboard')
    await waitTop(page, false)

    const s = await readRowStyles(page)
    expect(s?.name?.css['max-width']).toBe('260px')
    expect(s?.name?.width ?? 0).toBeLessThanOrEqual(260.5)
  })

  test('AC-5, AC-19: бейдж площадки — высота 20, радиус 4, 12/600; WB — --wb-soft / --wb-text, Ozon — --ozon-soft / --ozon-text', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    await waitTop(page, false)
    const tokens = await readTokens(page, [
      ['background-color', '--wb-soft'],
      ['color', '--wb-text'],
      ['background-color', '--ozon-soft'],
      ['color', '--ozon-text'],
    ])

    const badges = await topTable(page).evaluate((table) => {
      const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
      const rows = [...table.querySelectorAll('tr')].filter((r) => !r.closest('thead') && r.querySelector('td'))
      return rows.map((row) => {
        const cell = row.querySelectorAll('th, td')[2]
        const el = cell ? [...cell.querySelectorAll('*')].find((x) => x.children.length === 0 && /^(WB|Ozon)$/.test(n(x.textContent))) : null
        if (!el) return null
        const cs = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        return {
          text: n(el.textContent),
          bg: cs.backgroundColor,
          color: cs.color,
          height: r.height,
          radius: cs.borderTopLeftRadius,
          size: cs.fontSize,
          weight: cs.fontWeight,
        }
      })
    })
    expect(badges.length).toBeGreaterThan(0)
    const seen = new Set<string>()
    for (const badge of badges) {
      if (!badge) throw new Error('В ячейке «Площадка» нет бейджа WB / Ozon')
      seen.add(badge.text)
      const mp = badge.text === 'WB' ? 'wb' : 'ozon'
      expect(badge.bg, badge.text).toBe(tokens[`background-color --${mp}-soft`])
      expect(badge.color, badge.text).toBe(tokens[`color --${mp}-text`])
      expect(badge.height).toBeCloseTo(20, 0)
      expect(badge.radius).toBe('4px')
      expect(badge.size).toBe('12px')
      expect(badge.weight).toBe('600')
    }
    // В данных по умолчанию есть обе площадки — проверены оба цвета
    expect([...seen].sort()).toEqual(['Ozon', 'WB'])
  })

  test('AC-7: активный заголовок — --text и стрелка; неактивные — --text-3 и двойная стрелка с непрозрачностью 0,55', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    await waitTop(page, false)
    const tokens = await colorTokens(page, ['--text', '--text-3'])

    const read = (label: string) =>
      sortButton(page, label).evaluate((button) => {
        const svg = button.querySelector('svg')
        let opacity = 1
        for (let el: Element | null = svg; el && el !== button.parentElement; el = el.parentElement) {
          opacity *= Number.parseFloat(getComputedStyle(el).opacity || '1')
        }
        return { color: getComputedStyle(button).color, opacity, svg: svg?.outerHTML ?? '' }
      })

    const active = await read('Выручка')
    expect(active.color).toBe(tokens['--text'])
    expect(active.opacity).toBeCloseTo(1, 2)
    for (const label of ['Заказы', '% выкупа', 'Прибыль']) {
      const inactive = await read(label)
      expect(inactive.color, label).toBe(tokens['--text-3'])
      expect(inactive.opacity, label).toBeCloseTo(0.55, 2)
      expect(inactive.svg, label).not.toBe(active.svg)
    }

    // По возрастанию — другая стрелка, цвет тот же
    await sortButton(page, 'Выручка').click()
    await expect(headerCell(page, 'Выручка')).toHaveAttribute('aria-sort', 'ascending')
    const asc = await read('Выручка')
    expect(asc.color).toBe(tokens['--text'])
    expect(asc.svg).not.toBe(active.svg)
  })

  test('AC-8: «% выкупа» по возрастанию — обратный порядок, товары без значения («—») в конце', async ({ page }) => {
    await page.goto('/dashboard')
    await waitTop(page, false)
    const byRevenue = skusOf(await readItems(page, false))

    await sortButton(page, '% выкупа').click()
    await expect(subtitle(page, 'по % выкупа за период')).toBeVisible()
    await expect
      .poll(async () => skusOf(await readItems(page, false)).join(), { timeout: DATA_TIMEOUT })
      .not.toBe(byRevenue.join())
    await waitTop(page, false)
    const desc = await readItems(page, false)

    await sortButton(page, '% выкупа').click()

    await expect(subtitle(page, 'по % выкупа, по возрастанию за период')).toBeVisible()
    await expect(headerCell(page, '% выкупа')).toHaveAttribute('aria-sort', 'ascending')
    const asc = await readItems(page, false)
    expect(skusOf(asc)).toEqual(ascendingOf(desc, true))
    expect(asc.map((i) => i.rank)).toEqual(oneToN(asc.length))
  })

  test('AC-9: при смене метрики фокус остаётся на нажатой кнопке-заголовке', async ({ page }) => {
    await page.goto('/dashboard')
    await waitTop(page, false)

    await sortButton(page, 'Прибыль').focus()
    await page.keyboard.press('Enter')

    await expect(headerCell(page, 'Прибыль')).toHaveAttribute('aria-sort', 'descending')
    await expect(sortButton(page, 'Прибыль')).toBeFocused()
    await expect(subtitle(page, 'по прибыли за период')).toBeVisible()
    await waitTop(page, false)
    await expect(sortButton(page, 'Прибыль')).toBeFocused()
  })

  test('AC-13: наведение на строку — фон --surface-2; строки не в порядке Tab', async ({ page }) => {
    await page.goto('/dashboard')
    await waitTop(page, false)
    const tokens = await colorTokens(page, ['--surface-2'])
    const row = topTable(page).locator('tbody tr').nth(2)
    const background = () =>
      row.evaluate((tr) => {
        const own = getComputedStyle(tr).backgroundColor
        if (own !== 'rgba(0, 0, 0, 0)' && own !== 'transparent') return own
        const cell = tr.querySelector('td')
        return cell ? getComputedStyle(cell).backgroundColor : own
      })

    await page.mouse.move(0, 0)
    expect(await background()).not.toBe(tokens['--surface-2'])
    await row.hover()
    await expect.poll(background).toBe(tokens['--surface-2'])

    const focusable = await topTable(page).evaluate(
      (table) => [...table.querySelectorAll('tbody tr, tbody td, tbody [tabindex], tbody a, tbody button')].filter((el) => (el as HTMLElement).tabIndex >= 0).length,
    )
    expect(focusable).toBe(0)
  })
})

test.describe('Раскладка блока', () => {
  const LAYOUT = {
    desktop: { width: 1440, p: 20 },
    tablet: { width: 768, p: 16 },
  } as const

  async function checkCard(page: Page, p: number): Promise<void> {
    const tokens = await readTokens(page, [
      ['background-color', '--surface'],
      ['border-top-color', '--border'],
      ['border-top-left-radius', '--r-lg'],
      ['box-shadow', '--shadow-sm'],
      ['color', '--text-2'],
    ])
    const section = await styleOf(top(page), [
      'background-color',
      'border-top-color',
      'border-top-width',
      'border-top-left-radius',
      'box-shadow',
      'padding-left',
      'padding-top',
    ])
    expect(section['background-color']).toBe(tokens['background-color --surface'])
    expect(section['border-top-color']).toBe(tokens['border-top-color --border'])
    expect(section['border-top-width']).toBe('1px')
    expect(section['border-top-left-radius']).toBe(tokens['border-top-left-radius --r-lg'])
    expect(section['box-shadow']).toBe(tokens['box-shadow --shadow-sm'])
    // Без внутреннего padding: отступы задают шапка и крайние ячейки
    expect(section['padding-left']).toBe('0px')
    expect(section['padding-top']).toBe('0px')

    const head = await top(page).evaluate((s) => {
      const h2 = s.querySelector('h2')
      let header: Element | null = h2
      while (header && header.parentElement !== s) header = header.parentElement
      if (!h2 || !header) return null
      const cs = getComputedStyle(header)
      const h = getComputedStyle(h2)
      return {
        padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft],
        display: cs.display,
        wrap: cs.flexWrap,
        justify: cs.justifyContent,
        gap: cs.columnGap,
        h2: { size: h.fontSize, lh: h.lineHeight, weight: h.fontWeight, bottom: h2.getBoundingClientRect().bottom },
      }
    })
    if (!head) throw new Error('Нет шапки блока — прямого потомка section с h2')
    expect(head.padding).toEqual([`${p}px`, `${p}px`, '12px', `${p}px`])
    expect(head.display).toBe('flex')
    expect(head.wrap).toBe('wrap')
    expect(head.justify).toBe('space-between')
    expect(head.gap).toBe('12px')
    expect(head.h2).toMatchObject({ size: '16px', lh: '24px', weight: '600' })

    const sub = top(page).getByText(/^по .+ за период$/).first()
    const subStyle = await styleOf(sub, ['font-size', 'color'])
    expect(subStyle['font-size']).toBe('13px')
    expect(subStyle.color).toBe(tokens['color --text-2'])
    const subBox = await sub.boundingBox()
    expect(Math.abs((subBox?.y ?? 0) - head.h2.bottom - 2)).toBeLessThanOrEqual(1)
  }

  for (const layout of Object.values(LAYOUT)) {
    test(`AC-18: ${layout.width} px — карточка, шапка {${layout.p} ${layout.p} 12}, шапка таблицы 36 --surface-2, строки 56 с линией --border, крайние отступы ${layout.p}`, async ({
      page,
      viewport,
    }) => {
      test.skip(isPhone(viewport), 'Только в проекте 1440 px')
      await page.setViewportSize({ width: layout.width, height: 1024 })
      await page.goto('/dashboard')
      await waitTop(page, false)
      await checkCard(page, layout.p)
      const tokens = await readTokens(page, [
        ['background-color', '--surface-2'],
        ['color', '--text-3'],
        ['border-top-color', '--border'],
      ])

      const table = await topTable(page).evaluate((t) => {
        const head = t.querySelector('thead tr')
        const ths = head ? [...head.querySelectorAll('th')] : []
        const rows = [...t.querySelectorAll('tr')].filter((r) => !r.closest('thead') && r.querySelector('td'))
        const bg = (el: Element) => getComputedStyle(el).backgroundColor
        const transparent = (c: string) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent'
        return {
          headHeight: head?.getBoundingClientRect().height ?? 0,
          headBg: head ? (transparent(bg(head)) && ths[0] ? bg(ths[0]) : bg(head)) : '',
          plainTh: ths.slice(0, 3).map((th) => {
            const cs = getComputedStyle(th)
            return { size: cs.fontSize, weight: cs.fontWeight, color: cs.color }
          }),
          rows: rows.map((r) => {
            const td = r.querySelector('td') as Element
            const own = getComputedStyle(r)
            const cell = getComputedStyle(td)
            const width = own.borderTopWidth !== '0px' ? own.borderTopWidth : cell.borderTopWidth
            const color = own.borderTopWidth !== '0px' ? own.borderTopColor : cell.borderTopColor
            const cells = [...r.querySelectorAll('th, td')]
            return {
              height: r.getBoundingClientRect().height,
              borderWidth: width,
              borderColor: color,
              fontSize: getComputedStyle(cells[4] as Element).fontSize,
              lineHeight: getComputedStyle(cells[4] as Element).lineHeight,
              firstPadLeft: getComputedStyle(cells[0] as Element).paddingLeft,
              lastPadRight: getComputedStyle(cells.at(-1) as Element).paddingRight,
            }
          }),
        }
      })
      expect(table.headHeight).toBeCloseTo(36, 0)
      expect(table.headBg).toBe(tokens['background-color --surface-2'])
      for (const th of table.plainTh) expect(th).toEqual({ size: '12px', weight: '600', color: tokens['color --text-3'] })
      expect(table.rows.length).toBeGreaterThan(0)
      for (const row of table.rows) {
        expect(row.height).toBeCloseTo(56, 0)
        expect(row.borderWidth).toBe('1px')
        expect(row.borderColor).toBe(tokens['border-top-color --border'])
        expect(row.fontSize).toBe('13px')
        expect(row.lineHeight).toBe('18px')
        expect(row.firstPadLeft).toBe(`${layout.p}px`)
        expect(row.lastPadRight).toBe(`${layout.p}px`)
      }
    })
  }

  test('AC-18, AC-10: 375 px — карточки: padding 12/16, зазор 12, линия --border; превью 44; dl 2 × 2; шрифты по макету', async ({
    page,
    viewport,
  }) => {
    test.skip(!isPhone(viewport), 'Только для ширины < 640 px')
    await page.goto('/dashboard')
    await waitTop(page, true)
    await checkCard(page, 16)
    const tokens = await readTokens(page, [
      ['border-top-color', '--border'],
      ['color', '--text-3'],
      ['background-color', '--surface-2'],
    ])

    const cards = await top(page).evaluate((section) => {
      const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
      return [...section.querySelectorAll('ol > li')].map((li) => {
        const cs = getComputedStyle(li)
        const liBox = li.getBoundingClientRect()
        const preview = li.querySelector('[aria-hidden="true"]')
        const leaves = [...li.querySelectorAll('*')].filter((el) => el.children.length === 0 && n(el.textContent) !== '' && !el.closest('dl'))
        const sub = leaves.find((el) => /^№\d+/.test(n(el.textContent)))
        const badge = leaves.find((el) => /^(WB|Ozon)$/.test(n(el.textContent)))
        const name = leaves.find((el) => el !== sub && el !== badge)
        const dl = li.querySelector('dl')
        const dts = dl ? [...dl.querySelectorAll('dt')] : []
        const dds = dl ? [...dl.querySelectorAll('dd')] : []
        const font = (el: Element | undefined) => {
          if (!el) return null
          const s = getComputedStyle(el)
          return { size: s.fontSize, lh: s.lineHeight, weight: s.fontWeight, color: s.color }
        }
        return {
          padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft],
          gap: cs.columnGap,
          border: { width: cs.borderTopWidth, color: cs.borderTopColor },
          preview: preview
            ? { w: preview.getBoundingClientRect().width, h: preview.getBoundingClientRect().height, bg: getComputedStyle(preview).backgroundColor }
            : null,
          name: name ? { ...font(name), clamp: getComputedStyle(name).getPropertyValue('-webkit-line-clamp') } : null,
          sub: font(sub),
          badgeRight: badge ? liBox.right - badge.getBoundingClientRect().right : null,
          grid: dl ? { display: getComputedStyle(dl).display, columns: getComputedStyle(dl).gridTemplateColumns.split(' ').length } : null,
          terms: dts.map((dt) => ({ text: n(dt.textContent), ...font(dt) })),
          values: dds.map((dd) => font(dd)),
        }
      })
    })

    expect(cards).toHaveLength(10)
    for (const card of cards) {
      expect(card.padding).toEqual(['12px', '16px', '12px', '16px'])
      expect(card.gap).toBe('12px')
      expect(card.border).toEqual({ width: '1px', color: tokens['border-top-color --border'] })
      expect(card.preview?.w).toBeCloseTo(44, 0)
      expect(card.preview?.h).toBeCloseTo(44, 0)
      expect(card.preview?.bg).toBe(tokens['background-color --surface-2'])
      expect(card.name).toMatchObject({ size: '14px', lh: '20px', weight: '500', clamp: '2' })
      expect(card.sub).toMatchObject({ size: '12px', lh: '16px', color: tokens['color --text-3'] })
      // Бейдж справа: до правого края карточки — padding 16
      expect(Math.abs((card.badgeRight ?? 0) - 16)).toBeLessThanOrEqual(1)
      expect(card.grid).toEqual({ display: 'grid', columns: 2 })
      expect(card.terms.map((t) => t.text)).toEqual(['Выручка', 'Прибыль', 'Заказы', '% выкупа'])
      for (const term of card.terms) expect(term).toMatchObject({ size: '12px', lh: '16px', color: tokens['color --text-3'] })
      expect(card.values[0]).toMatchObject({ size: '14px', lh: '20px', weight: '600' })
      expect(card.values[1]).toMatchObject({ size: '14px', lh: '20px', weight: '600' })
      expect(card.values[2]).toMatchObject({ size: '13px', lh: '18px' })
      expect(card.values[3]).toMatchObject({ size: '13px', lh: '18px' })
    }
  })

  test('AC-11: 375 px — кнопка сортировки высотой 44 справа в шапке; на 1440 её нет', async ({ page, viewport }) => {
    const phone = isPhone(viewport)
    await page.goto('/dashboard')
    await waitTop(page, phone)

    if (!phone) {
      await expect(cycleButton(page)).toHaveCount(0)
      return
    }
    const button = await cycleButton(page).boundingBox()
    const section = await top(page).boundingBox()
    const h2 = await top(page).getByRole('heading', { level: 2 }).boundingBox()
    if (!button || !section || !h2) throw new Error('Нет кнопки, секции или заголовка')
    expect(button.height).toBeCloseTo(44, 0)
    // Справа в шапке: правый край — на отступе 16 от края карточки (рамка 1 px)
    expect(Math.abs(section.x + section.width - 1 - 16 - (button.x + button.width))).toBeLessThanOrEqual(1.5)
    expect(button.x).toBeGreaterThan(h2.x)
  })
})

test.describe('Загрузка', () => {
  test('AC-14: скелетон (если успели застать первую загрузку) — шапка 36, 10 строк по 56, квадрат 36, полосы, без шиммера', async ({
    page,
    viewport,
  }) => {
    const phone = isPhone(viewport)
    await page.goto('/dashboard')
    const busy = top(page).getByLabel('Загружаем топ товаров')
    const caught = await busy.waitFor({ state: 'attached', timeout: 3_000 }).then(
      () => true,
      () => false,
    )
    test.skip(!caught, 'Данные пришли раньше, чем появился скелетон — состояние проверено интеграционными тестами')

    // Одним снимком: скелетон может исчезнуть в любой момент
    const snapshot = await top(page).evaluate((section) => {
      const el = section.querySelector('[aria-label="Загружаем топ товаров"]')
      if (!el) return null
      const kids = [...el.children]
      const probe = document.createElement('div')
      probe.style.backgroundColor = 'var(--skeleton)'
      section.append(probe)
      const skeleton = getComputedStyle(probe).backgroundColor
      probe.style.backgroundColor = 'var(--surface-2)'
      const surface2 = getComputedStyle(probe).backgroundColor
      probe.style.borderTopColor = 'var(--border)'
      const border = getComputedStyle(probe).borderTopColor
      probe.remove()
      return {
        busy: el.getAttribute('aria-busy'),
        tokens: { skeleton, surface2, border },
        kids: kids.map((k) => {
          const cs = getComputedStyle(k)
          return {
            height: k.getBoundingClientRect().height,
            bg: cs.backgroundColor,
            borderWidth: cs.borderTopWidth,
            borderColor: cs.borderTopColor,
            boxes: [...k.querySelectorAll('*')]
              .filter((b) => getComputedStyle(b).backgroundColor === skeleton)
              .map((b) => {
                const r = b.getBoundingClientRect()
                return { w: Math.round(r.width), h: Math.round(r.height), animation: getComputedStyle(b).animationName }
              }),
          }
        }),
      }
    })
    test.skip(snapshot === null, 'Скелетон исчез до снимка')
    if (!snapshot) return

    expect(snapshot.busy).toBe('true')
    const [strip, ...rows] = snapshot.kids
    expect(strip?.height).toBeCloseTo(36, 0)
    expect(strip?.bg).toBe(snapshot.tokens.surface2)
    expect(rows).toHaveLength(10)
    for (const row of rows) {
      expect(row.height).toBeCloseTo(56, 0)
      expect(row.borderWidth).toBe('1px')
      expect(row.borderColor).toBe(snapshot.tokens.border)
      expect(row.boxes.some((b) => b.w === 36 && b.h === 36), 'квадрат 36').toBe(true)
      expect(row.boxes.filter((b) => b.h === 12).length + row.boxes.filter((b) => b.h === 10).length).toBeGreaterThanOrEqual(2)
      const bars12 = row.boxes.filter((b) => b.h === 12 && b.w !== 36).map((b) => b.w)
      // На ≥ 640 — ещё четыре полосы 12 × 72 / 40 / 48 / 72
      if (!phone) expect(bars12.slice(-4)).toEqual([72, 40, 48, 72])
      for (const box of row.boxes) expect(box.animation).toBe('none')
    }
  })
})
