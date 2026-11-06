import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { META_FIXTURE, sortedParams } from './filtersTestFixtures'
import {
  CARD_LABELS,
  type CardLabel,
  createMatchMediaForWidth,
  CURRENT,
  elementsWithExactText,
  EXPECTED_CARDS,
  kpiResponse,
  MINUS,
  norm,
  rising,
  SPARK_LENGTH,
  sparklineAreas,
  sparklineLines,
  SR,
  vertexCount,
} from './kpiTestFixtures'
import { createAppRouter } from './router'

/*
 * Spec 004 «KPI-карточки» — дашборд целиком через настоящий роутер (≥ 1200 px).
 * «Сегодня» из фикстуры /api/meta — 04.11.2026: период по умолчанию 05.10–03.11.2026,
 * прошлый — 05.09–04.10.2026. Ответ /api/kpi — фиксированный (kpiTestFixtures.ts),
 * ожидаемые числа посчитаны вручную по формулам spec 004 и docs/domain.md.
 */

/** Параметры каждого запроса /api/kpi — по ним проверяется AC-5. */
const kpiRequests: URLSearchParams[] = []

/** Выручка по площадкам: по ней видно, что карточки показали ответ на новые фильтры. */
const REVENUE_BY_MP: Record<string, number> = { all: CURRENT.revenue, wb: 4_100_000, ozon: 3_184_560 }

function defaultKpi(params: URLSearchParams) {
  const revenue = REVENUE_BY_MP[params.get('mp') ?? 'all'] ?? CURRENT.revenue
  return HttpResponse.json(
    kpiResponse({
      current: { revenue },
      period: { from: params.get('from') ?? '2026-10-05', to: params.get('to') ?? '2026-11-03' },
    }),
  )
}

const server = setupServer(
  http.get('/api/meta', () => HttpResponse.json(META_FIXTURE)),
  http.get('/api/kpi', ({ request }) => {
    const params = new URL(request.url).searchParams
    kpiRequests.push(params)
    return defaultKpi(params)
  }),
  // Остальные блоки дашборда этим тестам не нужны
  http.get('/api/*', () => HttpResponse.json({ message: 'Недоступно в тесте KPI' }, { status: 503 })),
)

/** Подменяет ответ /api/kpi, сохраняя учёт запросов. */
function mockKpi(respond: (params: URLSearchParams) => Response | Promise<Response>): void {
  server.use(
    http.get('/api/kpi', ({ request }) => {
      const params = new URL(request.url).searchParams
      kpiRequests.push(params)
      return respond(params)
    }),
  )
}

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  kpiRequests.length = 0
  // Десктоп 1440 px: «было» видно (AC-14)
  vi.stubGlobal('matchMedia', createMatchMediaForWidth(1440))
})
afterEach(() => {
  server.resetHandlers()
  vi.unstubAllGlobals()
})
afterAll(() => server.close())

function renderApp(url: string) {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [url] }) })
  // Как в приложении (app/queryClient.ts): данные свежие 5 минут; без повторов — ошибка видна сразу
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, user: userEvent.setup() }
}

type AppRouter = ReturnType<typeof createAppRouter>
const searchStr = (router: AppRouter) => router.state.location.searchStr

const KPI_REGION = { name: 'Ключевые показатели' } as const
const LOADING_LABEL = 'Загружаем показатели'
const ERROR_TITLE = 'Не удалось загрузить показатели'
const ERROR_HINT = 'Проверьте соединение и повторите.'
/** Таймаут ожидания: ошибка может прийти после повтора, заданного в самом хуке. */
const WAIT = { timeout: 5000 }

const findRegion = () => screen.findByRole('region', KPI_REGION)

/** Восемь карточек после загрузки /api/meta и /api/kpi. */
async function findCards(): Promise<HTMLElement[]> {
  const region = await findRegion()
  await waitFor(() => expect(within(region).getAllByRole('article')).toHaveLength(8), WAIT)
  return within(region).getAllByRole('article')
}

/** Карточка по подписи среди уже показанных (синхронно — для waitFor). */
function getCard(label: CardLabel): HTMLElement {
  const region = screen.getByRole('region', KPI_REGION)
  const card = within(region)
    .getAllByRole('article')
    .find((c) => norm(within(c).getByRole('heading', { level: 3 }).textContent) === label)
  if (!card) throw new Error(`Нет карточки «${label}»`)
  return card
}

async function findCard(label: CardLabel): Promise<HTMLElement> {
  await findCards()
  return getCard(label)
}

/** У карточки есть элемент ровно с этим текстом (значение или «было …»). */
function expectText(card: HTMLElement, s: string): void {
  expect(elementsWithExactText(s, card).length, `в карточке нет «${s}»: ${norm(card.textContent)}`).toBeGreaterThan(0)
}

/** Собственный текст элемента (без потомков). */
const ownText = (el: Element) =>
  [...el.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent ?? '')
    .join('')

/** Бейдж: ближайший общий предок значения изменения и скрытого текста, внутри карточки. */
function findBadge(card: HTMLElement, delta: string, sr: string): HTMLElement {
  const deltaEl = within(card).getByText(delta)
  const srEl = within(card).getByText(sr)
  let badge: HTMLElement | null = deltaEl
  while (badge && !badge.contains(srEl)) badge = badge.parentElement
  if (!badge || badge === card || !card.contains(badge)) throw new Error('Скрытый текст не внутри бейджа')
  return badge
}

