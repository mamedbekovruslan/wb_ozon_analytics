import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'

/*
 * Spec 005 «График продаж по дням» — сценарии в настоящем браузере (проекты 1440 и 375 px,
 * часть проверок — ещё на 768 px). Данные — из фейкового API с реальным «сегодня», поэтому
 * конкретные числа не захардкожены: ожидания считаются из самой страницы — период из aria-label,
 * значения по дням из sr-only таблицы (её содержимое проверено интеграционными тестами).
 *
 * Recharts рисует SVG с классами recharts-*: по ним находятся столбцы, линия, сетка и оси.
 * Цвета сравниваются с вычисленными значениями токенов из tokens.css.
 */

// Первая генерация данных в браузере может занять несколько секунд
const DATA_TIMEOUT = 15_000

const MONTHS_SHORT = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.']
const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()

// --- Локаторы ---

const chart = (page: Page) => page.getByRole('region', { name: 'Продажи по дням' })
const chartImg = (page: Page) => chart(page).getByRole('img', { name: /^Столбцы по дням/ })
const salesTable = (page: Page) => chart(page).getByRole('table')
const metricGroup = (page: Page) => chart(page).getByRole('group', { name: 'Метрика графика' })
const metricButton = (page: Page, name: string) => metricGroup(page).getByRole('button', { name, exact: true })
const tooltip = (page: Page) => chart(page).getByRole('tooltip')
const kpiRegion = (page: Page) => page.getByRole('region', { name: 'Ключевые показатели' })

const isPhone = (viewport: { width: number } | null) => (viewport?.width ?? 0) < 640

async function waitChart(page: Page): Promise<void> {
  await expect(chartImg(page)).toBeVisible({ timeout: DATA_TIMEOUT })
}

const hasHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

/** Считает запросы /api/sales-daily (ответ MSW из Service Worker виден как обычный запрос страницы). */
function countSalesRequests(page: Page): { count: number } {
  const counter = { count: 0 }
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/sales-daily') counter.count += 1
  })
  return counter
}

// --- Даты ---

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const axisDate = (d: Date) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

type Period = { from: Date; to: Date; days: number }

/** Период из aria-label: «Столбцы по дням с 5 октября по 3 ноября 2026: …» (год у начала — если годы разные). */
function parsePeriod(label: string): Period {
  const m = /^Столбцы по дням с (\d{1,2}) (\p{L}+)(?: (\d{4}))? по (\d{1,2}) (\p{L}+) (\d{4}):/u.exec(norm(label))
  if (!m) throw new Error(`aria-label не по формату spec: «${label}»`)
  const toYear = Number(m[6])
  const from = new Date(m[3] ? Number(m[3]) : toYear, MONTHS_GENITIVE.indexOf(m[2] as string), Number(m[1]))
  const to = new Date(toYear, MONTHS_GENITIVE.indexOf(m[5] as string), Number(m[4]))
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
  return { from, to, days }
}

async function readPeriod(page: Page): Promise<Period> {
  return parsePeriod((await chartImg(page).getAttribute('aria-label')) ?? '')
}

/** «ср, 28 окт. 2026» → дата; день недели сверяется с календарём. */
function parseTooltipDate(text: string): Date {
  const m = /(пн|вт|ср|чт|пт|сб|вс), (\d{1,2}) (\S+) (\d{4})/.exec(norm(text))
  if (!m) throw new Error(`В тултипе нет даты формата «ср, 28 окт. 2026»: «${text}»`)
  const month = MONTHS_SHORT.indexOf(m[3] as string)
  expect(month, `месяц «${m[3]}»`).toBeGreaterThanOrEqual(0)
  const date = new Date(Number(m[4]), month, Number(m[2]))
  expect(WEEKDAYS[date.getDay()], `день недели для ${m[0]}`).toBe(m[1])
  return date
}

// --- Числа ---

/** «1 234 567 ₽», «−13 000 ₽», «5 476 шт» → число. */
const toNumber = (s: string) => Number(s.replace(/−/g, '-').replace(/[^\d,-]/g, '').replace(',', '.'))

