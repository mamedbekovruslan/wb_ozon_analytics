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
import { bodyRows, ResizeObserverStub, rowCells, salesDailyResponse } from './salesChartTestFixtures'
import {
  COLUMN_SORT,
  EXPECTED_ORDER,
  EXPECTED_VALUES,
  NAME_BY_SKU,
  ORDERS_ASC,
  PRODUCTS,
  REVENUE_ASC,
  rowSku,
  SKU,
  SORT_COLUMNS,
  type SortColumn,
  SUBTITLE,
  SUBTITLE_ASC,
  type TopItem,
  topItem,
  topProductsResponse,
} from './topProductsTestFixtures'

/*
 * Spec 006 «Топ товаров» — дашборд целиком через настоящий роутер (1440 px).
 * «Сегодня» из фикстуры /api/meta — 04.11.2026: период по умолчанию 05.10–03.11.2026.
 * Ответ /api/top-products строит фикстура-«сервер» (topProductsTestFixtures.ts) по параметрам
 * запроса; ожидаемые порядки строк и форматированные значения посчитаны вручную.
 *
 * CSS-модули jsdom не применяет: цвета, размеры, раскладка, наведение и прокрутка —
 * в e2e/top-products.spec.ts. Здесь — разметка, тексты, состояния и запросы.
 */

/** Параметры каждого запроса /api/top-products (AC-2, AC-8). */
const topRequests: URLSearchParams[] = []
let metaRequests = 0

function defaultTop(params: URLSearchParams) {
  return HttpResponse.json(
    topProductsResponse({ sort: params.get('sort'), limit: params.get('limit'), mp: params.get('mp') }),
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
    return HttpResponse.json(salesDailyResponse({ from: params.get('from'), to: params.get('to'), mp: params.get('mp') }))
  }),
  http.get('/api/top-products', ({ request }) => {
    const params = new URL(request.url).searchParams
    topRequests.push(params)
    return defaultTop(params)
  }),
  // Остальные блоки дашборда этим тестам не нужны
  http.get('/api/*', () => HttpResponse.json({ message: 'Недоступно в тесте топа' }, { status: 503 })),
)

/** Подменяет ответ /api/top-products, сохраняя учёт запросов. */
function mockTop(respond: (params: URLSearchParams) => Response | Promise<Response>): void {
  server.use(
    http.get('/api/top-products', ({ request }) => {
      const params = new URL(request.url).searchParams
      topRequests.push(params)
      return respond(params)
    }),
  )
}

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  topRequests.length = 0
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

const TOP = { name: 'Топ-10 товаров' } as const
const LOADING_LABEL = 'Загружаем топ товаров'
const EMPTY_TITLE = 'Нет продаж за период'
const EMPTY_TEXT = 'Топ появится, когда будет хотя бы один выкуп.'
const ERROR_TITLE = 'Не удалось загрузить товары'
const ERROR_TEXT = 'Проверьте соединение и повторите. Остальные блоки работают.'
const HEADERS = ['#', 'Товар', 'Площадка', 'Выручка', 'Заказы', '% выкупа', 'Прибыль']
/** Таймаут ожидания: ошибка может прийти после повтора, заданного в самом хуке. */
const WAIT = { timeout: 5000 }

const findTop = () => screen.findByRole('region', TOP)
const getTop = () => screen.getByRole('region', TOP)

/** Ждём данных топа: появилась таблица. */
async function findTable(): Promise<HTMLElement> {
  const top = await findTop()
  return within(top).findByRole('table', {}, WAIT)
}
const getTable = () => within(getTop()).getByRole('table')
const headerTexts = () => within(getTable()).getAllByRole('columnheader').map((th) => norm(th.textContent))

function columnHeader(label: string): HTMLElement {
  const th = within(getTable())
    .getAllByRole('columnheader')
    .find((cell) => norm(cell.textContent) === label)
  if (!th) throw new Error(`Нет заголовка «${label}»: ${headerTexts().join(', ')}`)
  return th
}
const sortButton = (label: SortColumn) => within(columnHeader(label)).getByRole('button')

const rows = () => bodyRows(getTable())
const skus = () => rows().map(rowSku)
const ranks = () => rows().map((row) => rowCells(row)[0])
const rowBySku = (sku: string) => {
  const row = rows().find((r) => rowSku(r) === sku)
  if (!row) throw new Error(`Нет строки с артикулом ${sku}`)
  return row
}
const cellsOf = (row: HTMLTableRowElement) => [...row.querySelectorAll<HTMLElement>('th, td')]
const oneToN = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

/** Подзаголовок — отдельный элемент с точным текстом. */
function expectSubtitle(text: string): void {
  const top = getTop()
  expect(elementsWithExactText(text, top), norm(top.textContent)).not.toHaveLength(0)
}

/** Заголовок h2 и подзаголовок на месте (AC-3: «во всех состояниях блока»). */
function expectHeader(subtitle = SUBTITLE.revenue): void {
  expect(within(getTop()).getByRole('heading', { level: 2, name: 'Топ-10 товаров' })).toBeInTheDocument()
  expectSubtitle(subtitle)
}

/** Ни таблицы, ни списка карточек. */
function expectNoData(): void {
  const top = getTop()
  expect(within(top).queryByRole('table')).toBeNull()
  expect(top.querySelector('ol')).toBeNull()
}

const filterPanel = () => screen.getByRole('search', { name: 'Фильтры' })
const panelButton = (group: string, name: string) =>
  within(within(filterPanel()).getByRole('group', { name: group })).getByRole('button', { name })
const compareSwitch = () => within(filterPanel()).getByRole('switch', { name: 'Сравнить с прошлым периодом' })

// =====================================================================================