/** Стрелки бейджа: svg-иконки или символы ↑ / ↓. */
function arrowsOf(badge: HTMLElement): Element[] {
  const glyphs = [badge, ...badge.querySelectorAll('*')].filter((el) => /[↑↓]/.test(ownText(el)))
  return [...badge.querySelectorAll('svg'), ...glyphs]
}

/** Проверка бейджа целиком: текст, тон (через скрытый текст), стрелка aria-hidden (AC-7, AC-9, AC-11). */
function expectBadge(card: HTMLElement, delta: string, sr: string): void {
  const badge = findBadge(card, delta, sr)
  const srEl = within(card).getByText(sr)
  // Скрытый текст доступен скринридеру
  expect(srEl.closest('[aria-hidden="true"]')).toBeNull()
  const arrows = arrowsOf(badge)
  if (sr === SR.flat) {
    expect(arrows).toHaveLength(0)
  } else {
    expect(arrows.length).toBeGreaterThan(0)
    for (const arrow of arrows) expect(arrow.closest('[aria-hidden="true"]')).not.toBeNull()
  }
}

/** Бейджа нет: ни скрытого текста, ни значения изменения со знаком. */
function expectNoBadge(card: HTMLElement): void {
  expect(within(card).queryByText(/к прошлому периоду/)).toBeNull()
  expect(within(card).queryByText(/^[+−]\d/)).toBeNull()
  expect(within(card).queryByText(/^0,0\s%$/)).toBeNull()
}

/** svg sparkline: все svg карточки, кроме стрелок внутри бейджа. */
function sparklineSvgs(card: HTMLElement): SVGElement[] {
  const srEl = within(card).queryByText(/к прошлому периоду/)
  let badge: HTMLElement | null = null
  if (srEl) {
    const srText = norm(srEl.textContent)
    badge = srEl
    while (badge && badge !== card && !norm(badge.textContent).replace(srText, '').includes('%')) {
      badge = badge.parentElement
    }
  }
  return [...card.querySelectorAll('svg')].filter((svg) => !badge || badge === card || !badge.contains(svg))
}

/** Текст страницы вне панели фильтров (там свои даты). */
function textOutsidePanel(): string {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const parts: string[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest('[role="search"]')) parts.push(node.textContent ?? '')
  }
  return norm(parts.join(' '))
}

const FULL_DATE = /\d{2}\.\d{2}\.\d{4}/

const filterPanel = () => screen.getByRole('search', { name: 'Фильтры' })
const panelButton = (group: string, name: string) =>
  within(within(filterPanel()).getByRole('group', { name: group })).getByRole('button', { name })
const compareSwitch = () => within(filterPanel()).getByRole('switch', { name: 'Сравнить с прошлым периодом' })

