import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { META_FIXTURE, MIDDOT, sortedParams } from './filtersTestFixtures'
import { createMatchMediaForWidth, elementsWithExactText, kpiResponse, norm } from './kpiTestFixtures'
import { createAppRouter } from './router'
import {
  bodyRows,
  emptyDay,
  EXPECTED,
  EXPECTED_7_DAYS,
  EXPECTED_ROWS,
  legendItem,
  legendItems,
  METRIC_LABELS,
  type MetricLabel,
  ResizeObserverStub,
  rowCells,
  salesDailyResponse,
  SKELETON_HEIGHTS,
  skeletonBarHeights,
} from './salesChartTestFixtures'

/*
 * Spec 005 «График продаж по дням» — дашборд целиком через настоящий роутер (1440 px).
 * «Сегодня» из фикстуры /api/meta — 04.11.2026: период по умолчанию 05.10–03.11.2026 (30 дней).
 * Ответ /api/sales-daily строится формулой (salesChartTestFixtures.ts), суммы посчитаны вручную.
 *
 * Recharts в jsdom получает нулевой размер, поэтому здесь проверяется то, что от размера
 * не зависит: секция, переключатель, подзаголовок, легенда, role="img" + aria-label,
 * sr-only таблица, состояния и запросы. Столбцы, оси, тултип, наведение, клавиатура,
 * раскладка и анимации — в e2e/sales-chart.spec.ts.
 */

/** Параметры каждого запроса /api/sales-daily (AC-2, AC-3, AC-7). */
const salesRequests: URLSearchParams[] = []
let metaRequests = 0

function defaultSales(params: URLSearchParams) {
  return HttpResponse.json(
    salesDailyResponse({ from: params.get('from'), to: params.get('to'), mp: params.get('mp') }),
  )
}

const server = setupServer(
  http.get('/api/meta', () => {
    metaRequests += 1
    return HttpResponse.json(META_FIXTURE)
  }),
  http.get('/api/kpi', () => HttpResponse.json(kpiResponse())),
  http.get('/api/sales-daily', ({ request }) => {
    const params = new URL(request.url).searchParams
    salesRequests.push(params)
    return defaultSales(params)
  }),
  // Остальные блоки дашборда этим тестам не нужны
  http.get('/api/*', () => HttpResponse.json({ message: 'Недоступно в тесте графика' }, { status: 503 })),
)

/** Подменяет ответ /api/sales-daily, сохраняя учёт запросов. */
function mockSales(respond: (params: URLSearchParams) => Response | Promise<Response>): void {
  server.use(
    http.get('/api/sales-daily', ({ request }) => {
      const params = new URL(request.url).searchParams
      salesRequests.push(params)
      return respond(params)
    }),
  )
}

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  salesRequests.length = 0
  metaRequests = 0
  vi.stubGlobal('matchMedia', createMatchMediaForWidth(1440))
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
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
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, client, view, user: userEvent.setup() }
}

type AppRouter = ReturnType<typeof createAppRouter>
const searchStr = (router: AppRouter) => router.state.location.searchStr

const CHART = { name: 'Продажи по дням' } as const
const LOADING_LABEL = 'Загружаем график'
const ERROR_TITLE = 'График не загрузился'
const ERROR_TEXT = 'Проверьте соединение и повторите. Остальные блоки работают.'
const EMPTY_TITLE = 'Нет продаж за период'
const EMPTY_TEXT = 'Попробуйте расширить период или выбрать все категории.'
/** Таймаут ожидания: ошибка может прийти после повтора, заданного в самом хуке. */
const WAIT = { timeout: 5000 }

/** Начало aria-label для периода по умолчанию. */
const LABEL_HEAD = 'Столбцы по дням с 5 октября по 3 ноября 2026'

const findChart = () => screen.findByRole('region', CHART)
const getChart = () => screen.getByRole('region', CHART)
const metricGroup = () => within(getChart()).getByRole('group', { name: 'Метрика графика' })
const metricButton = (label: MetricLabel) => within(metricGroup()).getByRole('button', { name: label })

/** Ждём данных графика: появилась sr-only таблица. */
async function findTable(): Promise<HTMLElement> {
  const chart = await findChart()
  return within(chart).findByRole('table', {}, WAIT)
}
const getTable = () => within(getChart()).getByRole('table')
const chartImg = () => within(getChart()).getByRole('img', { name: /^Столбцы по дням/ })
const imgLabel = () => norm(chartImg().getAttribute('aria-label'))
const headers = (table: HTMLElement) => within(table).getAllByRole('columnheader').map((th) => norm(th.textContent))

/** Подзаголовок «{всего} за период · было {было}»; часть «· было …» — отдельный элемент (цвет --text-3). */
function expectSubtitle(total: string, prev: string | null): void {
  const chart = getChart()
  if (prev === null) {
    expect(elementsWithExactText(`${total} за период`, chart), norm(chart.textContent)).not.toHaveLength(0)
    expect(norm(chart.textContent)).not.toMatch(/было/)
    return
  }
  expect(
    elementsWithExactText(`${total} за период ${MIDDOT} было ${prev}`, chart),
    norm(chart.textContent),
  ).not.toHaveLength(0)
  expect(elementsWithExactText(`${MIDDOT} было ${prev}`, chart)).not.toHaveLength(0)
}