describe('Секция топа', () => {
  it('AC-1: section с видимым h2 «Топ-10 товаров», связь через aria-labelledby', async () => {
    renderApp('/dashboard')
    const top = await findTop()

    expect(top.tagName).toBe('SECTION')
    const h2 = within(top).getByRole('heading', { level: 2, name: 'Топ-10 товаров' })
    expect(h2.id).not.toBe('')
    expect(top.getAttribute('aria-labelledby')).toBe(h2.id)
    expect(h2.closest('.sr-only')).toBeNull()
    expect(h2).not.toHaveClass('sr-only')
  })

  it('AC-1: секция идёт под графиком продаж (порядок KPI → график → топ), не внутри него', async () => {
    renderApp('/dashboard')
    const top = await findTop()
    const chart = await screen.findByRole('region', { name: 'Продажи по дням' })
    const kpi = await screen.findByRole('region', { name: 'Ключевые показатели' })

    expect(chart.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(kpi.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(chart.contains(top)).toBe(false)
    expect(top.contains(chart)).toBe(false)
  })
})

describe('Запрос /api/top-products', () => {
  it('AC-2: параметры по умолчанию — from, to, mp=all, sort=revenue, limit=10, без cat и cmp; один запрос', async () => {
    renderApp('/dashboard')
    await findTable()

    expect(topRequests).toHaveLength(1)
    expect(sortedParams((topRequests[0] as URLSearchParams).toString())).toEqual([
      ['from', '2026-10-05'],
      ['limit', '10'],
      ['mp', 'all'],
      ['sort', 'revenue'],
      ['to', '2026-11-03'],
    ])
  })

  it('AC-2: фильтры из URL — период, mp и cat (в порядке справочника); cmp и period в запрос не уходят', async () => {
    renderApp('/dashboard?period=7&mp=wb&cat=sports&cat=shoes&cmp=0')
    await findTable()

    expect(topRequests).toHaveLength(1)
    const params = topRequests[0] as URLSearchParams
    expect(params.get('from')).toBe('2026-10-28')
    expect(params.get('to')).toBe('2026-11-03')
    expect(params.get('mp')).toBe('wb')
    expect(params.getAll('cat')).toEqual(['shoes', 'sports'])
    expect(params.get('sort')).toBe('revenue')
    expect(params.get('limit')).toBe('10')
    expect(params.has('cmp')).toBe(false)
    expect(params.has('period')).toBe(false)
  })

  it('AC-2: свой период из URL — from и to как есть', async () => {
    renderApp('/dashboard?from=2025-12-28&to=2026-01-03')
    await findTable()

    const last = topRequests.at(-1) as URLSearchParams
    expect(last.get('from')).toBe('2025-12-28')
    expect(last.get('to')).toBe('2026-01-03')
  })

  it('AC-2: смена площадки — новый запрос и новые строки', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(panelButton('Маркетплейс', 'WB'))

    await waitFor(() => expect(topRequests).toHaveLength(2))
    expect((topRequests[1] as URLSearchParams).get('mp')).toBe('wb')
    // Только WB: P1, P3, P5, P7, P9, P11 по выручке
    await waitFor(() => expect(skus()).toEqual([SKU.P1, SKU.P3, SKU.P5, SKU.P7, SKU.P9, SKU.P11]), WAIT)
  })

  it('AC-2: смена периода — новый запрос с новыми from/to', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(panelButton('Период', '7 дней'))

    await waitFor(() => expect(topRequests).toHaveLength(2))
    const params = topRequests[1] as URLSearchParams
    expect(params.get('from')).toBe('2026-10-28')
    expect(params.get('to')).toBe('2026-11-03')
    expect(params.get('sort')).toBe('revenue')
  })

  it('AC-2: смена категорий — новый запрос с cat', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(within(filterPanel()).getByRole('button', { name: /^Категории/ }))
    const list = await screen.findByRole('group', { name: 'Категории' })
    await user.click(within(list).getByRole('checkbox', { name: /^Обувь/ }))
    await user.click(within(list).getByRole('button', { name: 'Применить' }))

    await waitFor(() => expect(topRequests).toHaveLength(2))
    expect((topRequests[1] as URLSearchParams).getAll('cat')).toEqual(['shoes'])
  })

  it('AC-2: смена метрики сортировки — новый запрос с sort и теми же фильтрами', async () => {
    const { user } = renderApp('/dashboard?mp=ozon')
    await findTable()

    await user.click(sortButton('Прибыль'))

    await waitFor(() => expect(topRequests).toHaveLength(2))
    const params = topRequests[1] as URLSearchParams
    expect(params.get('sort')).toBe('profit')
    expect(params.get('limit')).toBe('10')
    expect(params.get('mp')).toBe('ozon')
    expect(params.get('from')).toBe('2026-10-05')
  })

  it.each(SORT_COLUMNS.filter((c) => c !== 'Выручка'))(
    'AC-2: колонка «%s» — sort по таблице «Сортировка»',
    async (column) => {
      const { user } = renderApp('/dashboard')
      await findTable()

      await user.click(sortButton(column))

      await waitFor(() => expect(topRequests).toHaveLength(2))
      expect((topRequests[1] as URLSearchParams).get('sort')).toBe(COLUMN_SORT[column])
    },
  )

  it('AC-2: переключение сравнения и смена направления — без нового запроса', async () => {
    const { user, router } = renderApp('/dashboard')
    await findTable()
    expect(topRequests).toHaveLength(1)

    await user.click(compareSwitch())
    await waitFor(() => expect(searchStr(router)).toBe('?cmp=0'))
    await user.click(compareSwitch())
    await waitFor(() => expect(searchStr(router)).toBe(''))

    // Повторный клик по активной «Выручке» — только направление
    await user.click(sortButton('Выручка'))
    await waitFor(() => expect(skus()).toEqual(REVENUE_ASC))
    await user.click(sortButton('Выручка'))
    await waitFor(() => expect(skus()).toEqual(EXPECTED_ORDER.revenue))

    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
    expect(topRequests).toHaveLength(1)
  })

  it('AC-2: прежние фильтры после «Назад» — ответ из кэша, без повторного запроса', async () => {
    const { user, router } = renderApp('/dashboard')
    await findTable()

    await user.click(panelButton('Маркетплейс', 'WB'))
    await waitFor(() => expect(skus()).toHaveLength(6), WAIT)
    expect(topRequests).toHaveLength(2)

    act(() => router.history.back())
    await waitFor(() => expect(searchStr(router)).toBe(''))
    await waitFor(() => expect(skus()).toEqual(EXPECTED_ORDER.revenue), WAIT)
    expect(topRequests).toHaveLength(2)
  })
})

