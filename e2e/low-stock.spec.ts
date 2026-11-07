import { expect, test, type Locator, type Page } from '@playwright/test'

/*
 * Spec 007 «Скоро закончится» — сценарии в настоящем браузере (проекты 1440 и 375 px,
 * часть проверок — ещё на 768 и 1199 px). Данные — из фейкового API с реальным «сегодня»,
 * поэтому конкретные позиции не захардкожены: проверяются раскладка, вид и инварианты
 * (бейджи, число строк, ссылка). Тексты строк, порядок, подзаголовки и состояния на
 * подменённых ответах — в интеграционных тестах (src/app/lowStock*.test.tsx).
 *
 * Цвета и размеры сравниваются с вычисленными значениями токенов из tokens.css.
 */

// Первая генерация данных в браузере может занять несколько секунд
const DATA_TIMEOUT = 15_000

// --- Локаторы ---

const low = (page: Page) => page.getByRole('region', { name: 'Скоро закончится' })
const lowRows = (page: Page) => low(page).locator('ul > li')
const emptyTitle = (page: Page) => low(page).getByText('Ничего не заканчивается', { exact: true })
const allStocksLink = (page: Page) => low(page).getByRole('link', { name: 'Все остатки' })
const chart = (page: Page) => page.getByRole('region', { name: 'Продажи по дням' })
const top = (page: Page) => page.getByRole('region', { name: 'Топ-10 товаров' })
const kpiRegion = (page: Page) => page.getByRole('region', { name: 'Ключевые показатели' })

const isPhone = (viewport: { width: number } | null) => (viewport?.width ?? 0) < 640

/** Ждём данных блока: строки или «пусто», без aria-busy. Возвращает, что показано. */
async function waitLow(page: Page): Promise<'list' | 'empty'> {
  await expect(lowRows(page).first().or(emptyTitle(page))).toBeVisible({ timeout: DATA_TIMEOUT })
  await expect(low(page).locator('[aria-busy="true"]')).toHaveCount(0, { timeout: DATA_TIMEOUT })
  return (await lowRows(page).count()) > 0 ? 'list' : 'empty'
}

/** График нарисован (скелетон другой высоты). */
const waitChart = (page: Page) =>
  expect(chart(page).getByRole('img', { name: /^Столбцы по дням/ })).toBeVisible({ timeout: DATA_TIMEOUT })

const hasHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

// --- Чтение строк ---

type Row = { mp: string; scheme: string | null; days: string; status: string }

/** Бейджи, дни и статус каждой строки — по тексту элементов, а не по классам. */
async function readRows(page: Page): Promise<Row[]> {
  return low(page).evaluate((section) => {
    const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
    return [...section.querySelectorAll('ul > li')].map((li) => {
      const texts = [...li.querySelectorAll('*')].map((el) => n(el.textContent))
      const find = (re: RegExp) => texts.find((t) => re.test(t)) ?? ''
      return {
        mp: find(/^(WB|Ozon)$/),
        scheme: find(/^(FBO|FBS)$/) || null,
        days: find(/^\d[\d ]* дн\.$/),
        status: find(/^(Критично|Скоро закончится)$/),
      }
    })
  })
}

// --- Токены и стили ---