/** Подзаголовка нет (загрузка, пусто, ошибка). «Нет продаж за период» — не подзаголовок. */
function expectNoSubtitle(): void {
  const text = norm(getChart().textContent)
  expect(text).not.toMatch(/(₽|шт) за период/)
  expect(text).not.toMatch(/было/)
}

/** Ни легенды, ни графика, ни таблицы. */
function expectNoChartContent(): void {
  const chart = getChart()
  expect(legendItems(chart)).toEqual([])
  expect(within(chart).queryByRole('img')).toBeNull()
  expect(within(chart).queryByRole('table')).toBeNull()
}

/** Заголовок и переключатель видны в любом состоянии блока (AC-3, «Состояния»). */
function expectHeaderAndSwitch(): void {
  const chart = getChart()
  expect(within(chart).getByRole('heading', { level: 2, name: 'Продажи по дням' })).toBeInTheDocument()
  const buttons = within(metricGroup()).getAllByRole('button')
  expect(buttons.map((b) => norm(b.textContent))).toEqual([...METRIC_LABELS])
}

const filterPanel = () => screen.getByRole('search', { name: 'Фильтры' })
const panelButton = (group: string, name: string) =>
  within(within(filterPanel()).getByRole('group', { name: group })).getByRole('button', { name })
const compareSwitch = () => within(filterPanel()).getByRole('switch', { name: 'Сравнить с прошлым периодом' })

describe('Секция графика', () => {
  it('AC-1: section с видимым h2 «Продажи по дням», связь через aria-labelledby', async () => {
    renderApp('/dashboard')
    const chart = await findChart()

    expect(chart.tagName).toBe('SECTION')
    const h2 = within(chart).getByRole('heading', { level: 2, name: 'Продажи по дням' })
    expect(h2.id).not.toBe('')
    expect(chart.getAttribute('aria-labelledby')).toBe(h2.id)
    // Заголовок видимый, а не только для скринридера
    expect(h2.closest('.sr-only')).toBeNull()
    expect(h2).not.toHaveClass('sr-only')
  })

  it('AC-1: секция идёт под KPI', async () => {
    renderApp('/dashboard')
    const chart = await findChart()
    const kpi = await screen.findByRole('region', { name: 'Ключевые показатели' })

    expect(kpi.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(kpi.contains(chart)).toBe(false)
  })
})

describe('Переключатель метрики', () => {
  it('AC-3: группа «Метрика графика» из трёх кнопок с aria-pressed, по умолчанию «Выручка»', async () => {
    renderApp('/dashboard')
    await findTable()

    const group = metricGroup()
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => norm(b.textContent))).toEqual(['Выручка', 'Заказы', 'Прибыль'])
    expect(metricButton('Выручка')).toHaveAttribute('aria-pressed', 'true')
    expect(metricButton('Заказы')).toHaveAttribute('aria-pressed', 'false')
    expect(metricButton('Прибыль')).toHaveAttribute('aria-pressed', 'false')
  })

  it('AC-3: «Заказы» меняют подзаголовок, легенду, таблицу и aria-label без нового запроса', async () => {
    const { user, router } = renderApp('/dashboard')
    await findTable()
    expect(salesRequests).toHaveLength(1)

    await user.click(metricButton('Заказы'))

    expect(metricButton('Заказы')).toHaveAttribute('aria-pressed', 'true')
    expect(metricButton('Выручка')).toHaveAttribute('aria-pressed', 'false')
    expectSubtitle(EXPECTED.Заказы.total, EXPECTED.Заказы.prev)
    expect(legendItems(getChart())).toEqual([
      `WB ${EXPECTED.Заказы.wb}`,
      `Ozon ${EXPECTED.Заказы.ozon}`,
      'Прошлый период',
    ])
    expect(within(getChart()).getByRole('table', { name: 'Продажи по дням: Заказы' })).toBeInTheDocument()
    expect(imgLabel()).toMatch(/Итого 5 476 шт\.$/)
    expect(salesRequests).toHaveLength(1)
    // Метрика не пишется в URL
    expect(searchStr(router)).toBe('')
  })

  it('AC-3: «Прибыль», затем обратно «Выручка» — всё без новых запросов', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(metricButton('Прибыль'))
    expect(metricButton('Прибыль')).toHaveAttribute('aria-pressed', 'true')
    expectSubtitle(EXPECTED.Прибыль.total, EXPECTED.Прибыль.prev)
    expect(legendItems(getChart())).toEqual([
      `WB ${EXPECTED.Прибыль.wb}`,
      `Ozon ${EXPECTED.Прибыль.ozon}`,
      'Прошлый период',
    ])

    await user.click(metricButton('Выручка'))
    expect(metricButton('Выручка')).toHaveAttribute('aria-pressed', 'true')
    expectSubtitle(EXPECTED.Выручка.total, EXPECTED.Выручка.prev)
    expect(salesRequests).toHaveLength(1)
  })

  it('AC-3 / T9: выбор метрики живёт в состоянии блока — не в URL и не в хранилище; новый показ — снова «Выручка»', async () => {
    const before = { local: Object.keys(localStorage), session: Object.keys(sessionStorage) }
    // docs/security.md T9: в localStorage допустима только тема
    const added = (storage: Storage, was: string[]) =>
      Object.keys(storage).filter((key) => !was.includes(key) && !/theme/i.test(key))
    const { user, router, view } = renderApp('/dashboard')
    await findTable()

    await user.click(metricButton('Заказы'))
    expect(searchStr(router)).toBe('')
    expect(added(localStorage, before.local)).toEqual([])
    expect(added(sessionStorage, before.session)).toEqual([])

    // «Перезагрузка»: приложение заново по тому же адресу
    view.unmount()
    renderApp(router.state.location.href)
    await findTable()
    expect(metricButton('Выручка')).toHaveAttribute('aria-pressed', 'true')
    expectSubtitle(EXPECTED.Выручка.total, EXPECTED.Выручка.prev)
  })
})