describe('Заголовок страницы', () => {
  it('AC-1: под панелью фильтров — h1 «Дашборд» и подзаголовок с периодом и сравнением', async () => {
    renderApp('/dashboard')
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Дашборд' })

    // Заголовок идёт после панели фильтров
    const panel = await screen.findByRole('search', { name: 'Фильтры' })
    expect(panel.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await waitFor(() =>
      expect(elementsWithExactText('05.10.2026 – 03.11.2026 · сравнение с 05.09.2026 – 04.10.2026')).not.toHaveLength(0),
    )
  })

  it('AC-1: «7 дней» — 28.10.2026 – 03.11.2026 · сравнение с 21.10.2026 – 27.10.2026', async () => {
    renderApp('/dashboard?period=7')
    await screen.findByRole('heading', { level: 1, name: 'Дашборд' })

    await waitFor(() =>
      expect(elementsWithExactText('28.10.2026 – 03.11.2026 · сравнение с 21.10.2026 – 27.10.2026')).not.toHaveLength(0),
    )
  })

  it('AC-1: при cmp=0 — только период, без «сравнение с …»', async () => {
    renderApp('/dashboard?cmp=0')
    await screen.findByRole('heading', { level: 1, name: 'Дашборд' })

    await waitFor(() => expect(elementsWithExactText('05.10.2026 – 03.11.2026')).not.toHaveLength(0))
    expect(textOutsidePanel()).not.toMatch(/сравнение с/)
  })

  it('AC-1: выключение сравнения переключателем убирает «· сравнение с …» из подзаголовка', async () => {
    const { user } = renderApp('/dashboard')
    await waitFor(() => expect(textOutsidePanel()).toMatch(/сравнение с 05\.09\.2026 – 04\.10\.2026/))

    await user.click(compareSwitch())

    await waitFor(() => expect(textOutsidePanel()).not.toMatch(/сравнение с/))
    expect(elementsWithExactText('05.10.2026 – 03.11.2026')).not.toHaveLength(0)
  })

  it('AC-1: пока /api/meta грузится — h1 виден сразу, дат периода вне панели нет', async () => {
    server.use(
      http.get('/api/meta', async () => {
        await delay('infinite')
        return HttpResponse.json(META_FIXTURE)
      }),
    )
    renderApp('/dashboard')

    expect(await screen.findByRole('heading', { level: 1, name: 'Дашборд' })).toBeInTheDocument()
    expect(textOutsidePanel()).not.toMatch(FULL_DATE)
  })

  it('AC-2: «Данные WB и Ozon обновлены сегодня в 07:40» — время из updatedAt', async () => {
    renderApp('/dashboard')

    await waitFor(() => expect(elementsWithExactText('Данные WB и Ozon обновлены сегодня в 07:40')).not.toHaveLength(0))
  })

  it('AC-2: дата updatedAt не равна today — «обновлены 03.11.2026 в 07:40»', async () => {
    server.use(http.get('/api/meta', () => HttpResponse.json({ ...META_FIXTURE, updatedAt: '2026-11-03T07:40:00+03:00' })))
    renderApp('/dashboard')

    await waitFor(() =>
      expect(elementsWithExactText('Данные WB и Ozon обновлены 03.11.2026 в 07:40')).not.toHaveLength(0),
    )
    expect(textOutsidePanel()).not.toMatch(/обновлены сегодня/)
  })

  it('AC-2: время и дата — по Москве, как в строке ответа, независимо от часового пояса браузера', async () => {
    // 00:05 МСК 04.11 — это ещё 03.11 по UTC: дата и время берутся из строки, а не из Date в локальном поясе
    server.use(http.get('/api/meta', () => HttpResponse.json({ ...META_FIXTURE, updatedAt: '2026-11-04T00:05:00+03:00' })))
    renderApp('/dashboard')

    await waitFor(() => expect(elementsWithExactText('Данные WB и Ozon обновлены сегодня в 00:05')).not.toHaveLength(0))
  })

  it('AC-2: пока /api/meta грузится — строки «обновлены» нет', async () => {
    server.use(
      http.get('/api/meta', async () => {
        await delay('infinite')
        return HttpResponse.json(META_FIXTURE)
      }),
    )
    renderApp('/dashboard')
    await screen.findByRole('heading', { level: 1, name: 'Дашборд' })

    expect(textOutsidePanel()).not.toMatch(/обновлены/)
  })

  it('AC-2: при ошибке /api/meta строки «обновлены» нет', async () => {
    let requested = false
    server.use(
      http.get('/api/meta', () => {
        requested = true
        return new HttpResponse(null, { status: 500 })
      }),
    )
    renderApp('/dashboard')
    await screen.findByRole('heading', { level: 1, name: 'Дашборд' })
    await waitFor(() => expect(requested).toBe(true))
    await screen.findByText(ERROR_TITLE, {}, WAIT)

    expect(textOutsidePanel()).not.toMatch(/обновлены/)
  })
})

describe('Секция KPI — разметка и значения', () => {
  it('AC-4: section с невидимым h2 «Ключевые показатели», 8 article с h3 в порядке таблицы', async () => {
    renderApp('/dashboard')
    const region = await findRegion()

    expect(region.tagName).toBe('SECTION')
    expect(within(region).getByRole('heading', { level: 2, name: 'Ключевые показатели' })).toBeInTheDocument()

    const cards = await findCards()
    for (const card of cards) expect(card.tagName).toBe('ARTICLE')
    expect(cards.map((card) => norm(within(card).getByRole('heading', { level: 3 }).textContent))).toEqual([
      ...CARD_LABELS,
    ])
    for (const card of cards) expect(within(card).getAllByRole('heading')).toHaveLength(1)
  })

  it.each(CARD_LABELS)('AC-6: «%s» — значение и «было» по формату таблицы «Карточки»', async (label) => {
    renderApp('/dashboard')
    const card = await findCard(label)

    expectText(card, EXPECTED_CARDS[label].value)
    expectText(card, EXPECTED_CARDS[label].prev)
  })

  it('AC-6: null — «—», «было» с null — «было —»; отрицательные и большие числа — по форматтерам', async () => {
    mockKpi(() =>
      HttpResponse.json(
        kpiResponse({
          // Нет выкупов, выручка ≤ 0: % выкупа, средний чек и маржа — null
          current: {
            ordersCount: 1_234_567,
            buyoutsCount: 0,
            revenue: -5000,
            buyoutRate: null,
            returnsCount: 2,
            avgCheck: null,
            profit: -20_000,
            margin: null,
          },
          previous: { ordersCount: 1_000_000, revenue: 0, buyoutRate: 75, avgCheck: 1700, profit: 0, margin: null },
        }),
      ),
    )
    renderApp('/dashboard')
    await findCards()

    const expected: Record<CardLabel, [string, string]> = {
      Выручка: [`${MINUS}5 000 ₽`, 'было 0 ₽'],
      Заказы: ['1 234 567', 'было 1 000 000'],
      Выкупы: ['0', 'было 4 200'],
      '% выкупа': ['—', 'было 75,0 %'],
      Возвраты: ['2', 'было 264'],
      'Средний чек': ['—', 'было 1 700 ₽'],
      Прибыль: [`${MINUS}20 тыс. ₽`, 'было 0 ₽'],
      Маржа: ['—', 'было —'],
    }
    for (const label of CARD_LABELS) {
      const card = await findCard(label)
      expectText(card, expected[label][0])
      expectText(card, expected[label][1])
    }
  })
})

describe('Бейдж изменения', () => {
  it('AC-7: выручка 6 480 925 → 7 284 560 — «+12,4 %», рост, хорошо', async () => {
    renderApp('/dashboard')
    expectBadge(await findCard('Выручка'), '+12,4 %', SR.upGood)
  })

  it('AC-7: маржа 24,8 → 23,4 — «−5,6 %», снижение, плохо', async () => {
    renderApp('/dashboard')
    expectBadge(await findCard('Маржа'), `${MINUS}5,6 %`, SR.downBad)
  })

  it('AC-7: возвраты 264 → 312 — «+18,2 %», рост, но плохо (инверсия)', async () => {
    renderApp('/dashboard')
    expectBadge(await findCard('Возвраты'), '+18,2 %', SR.upBad)
  })

  it.each(CARD_LABELS)('AC-7: «%s» — бейдж по правилам «Тон бейджа»', async (label) => {
    renderApp('/dashboard')
    expectBadge(await findCard(label), EXPECTED_CARDS[label].delta, EXPECTED_CARDS[label].sr)
  })

  it('AC-8: прибыль −100 000 → 50 000 — «+150,0 %», рост, хорошо (знаменатель по модулю)', async () => {
    mockKpi(() =>
      HttpResponse.json(
        kpiResponse({
          current: { profit: 50_000, margin: 10 },
          previous: { profit: -100_000, margin: -5 },
        }),
      ),
    )
    renderApp('/dashboard')

    const profit = await findCard('Прибыль')
    // (50 000 − (−100 000)) / |−100 000| × 100 = 150
    expectBadge(profit, '+150,0 %', SR.upGood)
    expectText(profit, '50 тыс. ₽')
    expectText(profit, `было ${MINUS}100 тыс. ₽`)

    // Маржа −5 → 10: (10 − (−5)) / 5 × 100 = 300
    expectBadge(await findCard('Маржа'), '+300,0 %', SR.upGood)
  })

  it('AC-8: убыток вырос (−100 000 → −150 000) — «−50,0 %», снижение, плохо', async () => {
    mockKpi(() => HttpResponse.json(kpiResponse({ current: { profit: -150_000 }, previous: { profit: -100_000 } })))
    renderApp('/dashboard')

    expectBadge(await findCard('Прибыль'), `${MINUS}50,0 %`, SR.downBad)
  })

  it('AC-9: изменение ±0,04 % и ровно 0 — нейтральный «0,0 %» без стрелки; «+0,0 %» и «−0,0 %» нигде нет', async () => {
    mockKpi(() =>
      HttpResponse.json(
        kpiResponse({
          // +0,04 %, −0,04 %, +0,04 % у инвертированных «Возвратов», ровно 0
          current: { ordersCount: 10_004, buyoutsCount: 9_996, returnsCount: 10_004, avgCheck: 1700 },
          previous: { ordersCount: 10_000, buyoutsCount: 10_000, returnsCount: 10_000, avgCheck: 1700 },
        }),
      ),
    )
    renderApp('/dashboard')
    await findCards()

    for (const label of ['Заказы', 'Выкупы', 'Возвраты', 'Средний чек'] as const) {
      expectBadge(await findCard(label), '0,0 %', SR.flat)
    }
    const all = norm(document.body.textContent)
    expect(all).not.toContain('+0,0')
    expect(all).not.toContain(`${MINUS}0,0`)
    expect(all).not.toContain('-0,0')
  })

  it('AC-10: прошлое = 0, прошлое null, текущее null — бейджа нет, «было» показано', async () => {
    mockKpi(() =>
      HttpResponse.json(
        kpiResponse({
          current: { revenue: 7_284_560, margin: 23.4, avgCheck: null },
          previous: { revenue: 0, margin: null, avgCheck: 1700 },
        }),
      ),
    )
    renderApp('/dashboard')

    const revenue = await findCard('Выручка')
    expectNoBadge(revenue)
    expectText(revenue, 'было 0 ₽')

    const margin = await findCard('Маржа')
    expectNoBadge(margin)
    expectText(margin, 'было —')

    const avgCheck = await findCard('Средний чек')
    expectNoBadge(avgCheck)
    expectText(avgCheck, 'было 1 700 ₽')

    // Остальные карточки бейдж не теряют
    expectBadge(await findCard('Заказы'), '+9,5 %', SR.upGood)
  })

  it('AC-10: прошлое = 0 и текущее = 0 (деление 0 на 0) — бейджа нет, NaN и Infinity не выводятся', async () => {
    mockKpi(() =>
      HttpResponse.json(kpiResponse({ current: { returnsCount: 0, ordersCount: 3 }, previous: { returnsCount: 0 } })),
    )
    renderApp('/dashboard')

    const returns = await findCard('Возвраты')
    expectNoBadge(returns)
    expectText(returns, 'было 0')
    expect(norm(document.body.textContent)).not.toMatch(/NaN|Infinity|∞/)
  })

  it.each([
    ['рост, хорошо', { revenue: 7_284_560 }, { revenue: 6_480_925 }, 'Выручка', '+12,4 %', SR.upGood],
    // 264 → 312: +18,2 %
    ['рост, плохо', { returnsCount: 312 }, { returnsCount: 264 }, 'Возвраты', '+18,2 %', SR.upBad],
    // 312 → 264: −48 / 312 ≈ −15,38 % → −15,4 %
    ['снижение, хорошо', { returnsCount: 264 }, { returnsCount: 312 }, 'Возвраты', `${MINUS}15,4 %`, SR.downGood],
    ['снижение, плохо', { margin: 23.4 }, { margin: 24.8 }, 'Маржа', `${MINUS}5,6 %`, SR.downBad],
    ['без изменений', { avgCheck: 1700 }, { avgCheck: 1700 }, 'Средний чек', '0,0 %', SR.flat],
  ] as const)('AC-11: %s — скрытый текст для скринридера, стрелки aria-hidden', async (_t, cur, prev, label, delta, sr) => {
    mockKpi(() => HttpResponse.json(kpiResponse({ current: cur, previous: prev })))
    renderApp('/dashboard')

    expectBadge(await findCard(label), delta, sr)
  })
})

describe('Sparkline', () => {
  it('AC-12: в каждой карточке svg aria-hidden="true" с линией по 14 точкам и заливкой', async () => {
    renderApp('/dashboard')
    const cards = await findCards()

    for (const card of cards) {
      const svgs = sparklineSvgs(card)
      expect(svgs).toHaveLength(1)
      const svg = svgs[0] as SVGElement
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      const lines = sparklineLines(svg)
      expect(lines).toHaveLength(1)
      expect(vertexCount(lines[0] as Element)).toBe(SPARK_LENGTH)
      // Заливка под линией (10 % — проверяется в e2e по вычисленному стилю)
      expect(sparklineAreas(svg).length).toBeGreaterThan(0)
    }
  })

  it('AC-12: точки null пропускаются, линия соединяет соседние; < 2 точек — линии нет', async () => {
    const withGap = rising(1)
    withGap[6] = null
    const leadingNulls = rising(1)
    leadingNulls[0] = null
    leadingNulls[1] = null
    const single: (number | null)[] = Array.from({ length: SPARK_LENGTH }, (_, i) => (i === 13 ? 5 : null))
    const empty: (number | null)[] = Array.from({ length: SPARK_LENGTH }, () => null)
    mockKpi(() =>
      HttpResponse.json(
        kpiResponse({
          sparklines: { revenue: withGap, avgCheck: leadingNulls, ordersCount: single, buyoutsCount: empty },
        }),
      ),
    )
    renderApp('/dashboard')

    const gapLines = sparklineSvgs(await findCard('Выручка')).flatMap(sparklineLines)
    // Одна непрерывная линия по 13 точкам
    expect(gapLines).toHaveLength(1)
    expect(vertexCount(gapLines[0] as Element)).toBe(13)
    const d = (gapLines[0] as Element).getAttribute('d')
    if (d !== null) expect(d.match(/[Mm]/g)).toHaveLength(1)

    const leadingLines = sparklineSvgs(await findCard('Средний чек')).flatMap(sparklineLines)
    expect(leadingLines).toHaveLength(1)
    expect(vertexCount(leadingLines[0] as Element)).toBe(12)

    expect(sparklineSvgs(await findCard('Заказы')).flatMap(sparklineLines)).toHaveLength(0)
    expect(sparklineSvgs(await findCard('Выкупы')).flatMap(sparklineLines)).toHaveLength(0)
  })

  it('AC-12: ровный ряд (все точки равны — размах 0) рисуется без NaN', async () => {
    const flat: (number | null)[] = Array.from({ length: SPARK_LENGTH }, () => 7)
    const zeros: (number | null)[] = Array.from({ length: SPARK_LENGTH }, () => 0)
    mockKpi(() => HttpResponse.json(kpiResponse({ sparklines: { returnsCount: flat, profit: zeros } })))
    renderApp('/dashboard')

    for (const label of ['Возвраты', 'Прибыль'] as const) {
      const svg = sparklineSvgs(await findCard(label))[0] as SVGElement
      const lines = sparklineLines(svg)
      expect(lines).toHaveLength(1)
      expect(vertexCount(lines[0] as Element)).toBe(SPARK_LENGTH)
      expect(svg.innerHTML).not.toMatch(/NaN|Infinity/)
    }
  })
})

describe('Сравнение выключено', () => {
  it('AC-13: cmp=0 — нет бейджа и «было», sparkline на месте', async () => {
    renderApp('/dashboard?cmp=0')
    const cards = await findCards()

    for (const card of cards) {
      expectNoBadge(card)
      expect(within(card).queryByText(/^было/)).toBeNull()
      const lines = sparklineSvgs(card).flatMap(sparklineLines)
      expect(lines).toHaveLength(1)
      expect(vertexCount(lines[0] as Element)).toBe(SPARK_LENGTH)
    }
    // Значения показаны
    expectText(await findCard('Выручка'), '7,3 млн ₽')
  })

  it('AC-13: включение сравнения возвращает бейдж и «было» без нового запроса', async () => {
    const { user, router } = renderApp('/dashboard?cmp=0')
    await findCards()
    expect(kpiRequests).toHaveLength(1)

    await user.click(compareSwitch())
    await waitFor(() => expect(searchStr(router)).toBe(''))

    await waitFor(() => expectBadge(getCard('Выручка'), '+12,4 %', SR.upGood))
    expectText(getCard('Выручка'), 'было 6,5 млн ₽')
    expect(kpiRequests).toHaveLength(1)

    // И обратно — тоже без запроса
    await user.click(compareSwitch())
    await waitFor(() => expectNoBadge(getCard('Выручка')))
    expect(within(getCard('Выручка')).queryByText(/^было/)).toBeNull()
    expect(kpiRequests).toHaveLength(1)
  })
})

describe('Запрос /api/kpi и фильтры', () => {
  it('AC-5: параметры по умолчанию — from, to, mp=all, без cat и cmp', async () => {
    renderApp('/dashboard')
    await findCards()

    expect(kpiRequests).toHaveLength(1)
    expect(sortedParams((kpiRequests[0] as URLSearchParams).toString())).toEqual([
      ['from', '2026-10-05'],
      ['mp', 'all'],
      ['to', '2026-11-03'],
    ])
  })

  it('AC-5: фильтры из URL — mp и cat (в порядке справочника), сравнение на запрос не влияет', async () => {
    renderApp('/dashboard?period=7&mp=wb&cat=sports&cat=shoes&cmp=0')
    await findCards()

    expect(kpiRequests).toHaveLength(1)
    expect([...(kpiRequests[0] as URLSearchParams)]).toEqual(
      expect.arrayContaining([
        ['from', '2026-10-28'],
        ['to', '2026-11-03'],
        ['mp', 'wb'],
      ]),
    )
    expect((kpiRequests[0] as URLSearchParams).getAll('cat')).toEqual(['shoes', 'sports'])
    expect((kpiRequests[0] as URLSearchParams).has('cmp')).toBe(false)
    expect((kpiRequests[0] as URLSearchParams).has('period')).toBe(false)
  })

  it('AC-5: свой период из URL — from и to как есть', async () => {
    renderApp('/dashboard?from=2025-12-28&to=2026-01-03')
    await findCards()

    const last = kpiRequests.at(-1) as URLSearchParams
    expect(last.get('from')).toBe('2025-12-28')
    expect(last.get('to')).toBe('2026-01-03')
  })

  it('AC-5: смена площадки — новый запрос и новые цифры', async () => {
    const { user } = renderApp('/dashboard')
    expectText(await findCard('Выручка'), '7,3 млн ₽')

    await user.click(panelButton('Маркетплейс', 'WB'))

    await waitFor(() => expect(kpiRequests).toHaveLength(2))
    expect((kpiRequests[1] as URLSearchParams).get('mp')).toBe('wb')
    await waitFor(() => expectText(getCard('Выручка'), '4,1 млн ₽'), WAIT)
    expect(elementsWithExactText('7,3 млн ₽')).toHaveLength(0)

    await user.click(panelButton('Маркетплейс', 'Ozon'))
    await waitFor(() => expect(kpiRequests).toHaveLength(3))
    expect((kpiRequests[2] as URLSearchParams).get('mp')).toBe('ozon')
    await waitFor(() => expectText(getCard('Выручка'), '3,2 млн ₽'), WAIT)
  })

  it('AC-5: смена периода — новый запрос с новыми from и to', async () => {
    const { user } = renderApp('/dashboard')
    await findCards()

    await user.click(panelButton('Период', '7 дней'))

    await waitFor(() => expect(kpiRequests).toHaveLength(2))
    const params = kpiRequests[1] as URLSearchParams
    expect(params.get('from')).toBe('2026-10-28')
    expect(params.get('to')).toBe('2026-11-03')
    await findCards()
  })

  it('AC-5: смена категорий — новый запрос с cat', async () => {
    const { user } = renderApp('/dashboard')
    await findCards()

    await user.click(within(filterPanel()).getByRole('button', { name: /^Категории/ }))
    const list = await screen.findByRole('group', { name: 'Категории' })
    await user.click(within(list).getByRole('checkbox', { name: /^Обувь/ }))
    await user.click(within(list).getByRole('button', { name: 'Применить' }))

    await waitFor(() => expect(kpiRequests).toHaveLength(2))
    expect((kpiRequests[1] as URLSearchParams).getAll('cat')).toEqual(['shoes'])
  })

  it('AC-5: одинаковые разрешённые фильтры — без повторного запроса (переключение сравнения, «Назад» к прежним)', async () => {
    const { user, router } = renderApp('/dashboard')
    await findCards()
    expect(kpiRequests).toHaveLength(1)

    // cmp не входит в ключ запроса
    await user.click(compareSwitch())
    await waitFor(() => expect(searchStr(router)).toBe('?cmp=0'))
    await user.click(compareSwitch())
    await waitFor(() => expect(searchStr(router)).toBe(''))
    expect(kpiRequests).toHaveLength(1)

    await user.click(panelButton('Маркетплейс', 'WB'))
    await waitFor(() => expectText(getCard('Выручка'), '4,1 млн ₽'), WAIT)
    expect(kpiRequests).toHaveLength(2)

    // Те же фильтры, что в начале, — ответ из кэша
    act(() => router.history.back())
    await waitFor(() => expect(searchStr(router)).toBe(''))
    await waitFor(() => expectText(getCard('Выручка'), '7,3 млн ₽'), WAIT)
    expect(kpiRequests).toHaveLength(2)
  })

  it('AC-5: ссылка с периодом, равным пресету по умолчанию, — один запрос с теми же датами', async () => {
    // Свой период 05.10–03.11.2026 совпадает с «30 дней»: ключ одинаковый, запрос один
    renderApp('/dashboard?from=2026-10-05&to=2026-11-03')
    await findCards()
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))

    expect(kpiRequests).toHaveLength(1)
    expect((kpiRequests[0] as URLSearchParams).get('from')).toBe('2026-10-05')
  })
})