describe('Подзаголовок', () => {
  it('AC-3: по умолчанию — «по выручке за период»', async () => {
    renderApp('/dashboard')
    await findTable()

    expectSubtitle(SUBTITLE.revenue)
  })

  it.each(SORT_COLUMNS)('AC-3: колонка «%s» — подзаголовок по таблице «Сортировка», затем «…, по возрастанию за период»', async (column) => {
    const { user } = renderApp('/dashboard')
    await findTable()
    const sort = COLUMN_SORT[column]

    if (column !== 'Выручка') {
      await user.click(sortButton(column))
      await waitFor(() => expect(skus()).toEqual(EXPECTED_ORDER[sort]), WAIT)
      expectSubtitle(SUBTITLE[sort])
    }

    await user.click(sortButton(column))
    await waitFor(() => expectSubtitle(SUBTITLE_ASC[sort]))
    expect(elementsWithExactText(SUBTITLE[sort], getTop())).toHaveLength(0)
  })

  it('AC-3: пример из макета — «по выручке, по возрастанию за период»', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(sortButton('Выручка'))

    expectSubtitle('по выручке, по возрастанию за период')
  })
})

describe('Таблица', () => {
  it('AC-4: колонки #, Товар, Площадка, Выручка, Заказы, % выкупа, Прибыль; заголовки — th scope="col"', async () => {
    renderApp('/dashboard')
    const table = await findTable()

    expect(headerTexts()).toEqual(HEADERS)
    for (const th of within(table).getAllByRole('columnheader')) {
      expect(th.tagName).toBe('TH')
      expect(th).toHaveAttribute('scope', 'col')
    }
  })

  it('AC-4: строка на каждый товар ответа в порядке ответа (по выручке, по убыванию), номера 1…10', async () => {
    renderApp('/dashboard')
    await findTable()

    expect(skus()).toEqual(EXPECTED_ORDER.revenue)
    expect(ranks()).toEqual(oneToN(10))
  })

  it('AC-4: в ответе меньше 10 товаров (mp=wb — 6) — столько же строк', async () => {
    renderApp('/dashboard?mp=wb')
    await findTable()

    expect(skus()).toEqual([SKU.P1, SKU.P3, SKU.P5, SKU.P7, SKU.P9, SKU.P11])
    expect(ranks()).toEqual(oneToN(6))
  })

  it('AC-4: один товар — одна строка с номером 1', async () => {
    mockTop(() => HttpResponse.json({ items: [PRODUCTS[2] as TopItem] }))
    renderApp('/dashboard')
    await findTable()

    expect(skus()).toEqual([SKU.P3])
    expect(ranks()).toEqual(['1'])
  })

  it('AC-5: значения ячеек — formatRub, formatInt, formatPercent; бейдж «WB» / «Ozon»', async () => {
    renderApp('/dashboard')
    await findTable()

    for (const sku of EXPECTED_ORDER.revenue) {
      const expected = EXPECTED_VALUES[sku]
      if (!expected) throw new Error(sku)
      const cells = rowCells(rowBySku(sku))
      expect(cells[2], `площадка ${sku}`).toBe(expected.mp)
      expect(cells[3], `выручка ${sku}`).toBe(expected.revenue)
      expect(cells[4], `заказы ${sku}`).toBe(expected.orders)
      expect(cells[5], `% выкупа ${sku}`).toBe(expected.buyout)
      expect(cells[6], `прибыль ${sku}`).toBe(expected.profit)
    }
  })

  it('AC-5: «Товар» — название и «Арт. {sku} · {категория}» отдельными строками', async () => {
    renderApp('/dashboard')
    await findTable()

    for (const sku of EXPECTED_ORDER.revenue) {
      const cell = cellsOf(rowBySku(sku))[1] as HTMLElement
      expect(elementsWithExactText(NAME_BY_SKU[sku] as string, cell), `название ${sku}`).not.toHaveLength(0)
      expect(
        elementsWithExactText(`Арт. ${sku} ${MIDDOT} ${EXPECTED_VALUES[sku]?.category}`, cell),
        norm(cell.textContent),
      ).not.toHaveLength(0)
    }
  })

  it('AC-5: заглушка-превью — aria-hidden, с иконкой, без текста', async () => {
    renderApp('/dashboard')
    await findTable()

    for (const row of rows()) {
      const cell = cellsOf(row)[1] as HTMLElement
      const previews = [...cell.querySelectorAll<HTMLElement>('[aria-hidden="true"]')].filter((el) => el.querySelector('svg'))
      expect(previews.length, rowSku(row)).toBeGreaterThan(0)
      for (const preview of previews) expect(norm(preview.textContent)).toBe('')
    }
    // Фото товаров нет — настоящих картинок тоже
    expect(getTable().querySelector('img')).toBeNull()
  })

  it('AC-5: % выкупа null — «—» и скрытый текст «нет данных»; прибыль в минусе — с U+2212', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    // P8 (null) есть в топе по заказам
    await user.click(sortButton('Заказы'))
    await waitFor(() => expect(skus()).toEqual(EXPECTED_ORDER.orders), WAIT)

    const cell = cellsOf(rowBySku(SKU.P8))[5] as HTMLElement
    expect(norm(cell.textContent)).toMatch(/^—\s*нет данных$/)
    const hidden = within(cell).getByText('нет данных')
    expect(hidden.closest('.sr-only')).not.toBeNull()
    expect(elementsWithExactText('—', cell)).not.toHaveLength(0)
    expect(rowCells(rowBySku(SKU.P8))[6]).toBe('−1 200 ₽')
    expect(rowCells(rowBySku(SKU.P9))[6]).toBe('−5 000 ₽')
    expect(rowCells(rowBySku(SKU.P8))[3]).toBe('0 ₽')
  })

  it('AC-5: очень большие числа и нули — без экспоненты и обрезания', async () => {
    mockTop(() =>
      HttpResponse.json({
        items: [
          topItem({ sku: '900000001', revenue: 1_234_567_890, ordersCount: 1_000_000, buyoutRate: 100, profit: 987_654_321 }),
          topItem({ sku: '900000002', revenue: 0, ordersCount: 0, buyoutRate: 0, profit: 0 }),
        ],
      }),
    )
    renderApp('/dashboard')
    await findTable()

    expect(rowCells(rowBySku('900000001')).slice(3)).toEqual(['1 234 567 890 ₽', '1 000 000', '100,0 %', '987 654 321 ₽'])
    expect(rowCells(rowBySku('900000002')).slice(3)).toEqual(['0 ₽', '0', '0,0 %', '0 ₽'])
  })

  it('AC-6: название категории — из /api/meta', async () => {
    renderApp('/dashboard')
    await findTable()

    const cell = cellsOf(rowBySku(SKU.P4))[1] as HTMLElement
    expect(elementsWithExactText(`Арт. ${SKU.P4} ${MIDDOT} Дом и кухня`, cell)).not.toHaveLength(0)
  })

  it('AC-6: категории нет в /api/meta — показан её id', async () => {
    server.use(
      http.get('/api/meta', () =>
        HttpResponse.json({ ...META_FIXTURE, categories: META_FIXTURE.categories.filter((c) => c.id !== 'sports') }),
      ),
    )
    renderApp('/dashboard')
    await findTable()

    const cell = cellsOf(rowBySku(SKU.P7))[1] as HTMLElement
    expect(elementsWithExactText(`Арт. ${SKU.P7} ${MIDDOT} sports`, cell), norm(cell.textContent)).not.toHaveLength(0)
    // Остальные категории — по-прежнему по названию
    expect(elementsWithExactText(`Арт. ${SKU.P1} ${MIDDOT} Обувь`, cellsOf(rowBySku(SKU.P1))[1] as HTMLElement)).not.toHaveLength(0)
  })

  it('AC-13: строки не фокусируются — ни tabindex, ни ссылок и кнопок в теле таблицы', async () => {
    renderApp('/dashboard')
    const table = await findTable()

    for (const row of rows()) expect(row).not.toHaveAttribute('tabindex')
    const body = table.querySelector('tbody') ?? table
    const focusable = [...body.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter(
      (el) => !el.closest('thead'),
    )
    expect(focusable).toEqual([])
  })
})