describe('Подзаголовок', () => {
  it.each(METRIC_LABELS)('AC-4: «%s» — «{всего} за период · было {было}»', async (metric) => {
    const { user } = renderApp('/dashboard')
    await findTable()

    if (metric !== 'Выручка') await user.click(metricButton(metric))

    expectSubtitle(EXPECTED[metric].total, EXPECTED[metric].prev)
  })

  it('AC-4: примеры из spec — «7 284 560 ₽ за период · было 6 480 925 ₽» и «5 476 шт за период · было 5 066 шт»', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    expect(elementsWithExactText(`7 284 560 ₽ за период ${MIDDOT} было 6 480 925 ₽`, getChart())).not.toHaveLength(0)
    await user.click(metricButton('Заказы'))
    expect(elementsWithExactText(`5 476 шт за период ${MIDDOT} было 5 066 шт`, getChart())).not.toHaveLength(0)
  })

  it('AC-4: сравнение выключено (cmp=0) — только «{всего} за период»', async () => {
    renderApp('/dashboard?cmp=0')
    await findTable()

    expectSubtitle(EXPECTED.Выручка.total, null)
  })

  it('AC-4: переключатель сравнения убирает и возвращает «· было …» без нового запроса', async () => {
    const { user, router } = renderApp('/dashboard')
    await findTable()

    await user.click(compareSwitch())
    await waitFor(() => expect(searchStr(router)).toBe('?cmp=0'))
    await waitFor(() => expectSubtitle(EXPECTED.Выручка.total, null))

    await user.click(compareSwitch())
    await waitFor(() => expect(searchStr(router)).toBe(''))
    await waitFor(() => expectSubtitle(EXPECTED.Выручка.total, EXPECTED.Выручка.prev))
    expect(salesRequests).toHaveLength(1)
  })

  it('AC-4: подзаголовок по площадке — сумма только её данных', async () => {
    renderApp('/dashboard?mp=wb')
    await findTable()

    // При mp=wb итог дня = WB: Σ = 4 935 000
    expectSubtitle('4 935 000 ₽', EXPECTED.Выручка.prev)
  })
})

describe('Легенда', () => {
  it('AC-5: «WB {сумма}», «Ozon {сумма}», «Прошлый период» без суммы', async () => {
    renderApp('/dashboard')
    await findTable()

    expect(legendItems(getChart())).toEqual([
      `WB ${EXPECTED.Выручка.wb}`,
      `Ozon ${EXPECTED.Выручка.ozon}`,
      'Прошлый период',
    ])
  })

  it('AC-5, AC-14: цветные метки легенды — aria-hidden', async () => {
    renderApp('/dashboard')
    await findTable()
    const chart = getChart()

    for (const text of [`WB ${EXPECTED.Выручка.wb}`, `Ozon ${EXPECTED.Выручка.ozon}`, 'Прошлый период']) {
      const item = legendItem(chart, text)
      const marks = item.querySelectorAll('[aria-hidden="true"]')
      expect(marks.length, text).toBeGreaterThan(0)
      // Сама метка без текста: подпись читается скринридером
      for (const mark of marks) expect(norm(mark.textContent)).toBe('')
    }
  })

  it('AC-5: mp=wb — только пункт WB (и прошлый период)', async () => {
    renderApp('/dashboard?mp=wb')
    await findTable()

    expect(legendItems(getChart())).toEqual([`WB ${EXPECTED.Выручка.wb}`, 'Прошлый период'])
  })

  it('AC-5: mp=ozon — только пункт Ozon (и прошлый период)', async () => {
    renderApp('/dashboard?mp=ozon')
    await findTable()

    expect(legendItems(getChart())).toEqual([`Ozon ${EXPECTED.Выручка.ozon}`, 'Прошлый период'])
  })

  it('AC-5: сравнение выключено — нет пункта «Прошлый период»', async () => {
    renderApp('/dashboard?cmp=0')
    await findTable()

    expect(legendItems(getChart())).toEqual([`WB ${EXPECTED.Выручка.wb}`, `Ozon ${EXPECTED.Выручка.ozon}`])
  })

  it('AC-5, AC-7: включение сравнения возвращает «Прошлый период» без нового запроса', async () => {
    const { user, router } = renderApp('/dashboard?cmp=0')
    await findTable()
    expect(salesRequests).toHaveLength(1)

    await user.click(compareSwitch())
    await waitFor(() => expect(searchStr(router)).toBe(''))

    await waitFor(() => expect(legendItems(getChart())).toContain('Прошлый период'))
    expect(salesRequests).toHaveLength(1)
  })
})