/** Вычисленные значения токенов: ключ `${свойство} ${токен}`. */
async function readTokens(page: Page, pairs: [string, string][]): Promise<Record<string, string>> {
  return low(page).evaluate((section, list) => {
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

/** Переход внутри приложения без перезагрузки (данные фейкового API не генерируются заново). */
async function softNavigate(page: Page, url: string): Promise<void> {
  await page.evaluate((href) => {
    window.history.pushState({}, '', href)
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
  }, url)
  await expect(page).toHaveURL(new RegExp(`${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
}

const CATEGORIES = ['shoes', 'clothing', 'electronics', 'beauty', 'home', 'sports', 'kids', 'accessories'] as const

// =====================================================================================

test.describe('AC-17: сценарии на дашборде (1440 и 375 px)', () => {
  test('AC-17, AC-1: на 1440 блок справа от графика, верх и высота карточек совпадают; строк 1–5 или «пусто»', async ({
    page,
    viewport,
  }) => {
    test.skip(isPhone(viewport), 'Раскладка в строку — только на ≥ 1200 px')
    await page.goto('/dashboard')
    const shown = await waitLow(page)
    await waitChart(page)

    const graph = await chart(page).boundingBox()
    const section = await low(page).boundingBox()
    const kpi = await kpiRegion(page).boundingBox()
    if (!graph || !section || !kpi) throw new Error('Нет графика, KPI или блока остатков')

    // Справа от графика с зазором 24
    expect(Math.abs(section.x - (graph.x + graph.width) - 24), `зазор ${section.x - graph.x - graph.width}`).toBeLessThanOrEqual(1)
    // Одна строка: общий верх и одна высота (align-items: stretch)
    expect(Math.abs(section.y - graph.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(section.height - graph.height)).toBeLessThanOrEqual(1)
    // Колонки 2fr / 1fr по ширине KPI: левый край графика и правый край блока — края строки
    expect(Math.abs(graph.x - kpi.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(section.x + section.width - (kpi.x + kpi.width))).toBeLessThanOrEqual(1)
    expect(Math.abs(graph.width - 2 * section.width), `${graph.width} против 2 × ${section.width}`).toBeLessThanOrEqual(2)

    if (shown === 'list') {
      const count = await lowRows(page).count()
      expect(count).toBeGreaterThanOrEqual(1)
      expect(count).toBeLessThanOrEqual(5)
    } else {
      await expect(emptyTitle(page)).toBeVisible()
      await expect(lowRows(page)).toHaveCount(0)
    }
    await expect(low(page).getByRole('heading', { level: 2, name: 'Скоро закончится' })).toBeVisible()
  })

  test('AC-17, AC-1: на 375 блок ниже графика и выше топа, на всю ширину', async ({ page, viewport }) => {
    test.skip(!isPhone(viewport), 'Только для ширины < 640 px')
    await page.goto('/dashboard')
    await waitLow(page)

    const graph = await chart(page).boundingBox()
    const section = await low(page).boundingBox()
    const topBox = await top(page).boundingBox()
    const kpi = await kpiRegion(page).boundingBox()
    if (!graph || !section || !topBox || !kpi) throw new Error('Нет графика, топа, KPI или блока остатков')

    expect(section.y).toBeGreaterThan(graph.y + graph.height - 1)
    expect(topBox.y).toBeGreaterThan(section.y + section.height - 1)
    expect(Math.abs(section.x - kpi.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(section.width - kpi.width)).toBeLessThanOrEqual(1)
  })

  test('AC-17, AC-5, AC-6: выбор «WB» — у всех строк бейдж «WB» и нет бейджа схемы', async ({ page, viewport }) => {
    const phone = isPhone(viewport)
    await page.goto('/dashboard')
    await waitLow(page)

    await pickMarketplace(page, 'WB', phone)

    await expect(page).toHaveURL(/[?&]mp=wb(&|$)/)
    // Ждём ответа с новыми фильтрами: ни одной строки Ozon
    await expect
      .poll(
        async () => {
          if ((await emptyTitle(page).count()) > 0) return true
          const shown = await readRows(page)
          return shown.length > 0 && shown.every((r) => r.mp === 'WB')
        },
        { timeout: DATA_TIMEOUT },
      )
      .toBe(true)
    await waitLow(page)
    for (const row of await readRows(page)) {
      expect(row.mp).toBe('WB')
      expect(row.scheme).toBeNull()
    }
  })

  test('AC-17, AC-11: ссылка «Все остатки» ведёт на /stocks с mp=wb', async ({ page, viewport }) => {
    const phone = isPhone(viewport)
    await page.goto('/dashboard')
    await waitLow(page)
    await pickMarketplace(page, 'WB', phone)
    await expect(page).toHaveURL(/[?&]mp=wb(&|$)/)
    await expect(allStocksLink(page)).toHaveAttribute('href', /^\/stocks\?(.*&)?mp=wb(&|$)/)

    await allStocksLink(page).click()

    await expect(page).toHaveURL(/\/stocks\?(.*&)?mp=wb(&|$)/)
    // Здесь страница «Остатки» (spec 008): блока остатков дашборда на ней нет
    await expect(low(page)).toHaveCount(0)
  })

  test('AC-17, AC-16: на 375 нет горизонтальной прокрутки страницы', async ({ page, viewport }) => {
    test.skip(!isPhone(viewport), 'Только для ширины < 640 px')
    await page.goto('/dashboard')
    await waitLow(page)

    expect(await hasHorizontalScroll(page)).toBe(false)
    const section = await low(page).boundingBox()
    expect((section?.x ?? 0) + (section?.width ?? 0)).toBeLessThanOrEqual(375)
  })
})

test.describe('Раскладка дашборда', () => {
  test.skip(({ viewport }) => isPhone(viewport), 'В проекте 1440 px меняем ширину окна')

  for (const width of [1199, 768]) {
    test(`AC-1: ${width} px (< 1200) — одна колонка: блок под графиком, на всю ширину, над топом`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1024 })
      await page.goto('/dashboard')
      await waitLow(page)
      await waitChart(page)

      const graph = await chart(page).boundingBox()
      const section = await low(page).boundingBox()
      const topBox = await top(page).boundingBox()
      if (!graph || !section || !topBox) throw new Error('Нет графика, топа или блока остатков')
      expect(Math.abs(section.x - graph.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(section.width - graph.width)).toBeLessThanOrEqual(1)
      expect(section.y).toBeGreaterThan(graph.y + graph.height - 1)
      expect(topBox.y).toBeGreaterThan(section.y + section.height - 1)
      expect(await hasHorizontalScroll(page)).toBe(false)
    })
  }

  test('AC-1: 1200 px — уже строка из двух колонок', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 })
    await page.goto('/dashboard')
    await waitLow(page)
    await waitChart(page)

    const graph = await chart(page).boundingBox()
    const section = await low(page).boundingBox()
    if (!graph || !section) throw new Error('Нет графика или блока остатков')
    expect(Math.abs(section.y - graph.y)).toBeLessThanOrEqual(1)
    expect(section.x).toBeGreaterThan(graph.x + graph.width - 1)
  })
})

test.describe('Карточка и шапка', () => {
  const LAYOUT = [
    { width: 1440, pad: 20, linkH: 24 },
    { width: 768, pad: 16, linkH: 24 },
    { width: 375, pad: 16, linkH: 44 },
  ] as const

  for (const layout of LAYOUT) {
    test(`AC-16, AC-10, AC-11: ${layout.width} px — карточка (padding ${layout.pad}), шапка, подзаголовок, ссылка (min-height ${layout.linkH})`, async ({
      page,
      viewport,
    }) => {
      const phone = isPhone(viewport)
      test.skip(phone !== layout.width < 640, 'Ширина — в своём проекте')
      if (!phone) await page.setViewportSize({ width: layout.width, height: 1024 })
      await page.goto('/dashboard')
      await waitLow(page)

      const tokens = await readTokens(page, [
        ['background-color', '--surface'],
        ['border-top-color', '--border'],
        ['border-top-left-radius', '--r-lg'],
        ['box-shadow', '--shadow-sm'],
        ['color', '--text-2'],
        ['color', '--accent'],
      ])
      const section = await styleOf(low(page), [
        'background-color',
        'border-top-color',
        'border-top-width',
        'border-top-left-radius',
        'box-shadow',
        'padding-top',
        'padding-left',
        'display',
        'flex-direction',
        'row-gap',
      ])
      expect(section['background-color']).toBe(tokens['background-color --surface'])
      expect(section['border-top-color']).toBe(tokens['border-top-color --border'])
      expect(section['border-top-width']).toBe('1px')
      expect(section['border-top-left-radius']).toBe(tokens['border-top-left-radius --r-lg'])
      expect(section['box-shadow']).toBe(tokens['box-shadow --shadow-sm'])
      expect(section['padding-top']).toBe(`${layout.pad}px`)
      expect(section['padding-left']).toBe(`${layout.pad}px`)
      expect(section.display).toBe('flex')
      expect(section['flex-direction']).toBe('column')
      expect(section['row-gap']).toBe('4px')

      const head = await low(page).evaluate((s) => {
        const h2 = s.querySelector('h2')
        let header: Element | null = h2
        while (header && header.parentElement !== s) header = header.parentElement
        if (!h2 || !header) return null
        const cs = getComputedStyle(header)
        const h = getComputedStyle(h2)
        return {
          display: cs.display,
          justify: cs.justifyContent,
          align: cs.alignItems,
          gap: cs.columnGap,
          paddingBottom: cs.paddingBottom,
          h2: { size: h.fontSize, lh: h.lineHeight, weight: h.fontWeight, bottom: h2.getBoundingClientRect().bottom },
        }
      })
      if (!head) throw new Error('Нет шапки блока — прямого потомка section с h2')
      expect(head).toMatchObject({ display: 'flex', justify: 'space-between', align: 'flex-start', gap: '12px', paddingBottom: '8px' })
      expect(head.h2).toMatchObject({ size: '16px', lh: '24px', weight: '600' })

      const sub = low(page).getByText(/^\d позици(я|и|й) с наименьшим запасом$/).first()
      const subStyle = await styleOf(sub, ['font-size', 'color'])
      expect(subStyle['font-size']).toBe('13px')
      expect(subStyle.color).toBe(tokens['color --text-2'])
      // Заголовок и подзаголовок меряются одним снимком: если между двумя запросами догрузится
      // график выше, блок съедет (скелетон графика на 375 ниже графика на 73 px, roadmap)
      const gap = await sub.evaluate((el) => {
        const h2 = el.closest('section')?.querySelector('h2')
        return el.getBoundingClientRect().top - (h2?.getBoundingClientRect().bottom ?? Number.NaN)
      })
      expect(Math.abs(gap - 2)).toBeLessThanOrEqual(1)

      const a = await styleOf(allStocksLink(page), [
        'font-size',
        'font-weight',
        'color',
        'text-decoration-line',
        'white-space',
        'min-height',
      ])
      expect(a).toMatchObject({
        'font-size': '13px',
        'font-weight': '500',
        color: tokens['color --accent'],
        'text-decoration-line': 'none',
        'white-space': 'nowrap',
        'min-height': `${layout.linkH}px`,
      })
      const linkBox = await allStocksLink(page).boundingBox()
      expect(linkBox?.height ?? 0).toBeGreaterThanOrEqual(layout.linkH - 0.5)
      // Ссылка — справа в шапке
      const box = await low(page).boundingBox()
      if (!box || !linkBox) throw new Error('Нет блока или ссылки')
      expect(Math.abs(box.x + box.width - 1 - layout.pad - (linkBox.x + linkBox.width))).toBeLessThanOrEqual(1.5)
      // Стрелка 14 × 14
      const arrow = await allStocksLink(page).locator('svg').first().boundingBox()
      expect(arrow?.width).toBeCloseTo(14, 0)
      expect(arrow?.height).toBeCloseTo(14, 0)
    })
  }

  test('AC-11: при наведении у ссылки — подчёркивание с отступом 3', async ({ page, viewport }) => {
    test.skip(isPhone(viewport), 'Наведение — на десктопе')
    await page.goto('/dashboard')
    await waitLow(page)

    await page.mouse.move(0, 0)
    expect((await styleOf(allStocksLink(page), ['text-decoration-line']))['text-decoration-line']).toBe('none')
    await allStocksLink(page).hover()
    await expect
      .poll(async () => (await styleOf(allStocksLink(page), ['text-decoration-line']))['text-decoration-line'])
      .toBe('underline')
    expect((await styleOf(allStocksLink(page), ['text-underline-offset']))['text-underline-offset']).toBe('3px')
  })

  test('AC-11: видимое кольцо фокуса у ссылки при работе с клавиатуры', async ({ page, viewport }) => {
    test.skip(isPhone(viewport), 'Клавиатура — на десктопе')
    await page.goto('/dashboard')
    await waitLow(page)
    const tokens = await colorTokens(page, ['--focus'])

    // Сначала клавиатурное действие — чтобы фокус считался :focus-visible
    await page.keyboard.press('Shift')
    await allStocksLink(page).focus()
    await expect(allStocksLink(page)).toBeFocused()
    const ring = await styleOf(allStocksLink(page), ['outline-style', 'outline-color', 'outline-width', 'box-shadow'])
    const outlined = ring['outline-style'] !== 'none' && ring['outline-color'] === tokens['--focus']
    const shadowed = (ring['box-shadow'] ?? '').includes(tokens['--focus'] as string)
    expect(outlined || shadowed, `кольцо фокуса: ${JSON.stringify(ring)}`).toBe(true)
    if (outlined) expect(Number.parseFloat(ring['outline-width'] ?? '0')).toBeGreaterThanOrEqual(2)
  })
})

test.describe('Строка списка', () => {
  /** Стили частей каждой строки. Части ищутся по тексту и роли, а не по классам. */
  async function readRowStyles(page: Page) {
    return low(page).evaluate((section) => {
      const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
      const box = (el: Element | null | undefined) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { w: r.width, h: r.height, x: r.x, right: r.right }
      }
      const css = (el: Element | null | undefined, props: string[]) =>
        el ? Object.fromEntries(props.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])) : null
      const innermost = (root: Element, re: RegExp) => {
        const all = [...root.querySelectorAll('*')].filter((el) => re.test(n(el.textContent)))
        return all.find((el) => !all.some((o) => o !== el && el.contains(o))) ?? null
      }
      return [...section.querySelectorAll('ul > li')].map((li) => {
        const preview = [...li.querySelectorAll('[aria-hidden="true"]')].find((el) => el.querySelector('svg') && n(el.textContent) === '')
        const mp = innermost(li, /^(WB|Ozon)$/)
        const scheme = innermost(li, /^(FBO|FBS)$/)
        const metaLine = mp?.parentElement ?? null
        const name = metaLine?.previousElementSibling ?? null
        const days = innermost(li, /^\d[\d\s]*дн\.$/)
        const statusText = innermost(li, /^(Критично|Скоро закончится)$/)
        const status = statusText && !statusText.querySelector('svg') && statusText.parentElement?.querySelector('svg') ? statusText.parentElement : statusText
        const statusIcon = status?.querySelector('svg') ?? null
        return {
          liRight: li.getBoundingClientRect().right,
          li: css(li, ['display', 'column-gap', 'padding-top', 'padding-bottom', 'padding-left', 'border-top-width', 'border-top-color', 'align-items']),
          preview: { box: box(preview), css: css(preview, ['background-color', 'border-top-left-radius']), icon: box(preview?.querySelector('svg')) },
          name: css(name, ['font-size', 'line-height', 'font-weight', 'white-space', 'overflow-x', 'text-overflow']),
          nameBox: box(name),
          metaLine: css(metaLine, ['font-size', 'line-height', 'color', 'white-space', 'column-gap', 'overflow-x']),
          mpText: n(mp?.textContent),
          mp: { box: box(mp), css: css(mp, ['background-color', 'color', 'border-top-left-radius', 'font-size', 'font-weight', 'padding-left', 'padding-right']) },
          scheme: scheme
            ? {
                text: n(scheme.textContent),
                box: box(scheme),
                css: css(scheme, ['background-color', 'color', 'border-top-left-radius', 'border-top-width', 'border-top-color', 'font-size', 'font-weight', 'padding-left']),
              }
            : null,
          daysText: n(days?.textContent),
          days: css(days, ['font-size', 'line-height', 'font-weight', 'font-variant-numeric', 'color']),
          daysBox: box(days),
          statusText: n(status?.textContent),
          status: { box: box(status), css: css(status, ['background-color', 'color', 'border-top-left-radius', 'font-size', 'font-weight', 'padding-left', 'column-gap']) },
          statusIcon: { box: box(statusIcon), hidden: statusIcon?.closest('[aria-hidden="true"]') !== null },
        }
      })
    })
  }

  test('AC-4, AC-7: строка — flex 12, padding 12 0, линия --border; превью 40; название 14/20 500 с многоточием; дни 16/20 600 цветом статуса; бейдж статуса', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    const shown = await waitLow(page)
    test.skip(shown === 'empty', 'В данных нет позиций critical / soon — строки не проверить')
    const t = await readTokens(page, [
      ['border-top-color', '--border'],
      ['background-color', '--surface-2'],
      ['border-top-left-radius', '--r-md'],
      ['color', '--text-3'],
      ['color', '--danger'],
      ['background-color', '--danger-soft'],
      ['color', '--warning'],
      ['background-color', '--warning-soft'],
    ])

    const rows = await readRowStyles(page)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.li).toMatchObject({
        display: 'flex',
        'column-gap': '12px',
        'padding-top': '12px',
        'padding-bottom': '12px',
        'padding-left': '0px',
        'border-top-width': '1px',
        'border-top-color': t['border-top-color --border'],
      })
      expect(row.preview.box?.w).toBeCloseTo(40, 0)
      expect(row.preview.box?.h).toBeCloseTo(40, 0)
      expect(row.preview.css?.['background-color']).toBe(t['background-color --surface-2'])
      expect(row.preview.css?.['border-top-left-radius']).toBe(t['border-top-left-radius --r-md'])
      expect(row.preview.icon?.w).toBeCloseTo(18, 0)

      expect(row.name).toMatchObject({
        'font-size': '14px',
        'line-height': '20px',
        'font-weight': '500',
        'white-space': 'nowrap',
        'overflow-x': 'hidden',
        'text-overflow': 'ellipsis',
      })
      expect(row.metaLine).toMatchObject({
        'font-size': '12px',
        'line-height': '16px',
        color: t['color --text-3'],
        'white-space': 'nowrap',
        'column-gap': '6px',
      })

      expect(row.daysText).toMatch(/^\d[\d ]* дн\.$/)
      expect(row.days).toMatchObject({ 'font-size': '16px', 'line-height': '20px', 'font-weight': '600' })
      expect(row.days?.['font-variant-numeric']).toContain('tabular-nums')
      // Правая колонка прижата к правому краю строки
      expect(Math.abs((row.daysBox?.right ?? 0) - row.liRight)).toBeLessThanOrEqual(1)
      expect(Math.abs((row.status.box?.right ?? 0) - row.liRight)).toBeLessThanOrEqual(1)

      const critical = row.statusText === 'Критично'
      expect(['Критично', 'Скоро закончится']).toContain(row.statusText)
      const color = critical ? t['color --danger'] : t['color --warning']
      const bg = critical ? t['background-color --danger-soft'] : t['background-color --warning-soft']
      expect(row.days?.color, 'цвет дней — цвет статуса').toBe(color)
      expect(row.status.css).toMatchObject({
        color,
        'background-color': bg,
        'border-top-left-radius': '4px',
        'font-size': '11px',
        'font-weight': '600',
        'padding-left': '6px',
        'column-gap': '4px',
      })
      expect(row.status.box?.h).toBeCloseTo(20, 0)
      expect(row.statusIcon.box?.w).toBeCloseTo(12, 0)
      expect(row.statusIcon.hidden).toBe(true)
    }
  })

  test('AC-5: бейдж площадки в строке — 18, padding 0 5px, 11/600, радиус 4, цвета площадки', async ({ page }) => {
    await page.goto('/dashboard')
    const shown = await waitLow(page)
    test.skip(shown === 'empty', 'В данных нет позиций critical / soon')
    const t = await readTokens(page, [
      ['background-color', '--wb-soft'],
      ['color', '--wb-text'],
      ['background-color', '--ozon-soft'],
      ['color', '--ozon-text'],
    ])

    for (const row of await readRowStyles(page)) {
      const mp = row.mpText === 'WB' ? 'wb' : 'ozon'
      expect(['WB', 'Ozon']).toContain(row.mpText)
      expect(row.mp.box?.h).toBeCloseTo(18, 0)
      expect(row.mp.css).toMatchObject({
        'background-color': t[`background-color --${mp}-soft`],
        color: t[`color --${mp}-text`],
        'border-top-left-radius': '4px',
        'font-size': '11px',
        'font-weight': '600',
        'padding-left': '5px',
        'padding-right': '5px',
      })
    }
  })

  test('AC-6: бейдж схемы у Ozon — 18, рамка 1 px --border-strong, текст --text-2, без фона; у WB его нет', async ({ page }) => {
    await page.goto('/dashboard?mp=ozon')
    const shown = await waitLow(page)
    test.skip(shown === 'empty', 'У Ozon нет позиций critical / soon')
    const t = await readTokens(page, [
      ['border-top-color', '--border-strong'],
      ['color', '--text-2'],
    ])

    const rows = await readRowStyles(page)
    for (const row of rows) {
      expect(row.mpText).toBe('Ozon')
      if (!row.scheme) throw new Error('У строки Ozon нет бейджа схемы')
      expect(['FBO', 'FBS']).toContain(row.scheme.text)
      expect(row.scheme.box?.h).toBeCloseTo(18, 0)
      expect(row.scheme.css).toMatchObject({
        'border-top-width': '1px',
        'border-top-color': t['border-top-color --border-strong'],
        color: t['color --text-2'],
        'border-top-left-radius': '4px',
        'font-size': '11px',
        'font-weight': '600',
        'padding-left': '5px',
      })
      expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(row.scheme.css?.['background-color'])
    }
  })

  test('AC-16: длинные название и склад обрезаются многоточием, страница не расширяется (375)', async ({ page, viewport }) => {
    test.skip(!isPhone(viewport), 'Только для ширины < 640 px')
    await page.goto('/dashboard')
    const shown = await waitLow(page)
    test.skip(shown === 'empty', 'В данных нет позиций critical / soon')

    const overflow = await low(page).evaluate((section) =>
      [...section.querySelectorAll('ul > li')].map((li) => {
        const liBox = li.getBoundingClientRect()
        // Превью, середина и правая колонка не выходят за строку; лишнее внутри середины обрезано
        return [...li.children].filter((el) => el.getBoundingClientRect().right > liBox.right + 0.5).length
      }),
    )
    for (const count of overflow) expect(count, 'части строки не вылезают за её правый край').toBe(0)
    expect(await hasHorizontalScroll(page)).toBe(false)
  })
})

test.describe('Загрузка', () => {
  test('AC-12: скелетон (если успели застать) — 5 строк: квадрат 40, полосы 12 и 10, справа 14 × 40 и 16 × 64, --skeleton, без шиммера', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    const busy = low(page).getByLabel('Загружаем остатки')
    const caught = await busy.waitFor({ state: 'attached', timeout: 3_000 }).then(
      () => true,
      () => false,
    )
    test.skip(!caught, 'Данные пришли раньше, чем появился скелетон — состояние проверено интеграционными тестами')

    // Одним снимком: скелетон может исчезнуть в любой момент
    const snapshot = await low(page).evaluate((section) => {
      const el = section.querySelector('[aria-label="Загружаем остатки"]')
      if (!el) return null
      const probe = document.createElement('div')
      probe.style.backgroundColor = 'var(--skeleton)'
      section.append(probe)
      const skeleton = getComputedStyle(probe).backgroundColor
      probe.style.borderTopColor = 'var(--border)'
      const border = getComputedStyle(probe).borderTopColor
      probe.remove()
      let holder: Element = el
      while (holder.children.length === 1 && holder.firstElementChild) holder = holder.firstElementChild
      return {
        busy: el.getAttribute('aria-busy'),
        heading: section.querySelector('h2')?.getBoundingClientRect().height ?? 0,
        link: Boolean(section.querySelector('a[href]')),
        rows: [...holder.children].map((row) => {
          const cs = getComputedStyle(row)
          return {
            borderWidth: cs.borderTopWidth,
            borderColor: cs.borderTopColor,
            boxes: [...row.querySelectorAll('*')]
              .filter((b) => getComputedStyle(b).backgroundColor === skeleton)
              .map((b) => {
                const r = b.getBoundingClientRect()
                return { w: Math.round(r.width), h: Math.round(r.height), animation: getComputedStyle(b).animationName }
              }),
          }
        }),
        tokens: { skeleton, border },
      }
    })
    test.skip(snapshot === null, 'Скелетон исчез до снимка')
    if (!snapshot) return

    expect(snapshot.busy).toBe('true')
    expect(snapshot.heading).toBeGreaterThan(0)
    expect(snapshot.link).toBe(true)
    expect(snapshot.rows).toHaveLength(5)
    for (const row of snapshot.rows) {
      expect(row.borderWidth).toBe('1px')
      expect(row.borderColor).toBe(snapshot.tokens.border)
      expect(row.boxes.some((b) => b.w === 40 && b.h === 40), 'квадрат 40').toBe(true)
      expect(row.boxes.some((b) => b.h === 12), 'полоса 12').toBe(true)
      expect(row.boxes.some((b) => b.h === 10), 'полоса 10').toBe(true)
      expect(row.boxes.some((b) => b.h === 14 && b.w === 40), 'справа 14 × 40').toBe(true)
      expect(row.boxes.some((b) => b.h === 16 && b.w === 64), 'справа 16 × 64').toBe(true)
      for (const box of row.boxes) expect(box.animation).toBe('none')
    }
  })
})

test.describe('Пусто', () => {
  test('AC-13: «Ничего не заканчивается» (если найдётся фильтр без critical / soon) — геометрия по макету', async ({ page, viewport }) => {
    test.skip(isPhone(viewport), 'Поиск фильтра — в проекте 1440 px; кнопка 44 на < 640 — в интеграционных тестах не проверить')
    test.setTimeout(120_000)
    await page.goto('/dashboard')
    await waitLow(page)

    // Перебор площадок и категорий без перезагрузки страницы
    const urls = ['', 'wb', 'ozon'].flatMap((mp) => CATEGORIES.map((cat) => `/dashboard?${mp ? `mp=${mp}&` : ''}cat=${cat}`))
    let found = (await emptyTitle(page).count()) > 0
    for (const url of urls) {
      if (found) break
      await softNavigate(page, url)
      found = (await waitLow(page)) === 'empty'
    }
    test.skip(!found, 'В данных у каждой площадки и категории есть позиции critical / soon')

    const t = await readTokens(page, [
      ['border-top-color', '--border'],
      ['background-color', '--success-soft'],
      ['color', '--success'],
      ['color', '--text-2'],
    ])
    const block = await emptyTitle(page).evaluate((title) => {
      let el: HTMLElement | null = title as HTMLElement
      while (el && !el.querySelector('button')) el = el.parentElement
      if (!el) return null
      const cs = getComputedStyle(el)
      const icon = el.querySelector('[aria-hidden="true"]')
      const text = [...el.querySelectorAll('*')].find((x) => (x.textContent ?? '').trim().startsWith('У всех товаров запас'))
      const button = el.querySelector('button')
      return {
        css: { minHeight: cs.minHeight, flexGrow: cs.flexGrow, borderWidth: cs.borderTopWidth, borderColor: cs.borderTopColor, gap: cs.rowGap, align: cs.alignItems, justify: cs.justifyContent },
        icon: icon
          ? { w: icon.getBoundingClientRect().width, h: icon.getBoundingClientRect().height, bg: getComputedStyle(icon).backgroundColor, color: getComputedStyle(icon).color }
          : null,
        title: { size: getComputedStyle(title).fontSize, weight: getComputedStyle(title).fontWeight },
        text: text ? { size: getComputedStyle(text).fontSize, lh: getComputedStyle(text).lineHeight, color: getComputedStyle(text).color, maxWidth: getComputedStyle(text).maxWidth } : null,
        button: button ? { text: (button.textContent ?? '').trim(), h: button.getBoundingClientRect().height } : null,
      }
    })
    if (!block) throw new Error('Нет блока «пусто» с кнопкой')
    expect(block.css).toMatchObject({
      minHeight: '240px',
      flexGrow: '1',
      borderWidth: '1px',
      borderColor: t['border-top-color --border'],
      gap: '8px',
      align: 'center',
      justify: 'center',
    })
    expect(block.icon?.w).toBeCloseTo(40, 0)
    expect(block.icon?.h).toBeCloseTo(40, 0)
    expect(block.icon?.bg).toBe(t['background-color --success-soft'])
    expect(block.icon?.color).toBe(t['color --success'])
    expect(block.title).toEqual({ size: '14px', weight: '600' })
    expect(block.text).toMatchObject({ size: '13px', lh: '18px', color: t['color --text-2'], maxWidth: '300px' })
    expect(block.button?.text).toBe('Сбросить фильтры')
    expect(block.button?.h).toBeCloseTo(36, 0)

    // На 1440 карточки строки по-прежнему одной высоты
    const graph = await chart(page).boundingBox()
    const section = await low(page).boundingBox()
    expect(Math.abs((section?.height ?? 0) - (graph?.height ?? 0))).toBeLessThanOrEqual(1)
  })
})
