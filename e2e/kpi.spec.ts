import { expect, test, type Locator, type Page } from '@playwright/test'

/*
 * Spec 004 «KPI-карточки» — сценарии в настоящем браузере (проекты 1440 и 375 px).
 * Данные — из фейкового API с реальным «сегодня», поэтому конкретные числа не проверяются:
 * только что они есть, меняются при смене площадки, а раскладка и цвета соответствуют spec.
 */

// Первая генерация данных в браузере может занять несколько секунд
const DATA_TIMEOUT = 15_000

const LABELS = ['Выручка', 'Заказы', 'Выкупы', '% выкупа', 'Возвраты', 'Средний чек', 'Прибыль', 'Маржа']

const kpiRegion = (page: Page) => page.getByRole('region', { name: 'Ключевые показатели' })
const cards = (page: Page) => kpiRegion(page).getByRole('article')
const card = (page: Page, label: string) =>
  cards(page).filter({ has: page.getByRole('heading', { level: 3, name: label, exact: true }) })

async function waitCards(page: Page): Promise<void> {
  await expect(cards(page)).toHaveCount(8, { timeout: DATA_TIMEOUT })
}

/** Значение карточки — первая видимая строка после подписи. */
async function cardValue(c: Locator): Promise<string> {
  const lines = (await c.innerText())
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  return lines[1] ?? ''
}

/** Число колонок сетки — по различным левым координатам карточек. */
async function columnCount(page: Page): Promise<number> {
  const xs = new Set<number>()
  for (const c of await cards(page).all()) {
    const box = await c.boundingBox()
    if (box) xs.add(Math.round(box.x))
  }
  return xs.size
}

const hasHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

test.describe('KPI на дашборде (1440 и 375 px)', () => {
  test('AC-22: 8 карточек KPI в порядке spec, у каждой число из фейкового API', async ({ page }) => {
    await page.goto('/dashboard')
    await waitCards(page)

    await expect(cards(page).getByRole('heading', { level: 3 })).toHaveText(LABELS)
    for (const label of LABELS) {
      expect(await cardValue(card(page, label))).toMatch(/\d/)
    }
  })

  test('AC-22: переключение площадки меняет значение «Выручки»', async ({ page, viewport }) => {
    await page.goto('/dashboard')
    await waitCards(page)
    const revenue = card(page, 'Выручка')
    const before = await cardValue(revenue)
    expect(before).toMatch(/\d.*₽$/)

    if ((viewport?.width ?? 0) >= 640) {
      await page
        .getByRole('search', { name: 'Фильтры' })
        .getByRole('group', { name: 'Маркетплейс' })
        .getByRole('button', { name: 'WB', exact: true })
        .click()
    } else {
      await page.getByRole('button', { name: /^Фильтры\s*\(\d+\)$/ }).click()
      const sheet = page.getByRole('dialog', { name: 'Фильтры' })
      await sheet.getByRole('group', { name: 'Маркетплейс' }).getByRole('button', { name: 'WB', exact: true }).click()
      await sheet.getByRole('button', { name: 'Показать результаты', exact: true }).click()
    }

    await expect(page).toHaveURL(/[?&]mp=wb(&|$)/)
    await waitCards(page)
    await expect
      .poll(() => cardValue(card(page, 'Выручка')), { timeout: DATA_TIMEOUT })
      .not.toBe(before)
    expect(await cardValue(card(page, 'Выручка'))).toMatch(/\d.*₽$/)
  })
})

test.describe('Раскладка на телефоне (375 px)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 640, 'Только для ширины < 640 px')

  test('AC-22, AC-14: сетка в 2 колонки, нет горизонтальной прокрутки, «было» скрыто', async ({ page }) => {
    await page.goto('/dashboard')
    await waitCards(page)

    expect(await columnCount(page)).toBe(2)
    expect(await hasHorizontalScroll(page)).toBe(false)
    for (const prev of await kpiRegion(page).getByText(/^было\s/).all()) await expect(prev).toBeHidden()
  })
})

test.describe('Раскладка на десктопе и планшете', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1200, 'Только в проекте 1440 px')

  test('AC-14: 1440 px — 4 колонки, «было» видно во всех 8 карточках', async ({ page }) => {
    await page.goto('/dashboard')
    await waitCards(page)

    expect(await columnCount(page)).toBe(4)
    expect(await hasHorizontalScroll(page)).toBe(false)
    const prev = kpiRegion(page).getByText(/^было\s/)
    await expect(prev).toHaveCount(8)
    for (const el of await prev.all()) await expect(el).toBeVisible()
  })

  test('AC-14: 768 px — 4 колонки, «было» скрыто, без горизонтальной прокрутки', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/dashboard')
    await waitCards(page)

    expect(await columnCount(page)).toBe(4)
    expect(await hasHorizontalScroll(page)).toBe(false)
    for (const el of await kpiRegion(page).getByText(/^было\s/).all()) await expect(el).toBeHidden()
  })
})

type CardColors = {
  label: string
  sr: string | null
  badgeColor: string | null
  badgeBg: string | null
  strokes: string[]
  areaFills: string[]
  areaOpacities: number[]
}