describe('Запрос /api/sales-daily и фильтры', () => {
  it('AC-2: параметры по умолчанию — from, to, mp=all, без cat и cmp; один запрос', async () => {
    renderApp('/dashboard')
    await findTable()

    expect(salesRequests).toHaveLength(1)
    expect(sortedParams((salesRequests[0] as URLSearchParams).toString())).toEqual([
      ['from', '2026-10-05'],
      ['mp', 'all'],
      ['to', '2026-11-03'],
    ])
  })

  it('AC-2: фильтры из URL — период, mp и cat (в порядке справочника); cmp и period в запрос не уходят', async () => {
    renderApp('/dashboard?period=7&mp=wb&cat=sports&cat=shoes&cmp=0')
    await findTable()

    expect(salesRequests).toHaveLength(1)
    const params = salesRequests[0] as URLSearchParams
    expect(params.get('from')).toBe('2026-10-28')
    expect(params.get('to')).toBe('2026-11-03')
    expect(params.get('mp')).toBe('wb')
    expect(params.getAll('cat')).toEqual(['shoes', 'sports'])
    expect(params.has('cmp')).toBe(false)
    expect(params.has('period')).toBe(false)
  })

  it('AC-2: свой период из URL — from и to как есть', async () => {
    renderApp('/dashboard?from=2025-12-28&to=2026-01-03')
    await findTable()

    const last = salesRequests.at(-1) as URLSearchParams
    expect(last.get('from')).toBe('2025-12-28')
    expect(last.get('to')).toBe('2026-01-03')
  })

  it('AC-2: смена площадки — новый запрос и новые данные (легенда, таблица)', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()
    expect(legendItems(getChart())).toContain(`Ozon ${EXPECTED.Выручка.ozon}`)

    await user.click(panelButton('Маркетплейс', 'WB'))

    await waitFor(() => expect(salesRequests).toHaveLength(2))
    expect((salesRequests[1] as URLSearchParams).get('mp')).toBe('wb')
    await waitFor(() => expect(legendItems(getChart())).toEqual([`WB ${EXPECTED.Выручка.wb}`, 'Прошлый период']), WAIT)
    expect(headers(getTable())).not.toContain('Ozon')
  })

  it('AC-2: смена периода — новый запрос с новыми from/to и новые столбцы (7 строк таблицы)', async () => {
    const { user } = renderApp('/dashboard')
    expect(bodyRows(await findTable())).toHaveLength(30)

    await user.click(panelButton('Период', '7 дней'))

    await waitFor(() => expect(salesRequests).toHaveLength(2))
    const params = salesRequests[1] as URLSearchParams
    expect(params.get('from')).toBe('2026-10-28')
    expect(params.get('to')).toBe('2026-11-03')
    await waitFor(() => expect(bodyRows(getTable())).toHaveLength(7), WAIT)
    expectSubtitle(EXPECTED_7_DAYS.total, EXPECTED_7_DAYS.prev)
    expect(legendItems(getChart())).toEqual([
      `WB ${EXPECTED_7_DAYS.wb}`,
      `Ozon ${EXPECTED_7_DAYS.ozon}`,
      'Прошлый период',
    ])
  })

  it('AC-2: смена категорий — новый запрос с cat', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(within(filterPanel()).getByRole('button', { name: /^Категории/ }))
    const list = await screen.findByRole('group', { name: 'Категории' })
    await user.click(within(list).getByRole('checkbox', { name: /^Обувь/ }))
    await user.click(within(list).getByRole('button', { name: 'Применить' }))

    await waitFor(() => expect(salesRequests).toHaveLength(2))
    expect((salesRequests[1] as URLSearchParams).getAll('cat')).toEqual(['shoes'])
  })

  it('AC-2: одинаковые разрешённые фильтры — без повторного запроса (сравнение, «Назад» к прежним)', async () => {
    const { user, router } = renderApp('/dashboard')
    await findTable()
    expect(salesRequests).toHaveLength(1)

    // cmp не входит в ключ запроса
    await user.click(compareSwitch())
    await waitFor(() => expect(searchStr(router)).toBe('?cmp=0'))
    await user.click(compareSwitch())
    await waitFor(() => expect(searchStr(router)).toBe(''))
    expect(salesRequests).toHaveLength(1)

    await user.click(panelButton('Маркетплейс', 'WB'))
    await waitFor(() => expect(legendItems(getChart())).toEqual([`WB ${EXPECTED.Выручка.wb}`, 'Прошлый период']), WAIT)
    expect(salesRequests).toHaveLength(2)

    // Те же фильтры, что в начале, — ответ из кэша
    act(() => router.history.back())
    await waitFor(() => expect(searchStr(router)).toBe(''))
    await waitFor(() => expect(legendItems(getChart())).toContain(`Ozon ${EXPECTED.Выручка.ozon}`), WAIT)
    expect(salesRequests).toHaveLength(2)
  })

  it('AC-2: ссылка с периодом, равным пресету по умолчанию, — один запрос', async () => {
    renderApp('/dashboard?from=2026-10-05&to=2026-11-03')
    await findTable()
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))

    expect(salesRequests).toHaveLength(1)
  })
})