describe('Загрузка', () => {
  /** Контейнер скелетонов: aria-busy="true", aria-label «Загружаем показатели», 8 скелетонов. */
  async function expectSkeletons(): Promise<void> {
    const busy = await screen.findByLabelText(LOADING_LABEL)
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy.children).toHaveLength(8)
    const region = screen.getByRole('region', KPI_REGION)
    expect(region.contains(busy)).toBe(true)
    expect(within(region).queryAllByRole('article')).toHaveLength(0)
  }

  it('AC-15: пока грузится /api/kpi — 8 скелетонов в контейнере aria-busy', async () => {
    mockKpi(async () => {
      await delay('infinite')
      return HttpResponse.json(kpiResponse())
    })
    renderApp('/dashboard')

    await expectSkeletons()
    expect(screen.getByRole('heading', { level: 1, name: 'Дашборд' })).toBeInTheDocument()
  })

  it('AC-15: пока грузится /api/meta — скелетоны, /api/kpi ещё не запрашивается', async () => {
    server.use(
      http.get('/api/meta', async () => {
        await delay('infinite')
        return HttpResponse.json(META_FIXTURE)
      }),
    )
    renderApp('/dashboard')

    await expectSkeletons()
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
    expect(kpiRequests).toHaveLength(0)
  })

  it('AC-15: после смены фильтров, пока идёт новый запрос, — снова скелетоны, старых цифр нет', async () => {
    const { user } = renderApp('/dashboard')
    expectText(await findCard('Выручка'), '7,3 млн ₽')

    mockKpi(async () => {
      await delay('infinite')
      return HttpResponse.json(kpiResponse())
    })
    await user.click(panelButton('Маркетплейс', 'Ozon'))

    await expectSkeletons()
    expect(elementsWithExactText('7,3 млн ₽')).toHaveLength(0)
  })

  it('AC-15: после загрузки контейнера скелетонов нет', async () => {
    renderApp('/dashboard')
    await findCards()

    expect(screen.queryByLabelText(LOADING_LABEL)).toBeNull()
  })
})