describe('Заголовки-кнопки сортировки', () => {
  it('AC-7: «Выручка», «Заказы», «% выкупа», «Прибыль» — button внутри th; у #, «Товар», «Площадка» кнопок нет', async () => {
    renderApp('/dashboard')
    await findTable()

    for (const label of SORT_COLUMNS) {
      const button = sortButton(label)
      expect(button.tagName).toBe('BUTTON')
      expect(norm(button.textContent)).toBe(label)
    }
    for (const label of ['#', 'Товар', 'Площадка']) {
      expect(within(columnHeader(label)).queryByRole('button')).toBeNull()
    }
  })

  it('AC-11, AC-10: на ≥ 640 нет мобильной кнопки «Сменить сортировку» и списка карточек', async () => {
    renderApp('/dashboard')
    await findTable()

    expect(within(getTop()).queryByRole('button', { name: /Сменить сортировку/ })).toBeNull()
    expect(getTop().querySelector('ol')).toBeNull()
  })

  it.each([768, 640])('AC-4, AC-11: %i px (≥ 640) — та же таблица с кнопками-заголовками, без мобильной кнопки', async (width) => {
    vi.stubGlobal('matchMedia', createMatchMediaForWidth(width))
    renderApp('/dashboard')
    await findTable()

    expect(headerTexts()).toEqual(HEADERS)
    expect(skus()).toEqual(EXPECTED_ORDER.revenue)
    expect(within(getTop()).queryByRole('button', { name: /Сменить сортировку/ })).toBeNull()
    expect(getTop().querySelector('ol')).toBeNull()
  })

  it('AC-7: по умолчанию «Выручка» — aria-sort="descending", остальные — "none"', async () => {
    renderApp('/dashboard')
    await findTable()

    expect(columnHeader('Выручка')).toHaveAttribute('aria-sort', 'descending')
    for (const label of ['Заказы', '% выкупа', 'Прибыль']) {
      expect(columnHeader(label)).toHaveAttribute('aria-sort', 'none')
    }
  })

  it('AC-7: стрелки в кнопках — aria-hidden, у каждой кнопки есть стрелка', async () => {
    renderApp('/dashboard')
    await findTable()

    for (const label of SORT_COLUMNS) {
      const svgs = [...sortButton(label).querySelectorAll('svg')]
      expect(svgs.length, label).toBeGreaterThan(0)
      for (const svg of svgs) expect(svg.closest('[aria-hidden="true"]'), label).not.toBeNull()
    }
  })

  it('AC-7: стрелка активной колонки меняется при смене направления и отличается от стрелки неактивной', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    const arrow = (label: SortColumn) => [...sortButton(label).querySelectorAll('svg')].map((s) => s.outerHTML).join('')
    const desc = arrow('Выручка')
    const inactive = arrow('Заказы')
    expect(desc).not.toBe(inactive)

    await user.click(sortButton('Выручка'))
    await waitFor(() => expect(columnHeader('Выручка')).toHaveAttribute('aria-sort', 'ascending'))
    const asc = arrow('Выручка')
    expect(asc).not.toBe(desc)
    expect(asc).not.toBe(inactive)
  })
})