describe('Доступность: role="img" и aria-label', () => {
  it('AC-14: aria-label по умолчанию — пример из spec', async () => {
    renderApp('/dashboard')
    await findTable()

    expect(imgLabel()).toBe(
      `${LABEL_HEAD}: WB и Ozon стопкой, пунктир — прошлый период. Итого 7 284 560 ₽.`,
    )
  })

  it('AC-14: годы разные — «с 28 декабря 2025 по 3 января 2026»', async () => {
    renderApp('/dashboard?from=2025-12-28&to=2026-01-03')
    await findTable()

    expect(imgLabel()).toBe(
      `Столбцы по дням с 28 декабря 2025 по 3 января 2026: WB и Ozon стопкой, пунктир — прошлый период. Итого ${EXPECTED_7_DAYS.total}.`,
    )
  })

  it('AC-14: mp=wb — «: WB»', async () => {
    renderApp('/dashboard?mp=wb')
    await findTable()

    expect(imgLabel()).toBe(`${LABEL_HEAD}: WB, пунктир — прошлый период. Итого 4 935 000 ₽.`)
  })

  it('AC-14: mp=ozon — «: Ozon»', async () => {
    renderApp('/dashboard?mp=ozon')
    await findTable()

    expect(imgLabel()).toBe(`${LABEL_HEAD}: Ozon, пунктир — прошлый период. Итого 2 349 560 ₽.`)
  })

  it('AC-14: без сравнения — без «, пунктир — прошлый период»', async () => {
    renderApp('/dashboard?cmp=0')
    await findTable()

    expect(imgLabel()).toBe(`${LABEL_HEAD}: WB и Ozon стопкой. Итого 7 284 560 ₽.`)
  })

  it('AC-14: итог — в формате выбранной метрики', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(metricButton('Заказы'))
    expect(imgLabel()).toBe(`${LABEL_HEAD}: WB и Ozon стопкой, пунктир — прошлый период. Итого 5 476 шт.`)

    await user.click(metricButton('Прибыль'))
    expect(imgLabel()).toBe(`${LABEL_HEAD}: WB и Ozon стопкой, пунктир — прошлый период. Итого 1 704 587 ₽.`)
  })

  it('AC-14: подписи осей (если Recharts их нарисовал) скрыты от скринридера', async () => {
    renderApp('/dashboard')
    await findTable()
    const chart = getChart()

    for (const tick of chart.querySelectorAll('.recharts-cartesian-axis-tick, .recharts-cartesian-axis')) {
      expect(tick.closest('[aria-hidden="true"], [role="img"]')).not.toBeNull()
    }
  })

  it('AC-15: область графика доступна с клавиатуры (в порядке Tab)', async () => {
    renderApp('/dashboard')
    await findTable()

    const img = chartImg()
    expect(img.tabIndex).toBe(0)
    act(() => img.focus())
    expect(img).toHaveFocus()
  })
})