/** Вычисленные цвета токенов и элементов каждой карточки. */
async function readColors(page: Page) {
  return kpiRegion(page).evaluate((section) => {
    const resolve = (property: 'color' | 'background-color', token: string) => {
      const probe = document.createElement('span')
      probe.style.setProperty(property, `var(${token})`)
      section.append(probe)
      const value = getComputedStyle(probe).getPropertyValue(property)
      probe.remove()
      return value
    }
    const tokens = {
      success: resolve('color', '--success'),
      danger: resolve('color', '--danger'),
      neutral: resolve('color', '--neutral'),
      text3: resolve('color', '--text-3'),
      successSoft: resolve('background-color', '--success-soft'),
      dangerSoft: resolve('background-color', '--danger-soft'),
      neutralSoft: resolve('background-color', '--neutral-soft'),
    }

    const result = [...section.querySelectorAll('article')].map((card) => {
      const label = card.querySelector('h3')?.textContent?.trim() ?? ''
      const sr = [...card.querySelectorAll<HTMLElement>('*')].find(
        (el) => el.children.length === 0 && /к прошлому периоду/.test(el.textContent ?? ''),
      )
      // Бейдж — ближайший предок скрытого текста, где есть само изменение (знак %)
      let badge: HTMLElement | null = null
      if (sr) {
        const srText = sr.textContent ?? ''
        badge = sr.parentElement
        while (badge && badge !== card && !(badge.textContent ?? '').replace(srText, '').includes('%')) {
          badge = badge.parentElement
        }
      }
      const svgs = [...card.querySelectorAll('svg')].filter((svg) => !badge || !badge.contains(svg))
      const shapes = svgs.flatMap((svg) => [...svg.querySelectorAll('path, polyline, polygon')])
      const lines = shapes.filter((el) => getComputedStyle(el).fill === 'none')
      const areas = shapes.filter((el) => getComputedStyle(el).fill !== 'none')
      const effectiveOpacity = (el: Element) => {
        let opacity = Number.parseFloat(getComputedStyle(el).fillOpacity || '1')
        for (let node: Element | null = el; node && node !== card; node = node.parentElement) {
          opacity *= Number.parseFloat(getComputedStyle(node).opacity || '1')
        }
        return opacity
      }
      return {
        label,
        sr: sr?.textContent?.trim() ?? null,
        badgeColor: badge ? getComputedStyle(badge).color : null,
        badgeBg: badge ? getComputedStyle(badge).backgroundColor : null,
        strokes: lines.map((el) => getComputedStyle(el).stroke),
        areaFills: areas.map((el) => getComputedStyle(el).fill),
        areaOpacities: areas.map(effectiveOpacity),
      }
    })
    return { tokens, cards: result }
  }) as Promise<{ tokens: Record<string, string>; cards: CardColors[] }>
}

test.describe('Цвета бейджа и sparkline в браузере', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1200, 'Достаточно проекта 1440 px')

  test('AC-7, AC-9, AC-12: бейдж и sparkline окрашены токенами по тону; заливка 10 %', async ({ page }) => {
    await page.goto('/dashboard')
    await waitCards(page)
    const { tokens, cards: colors } = await readColors(page)

    expect(colors).toHaveLength(8)
    for (const c of colors) {
      expect(c.strokes, `${c.label}: одна линия sparkline`).toHaveLength(1)
      let expectedStroke = tokens.text3
      if (c.sr?.endsWith('хорошо')) {
        expect(c.badgeColor, c.label).toBe(tokens.success)
        expect(c.badgeBg, c.label).toBe(tokens.successSoft)
        expectedStroke = tokens.success
      } else if (c.sr?.endsWith('плохо')) {
        expect(c.badgeColor, c.label).toBe(tokens.danger)
        expect(c.badgeBg, c.label).toBe(tokens.dangerSoft)
        expectedStroke = tokens.danger
      } else if (c.sr === 'без изменений к прошлому периоду') {
        expect(c.badgeColor, c.label).toBe(tokens.neutral)
        expect(c.badgeBg, c.label).toBe(tokens.neutralSoft)
      }
      expect(c.strokes[0], `${c.label}: цвет линии`).toBe(expectedStroke)
      expect(c.areaFills.length, `${c.label}: заливка`).toBeGreaterThan(0)
      for (const fill of c.areaFills) expect(fill, `${c.label}: цвет заливки`).toBe(expectedStroke)
      for (const opacity of c.areaOpacities) expect(opacity, `${c.label}: прозрачность заливки`).toBeCloseTo(0.1, 2)
    }
  })

  test('AC-13: сравнение выключено — бейджей нет, все sparkline цвета --text-3', async ({ page }) => {
    await page.goto('/dashboard?cmp=0')
    await waitCards(page)
    const { tokens, cards: colors } = await readColors(page)

    for (const c of colors) {
      expect(c.sr, c.label).toBeNull()
      expect(c.strokes, c.label).toEqual([tokens.text3])
    }
    await expect(kpiRegion(page).getByText(/^было\s/)).toHaveCount(0)
  })
})