describe('Сортировка', () => {
  it('AC-8: клик по неактивному заголовку — топ по этой метрике по убыванию, номера заново 1…10', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(sortButton('Прибыль'))

    await waitFor(() => expect(skus()).toEqual(EXPECTED_ORDER.profit), WAIT)
    expect(ranks()).toEqual(oneToN(10))
    expect(columnHeader('Прибыль')).toHaveAttribute('aria-sort', 'descending')
    expect(columnHeader('Выручка')).toHaveAttribute('aria-sort', 'none')
  })

  it.each(SORT_COLUMNS.filter((c) => c !== 'Выручка'))('AC-8: «%s» — топ-10 по своей метрике', async (column) => {
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(sortButton(column))

    await waitFor(() => expect(skus()).toEqual(EXPECTED_ORDER[COLUMN_SORT[column]]), WAIT)
  })

  it('AC-8: повторный клик по активному — те же строки в обратном порядке без нового запроса, номера 1…10', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(sortButton('Выручка'))

    expect(skus()).toEqual(REVENUE_ASC)
    expect(ranks()).toEqual(oneToN(10))
    expect(columnHeader('Выручка')).toHaveAttribute('aria-sort', 'ascending')
    expect(topRequests).toHaveLength(1)

    // Третий клик — снова по убыванию
    await user.click(sortButton('Выручка'))
    expect(skus()).toEqual(EXPECTED_ORDER.revenue)
    expect(columnHeader('Выручка')).toHaveAttribute('aria-sort', 'descending')
    expect(topRequests).toHaveLength(1)
  })

  it('AC-8: «Заказы» по возрастанию — простой разворот, товар без % выкупа (null) разворачивается со всеми', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(sortButton('Заказы'))
    await waitFor(() => expect(skus()).toEqual(EXPECTED_ORDER.orders), WAIT)
    // P8 (null) — седьмой по убыванию
    expect(skus()[6]).toBe(SKU.P8)
    const requests = topRequests.length

    await user.click(sortButton('Заказы'))

    expect(skus()).toEqual(ORDERS_ASC)
    expect(skus()).toEqual([...EXPECTED_ORDER.orders].reverse())
    // По возрастанию — четвёртый, а не в конце
    expect(skus()[3]).toBe(SKU.P8)
    expect(ranks()).toEqual(oneToN(10))
    expect(topRequests).toHaveLength(requests)
  })

  it('AC-8: «% выкупа» по возрастанию (mp=ozon, ответ фикстуры-сервера) — null-товар остаётся в конце', async () => {
    // Ozon по % выкупа: P6 95,6 > P4 88 > P2 74,1 > P10 55 > P12 10 > P8 null (сервер ставит null в конец)
    const { user } = renderApp('/dashboard?mp=ozon')
    await findTable()

    await user.click(sortButton('% выкупа'))
    await waitFor(() => expect(skus()).toEqual([SKU.P6, SKU.P4, SKU.P2, SKU.P10, SKU.P12, SKU.P8]), WAIT)
    expect(ranks()).toEqual(oneToN(6))
    const requests = topRequests.length

    await user.click(sortButton('% выкупа'))

    expect(skus()).toEqual([SKU.P12, SKU.P10, SKU.P2, SKU.P4, SKU.P6, SKU.P8])
    expect(ranks()).toEqual(oneToN(6))
    expect(columnHeader('% выкупа')).toHaveAttribute('aria-sort', 'ascending')
    expectSubtitle(SUBTITLE_ASC.buyoutRate)
    expect(topRequests).toHaveLength(requests)
  })

  it('AC-8: «% выкупа» — null в конце и по убыванию, и по возрастанию (ответ из 4 товаров)', async () => {
    // Сервер ставит товары без % выкупа в конец (spec 001)
    // P11 99, P6 95,6, P3 91,3, P8 null
    const items = [PRODUCTS[10], PRODUCTS[5], PRODUCTS[2], PRODUCTS[7]] as TopItem[]
    mockTop((params) => (params.get('sort') === 'buyoutRate' ? HttpResponse.json({ items }) : defaultTop(params)))
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(sortButton('% выкупа'))
    await waitFor(() => expect(skus()).toEqual([SKU.P11, SKU.P6, SKU.P3, SKU.P8]), WAIT)
    expect(ranks()).toEqual(oneToN(4))

    await user.click(sortButton('% выкупа'))
    expect(skus()).toEqual([SKU.P3, SKU.P6, SKU.P11, SKU.P8])
    expect(ranks()).toEqual(oneToN(4))
    expect(columnHeader('% выкупа')).toHaveAttribute('aria-sort', 'ascending')
  })

  it('AC-8: после «по возрастанию» клик по другой колонке — новая метрика по убыванию', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(sortButton('Выручка'))
    expect(columnHeader('Выручка')).toHaveAttribute('aria-sort', 'ascending')

    await user.click(sortButton('Заказы'))
    await waitFor(() => expect(skus()).toEqual(EXPECTED_ORDER.orders), WAIT)
    expect(columnHeader('Заказы')).toHaveAttribute('aria-sort', 'descending')
    expect(columnHeader('Выручка')).toHaveAttribute('aria-sort', 'none')
    expectSubtitle(SUBTITLE.orders)

    // Возврат к «Выручке» — тоже по убыванию
    await user.click(sortButton('Выручка'))
    await waitFor(() => expect(skus()).toEqual(EXPECTED_ORDER.revenue), WAIT)
    expect(columnHeader('Выручка')).toHaveAttribute('aria-sort', 'descending')
  })

  it('AC-8 / T9: сортировка — состояние блока: не в URL и не в хранилище; новый показ — снова по выручке, по убыванию', async () => {
    const before = { local: Object.keys(localStorage), session: Object.keys(sessionStorage) }
    // docs/security.md T9: в localStorage допустима только тема
    const added = (storage: Storage, was: string[]) =>
      Object.keys(storage).filter((key) => !was.includes(key) && !/theme/i.test(key))
    const { user, router, view } = renderApp('/dashboard')
    await findTable()

    await user.click(sortButton('Заказы'))
    await waitFor(() => expect(skus()).toEqual(EXPECTED_ORDER.orders), WAIT)
    await user.click(sortButton('Заказы'))
    expect(searchStr(router)).toBe('')
    expect(added(localStorage, before.local)).toEqual([])
    expect(added(sessionStorage, before.session)).toEqual([])

    // «Перезагрузка»: приложение заново по тому же адресу
    view.unmount()
    renderApp(router.state.location.href)
    await findTable()
    expect(columnHeader('Выручка')).toHaveAttribute('aria-sort', 'descending')
    expectSubtitle(SUBTITLE.revenue)
    expect(skus()).toEqual(EXPECTED_ORDER.revenue)
  })
})