describe('Доступность: sr-only таблица', () => {
  it('AC-15: caption «Продажи по дням: Выручка», колонки «Дата», «WB», «Ozon», «Итого», «Прошлый период»', async () => {
    renderApp('/dashboard')
    const table = await findTable()

    expect(table).toHaveAccessibleName('Продажи по дням: Выручка')
    expect(norm(table.querySelector('caption')?.textContent)).toBe('Продажи по дням: Выручка')
    expect(headers(table)).toEqual(['Дата', 'WB', 'Ozon', 'Итого', 'Прошлый период'])
  })

  it('AC-15: строка на каждый день периода, значения в формате метрики, по порядку дат', async () => {
    renderApp('/dashboard')
    const rows = bodyRows(await findTable())

    expect(rows).toHaveLength(30)
    const first = rowCells(rows[0] as HTMLTableRowElement)
    const last = rowCells(rows[29] as HTMLTableRowElement)
    expect(first.slice(1)).toEqual([...EXPECTED_ROWS.Выручка.first])
    expect(last.slice(1)).toEqual([...EXPECTED_ROWS.Выручка.last])
    // Дата — formatDayMonthLong(date, true): «5 октября 2026» … «3 ноября 2026»
    const dates = rows.map((row) => rowCells(row)[0])
    expect(dates[0]).toBe('5 октября 2026')
    expect(dates[1]).toBe('6 октября 2026')
    expect(dates[26]).toBe('31 октября 2026')
    expect(dates[27]).toBe('1 ноября 2026')
    expect(dates[29]).toBe('3 ноября 2026')
    expect(new Set(dates).size).toBe(30)
  })

  it('AC-15: дата в таблице — с годом даже на стыке лет («28 декабря 2025» … «3 января 2026»)', async () => {
    renderApp('/dashboard?from=2025-12-28&to=2026-01-03')
    const rows = bodyRows(await findTable())

    expect(rows.map((row) => rowCells(row)[0])).toEqual([
      '28 декабря 2025',
      '29 декабря 2025',
      '30 декабря 2025',
      '31 декабря 2025',
      '1 января 2026',
      '2 января 2026',
      '3 января 2026',
    ])
  })

  it('AC-15: «Заказы» — caption и значения в штуках', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(metricButton('Заказы'))

    const table = within(getChart()).getByRole('table', { name: 'Продажи по дням: Заказы' })
    const rows = bodyRows(table)
    expect(rowCells(rows[0] as HTMLTableRowElement).slice(1)).toEqual([...EXPECTED_ROWS.Заказы.first])
    expect(rowCells(rows[29] as HTMLTableRowElement).slice(1)).toEqual([...EXPECTED_ROWS.Заказы.last])
  })

  it('AC-15, AC-6: «Прибыль» — отрицательные значения с минусом U+2212', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(metricButton('Прибыль'))

    const table = within(getChart()).getByRole('table', { name: 'Продажи по дням: Прибыль' })
    const rows = bodyRows(table)
    expect(rowCells(rows[0] as HTMLTableRowElement).slice(1)).toEqual([...EXPECTED_ROWS.Прибыль.first])
    expect(rowCells(rows[1] as HTMLTableRowElement).slice(1)).toEqual([...EXPECTED_ROWS.Прибыль.second])
    expect(rowCells(rows[29] as HTMLTableRowElement).slice(1)).toEqual([...EXPECTED_ROWS.Прибыль.last])
  })

  it('AC-15: mp=wb — нет колонки «Ozon»', async () => {
    renderApp('/dashboard?mp=wb')
    const table = await findTable()

    expect(headers(table)).toEqual(['Дата', 'WB', 'Итого', 'Прошлый период'])
    // При mp=wb итог дня = WB
    expect(rowCells(bodyRows(table)[0] as HTMLTableRowElement).slice(1)).toEqual(['150 000 ₽', '150 000 ₽', '216 000 ₽'])
  })

  it('AC-15: mp=ozon — нет колонки «WB»', async () => {
    renderApp('/dashboard?mp=ozon')
    const table = await findTable()

    expect(headers(table)).toEqual(['Дата', 'Ozon', 'Итого', 'Прошлый период'])
  })

  it('AC-15: без сравнения — нет колонки «Прошлый период»', async () => {
    renderApp('/dashboard?cmp=0')
    const table = await findTable()

    expect(headers(table)).toEqual(['Дата', 'WB', 'Ozon', 'Итого'])
    expect(rowCells(bodyRows(table)[0] as HTMLTableRowElement).slice(1)).toEqual(['150 000 ₽', '78 000 ₽', '228 000 ₽'])
  })

  it('AC-15: таблица — под графиком', async () => {
    renderApp('/dashboard')
    const table = await findTable()

    expect(chartImg().compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('Загрузка', () => {
  /** Контейнер скелетона: aria-busy, aria-label, 30 столбцов с высотами из макета; заголовок и переключатель на месте. */
  async function expectSkeleton(): Promise<HTMLElement> {
    const chart = await findChart()
    const busy = await within(chart).findByLabelText(LOADING_LABEL)
    expect(busy).toHaveAttribute('aria-busy', 'true')
    // Высоты столбцов — в процентах inline-стилем; у полос легенды размер фиксированный (110 × 12)
    expect(skeletonBarHeights(busy)).toEqual([...SKELETON_HEIGHTS])
    expectHeaderAndSwitch()
    expectNoChartContent()
    expectNoSubtitle()
    return busy
  }

  it('AC-17: пока грузится /api/sales-daily — скелетон в контейнере aria-busy', async () => {
    mockSales(async () => {
      await delay('infinite')
      return HttpResponse.json(salesDailyResponse())
    })
    renderApp('/dashboard')

    await expectSkeleton()
  })

  it('AC-17: пока грузится /api/meta — скелетон, /api/sales-daily ещё не запрашивается', async () => {
    server.use(
      http.get('/api/meta', async () => {
        await delay('infinite')
        return HttpResponse.json(META_FIXTURE)
      }),
    )
    renderApp('/dashboard')

    await expectSkeleton()
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
    expect(salesRequests).toHaveLength(0)
  })

  it('AC-17: после смены фильтров, пока идёт новый запрос, — снова скелетон, старых данных нет', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    mockSales(async () => {
      await delay('infinite')
      return HttpResponse.json(salesDailyResponse())
    })
    await user.click(panelButton('Маркетплейс', 'Ozon'))

    await expectSkeleton()
    expect(norm(getChart().textContent)).not.toContain('4 935 000')
  })

  it('AC-17: после загрузки скелетона нет', async () => {
    renderApp('/dashboard')
    await findTable()

    expect(within(getChart()).queryByLabelText(LOADING_LABEL)).toBeNull()
    expect(getChart().querySelector('[aria-busy="true"]')).toBeNull()
  })
})

describe('Пусто', () => {
  /** Блок «Нет продаж за период» вместо легенды и графика. */
  async function findEmptyBlock(): Promise<HTMLElement> {
    const chart = await findChart()
    const title = await within(chart).findByText(EMPTY_TITLE, {}, WAIT)
    let block: HTMLElement | null = title
    while (block && block !== chart && !within(block).queryByRole('button', { name: 'Сбросить фильтры' })) {
      block = block.parentElement
    }
    if (!block || block === chart) throw new Error('Кнопка «Сбросить фильтры» не в блоке «Нет продаж за период»')
    expect(elementsWithExactText(EMPTY_TEXT, block)).not.toHaveLength(0)
    // Пусто — не ошибка
    expect(block.closest('[role="alert"]')).toBeNull()
    expectHeaderAndSwitch()
    expectNoChartContent()
    expectNoSubtitle()
    expect(within(chart).queryByLabelText(LOADING_LABEL)).toBeNull()
    return block
  }

  it('AC-16: у всех дней нули — «Нет продаж за период», пояснение и «Сбросить фильтры»', async () => {
    mockSales((params) =>
      HttpResponse.json(salesDailyResponse({ from: params.get('from'), to: params.get('to'), map: emptyDay })),
    )
    renderApp('/dashboard')

    await findEmptyBlock()
  })

  it('AC-16: продажи в прошлом периоде есть, в текущем нет — всё равно пусто', async () => {
    // emptyDay оставляет previousTotal с продажами
    mockSales(() => HttpResponse.json(salesDailyResponse({ map: emptyDay })))
    renderApp('/dashboard')

    await findEmptyBlock()
  })

  it('AC-16: «Сбросить фильтры» сбрасывает все фильтры, как в spec 002 AC-15', async () => {
    // Пусто только по WB: после сброса — график по всем площадкам
    mockSales((params) =>
      params.get('mp') === 'wb'
        ? HttpResponse.json(salesDailyResponse({ from: params.get('from'), to: params.get('to'), map: emptyDay }))
        : defaultSales(params),
    )
    const { user, router } = renderApp('/dashboard?period=7&mp=wb&cat=shoes&cmp=0')
    const block = await findEmptyBlock()

    await user.click(within(block).getByRole('button', { name: 'Сбросить фильтры' }))

    await waitFor(() => expect(searchStr(router)).toBe(''))
    expect(router.state.location.pathname).toBe('/dashboard')
    await findTable()
    expect(legendItems(getChart())).toContain(`Ozon ${EXPECTED.Выручка.ozon}`)
  })

  it('AC-16: выручка 0, но заказы есть — не пусто, таблица показана', async () => {
    mockSales(() =>
      HttpResponse.json(
        salesDailyResponse({
          map: (day, i) => {
            const empty = emptyDay(day)
            return i === 3 ? { ...empty, wb: { ...empty.wb, ordersCount: 2 }, total: { ...empty.total, ordersCount: 2 } } : empty
          },
        }),
      ),
    )
    renderApp('/dashboard')

    await findTable()
    expect(screen.queryByText(EMPTY_TITLE)).toBeNull()
  })

  it('AC-16: «пусто» не зависит от метрики — на «Прибыли» с нулевой прибылью график остаётся', async () => {
    mockSales(() =>
      HttpResponse.json(
        salesDailyResponse({
          map: (day) => ({
            ...day,
            wb: { ...day.wb, profit: 0 },
            ozon: { ...day.ozon, profit: 0 },
            total: { ...day.total, profit: 0 },
          }),
        }),
      ),
    )
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(metricButton('Прибыль'))

    expect(within(getChart()).getByRole('table', { name: 'Продажи по дням: Прибыль' })).toBeInTheDocument()
    expect(screen.queryByText(EMPTY_TITLE)).toBeNull()
  })
})

describe('Ошибка', () => {
  /** Блок ошибки графика: role="alert", заголовок, пояснение, «Повторить». */
  async function findChartError(): Promise<HTMLElement> {
    const chart = await findChart()
    const title = await within(chart).findByText(ERROR_TITLE, {}, WAIT)
    const alert = title.closest<HTMLElement>('[role="alert"]')
    if (!alert) throw new Error('Блок ошибки графика без role="alert"')
    expect(chart.contains(alert)).toBe(true)
    expect(elementsWithExactText(ERROR_TEXT, alert)).not.toHaveLength(0)
    expect(within(alert).getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    expectHeaderAndSwitch()
    expectNoChartContent()
    expectNoSubtitle()
    expect(within(chart).queryByLabelText(LOADING_LABEL)).toBeNull()
    return alert
  }

  it.each([
    ['статус 500', () => HttpResponse.json({ message: 'Внутренняя ошибка' }, { status: 500 })],
    ['статус 404', () => HttpResponse.json({ message: 'Не найдено' }, { status: 404 })],
    ['сетевая ошибка', () => HttpResponse.error()],
    [
      'ответ не по схеме: нет previousTotal',
      () => {
        const days = salesDailyResponse().days.map((d) => ({
          date: d.date,
          wb: d.wb,
          ozon: d.ozon,
          total: d.total,
          previousDate: d.previousDate,
        }))
        return HttpResponse.json({ days })
      },
    ],
    [
      'ответ не по схеме: строка вместо числа',
      () => {
        const { days } = salesDailyResponse()
        const broken = days.map((d, i) => (i === 0 ? { ...d, wb: { ...d.wb, revenue: 'много' } } : d))
        return HttpResponse.json({ days: broken })
      },
    ],
    ['ответ не по схеме: нет days', () => HttpResponse.json({ items: [] })],
  ])('AC-18: ошибка /api/sales-daily (%s) — блок role="alert"', async (_title, respond) => {
    mockSales(respond)
    renderApp('/dashboard')

    await findChartError()
  })

  it('AC-18 / T3, T5: разметка в ответе не по схеме не внедряется', async () => {
    mockSales(() => {
      const { days } = salesDailyResponse()
      const broken = days.map((d, i) => (i === 0 ? { ...d, date: '<img src=x onerror=alert(1)>' } : d))
      return HttpResponse.json({ days: broken })
    })
    renderApp('/dashboard')

    await findChartError()
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(screen.queryByText(/onerror/)).toBeNull()
  })

  it('AC-18: технических деталей (статус, путь, стек) в блоке ошибки нет', async () => {
    mockSales(() => HttpResponse.json({ message: 'Внутренняя ошибка: /src/mocks/server/core.ts' }, { status: 502 }))
    renderApp('/dashboard')

    const alert = await findChartError()
    expect(norm(alert.textContent)).not.toMatch(/502|\/api\/|\/src\/|Error|Внутренняя ошибка/)
  })

  it('AC-18: ошибка /api/meta — тот же блок ошибки графика', async () => {
    server.use(http.get('/api/meta', () => new HttpResponse(null, { status: 500 })))
    renderApp('/dashboard')

    await findChartError()
    expect(salesRequests).toHaveLength(0)
  })

  it('AC-18: «Повторить» заново запрашивает /api/sales-daily, при успехе — график', async () => {
    let fail = true
    mockSales((params) => (fail ? new HttpResponse(null, { status: 500 }) : defaultSales(params)))
    const { user } = renderApp('/dashboard')
    const alert = await findChartError()
    const before = salesRequests.length

    fail = false
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }))

    await findTable()
    expect(salesRequests.length).toBeGreaterThan(before)
    expect(within(getChart()).queryByText(ERROR_TITLE)).toBeNull()
    expectSubtitle(EXPECTED.Выручка.total, EXPECTED.Выручка.prev)
  })

  it('AC-18: «Повторить» после ошибки /api/meta заново запрашивает /api/meta, затем график', async () => {
    let metaFail = true
    server.use(
      http.get('/api/meta', () => {
        metaRequests += 1
        return metaFail ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(META_FIXTURE)
      }),
    )
    const { user } = renderApp('/dashboard')
    const alert = await findChartError()
    const before = metaRequests

    metaFail = false
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }))

    await findTable()
    expect(metaRequests).toBeGreaterThan(before)
    expect(within(getChart()).queryByText(ERROR_TITLE)).toBeNull()
  })

  it('AC-18: упал лишь фоновый перезапрос, а данные есть, — график остаётся', async () => {
    const { client } = renderApp('/dashboard')
    await findTable()
    expect(salesRequests).toHaveLength(1)

    mockSales(() => new HttpResponse(null, { status: 500 }))
    // Фоновый перезапрос тех же данных (ключ из spec: ['sales-daily', from, to, mp, cat])
    void client.invalidateQueries({ queryKey: ['sales-daily'] })

    await waitFor(() => expect(salesRequests.length).toBeGreaterThan(1))
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
    expect(within(getChart()).queryByText(ERROR_TITLE)).toBeNull()
    expect(within(getChart()).queryByRole('alert')).toBeNull()
    expect(getTable()).toBeInTheDocument()
    expectSubtitle(EXPECTED.Выручка.total, EXPECTED.Выручка.prev)
  })
})