/** Подпись оси Y для денег (как formatAxisMoney): «0», «250 тыс.», «1,5 млн», «2 млн». */
function axisMoney(n: number): string {
  if (n === 0) return '0'
  const sign = n < 0 ? '−' : ''
  const a = Math.abs(n)
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1).replace('.', ',').replace(/,0$/, '')} млн`
  return `${sign}${norm(Math.round(a / 1e3).toLocaleString('ru-RU'))} тыс.`
}

/**
 * niceAxis из spec 005, раздел «Расчёты» — чтобы сверить деления оси Y с данными таблицы.
 * `integer` (AC-25, «Заказы»): шаг не меньше 1, ступень 2,5 пропускается.
 */
function niceAxis(min: number, max: number, options: { integer?: boolean } = {}): number[] {
  const steps = options.integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]
  const nice = (raw: number) => {
    if (options.integer && raw <= 1) return 1
    const power = 10 ** Math.floor(Math.log10(raw))
    for (const m of steps) if (m * power >= raw - 1e-9) return m * power
    return 10 * power
  }
  if (min >= 0) {
    const step = nice(max / 4)
    return [0, 1, 2, 3, 4].map((k) => k * step)
  }
  const step = nice((max - min) / 4)
  const ticks: number[] = []
  for (let k = Math.floor(min / step); k <= Math.ceil(max / step); k++) ticks.push(k * step)
  return ticks
}

// --- Таблица ---

type Table = { headers: string[]; rows: string[][] }

async function readTable(page: Page): Promise<Table> {
  return salesTable(page).evaluate((table) => {
    const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
    const head = table.querySelector('thead')
    const headerCells = head ? [...head.querySelectorAll('th')] : [...(table.querySelector('tr')?.querySelectorAll('th') ?? [])]
    const rows = [...table.querySelectorAll('tr')]
      .filter((row) => !row.closest('thead') && row.querySelector('td'))
      .map((row) => [...row.querySelectorAll('th, td')].map((cell) => n(cell.textContent)))
    return { headers: headerCells.map((th) => n(th.textContent)), rows }
  })
}

function column(table: Table, name: string): number[] {
  const index = table.headers.indexOf(name)
  if (index < 0) throw new Error(`В таблице нет колонки «${name}»: ${table.headers.join(', ')}`)
  return table.rows.map((row) => toNumber(row[index] ?? ''))
}

// --- Токены и стили ---

/** Вычисленные значения токенов: ключ `${свойство} ${токен}`. */
async function readTokens(page: Page, pairs: [string, string][]): Promise<Record<string, string>> {
  return chart(page).evaluate((section, list) => {
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

// --- Столбцы ---

type Bar = {
  fill: string
  left: number
  right: number
  top: number
  bottom: number
  cx: number
  height: number
  opacity: number
  stroke: string
  strokeWidth: number
}

/** Прямоугольники серий (без курсора тултипа) с вычисленным цветом и итоговой непрозрачностью. */
async function readBars(page: Page): Promise<Bar[]> {
  return chart(page).evaluate((section) => {
    const shapes = [...section.querySelectorAll('.recharts-bar .recharts-rectangle')].filter(
      (el) => !el.closest('.recharts-tooltip-cursor') && !el.classList.contains('recharts-tooltip-cursor'),
    )
    return shapes
      .map((el) => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        let opacity = Number.parseFloat(cs.fillOpacity || '1')
        for (let node: Element | null = el; node && node !== section; node = node.parentElement) {
          opacity *= Number.parseFloat(getComputedStyle(node).opacity || '1')
        }
        return {
          fill: cs.fill,
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          cx: r.left + r.width / 2,
          height: r.height,
          opacity,
          stroke: cs.stroke,
          strokeWidth: Number.parseFloat(cs.strokeWidth || '0'),
        }
      })
      .filter((bar) => bar.height > 0)
  })
}

type Column = { cx: number; left: number; right: number; top: number; bottom: number; bars: Bar[] }

/** Столбцы одного дня — с общим центром по X; по возрастанию X (= по датам). */
function columns(bars: Bar[]): Column[] {
  const result: Column[] = []
  for (const bar of [...bars].sort((a, b) => a.cx - b.cx)) {
    const last = result.at(-1)
    if (last && Math.abs(last.cx - bar.cx) < 1) {
      last.bars.push(bar)
      last.top = Math.min(last.top, bar.top)
      last.bottom = Math.max(last.bottom, bar.bottom)
      last.left = Math.min(last.left, bar.left)
      last.right = Math.max(last.right, bar.right)
    } else {
      result.push({ cx: bar.cx, left: bar.left, right: bar.right, top: bar.top, bottom: bar.bottom, bars: [bar] })
    }
  }
  return result
}

/** Наводит (десктоп) или касается (телефон) дня `index`; возвращает точку указателя. */
async function pointDay(
  page: Page,
  index: number,
  phone: boolean,
): Promise<{ x: number; y: number; column: Column; count: number }> {
  // На телефоне график ниже первого экрана: касание по координатам вне окна никуда не попадёт
  await chartImg(page).scrollIntoViewIfNeeded()
  const cols = columns(await readBars(page))
  const col = cols[index < 0 ? cols.length + index : index]
  if (!col) throw new Error(`Нет столбца дня ${index}, всего ${cols.length}`)
  const box = await chartImg(page).boundingBox()
  if (!box) throw new Error('Область графика не видна')
  const x = col.cx
  const y = box.y + box.height * 0.45
  if (phone) await page.touchscreen.tap(x, y)
  else await page.mouse.move(x, y)
  return { x, y, column: col, count: cols.length }
}

// --- Легенда и тултип ---

/** Пункты легенды: элементы с меткой aria-hidden и текстом «WB …», «Ozon …», «Прошлый период» вне таблицы и тултипа. */
async function readLegend(page: Page): Promise<string[]> {
  return chart(page).evaluate((section) => {
    const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
    const candidates = [...section.querySelectorAll<HTMLElement>('*')].filter(
      (el) =>
        !el.closest('table') &&
        !el.closest('[role="tooltip"]') &&
        !el.closest('[role="img"]') &&
        el.getAttribute('aria-hidden') !== 'true' &&
        el.querySelector('[aria-hidden="true"]') !== null &&
        /^(WB|Ozon) \S|^Прошлый период$/.test(n(el.textContent)),
    )
    return candidates
      .filter((el) => !candidates.some((other) => other !== el && el.contains(other)))
      .map((el) => n(el.textContent))
  })
}

type Tooltip = {
  text: string
  rows: { label: string; value: string }[]
  box: { x: number; y: number; width: number; height: number }
}

/** Тултип: текст и строки «подпись → значение» (значение — последний дочерний элемент строки). */
async function readTooltip(page: Page): Promise<Tooltip> {
  const tip = tooltip(page)
  await expect(tip).toBeVisible()
  const box = await tip.boundingBox()
  if (!box) throw new Error('Тултип без размеров')
  const data = await tip.evaluate((root) => {
    const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
    const rowEls = [...root.querySelectorAll('*')].filter(
      (el) =>
        el.children.length >= 2 &&
        /\d (₽|шт)$/.test(n(el.textContent)) &&
        /\d/.test(n(el.lastElementChild?.textContent)) &&
        !/\d/.test(n(el.firstElementChild?.textContent).replace(/, \d{1,2} \S+$/, '')),
    )
    const rows = rowEls.filter((el) => !rowEls.some((other) => other !== el && el.contains(other)))
    return {
      text: n(root.textContent),
      rows: rows.map((el) => ({ label: n(el.firstElementChild?.textContent), value: n(el.lastElementChild?.textContent) })),
    }
  })
  return { ...data, box }
}

const rowValue = (tip: Tooltip, label: string | RegExp) =>
  tip.rows.find((row) => (typeof label === 'string' ? row.label === label : label.test(row.label)))?.value

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

const compareSwitch = (page: Page) =>
  page.getByRole('search', { name: 'Фильтры' }).getByRole('switch', { name: 'Сравнить с прошлым периодом' })

// =====================================================================================

test.describe('AC-23: сценарии на дашборде (1440 и 375 px)', () => {
  test('AC-23, AC-1: график с 30 днями по умолчанию — под KPI, на всю ширину', async ({ page }) => {
    await page.goto('/dashboard')
    await waitChart(page)

    const period = await readPeriod(page)
    expect(period.days).toBe(30)
    expect((await readTable(page)).rows).toHaveLength(30)
    expect(columns(await readBars(page))).toHaveLength(30)

    // На всю ширину страницы, как блок KPI, и под ним
    const kpi = await kpiRegion(page).boundingBox()
    const section = await chart(page).boundingBox()
    if (!kpi || !section) throw new Error('Нет KPI или графика')
    expect(Math.abs(section.width - kpi.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(section.x - kpi.x)).toBeLessThanOrEqual(1)
    expect(section.y).toBeGreaterThan(kpi.y + kpi.height - 1)
    await expect(chart(page).getByRole('heading', { level: 2, name: 'Продажи по дням' })).toBeVisible()
  })

  test('AC-23, AC-3: «Заказы» меняют подзаголовок на «… шт за период» без нового запроса', async ({ page }) => {
    const requests = countSalesRequests(page)
    await page.goto('/dashboard')
    await waitChart(page)
    await expect(chart(page).getByText(/₽ за период/).first()).toBeVisible()
    const before = requests.count

    await metricButton(page, 'Заказы').click()

    await expect(metricButton(page, 'Заказы')).toHaveAttribute('aria-pressed', 'true')
    // Перед «шт» — неразрывный пробел (formatPieces, AC-21)
    await expect(chart(page).getByText(/^[\d\s]+\sшт за период/).first()).toBeVisible()
    expect(requests.count).toBe(before)
  })

  test('AC-23, AC-5: выбор «WB» в фильтре убирает Ozon из легенды', async ({ page, viewport }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    await expect.poll(() => readLegend(page)).toEqual([
      expect.stringMatching(/^WB [−\d]/),
      expect.stringMatching(/^Ozon [−\d]/),
      'Прошлый период',
    ])

    await pickMarketplace(page, 'WB', isPhone(viewport))

    await expect(page).toHaveURL(/[?&]mp=wb(&|$)/)
    await waitChart(page)
    await expect
      .poll(() => readLegend(page), { timeout: DATA_TIMEOUT })
      .toEqual([expect.stringMatching(/^WB [−\d]/), 'Прошлый период'])
  })

  test('AC-23, AC-5: cmp=0 убирает «Прошлый период» из легенды', async ({ page }) => {
    await page.goto('/dashboard?cmp=0')
    await waitChart(page)

    const legend = await readLegend(page)
    expect(legend).toHaveLength(2)
    expect(legend).not.toContain('Прошлый период')
  })

  test('AC-23, AC-11: наведение (на 375 — касание) показывает тултип с датой', async ({ page, viewport }) => {
    await page.goto('/dashboard')
    await waitChart(page)

    await pointDay(page, 10, isPhone(viewport))

    const tip = await readTooltip(page)
    expect(tip.text).toMatch(/^(пн|вт|ср|чт|пт|сб|вс), \d{1,2} \S+ \d{4}/)
  })

  test('AC-23, AC-20: на 375 нет горизонтальной прокрутки', async ({ page, viewport }) => {
    test.skip(!isPhone(viewport), 'Только для ширины < 640 px')
    await page.goto('/dashboard')
    await waitChart(page)

    expect(await hasHorizontalScroll(page)).toBe(false)
    // И после тултипа у правого края
    await pointDay(page, -1, true)
    await expect(tooltip(page)).toBeVisible()
    expect(await hasHorizontalScroll(page)).toBe(false)
  })
})

test.describe('Столбцы и линия прошлого периода', () => {
  test('AC-6: стопка WB снизу и Ozon сверху на каждый день, цвета --wb / --ozon, зазор 1 px --surface', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    const tokens = await colorTokens(page, ['--wb', '--ozon', '--surface'])
    const bars = await readBars(page)

    for (const bar of bars) expect([tokens['--wb'], tokens['--ozon']], 'цвет столбца').toContain(bar.fill)
    const cols = columns(bars)
    expect(cols).toHaveLength(30)
    for (const col of cols) {
      const wb = col.bars.filter((b) => b.fill === tokens['--wb'])
      const ozon = col.bars.filter((b) => b.fill === tokens['--ozon'])
      expect(wb.length, 'один столбец WB в день').toBeLessThanOrEqual(1)
      expect(ozon.length, 'один столбец Ozon в день').toBeLessThanOrEqual(1)
      const [w] = wb
      const [o] = ozon
      if (!w || !o) continue
      // Ozon над WB; между ними — зазор 1 px (фон карточки --surface) или обводка --surface
      const gap = w.top - o.bottom
      expect(gap, 'Ozon сверху WB').toBeGreaterThanOrEqual(-0.5)
      expect(gap, 'зазор не больше 1 px').toBeLessThanOrEqual(1.5)
      const strokeIsSurface =
        (o.stroke === tokens['--surface'] && o.strokeWidth >= 1) || (w.stroke === tokens['--surface'] && w.strokeWidth >= 1)
      expect(gap >= 0.5 || strokeIsSurface, `зазор между сериями: ${gap.toFixed(2)} px`).toBe(true)
    }
  })

  test('AC-6: высота стопки пропорциональна итогу дня из таблицы', async ({ page }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    const totals = column(await readTable(page), 'Итого')
    const cols = columns(await readBars(page))
    expect(cols).toHaveLength(totals.length)

    const heights = cols.map((c) => c.bottom - c.top)
    const maxIndex = totals.indexOf(Math.max(...totals))
    const pxPerUnit = (heights[maxIndex] as number) / (totals[maxIndex] as number)
    totals.forEach((total, i) => {
      expect(Math.abs((heights[i] as number) - total * pxPerUnit), `день ${i}`).toBeLessThanOrEqual(2.5)
    })
  })

  test('AC-6: одна площадка в фильтре — только её серия', async ({ page }) => {
    for (const [mp, own, other] of [
      ['wb', '--wb', '--ozon'],
      ['ozon', '--ozon', '--wb'],
    ] as const) {
      await page.goto(`/dashboard?mp=${mp}`)
      await waitChart(page)
      const colors = await colorTokens(page, [own, other])
      const bars = await readBars(page)
      expect(bars.length, mp).toBeGreaterThan(0)
      for (const bar of bars) expect(bar.fill, mp).toBe(colors[own])
    }
  })

  test('AC-6: «Прибыль» — отрицательные дни уходят вниз от нуля (если такие дни есть в данных)', async ({ page }) => {
    await page.goto('/dashboard?period=90')
    await waitChart(page)
    await metricButton(page, 'Прибыль').click()
    await expect(chart(page).getByRole('table', { name: 'Продажи по дням: Прибыль' })).toBeAttached()

    const totals = column(await readTable(page), 'Итого')
    const negative = totals.map((t, i) => [t, i] as const).filter(([t]) => t < 0)
    test.skip(negative.length === 0, 'В данных за 90 дней нет убыточных дней — проверено unit-тестом niceAxis')

    const cols = columns(await readBars(page))
    const zeroY = await zeroLineY(page)
    for (const [, i] of negative) {
      const col = cols[i]
      if (!col) continue
      expect(col.top, `день ${i}: столбец начинается от нуля`).toBeGreaterThanOrEqual(zeroY - 1.5)
    }
  })

  test('AC-7: линия прошлого периода — пунктир 4 3, толщина 1,5, --prev, без точек', async ({ page }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    const tokens = await colorTokens(page, ['--prev'])

    const curve = chart(page).locator('.recharts-line .recharts-line-curve')
    await expect(curve).toHaveCount(1)
    const style = await styleOf(curve, ['stroke', 'stroke-dasharray', 'stroke-width', 'fill'])
    expect(style.stroke).toBe(tokens['--prev'])
    expect((style['stroke-dasharray'] ?? '').match(/[\d.]+/g)?.map(Number)).toEqual([4, 3])
    expect(Number.parseFloat(style['stroke-width'] ?? '')).toBeCloseTo(1.5, 2)
    expect(style.fill).toBe('none')
    await expect(chart(page).locator('.recharts-line-dot, .recharts-line-dots circle, .recharts-line circle')).toHaveCount(0)
  })

  test('AC-7: cmp=0 — линии нет; включение сравнения возвращает её без нового запроса', async ({ page, viewport }) => {
    test.skip(isPhone(viewport), 'Переключатель сравнения на панели — только ≥ 640 px; на телефоне проверяется cmp=0 в AC-23')
    const requests = countSalesRequests(page)
    await page.goto('/dashboard?cmp=0')
    await waitChart(page)
    await expect(chart(page).locator('.recharts-line-curve')).toHaveCount(0)
    const before = requests.count

    await compareSwitch(page).click()

    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(chart(page).locator('.recharts-line .recharts-line-curve')).toHaveCount(1)
    expect(requests.count).toBe(before)
  })
})

/** Y линии нуля: середина подписи «0» на оси Y. */
async function zeroLineY(page: Page): Promise<number> {
  const labels = await yLabels(page)
  const zero = labels.find((l) => l.text === '0')
  if (!zero) throw new Error(`На оси Y нет деления 0: ${labels.map((l) => l.text).join(', ')}`)
  return zero.cy
}

type AxisLabel = { text: string; cx: number; cy: number; left: number; right: number }

async function axisLabels(page: Page, selector: string): Promise<AxisLabel[]> {
  return chart(page).evaluate(
    (section, sel) =>
      [...section.querySelectorAll(sel)].map((el) => {
        const r = el.getBoundingClientRect()
        return {
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
          left: r.left,
          right: r.right,
        }
      }),
    selector,
  )
}

/** Подписи оси Y снизу вверх. */
const yLabels = async (page: Page) =>
  // Recharts 3 рендерит подписи осей в отдельном слое `.recharts-*Axis-tick-labels`, вне группы оси
  (await axisLabels(page, '.recharts-yAxis-tick-labels text')).filter((l) => l.text !== '').sort((a, b) => b.cy - a.cy)
/** Подписи оси X слева направо. */
const xLabels = async (page: Page) =>
  (await axisLabels(page, '.recharts-xAxis-tick-labels text')).filter((l) => l.text !== '').sort((a, b) => a.cx - b.cx)

test.describe('Оси и сетка', () => {
  test('AC-8: деления оси Y — niceAxis по данным таблицы, подписи formatAxisMoney', async ({ page }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    const table = await readTable(page)
    const max = Math.max(...column(table, 'Итого'), ...column(table, 'Прошлый период'))
    const min = Math.min(0, ...column(table, 'Итого'))
    test.skip(min < 0, 'Выручка с минусом — непредусмотренный случай для этой проверки')

    const labels = await yLabels(page)
    expect(labels.map((l) => l.text)).toEqual(niceAxis(0, max).map(axisMoney))
  })

  test('AC-8, AC-25: «Заказы» — деления по niceAxis({ integer: true }), подписи целыми числами', async ({ page }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    await metricButton(page, 'Заказы').click()
    await expect(chart(page).getByRole('table', { name: 'Продажи по дням: Заказы' })).toBeAttached()
    const table = await readTable(page)
    const max = Math.max(...column(table, 'Итого'), ...column(table, 'Прошлый период'))

    const labels = (await yLabels(page)).map((l) => l.text)
    expect(labels).toEqual(niceAxis(0, max, { integer: true }).map((t) => norm(t.toLocaleString('ru-RU'))))
    for (const label of labels) expect(label, 'подпись без дробной части').toMatch(/^\d[\d ]*$/)
  })

  test('AC-25: на узком фильтре (7 дней, одна площадка, одна категория) подписи «Заказов» без дробной части', async ({
    page,
  }) => {
    // Чем меньше заказов в день, тем вероятнее без опции integer получился бы шаг 0,25 / 2,5 / 25
    await page.goto('/dashboard?period=7&mp=ozon&cat=accessories&cmp=0')
    await expect(chartImg(page).or(chart(page).getByText('Нет продаж за период'))).toBeVisible({ timeout: DATA_TIMEOUT })
    test.skip(await chart(page).getByText('Нет продаж за период').isVisible(), 'На узком фильтре нет продаж — проверка unit-тестом')
    await metricButton(page, 'Заказы').click()
    await expect(chart(page).getByRole('table', { name: 'Продажи по дням: Заказы' })).toBeAttached()
    const max = Math.max(...column(await readTable(page), 'Итого'))

    const labels = (await yLabels(page)).map((l) => l.text)
    expect(labels).toEqual(niceAxis(0, max, { integer: true }).map((t) => norm(t.toLocaleString('ru-RU'))))
    for (const label of labels) expect(label, 'подпись без дробной части').toMatch(/^\d[\d ]*$/)
  })

  test('AC-8: подписи 11 px --axis; без линии оси Y и засечек; сетка только горизонтальная --grid, ноль — --border-strong', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    const tokens = await colorTokens(page, ['--axis', '--grid', '--border-strong'])

    for (const text of await chart(page).locator('.recharts-yAxis-tick-labels text, .recharts-xAxis-tick-labels text').all()) {
      const style = await styleOf(text, ['font-size', 'fill'])
      expect(style['font-size']).toBe('11px')
      expect(style.fill).toBe(tokens['--axis'])
    }
    await expect(chart(page).locator('.recharts-yAxis .recharts-cartesian-axis-line')).toHaveCount(0)
    await expect(chart(page).locator('.recharts-cartesian-axis-tick-line')).toHaveCount(0)
    await expect(chart(page).locator('.recharts-cartesian-grid-vertical line')).toHaveCount(0)

    const labels = await yLabels(page)
    const grid = await chart(page).evaluate((section) =>
      [...section.querySelectorAll('.recharts-cartesian-grid-horizontal line')].map((el) => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return { y: r.top + r.height / 2, stroke: cs.stroke, width: Number.parseFloat(cs.strokeWidth || '1') }
      }),
    )
    expect(grid).toHaveLength(labels.length)
    const zeroY = await zeroLineY(page)
    for (const line of grid) {
      expect(line.width).toBeCloseTo(1, 1)
      if (Math.abs(line.y - zeroY) > 3) expect(line.stroke).toBe(tokens['--grid'])
    }
    // Линия нуля --border-strong: сама линия сетки или отдельная горизонтальная линия на нуле
    const zeroLines = await chart(page).evaluate(
      (section, args) =>
        [...section.querySelectorAll('svg line, svg path')].filter((el) => {
          const r = el.getBoundingClientRect()
          return (
            getComputedStyle(el).stroke === args.color && r.height <= 2 && r.width > 50 && Math.abs(r.top - args.y) <= 3
          )
        }).length,
      { color: tokens['--border-strong'], y: zeroY },
    )
    expect(zeroLines, 'линия нуля цвета --border-strong').toBeGreaterThan(0)
  })

  test('AC-8: ширина оси Y — 52 px (на телефоне 44)', async ({ page, viewport }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    const expected = isPhone(viewport) ? 44 : 52

    const offset = await chart(page).evaluate((section) => {
      const svg = section.querySelector('svg.recharts-surface')
      const lines = [...section.querySelectorAll('.recharts-cartesian-grid-horizontal line')]
      if (!svg || lines.length === 0) return null
      const plotLeft = Math.min(...lines.map((l) => l.getBoundingClientRect().left))
      return plotLeft - svg.getBoundingClientRect().left
    })
    expect(offset).not.toBeNull()
    // Допуск — на внутренний отступ Recharts (margin) до 8 px
    expect(offset as number).toBeGreaterThanOrEqual(expected - 1)
    expect(offset as number).toBeLessThanOrEqual(expected + 8)
    // Подписи оси Y не заходят на область столбцов
    const plotLeft = Math.min(...columns(await readBars(page)).map((c) => c.left))
    for (const label of await yLabels(page)) expect(label.right).toBeLessThanOrEqual(plotLeft + 1)
  })

  test('AC-10: подписи оси X — xTickIndexes в формате «5 окт.», первая и последняя всегда', async ({
    page,
    viewport,
  }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    const period = await readPeriod(page)
    expect(period.days).toBe(30)

    // xTickIndexes(30, 7) на ≥ 1200, xTickIndexes(30, 4) на < 640 — примеры spec
    const indexes = isPhone(viewport) ? [0, 10, 20, 29] : [0, 5, 10, 15, 20, 25, 29]
    const labels = await xLabels(page)
    expect(labels.map((l) => l.text)).toEqual(indexes.map((i) => axisDate(addDays(period.from, i))))
  })

  test('AC-10: на 768 px — 6 подписей (xTickIndexes(30, 6))', async ({ page, viewport }) => {
    test.skip(isPhone(viewport), 'Только в проекте 1440 px')
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/dashboard')
    await waitChart(page)
    const period = await readPeriod(page)

    const labels = await xLabels(page)
    expect(labels.map((l) => l.text)).toEqual([0, 6, 12, 18, 24, 29].map((i) => axisDate(addDays(period.from, i))))
  })

  test('AC-14: подписи осей скрыты от скринридера (aria-hidden или внутри role="img")', async ({ page }) => {
    await page.goto('/dashboard')
    await waitChart(page)

    const exposed = await chart(page).evaluate(
      (section) =>
        [...section.querySelectorAll('.recharts-xAxis-tick-labels text, .recharts-yAxis-tick-labels text')].filter(
          (el) => !el.closest('[aria-hidden="true"], [role="img"]'),
        ).length,
    )
    expect(exposed).toBe(0)
  })
})

test.describe('Тултип и подсветка дня', () => {
  test('AC-11: дата, WB, Ozon, Итого, прошлый период с датой и бейдж — значения совпадают с таблицей', async ({
    page,
    viewport,
  }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    const period = await readPeriod(page)
    const table = await readTable(page)
    const index = 12

    await pointDay(page, index, isPhone(viewport))
    const tip = await readTooltip(page)

    const date = parseTooltipDate(tip.text)
    expect(sameDay(date, addDays(period.from, index)), `дата дня ${index}`).toBe(true)

    const row = table.rows[index] as string[]
    const cell = (name: string) => row[table.headers.indexOf(name)]
    expect(rowValue(tip, 'WB')).toBe(cell('WB'))
    expect(rowValue(tip, 'Ozon')).toBe(cell('Ozon'))
    expect(rowValue(tip, 'Итого')).toBe(cell('Итого'))
    // «Прошлый период, {formatAxisDate(previousDate)}»: прошлый период — той же длины непосредственно перед текущим
    const previousDate = addDays(date, -period.days)
    expect(rowValue(tip, `Прошлый период, ${axisDate(previousDate)}`), tip.rows.map((r) => r.label).join(' | ')).toBe(
      cell('Прошлый период'),
    )

    // Бейдж: (итого − прошлое) / |прошлое| × 100, рост — хорошо (spec 004 AC-9, AC-10)
    const total = toNumber(cell('Итого') ?? '')
    const prev = toNumber(cell('Прошлый период') ?? '')
    const badge = /([+−]?)(\d+,\d) %/.exec(tip.text)
    if (prev === 0) {
      expect(badge, 'прошлое = 0 — бейджа нет').toBeNull()
      return
    }
    const change = ((total - prev) / Math.abs(prev)) * 100
    if (!badge) throw new Error(`В тултипе нет бейджа изменения: ${tip.text}`)
    const shown = (badge[1] === '−' ? -1 : 1) * Number((badge[2] as string).replace(',', '.'))
    expect(Math.abs(shown - change), `бейдж ${badge[0]} при изменении ${change.toFixed(3)} %`).toBeLessThanOrEqual(0.11)
    if (badge[0].startsWith('0,0')) expect(tip.text).toContain('без изменений к прошлому периоду')
    else if (badge[1] === '+') expect(tip.text).toContain('рост к прошлому периоду, хорошо')
    else expect(tip.text).toContain('снижение к прошлому периоду, плохо')
  })

  test('AC-11: подсветка колонки дня --surface-2; остальные столбцы — непрозрачность 0,92, выбранный — 1', async ({
    page,
    viewport,
  }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    const tokens = await colorTokens(page, ['--surface-2'])

    const { x } = await pointDay(page, 8, isPhone(viewport))
    await expect(tooltip(page)).toBeVisible()

    const highlights = await chart(page).evaluate(
      (section, args) =>
        [...section.querySelectorAll('svg rect, svg path')].filter((el) => {
          const r = el.getBoundingClientRect()
          return getComputedStyle(el).fill === args.color && r.left <= args.x && r.right >= args.x && r.height > 20
        }).length,
      { color: tokens['--surface-2'], x },
    )
    expect(highlights, 'подсветка колонки дня').toBeGreaterThan(0)

    const cols = columns(await readBars(page))
    for (const col of cols) {
      const active = col.left - 1 <= x && x <= col.right + 1
      for (const bar of col.bars) expect(bar.opacity, active ? 'выбранный день' : 'другой день').toBeCloseTo(active ? 1 : 0.92, 2)
    }
  })

  test('AC-11: тултип — role="tooltip"; «Итого» 600 с линией --border сверху; прошлый период --text-3; квадраты 8 × 8', async ({
    page,
    viewport,
  }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    const tokens = await colorTokens(page, ['--border', '--text-3', '--wb', '--ozon'])

    await pointDay(page, 5, isPhone(viewport))
    await expect(tooltip(page)).toBeVisible()

    const styles = await tooltip(page).evaluate((root) => {
      const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
      const rowOf = (re: RegExp) => {
        const els = [...root.querySelectorAll<HTMLElement>('*')].filter(
          (el) => el.children.length >= 2 && re.test(n(el.firstElementChild?.textContent)),
        )
        return els.find((el) => !els.some((o) => o !== el && el.contains(o))) ?? null
      }
      const total = rowOf(/^Итого$/)
      const prev = rowOf(/^Прошлый период/)
      const mark = (label: string) => {
        const row = rowOf(new RegExp(`^${label}$`))
        const m = row?.querySelector<HTMLElement>('[aria-hidden="true"]')
        if (!m) return null
        const r = m.getBoundingClientRect()
        return { width: r.width, height: r.height, background: getComputedStyle(m).backgroundColor }
      }
      const cs = (el: HTMLElement | null) => (el ? getComputedStyle(el) : null)
      return {
        totalWeight: cs(total)?.fontWeight ?? null,
        totalBorderColor: cs(total)?.borderTopColor ?? null,
        totalBorderWidth: cs(total)?.borderTopWidth ?? null,
        prevColor: cs(prev)?.color ?? null,
        wb: mark('WB'),
        ozon: mark('Ozon'),
      }
    })
    expect(styles.totalWeight).toBe('600')
    expect(styles.totalBorderColor).toBe(tokens['--border'])
    expect(styles.totalBorderWidth).toBe('1px')
    expect(styles.prevColor).toBe(tokens['--text-3'])
    expect(styles.wb).toEqual({ width: 8, height: 8, background: tokens['--wb'] })
    expect(styles.ozon).toEqual({ width: 8, height: 8, background: tokens['--ozon'] })
  })

  test('AC-12: одна площадка — без строки второй площадки', async ({ page, viewport }) => {
    await page.goto('/dashboard?mp=wb')
    await waitChart(page)

    await pointDay(page, 10, isPhone(viewport))
    const tip = await readTooltip(page)

    expect(rowValue(tip, 'WB')).toBeDefined()
    expect(rowValue(tip, 'Ozon')).toBeUndefined()
    expect(tip.text).not.toMatch(/Ozon/)
  })

  test('AC-12: сравнение выключено — без строки прошлого периода и бейджа', async ({ page, viewport }) => {
    await page.goto('/dashboard?cmp=0')
    await waitChart(page)

    await pointDay(page, 10, isPhone(viewport))
    const tip = await readTooltip(page)

    expect(rowValue(tip, 'Итого')).toBeDefined()
    expect(tip.text).not.toMatch(/Прошлый период/)
    expect(tip.text).not.toMatch(/%/)
    expect(tip.text).not.toMatch(/к прошлому периоду/)
  })

  test('AC-13: тултип не перекрывает указатель; у правого края открывается влево от колонки', async ({
    page,
    viewport,
  }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    const phone = isPhone(viewport)

    for (const index of [3, 15]) {
      const { x, y } = await pointDay(page, index, phone)
      const { box } = await readTooltip(page)
      const covers = box.x <= x && x <= box.x + box.width && box.y <= y && y <= box.y + box.height
      expect(covers, `день ${index}: тултип под указателем`).toBe(false)
    }

    const { x, column: last } = await pointDay(page, -1, phone)
    const { box } = await readTooltip(page)
    expect(box.x + box.width, 'у правого края — левее колонки').toBeLessThanOrEqual(Math.min(x, last.left) + 1)
    // И не уезжает за левый край окна
    expect(box.x).toBeGreaterThanOrEqual(0)
  })

  test('AC-13: стиль тултипа — --surface, рамка --border, --r-md, --shadow-lg, padding 10/12, min-width 208, 12/16, зазор 6', async ({
    page,
    viewport,
  }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    const tokens = await readTokens(page, [
      ['background-color', '--surface'],
      ['border-top-color', '--border'],
      ['border-top-left-radius', '--r-md'],
      ['box-shadow', '--shadow-lg'],
    ])

    await pointDay(page, 10, isPhone(viewport))
    await expect(tooltip(page)).toBeVisible()
    const style = await styleOf(tooltip(page), [
      'background-color',
      'border-top-color',
      'border-top-width',
      'border-top-left-radius',
      'box-shadow',
      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',
      'min-width',
      'font-size',
      'line-height',
      'row-gap',
    ])
    expect(style['background-color']).toBe(tokens['background-color --surface'])
    expect(style['border-top-color']).toBe(tokens['border-top-color --border'])
    expect(style['border-top-width']).toBe('1px')
    expect(style['border-top-left-radius']).toBe(tokens['border-top-left-radius --r-md'])
    expect(style['box-shadow']).toBe(tokens['box-shadow --shadow-lg'])
    expect([style['padding-top'], style['padding-right'], style['padding-bottom'], style['padding-left']]).toEqual([
      '10px',
      '12px',
      '10px',
      '12px',
    ])
    expect(style['min-width']).toBe('208px')
    expect(style['font-size']).toBe('12px')
    expect(style['line-height']).toBe('16px')
    expect(style['row-gap']).toBe('6px')
  })
})

test.describe('Клавиатура', () => {
  test.skip(({ viewport }) => isPhone(viewport), 'Клавиатура — в проекте 1440 px')

  test('AC-15: фокус на области графика — видимое кольцо --focus; ← / → переходят по дням и показывают тултип', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    const tokens = await colorTokens(page, ['--focus'])

    // Сначала клавиатурное действие — чтобы фокус считался :focus-visible
    await page.keyboard.press('Shift')
    await chartImg(page).focus()
    await expect(chartImg(page)).toBeFocused()
    const ring = await styleOf(chartImg(page), ['outline-style', 'outline-color', 'outline-width', 'box-shadow'])
    const outlined = ring['outline-style'] !== 'none' && ring['outline-color'] === tokens['--focus']
    const shadowed = (ring['box-shadow'] ?? '').includes(tokens['--focus'] as string)
    expect(outlined || shadowed, `кольцо фокуса: ${JSON.stringify(ring)}`).toBe(true)
    if (outlined) expect(Number.parseFloat(ring['outline-width'] ?? '0')).toBeGreaterThanOrEqual(2)

    await page.keyboard.press('ArrowRight')
    const first = parseTooltipDate((await readTooltip(page)).text)
    await page.keyboard.press('ArrowRight')
    await expect.poll(async () => parseTooltipDate((await readTooltip(page)).text).getTime()).toBe(
      addDays(first, 1).getTime(),
    )
    await page.keyboard.press('ArrowLeft')
    await expect.poll(async () => parseTooltipDate((await readTooltip(page)).text).getTime()).toBe(first.getTime())
  })
})

test.describe('Раскладка', () => {
  /** Ожидания AC-20 по ширине: padding, высота графика, зазор KPI → график, высота сегмента. */
  const LAYOUT = {
    desktop: { pad: '20px', chartH: 260, kpiGap: 24, segH: 30 },
    tablet: { pad: '16px', chartH: 220, kpiGap: 16, segH: 30 },
    phone: { pad: '16px', chartH: 180, kpiGap: 12, segH: 40 },
  } as const

  async function checkLayout(page: Page, layout: (typeof LAYOUT)[keyof typeof LAYOUT], phone: boolean): Promise<void> {
    await waitChart(page)
    const tokens = await readTokens(page, [
      ['background-color', '--surface'],
      ['border-top-color', '--border'],
      ['border-top-left-radius', '--r-lg'],
      ['box-shadow', '--shadow-sm'],
    ])
    const style = await styleOf(chart(page), [
      'background-color',
      'border-top-color',
      'border-top-width',
      'border-top-left-radius',
      'box-shadow',
      'padding-top',
      'padding-left',
      'row-gap',
    ])
    expect(style['background-color']).toBe(tokens['background-color --surface'])
    expect(style['border-top-color']).toBe(tokens['border-top-color --border'])
    expect(style['border-top-width']).toBe('1px')
    expect(style['border-top-left-radius']).toBe(tokens['border-top-left-radius --r-lg'])
    expect(style['box-shadow']).toBe(tokens['box-shadow --shadow-sm'])
    expect(style['padding-top']).toBe(layout.pad)
    expect(style['padding-left']).toBe(layout.pad)
    expect(style['row-gap']).toBe('16px')

    // Высота графика — область столбцов без подписей оси X (AC-20). У выручки без минусов
    // деления 0 … 4·шаг: верхняя линия сетки — верх области, нижняя (ноль) — низ
    const plot = await chart(page).evaluate((section) => {
      const ys = [...section.querySelectorAll('.recharts-cartesian-grid-horizontal line')].map(
        (el) => el.getBoundingClientRect().top,
      )
      return ys.length > 0 ? { top: Math.min(...ys), bottom: Math.max(...ys) } : null
    })
    if (!plot) throw new Error('Нет горизонтальной сетки')
    expect(Math.abs(plot.bottom - plot.top - layout.chartH), `высота области столбцов ${plot.bottom - plot.top}`).toBeLessThanOrEqual(1.5)
    // Подписи оси X — строка 16 px на 8 px ниже области: центр подписи ≈ низ + 8 + 8
    for (const label of await xLabels(page)) {
      expect(Math.abs(label.cy - (plot.bottom + 16)), `подпись «${label.text}»`).toBeLessThanOrEqual(3)
    }
    // Область role="img" охватывает столбцы сверху
    const img = await chartImg(page).boundingBox()
    if (!img) throw new Error('Нет области графика')
    expect(img.y).toBeLessThanOrEqual(plot.top + 1)

    // Зазор между KPI и графиком
    const kpi = await kpiRegion(page).boundingBox()
    const section = await chart(page).boundingBox()
    if (!kpi || !section) throw new Error('Нет KPI или графика')
    expect(Math.abs(section.y - (kpi.y + kpi.height) - layout.kpiGap)).toBeLessThanOrEqual(1)

    // Переключатель метрики
    const h2 = await chart(page).getByRole('heading', { level: 2 }).boundingBox()
    const group = await metricGroup(page).boundingBox()
    const buttons = await metricGroup(page).getByRole('button').all()
    if (!h2 || !group) throw new Error('Нет заголовка или переключателя')
    for (const button of buttons) {
      const b = await button.boundingBox()
      expect(b?.height).toBeCloseTo(layout.segH, 0)
    }
    const pad = Number.parseFloat(layout.pad)
    if (phone) {
      // На всю ширину под заголовком, три равные колонки
      const inner = section.width - 2 * pad - 2
      expect(Math.abs(group.width - inner)).toBeLessThanOrEqual(2)
      expect(group.y).toBeGreaterThanOrEqual(h2.y + h2.height - 1)
      const boxes = await Promise.all(buttons.map((b) => b.boundingBox()))
      const widths = boxes.map((b) => b?.width ?? 0)
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
      expect(new Set(boxes.map((b) => Math.round(b?.y ?? 0))).size).toBe(1)
    } else {
      // Справа от заголовка, в той же строке
      expect(group.x).toBeGreaterThan(h2.x + h2.width)
      expect(group.y).toBeLessThan(h2.y + h2.height)
      expect(Math.abs(group.x + group.width - (section.x + section.width - pad - 1))).toBeLessThanOrEqual(2)
    }
    expect(await hasHorizontalScroll(page)).toBe(false)
  }

  test('AC-20: 1440 px — карточка, padding 20, график 260, переключатель справа (30), зазор с KPI 24', async ({
    page,
    viewport,
  }) => {
    test.skip(isPhone(viewport), 'Только в проекте 1440 px')
    await page.goto('/dashboard')
    await checkLayout(page, LAYOUT.desktop, false)
  })

  test('AC-20: 768 px — padding 16, график 220, переключатель справа, зазор с KPI 16', async ({ page, viewport }) => {
    test.skip(isPhone(viewport), 'Только в проекте 1440 px')
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/dashboard')
    await checkLayout(page, LAYOUT.tablet, false)
  })

  test('AC-20: 375 px — padding 16, график 180, переключатель на всю ширину (сетка 3 × 40), зазор с KPI 12', async ({
    page,
    viewport,
  }) => {
    test.skip(!isPhone(viewport), 'Только для ширины < 640 px')
    await page.goto('/dashboard')
    await checkLayout(page, LAYOUT.phone, true)
  })
})

test.describe('Анимации', () => {
  test.skip(({ viewport }) => isPhone(viewport), 'Достаточно проекта 1440 px')

  /** Геометрия столбцов и линии — для сравнения «сразу» и «через 700 мс». */
  const snapshot = (page: Page) =>
    chart(page).evaluate((section) => ({
      bars: [...section.querySelectorAll('.recharts-bar .recharts-rectangle')].map((el) => {
        const r = el.getBoundingClientRect()
        return [Math.round(r.top * 10), Math.round(r.height * 10)]
      }),
      line: [...section.querySelectorAll('.recharts-line-curve')].map((el) => el.getAttribute('d')),
    }))

  test('AC-22: столбцы и линия рисуются сразу — без анимации при загрузке и смене метрики', async ({ page }) => {
    await page.goto('/dashboard')
    await waitChart(page)
    const atLoad = await snapshot(page)
    await page.waitForTimeout(700)
    expect(await snapshot(page)).toEqual(atLoad)

    await metricButton(page, 'Заказы').click()
    await expect(chart(page).getByText(/шт за период/).first()).toBeVisible()
    const afterSwitch = await snapshot(page)
    await page.waitForTimeout(700)
    expect(await snapshot(page)).toEqual(afterSwitch)
    expect(afterSwitch).not.toEqual(atLoad)
  })

  test('AC-22: тултип переезжает к другому дню сразу, без анимации', async ({ page }) => {
    await page.goto('/dashboard')
    await waitChart(page)

    await pointDay(page, 3, false)
    const dayThree = parseTooltipDate((await readTooltip(page)).text).getTime()
    await pointDay(page, 20, false)
    // Ждём, пока тултип покажет новый день, и сразу снимаем положение
    await expect.poll(async () => parseTooltipDate((await readTooltip(page)).text).getTime()).not.toBe(dayThree)
    const first = (await readTooltip(page)).box
    await page.waitForTimeout(700)
    const later = (await readTooltip(page)).box
    expect(Math.round(later.x)).toBe(Math.round(first.x))
    expect(Math.round(later.y)).toBe(Math.round(first.y))
  })
})

test.describe('Безопасность', () => {
  test.skip(({ viewport }) => isPhone(viewport), 'Достаточно проекта 1440 px')

  /** CSP продакшена из vercel.json (dev и preview заголовков не отдают). */
  function productionCsp(): string {
    const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
      headers: { headers: { key: string; value: string }[] }[]
    }
    const header = config.headers.flatMap((rule) => rule.headers).find((h) => h.key === 'Content-Security-Policy')
    if (!header) throw new Error('в vercel.json нет Content-Security-Policy')
    return header.value
  }

  test('Безопасность (spec 005): с CSP продакшена график рисуется, тултип работает, нарушений CSP нет', async ({
    page,
  }) => {
    const csp = productionCsp()
    await page.addInitScript(() => {
      const violations: { directive: string; blocked: string }[] = []
      document.addEventListener('securitypolicyviolation', (event) => {
        violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI })
      })
      Object.defineProperty(window, '__cspViolations', { value: violations })
    })
    // Заголовок CSP добавляется к HTML-документу так, как его отдаёт Vercel
    await page.route(
      (url) => url.pathname === '/dashboard',
      async (route) => {
        const response = await route.fetch()
        await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } })
      },
    )

    await page.goto('/dashboard')
    await waitChart(page)
    await pointDay(page, 10, false)
    await expect(tooltip(page)).toBeVisible()
    await metricButton(page, 'Прибыль').click()

    const violations = await page.evaluate(
      () => (window as unknown as { __cspViolations: { directive: string; blocked: string }[] }).__cspViolations,
    )
    // В том числе style-src: Recharts не должен вставлять теги <style> (без 'unsafe-inline' они блокируются)
    expect(violations).toEqual([])
  })
})