describe('Загрузка при смене метрики', () => {
  it('AC-9: старые строки на месте с aria-busy, заголовки уже с новой сортировкой, фокус на кнопке; после ответа — новые строки', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mockTop(async (params) => {
      if (params.get('sort') === 'orders') await gate
      return defaultTop(params)
    })
    const { user } = renderApp('/dashboard')
    await findTable()

    try {
      await user.click(sortButton('Заказы'))

      await waitFor(() => expect(topRequests.some((p) => p.get('sort') === 'orders')).toBe(true))
      expect(getTable()).toHaveAttribute('aria-busy', 'true')
      expect(skus()).toEqual(EXPECTED_ORDER.revenue)
      expect(columnHeader('Заказы')).toHaveAttribute('aria-sort', 'descending')
      expect(columnHeader('Выручка')).toHaveAttribute('aria-sort', 'none')
      expect(sortButton('Заказы')).toHaveFocus()
      // Скелетона нет — таблица не исчезает
      expect(within(getTop()).queryByLabelText(LOADING_LABEL)).toBeNull()
    } finally {
      release()
    }

    await waitFor(() => expect(skus()).toEqual(EXPECTED_ORDER.orders), WAIT)
    expect(getTable()).not.toHaveAttribute('aria-busy', 'true')
    expect(sortButton('Заказы')).toHaveFocus()
  })
})

describe('Загрузка', () => {
  /** Контейнер скелетона: aria-busy, aria-label; заголовок и подзаголовок видны; данных нет. */
  async function expectSkeleton(subtitle = SUBTITLE.revenue): Promise<HTMLElement> {
    const top = await findTop()
    const busy = await within(top).findByLabelText(LOADING_LABEL)
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expectHeader(subtitle)
    expectNoData()
    expect(within(top).queryByRole('alert')).toBeNull()
    return busy
  }

  it('AC-14: первая загрузка /api/top-products — скелетон', async () => {
    mockTop(async () => {
      await delay('infinite')
      return HttpResponse.json(topProductsResponse())
    })
    renderApp('/dashboard')

    await expectSkeleton()
  })

  it('AC-14: пока грузится /api/meta — скелетон, /api/top-products ещё не запрашивается', async () => {
    server.use(
      http.get('/api/meta', async () => {
        await delay('infinite')
        return HttpResponse.json(META_FIXTURE)
      }),
    )
    renderApp('/dashboard')

    await expectSkeleton()
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
    expect(topRequests).toHaveLength(0)
  })

  it('AC-14, AC-9: после смены фильтров — снова скелетон, старых строк нет', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()

    mockTop(async () => {
      await delay('infinite')
      return HttpResponse.json(topProductsResponse())
    })
    await user.click(panelButton('Маркетплейс', 'Ozon'))

    await expectSkeleton()
    expect(norm(getTop().textContent)).not.toContain(NAME_BY_SKU[SKU.P1])
  })

  it('AC-14: после смены фильтров при сортировке «Заказы» скелетон с подзаголовком «по заказам за период»', async () => {
    const { user } = renderApp('/dashboard')
    await findTable()
    await user.click(sortButton('Заказы'))
    await waitFor(() => expect(skus()).toEqual(EXPECTED_ORDER.orders), WAIT)

    mockTop(async () => {
      await delay('infinite')
      return HttpResponse.json(topProductsResponse())
    })
    await user.click(panelButton('Маркетплейс', 'WB'))

    await expectSkeleton(SUBTITLE.orders)
  })

  it('AC-14: после загрузки скелетона и aria-busy нет', async () => {
    renderApp('/dashboard')
    await findTable()

    expect(within(getTop()).queryByLabelText(LOADING_LABEL)).toBeNull()
    expect(getTop().querySelector('[aria-busy="true"]')).toBeNull()
  })
})