describe('Пусто', () => {
  const EMPTY = { ordersCount: 0, buyoutsCount: 0, returnsCount: 0, revenue: 0, profit: 0 }

  it('AC-16: нет заказов, выкупов и возвратов — «Нет данных за период» вместо карточек', async () => {
    mockKpi(() => HttpResponse.json(kpiResponse({ current: EMPTY })))
    renderApp('/dashboard')
    const region = await findRegion()

    await within(region).findByText('Нет данных за период', {}, WAIT)
    expect(
      elementsWithExactText('За 05.10–03.11.2026 по выбранным фильтрам не было ни заказов, ни выкупов.', region),
    ).not.toHaveLength(0)
    expect(within(region).getByRole('button', { name: 'Сбросить фильтры' })).toBeInTheDocument()
    expect(within(region).queryAllByRole('article')).toHaveLength(0)
    expect(screen.queryByLabelText(LOADING_LABEL)).toBeNull()
  })

  it('AC-16: годы начала и конца разные — «За 28.12.2025–03.01.2026 …»', async () => {
    mockKpi(() => HttpResponse.json(kpiResponse({ current: EMPTY })))
    renderApp('/dashboard?from=2025-12-28&to=2026-01-03')
    const region = await findRegion()

    await within(region).findByText('Нет данных за период', {}, WAIT)
    expect(
      elementsWithExactText('За 28.12.2025–03.01.2026 по выбранным фильтрам не было ни заказов, ни выкупов.', region),
    ).not.toHaveLength(0)
  })

  it('AC-16: «Сбросить фильтры» в блоке сбрасывает все фильтры, как в spec 002 AC-15', async () => {
    // Пусто только по WB: после сброса — карточки по всем площадкам
    mockKpi((params) =>
      params.get('mp') === 'wb' ? HttpResponse.json(kpiResponse({ current: EMPTY })) : defaultKpi(params),
    )
    const { user, router } = renderApp('/dashboard?period=7&mp=wb&cat=shoes&cmp=0')
    const region = await findRegion()
    await within(region).findByText('Нет данных за период', {}, WAIT)
    expect(
      elementsWithExactText('За 28.10–03.11.2026 по выбранным фильтрам не было ни заказов, ни выкупов.', region),
    ).not.toHaveLength(0)

    await user.click(within(region).getByRole('button', { name: 'Сбросить фильтры' }))

    await waitFor(() => expect(searchStr(router)).toBe(''))
    expect(router.state.location.pathname).toBe('/dashboard')
    expectText(await findCard('Выручка'), '7,3 млн ₽')
  })

  it('AC-16: есть хотя бы один возврат — не «пусто», карточки показаны', async () => {
    mockKpi(() => HttpResponse.json(kpiResponse({ current: { ...EMPTY, returnsCount: 1 } })))
    renderApp('/dashboard')

    await findCards()
    expect(screen.queryByText('Нет данных за период')).toBeNull()
  })

  it('AC-16: пусто в текущем периоде при ненулевом прошлом — всё равно «Нет данных за период»', async () => {
    mockKpi(() => HttpResponse.json(kpiResponse({ current: EMPTY, previous: { ordersCount: 100, buyoutsCount: 80 } })))
    renderApp('/dashboard')
    const region = await findRegion()

    await within(region).findByText('Нет данных за период', {}, WAIT)
    expect(within(region).queryAllByRole('article')).toHaveLength(0)
  })
})