describe('Независимость блоков', () => {
  it('AC-19: ошибка графика не ломает KPI и панель фильтров', async () => {
    mockSales(() => new HttpResponse(null, { status: 500 }))
    const { user, router } = renderApp('/dashboard')
    await screen.findByText(ERROR_TITLE, {}, WAIT)

    const kpi = screen.getByRole('region', { name: 'Ключевые показатели' })
    await waitFor(() => expect(within(kpi).getAllByRole('article')).toHaveLength(8), WAIT)
    expect(within(kpi).queryByRole('alert')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Дашборд' })).toBeInTheDocument()

    const before = salesRequests.length
    await user.click(panelButton('Маркетплейс', 'WB'))
    await waitFor(() => expect(searchStr(router)).toBe('?mp=wb'))
    await waitFor(() => expect(salesRequests.length).toBeGreaterThan(before))
    expect((salesRequests.at(-1) as URLSearchParams).get('mp')).toBe('wb')
  })

  it('AC-19: ошибка KPI не ломает график', async () => {
    server.use(http.get('/api/kpi', () => new HttpResponse(null, { status: 500 })))
    renderApp('/dashboard')

    await screen.findByText('Не удалось загрузить показатели', {}, WAIT)
    await findTable()
    expect(within(getChart()).queryByRole('alert')).toBeNull()
    expectSubtitle(EXPECTED.Выручка.total, EXPECTED.Выручка.prev)
    expect(legendItems(getChart())).toHaveLength(3)
  })
})