describe('Пусто', () => {
  async function findEmptyBlock(): Promise<HTMLElement> {
    const top = await findTop()
    const title = await within(top).findByText(EMPTY_TITLE, {}, WAIT)
    let block: HTMLElement | null = title
    while (block && block !== top && !within(block).queryByRole('button', { name: 'Сбросить фильтры' })) {
      block = block.parentElement
    }
    if (!block || block === top) throw new Error('Кнопка «Сбросить фильтры» не в блоке «Нет продаж за период»')
    expect(elementsWithExactText(EMPTY_TEXT, block)).not.toHaveLength(0)
    expect(block.closest('[role="alert"]')).toBeNull()
    // Иконка — декоративная
    const icons = [...block.querySelectorAll('[aria-hidden="true"]')].filter((el) => el.querySelector('svg'))
    expect(icons.length).toBeGreaterThan(0)
    expectHeader()
    expectNoData()
    expect(within(top).queryByLabelText(LOADING_LABEL)).toBeNull()
    return block
  }

  it('AC-15: ответ без товаров — «Нет продаж за период», пояснение и «Сбросить фильтры»', async () => {
    mockTop(() => HttpResponse.json({ items: [] }))
    renderApp('/dashboard')

    await findEmptyBlock()
  })

  it('AC-15: «Сбросить фильтры» сбрасывает все фильтры, как в spec 002 AC-15', async () => {
    mockTop((params) => (params.get('mp') === 'wb' ? HttpResponse.json({ items: [] }) : defaultTop(params)))
    const { user, router } = renderApp('/dashboard?period=7&mp=wb&cat=shoes&cmp=0')
    const block = await findEmptyBlock()

    await user.click(within(block).getByRole('button', { name: 'Сбросить фильтры' }))

    await waitFor(() => expect(searchStr(router)).toBe(''))
    expect(router.state.location.pathname).toBe('/dashboard')
    await findTable()
    expect(skus()).toEqual(EXPECTED_ORDER.revenue)
  })
})

describe('Ошибка', () => {
  async function findTopError(subtitle = SUBTITLE.revenue): Promise<HTMLElement> {
    const top = await findTop()
    const title = await within(top).findByText(ERROR_TITLE, {}, WAIT)
    const alert = title.closest<HTMLElement>('[role="alert"]')
    if (!alert) throw new Error('Блок ошибки топа без role="alert"')
    expect(top.contains(alert)).toBe(true)
    expect(elementsWithExactText(ERROR_TEXT, alert)).not.toHaveLength(0)
    const retry = within(alert).getByRole('button', { name: 'Повторить' })
    // Иконка обновления в кнопке — декоративная
    expect(retry.querySelector('svg')).not.toBeNull()
    for (const svg of retry.querySelectorAll('svg')) expect(svg.closest('[aria-hidden="true"]')).not.toBeNull()
    expectHeader(subtitle)
    expectNoData()
    expect(within(top).queryByLabelText(LOADING_LABEL)).toBeNull()
    return alert
  }

  it.each([
    ['статус 500', () => HttpResponse.json({ message: 'Внутренняя ошибка' }, { status: 500 })],
    ['статус 404', () => HttpResponse.json({ message: 'Не найдено' }, { status: 404 })],
    ['сетевая ошибка', () => HttpResponse.error()],
    ['ответ не по схеме: нет items', () => HttpResponse.json({ days: [] })],
    [
      'ответ не по схеме: строка вместо числа',
      () => HttpResponse.json({ items: [{ ...PRODUCTS[0], revenue: 'много' }] }),
    ],
    [
      'ответ не по схеме: неизвестная площадка',
      () => HttpResponse.json({ items: [{ ...PRODUCTS[0], marketplace: 'avito' }] }),
    ],
    [
      'ответ не по схеме: нет поля profit',
      () => {
        const withoutProfit: Partial<TopItem> = { ...PRODUCTS[0] }
        delete withoutProfit.profit
        return HttpResponse.json({ items: [withoutProfit] })
      },
    ],
  ])('AC-16 / T5: ошибка /api/top-products (%s) — блок role="alert"', async (_title, respond) => {
    mockTop(respond)
    renderApp('/dashboard')

    await findTopError()
  })

  it('AC-16 / T3, T5: разметка в ответе не по схеме не внедряется', async () => {
    mockTop(() =>
      HttpResponse.json({ items: [{ ...PRODUCTS[0], name: '<img src=x onerror=alert(1)>', ordersCount: 'x' }] }),
    )
    renderApp('/dashboard')

    await findTopError()
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(screen.queryByText(/onerror/)).toBeNull()
  })

  it('AC-16: технических деталей (статус, путь, стек) в блоке ошибки нет', async () => {
    mockTop(() => HttpResponse.json({ message: 'Внутренняя ошибка: /src/mocks/server/core.ts' }, { status: 502 }))
    renderApp('/dashboard')

    const alert = await findTopError()
    expect(norm(alert.textContent)).not.toMatch(/502|\/api\/|\/src\/|Error|Внутренняя ошибка|Сервер вернул/)
  })

  it('AC-16: ошибка /api/meta — тот же блок ошибки топа, /api/top-products не запрашивается', async () => {
    server.use(http.get('/api/meta', () => new HttpResponse(null, { status: 500 })))
    renderApp('/dashboard')

    await findTopError()
    expect(topRequests).toHaveLength(0)
  })

  it('AC-16: «Повторить» заново запрашивает /api/top-products, при успехе — таблица', async () => {
    let fail = true
    mockTop((params) => (fail ? new HttpResponse(null, { status: 500 }) : defaultTop(params)))
    const { user } = renderApp('/dashboard')
    const alert = await findTopError()
    const before = topRequests.length

    fail = false
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }))

    await findTable()
    expect(topRequests.length).toBeGreaterThan(before)
    expect(within(getTop()).queryByText(ERROR_TITLE)).toBeNull()
    expect(skus()).toEqual(EXPECTED_ORDER.revenue)
  })

  it('AC-16: ошибка топа по новой метрике — «Повторить» запрашивает ту же метрику', async () => {
    mockTop((params) => (params.get('sort') === 'profit' ? new HttpResponse(null, { status: 500 }) : defaultTop(params)))
    const { user } = renderApp('/dashboard')
    await findTable()

    await user.click(sortButton('Прибыль'))
    const alert = await findTopError(SUBTITLE.profit)

    mockTop(defaultTop)
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }))

    await findTable()
    expect((topRequests.at(-1) as URLSearchParams).get('sort')).toBe('profit')
    await waitFor(() => expect(skus()).toEqual(EXPECTED_ORDER.profit), WAIT)
  })

  it('AC-16: «Повторить» после ошибки /api/meta заново запрашивает /api/meta, затем топ', async () => {
    let metaFail = true
    server.use(
      http.get('/api/meta', () => {
        metaRequests += 1
        return metaFail ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(META_FIXTURE)
      }),
    )
    const { user } = renderApp('/dashboard')
    const alert = await findTopError()
    const before = metaRequests

    metaFail = false
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }))

    await findTable()
    expect(metaRequests).toBeGreaterThan(before)
    expect(within(getTop()).queryByText(ERROR_TITLE)).toBeNull()
  })

  it('AC-16: упал лишь фоновый перезапрос, а данные есть, — таблица остаётся', async () => {
    const { client } = renderApp('/dashboard')
    await findTable()
    expect(topRequests).toHaveLength(1)

    mockTop(() => new HttpResponse(null, { status: 500 }))
    // Фоновый перезапрос тех же данных (ключ из spec: ['top-products', from, to, mp, cat, sort])
    void client.invalidateQueries({ queryKey: ['top-products'] })

    await waitFor(() => expect(topRequests.length).toBeGreaterThan(1))
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
    expect(within(getTop()).queryByText(ERROR_TITLE)).toBeNull()
    expect(within(getTop()).queryByRole('alert')).toBeNull()
    expect(skus()).toEqual(EXPECTED_ORDER.revenue)
  })
})