describe('Ошибка', () => {
  /** Блок ошибки: role="alert", заголовок, пояснение, кнопка «Повторить». */
  async function findErrorBlock(): Promise<HTMLElement> {
    const title = await screen.findByText(ERROR_TITLE, {}, WAIT)
    const alert = title.closest<HTMLElement>('[role="alert"]')
    if (!alert) throw new Error('Блок ошибки без role="alert"')
    expect(within(alert).getByText(ERROR_HINT)).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    expect(screen.getByRole('region', KPI_REGION).contains(alert)).toBe(true)
    expect(within(screen.getByRole('region', KPI_REGION)).queryAllByRole('article')).toHaveLength(0)
    expect(screen.queryByLabelText(LOADING_LABEL)).toBeNull()
    return alert
  }

  it.each([
    ['статус 500', () => HttpResponse.json({ message: 'Внутренняя ошибка' }, { status: 500 })],
    ['статус 404', () => HttpResponse.json({ message: 'Не найдено' }, { status: 404 })],
    ['сетевая ошибка', () => HttpResponse.error()],
    [
      'ответ не по схеме: нет sparklines',
      () => {
        const { period, previousPeriod, current, previous } = kpiResponse()
        return HttpResponse.json({ period, previousPeriod, current, previous })
      },
    ],
    ['ответ не по схеме: строка вместо числа', () =>
      HttpResponse.json({ ...kpiResponse(), current: { ...CURRENT, revenue: 'много' } })],
  ])('AC-17: ошибка /api/kpi (%s) — блок role="alert"', async (_title, respond) => {
    mockKpi(respond)
    renderApp('/dashboard')

    await findErrorBlock()
  })

  it('AC-17 / T-контракт: разметка в ответе не по схеме не внедряется', async () => {
    mockKpi(() =>
      HttpResponse.json({ ...kpiResponse(), current: { ...CURRENT, revenue: '<img src=x onerror=alert(1)>' } }),
    )
    renderApp('/dashboard')

    await findErrorBlock()
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(screen.queryByText(/onerror/)).toBeNull()
  })

  it('AC-17: ошибка /api/meta — тот же блок ошибки', async () => {
    server.use(http.get('/api/meta', () => new HttpResponse(null, { status: 500 })))
    renderApp('/dashboard')

    await findErrorBlock()
    expect(kpiRequests).toHaveLength(0)
  })

  it('AC-17: «Повторить» заново запрашивает /api/kpi, при успехе — карточки', async () => {
    let fail = true
    mockKpi((params) => (fail ? new HttpResponse(null, { status: 500 }) : defaultKpi(params)))
    const { user } = renderApp('/dashboard')
    const alert = await findErrorBlock()
    const before = kpiRequests.length

    fail = false
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }))

    expectText(await findCard('Выручка'), '7,3 млн ₽')
    expect(kpiRequests.length).toBeGreaterThan(before)
    expect(screen.queryByText(ERROR_TITLE)).toBeNull()
  })

  it('AC-17: «Повторить» после ошибки /api/meta заново запрашивает /api/meta, затем показываются карточки', async () => {
    let metaFail = true
    let metaRequests = 0
    server.use(
      http.get('/api/meta', () => {
        metaRequests += 1
        return metaFail ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(META_FIXTURE)
      }),
    )
    const { user } = renderApp('/dashboard')
    const alert = await findErrorBlock()
    const before = metaRequests

    metaFail = false
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }))

    await findCards()
    expect(metaRequests).toBeGreaterThan(before)
    expect(screen.queryByText(ERROR_TITLE)).toBeNull()
  })

  it('AC-18: ошибка KPI не ломает страницу — заголовок на месте, фильтры работают и дают новый запрос', async () => {
    mockKpi(() => new HttpResponse(null, { status: 500 }))
    const { user, router } = renderApp('/dashboard')
    await findErrorBlock()

    expect(screen.getByRole('heading', { level: 1, name: 'Дашборд' })).toBeInTheDocument()
    expect(elementsWithExactText('05.10.2026 – 03.11.2026 · сравнение с 05.09.2026 – 04.10.2026')).not.toHaveLength(0)
    const before = kpiRequests.length

    await user.click(panelButton('Маркетплейс', 'WB'))
    await waitFor(() => expect(searchStr(router)).toBe('?mp=wb'))
    expect(panelButton('Маркетплейс', 'WB')).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(kpiRequests.length).toBeGreaterThan(before))
    expect((kpiRequests.at(-1) as URLSearchParams).get('mp')).toBe('wb')

    await user.click(panelButton('Период', '7 дней'))
    await waitFor(() => expect(new URLSearchParams(searchStr(router)).get('period')).toBe('7'))
  })
})

describe('Ширина ≥ 1200 px', () => {
  it('AC-14: на десктопе «было» видно во всех 8 карточках', async () => {
    renderApp('/dashboard')
    const cards = await findCards()

    for (const card of cards) expect(within(card).getByText(/^было/)).toBeInTheDocument()
  })
})