describe('Независимость блоков', () => {
  it('AC-17: ошибка топа не ломает KPI, график и панель фильтров', async () => {
    mockTop(() => new HttpResponse(null, { status: 500 }))
    const { user, router } = renderApp('/dashboard')
    await within(await findTop()).findByText(ERROR_TITLE, {}, WAIT)

    const kpi = screen.getByRole('region', { name: 'Ключевые показатели' })
    await waitFor(() => expect(within(kpi).getAllByRole('article')).toHaveLength(8), WAIT)
    expect(within(kpi).queryByRole('alert')).toBeNull()
    const chart = screen.getByRole('region', { name: 'Продажи по дням' })
    await within(chart).findByRole('table', {}, WAIT)
    expect(within(chart).queryByRole('alert')).toBeNull()

    const before = topRequests.length
    await user.click(panelButton('Маркетплейс', 'WB'))
    await waitFor(() => expect(searchStr(router)).toBe('?mp=wb'))
    await waitFor(() => expect(topRequests.length).toBeGreaterThan(before))
    expect((topRequests.at(-1) as URLSearchParams).get('mp')).toBe('wb')
  })

  it('AC-17: ошибка графика не ломает топ', async () => {
    server.use(http.get('/api/sales-daily', () => new HttpResponse(null, { status: 500 })))
    renderApp('/dashboard')

    await screen.findByText('График не загрузился', {}, WAIT)
    await findTable()
    expect(within(getTop()).queryByRole('alert')).toBeNull()
    expect(skus()).toEqual(EXPECTED_ORDER.revenue)
  })

  it('AC-17: ошибка KPI не ломает топ', async () => {
    server.use(http.get('/api/kpi', () => new HttpResponse(null, { status: 500 })))
    renderApp('/dashboard')

    await screen.findByText('Не удалось загрузить показатели', {}, WAIT)
    await findTable()
    expect(within(getTop()).queryByRole('alert')).toBeNull()
    expectSubtitle(SUBTITLE.revenue)
  })
})

describe('Безопасность', () => {
  it('T3: название с разметкой выводится как текст', async () => {
    const evil = '<img src=x onerror=alert(1)><b>Жирный</b>'
    mockTop(() => HttpResponse.json({ items: [topItem({ sku: '900000003', name: evil })] }))
    renderApp('/dashboard')
    await findTable()

    const cell = cellsOf(rowBySku('900000003'))[1] as HTMLElement
    expect(elementsWithExactText(evil, cell)).not.toHaveLength(0)
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(getTable().querySelector('b')).toBeNull()
  })

  it('T3: название вида «=HYPERLINK(…)» выводится как текст, без ссылки', async () => {
    const formula = '=HYPERLINK("http://evil.example","Кроссовки")'
    mockTop(() => HttpResponse.json({ items: [topItem({ sku: '900000004', name: formula })] }))
    renderApp('/dashboard')
    await findTable()

    expect(elementsWithExactText(formula, cellsOf(rowBySku('900000004'))[1] as HTMLElement)).not.toHaveLength(0)
    expect(getTable().querySelector('a')).toBeNull()
  })
})
