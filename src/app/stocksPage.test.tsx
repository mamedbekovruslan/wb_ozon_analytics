import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StockStatus } from '../entities/warehouse'
import { META_FIXTURE, MIDDOT, sortedParams } from './filtersTestFixtures'
import { createMatchMediaForWidth, elementsWithExactText, kpiResponse, norm } from './kpiTestFixtures'
import {
  emptyStocksResponse,
  L,
  rowSkuByName,
  type StockItem,
  stockItem,
  stocksResponse,
  stocksResponseOf,
} from './lowStockTestFixtures'
import { createAppRouter } from './router'
import { ResizeObserverStub, salesDailyResponse } from './salesChartTestFixtures'
import {
  ALL_SKUS,
  HEADERS_NARROW,
  HEADERS_WIDE,
  manyItems,
  manyName,
  OZON_SKUS,
  PAGE_ROWS,
  PAGE_TEXT,
  SCHEME_TITLE,
  SKUS_BY_STATUS,
  STATUS_ORDER,
  STATUS_TEXT,
  stubVirtualLayout,
  TILE_HINT,
  WB_SKUS,
} from './stocksPageTestFixtures'
import { topProductsResponse } from './topProductsTestFixtures'

/*
 * Spec 008 «Страница «Остатки»» — страница /stocks целиком через настоящий роутер (1440 px;
 * часть проверок — на 768 px). Ответ /api/stocks строит фикстура-«сервер» по mp и cat
 * (lowStockTestFixtures.ts); ожидаемые строки посчитаны вручную (stocksPageTestFixtures.ts).
 *
 * Таблица виртуальная: в jsdom нет размеров, поэтому области прокрутки задаётся высота 620,
 * строкам — 52 (stubVirtualLayout). На восьми позициях видны все строки.
 *
 * CSS-модули jsdom не применяет: размеры, цвета, сетка колонок, наведение, кольцо фокуса,
 * скрытие подсказок порога < 1200 и видимый набор колонок — в e2e/stocks.spec.ts.
 * Здесь — разметка, тексты, состояния, запросы, ключ кэша, поиск, плитки и виртуализация.
 */

/** Параметры каждого запроса /api/stocks. */
const stockRequests: URLSearchParams[] = []

function defaultStocks(params: URLSearchParams) {
  return HttpResponse.json(stocksResponse({ mp: params.get('mp'), cat: params.getAll('cat'), limit: params.get('limit') }))
}

const server = setupServer(
  http.get('/api/meta', () => HttpResponse.json(META_FIXTURE)),
  http.get('/api/kpi', () => HttpResponse.json(kpiResponse())),
  http.get('/api/sales-daily', ({ request }) => {
    const params = new URL(request.url).searchParams
    return HttpResponse.json(salesDailyResponse({ from: params.get('from'), to: params.get('to'), mp: params.get('mp') }))
  }),
  http.get('/api/top-products', ({ request }) => {
    const params = new URL(request.url).searchParams
    return HttpResponse.json(topProductsResponse({ sort: params.get('sort'), limit: params.get('limit'), mp: params.get('mp') }))
  }),
  http.get('/api/stocks', ({ request }) => {
    const params = new URL(request.url).searchParams
    stockRequests.push(params)
    return defaultStocks(params)
  }),
  http.get('/api/*', () => HttpResponse.json({ message: 'Недоступно в тесте страницы остатков' }, { status: 503 })),
)

/** Подменяет ответ /api/stocks, сохраняя учёт запросов. */
function mockStocks(respond: (params: URLSearchParams) => Response | Promise<Response>): void {
  server.use(
    http.get('/api/stocks', ({ request }) => {
      const params = new URL(request.url).searchParams
      stockRequests.push(params)
      return respond(params)
    }),
  )
}

/** Ответ-«сервер» на своих позициях: фильтр по mp и cat, сортировка по дням. */
const serveItems = (items: readonly StockItem[]) =>
  mockStocks((params) => HttpResponse.json(stocksResponse({ mp: params.get('mp'), cat: params.getAll('cat'), items })))

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  stockRequests.length = 0
  vi.stubGlobal('matchMedia', createMatchMediaForWidth(1440))
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  stubVirtualLayout()
})
afterEach(() => {
  server.resetHandlers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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

const WAIT = { timeout: 5000 }

// --- Локаторы ---

const getMain = () => screen.getByRole('main')
// Роутер рисует страницу асинхронно: до первого ожидания main ещё нет
const findMain = () => screen.findByRole('main', {}, WAIT)
const findH1 = () => screen.findByRole('heading', { level: 1, name: PAGE_TEXT.h1 }, WAIT)

const getSection = () => screen.getByRole('region', { name: PAGE_TEXT.section })
const getTable = () => within(getSection()).getByRole('table')
const getScroll = () => within(getSection()).getByLabelText(PAGE_TEXT.scroll)
const dataRows = () => [...getScroll().querySelectorAll<HTMLElement>('[role="row"]')]
const skus = () => dataRows().map(rowSkuByName)

/** Таблица с данными: секция и хотя бы одна строка. */
async function findRows(): Promise<HTMLElement[]> {
  await screen.findByRole('region', { name: PAGE_TEXT.section }, WAIT)
  await waitFor(() => expect(dataRows().length).toBeGreaterThan(0), WAIT)
  return dataRows()
}

const rowBySku = (sku: string) => {
  const row = dataRows().find((r) => rowSkuByName(r) === sku)
  if (!row) throw new Error(`Нет строки ${sku}: ${norm(getScroll().textContent)}`)
  return row
}

/** Заголовки колонок: role="columnheader" в таблице. */
const headers = () => within(getTable()).getAllByRole('columnheader')
const headerTexts = () => headers().map((h) => norm(h.textContent))

/** `expected` — подпоследовательность `actual` (в том же порядке). */
function expectSubsequence(actual: readonly string[], expected: readonly string[]): void {
  let i = 0
  for (const text of actual) if (text === expected[i]) i += 1
  expect(i, `${JSON.stringify(expected)} в ${JSON.stringify(actual)}`).toBe(expected.length)
}

const tilesGroup = () => screen.getByRole('group', { name: PAGE_TEXT.tilesGroup })
const tiles = () => within(tilesGroup()).getAllByRole('button')
function tile(status: StockStatus): HTMLElement {
  const found = tiles().filter((b) => norm(b.textContent).includes(STATUS_TEXT[status]))
  if (found.length !== 1) throw new Error(`Плитка «${STATUS_TEXT[status]}»: найдено ${found.length}`)
  return found[0] as HTMLElement
}

/** Число на плитке: самый вложенный элемент с текстом из цифр или «—»; null — числа нет. */
function tileValue(el: HTMLElement): string | null {
  const all = [...el.querySelectorAll<HTMLElement>('*')].filter((x) => /^(\d[\d ]*|—)$/.test(norm(x.textContent)))
  const inner = all.find((x) => !all.some((o) => o !== x && x.contains(o)))
  return inner ? norm(inner.textContent) : null
}
const tileCounts = () => Object.fromEntries(STATUS_ORDER.map((s) => [s, tileValue(tile(s))]))

/** Счётчик «Позиций «товар × склад»: N» — aria-live внутри main. */
const findCounter = (): HTMLElement | null =>
  [...getMain().querySelectorAll<HTMLElement>('[aria-live]')].find((el) => norm(el.textContent).startsWith(PAGE_TEXT.counterPrefix)) ??
  null
const counterValue = () => norm(findCounter()?.textContent).slice(PAGE_TEXT.counterPrefix.length).trim()

const getSearch = () => screen.getByLabelText(PAGE_TEXT.searchLabel) as HTMLInputElement

const filterPanel = () => screen.getByRole('search', { name: 'Фильтры' })
const panelButton = (group: string, name: string) =>
  within(within(filterPanel()).getByRole('group', { name: group })).getByRole('button', { name })
const compareSwitch = () => within(filterPanel()).getByRole('switch', { name: 'Сравнить с прошлым периодом' })

const stockKeys = (client: QueryClient) =>
  client
    .getQueryCache()
    .getAll()
    .map((q) => q.queryKey)
    .filter((key) => key[0] === 'stocks')

const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

/** Самый вложенный элемент с точным текстом. */
function leaf(root: Element, text: string): HTMLElement {
  const all = elementsWithExactText(text, root)
  const innermost = all.find((el) => !all.some((other) => other !== el && el.contains(other)))
  if (!innermost) throw new Error(`Нет «${text}» в «${norm(root.textContent)}»`)
  return innermost
}

/** Декоративные иконки: svg внутри aria-hidden. */
const hiddenIcons = (root: Element) =>
  [...root.querySelectorAll<HTMLElement>('[aria-hidden="true"]')].filter((el) => el.querySelector('svg') || el.tagName === 'svg')

const SUBTITLE = `На 04.11.2026, 07:40 ${MIDDOT} ${PAGE_TEXT.speedNote}`

async function chooseCategory(user: ReturnType<typeof userEvent.setup>, name: RegExp): Promise<void> {
  await user.click(within(filterPanel()).getByRole('button', { name: /^Категории/ }))
  const list = await screen.findByRole('group', { name: 'Категории' })
  await user.click(within(list).getByRole('checkbox', { name }))
  await user.click(within(list).getByRole('button', { name: 'Применить' }))
}

/** Пауза, чтобы убедиться, что запроса не было. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 100)))

// =====================================================================================

describe('Маршрут /stocks', () => {
  it('AC-1: страница «Остатки» — main с h1 «Остатки», над ним панель фильтров (вне main)', async () => {
    renderApp('/stocks')
    const h1 = await findH1()

    const main = getMain()
    expect(main.contains(h1)).toBe(true)
    const panel = filterPanel()
    expect(main.contains(panel)).toBe(false)
    expect(follows(panel, main)).toBe(true)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.queryByRole('heading', { level: 1, name: 'Дашборд' })).toBeNull()
  })

  it('AC-1: блоков дашборда на странице нет', async () => {
    renderApp('/stocks')
    await findRows()

    expect(screen.queryByRole('region', { name: 'Ключевые показатели' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Скоро закончится' })).toBeNull()
  })

  it('AC-1: валидные фильтры в URL остаются как есть, панель их показывает', async () => {
    const { router } = renderApp('/stocks?period=7&mp=wb&cat=shoes&cmp=0')
    await findRows()

    expect(router.state.location.pathname).toBe('/stocks')
    expect(sortedParams(searchStr(router))).toEqual([
      ['cat', 'shoes'],
      ['cmp', '0'],
      ['mp', 'wb'],
      ['period', '7'],
    ])
    expect(panelButton('Маркетплейс', 'WB')).toHaveAttribute('aria-pressed', 'true')
  })

  it('AC-1 / T4: мусор в URL вычищается заменой адреса (ADR-0015), страница та же', async () => {
    const { router } = renderApp('/stocks?mp=hack&cat=%3Cscript%3E&cat=shoes&limit=999&status=critical&q=abc&foo=1')
    await findRows()

    await waitFor(() => expect(searchStr(router)).toBe('?cat=shoes'))
    expect(router.state.location.pathname).toBe('/stocks')
    const params = stockRequests.at(-1) as URLSearchParams
    expect(params.get('mp')).toBe('all')
    expect(params.getAll('cat')).toEqual(['shoes'])
    for (const key of ['limit', 'status', 'q', 'foo']) expect(params.has(key), key).toBe(false)
  })

  it('AC-1: /stocks без параметров — адрес без параметров', async () => {
    const { router } = renderApp('/stocks')
    await findRows()

    expect(searchStr(router)).toBe('')
  })
})

describe('Переход с дашборда', () => {
  it('AC-2: «Все остатки» → /stocks с теми же фильтрами, страница «Остатки» открывается', async () => {
    const { user, router } = renderApp('/dashboard?period=7&mp=wb&cat=shoes&cmp=0')
    const low = await screen.findByRole('region', { name: 'Скоро закончится' }, WAIT)
    const link = await within(low).findByRole('link', { name: 'Все остатки' }, WAIT)
    const before = sortedParams(searchStr(router))

    await user.click(link)

    await waitFor(() => expect(router.state.location.pathname).toBe('/stocks'))
    expect(sortedParams(searchStr(router))).toEqual(before)
    await findH1()
    await findRows()
    // mp=wb и cat=shoes → только L1
    expect(skus()).toEqual([L.L1.sku])
  })

  it('AC-2, AC-3: ключи блока и страницы не совпадают — два разных запроса (с limit=5 и без)', async () => {
    const { user, client } = renderApp('/dashboard?mp=wb&cat=shoes')
    const low = await screen.findByRole('region', { name: 'Скоро закончится' }, WAIT)
    await waitFor(() => expect(low.querySelector('ul > li')).not.toBeNull(), WAIT)

    await user.click(within(low).getByRole('link', { name: 'Все остатки' }))
    await findRows()

    expect(stockRequests).toHaveLength(2)
    expect((stockRequests[0] as URLSearchParams).get('limit')).toBe('5')
    expect((stockRequests[1] as URLSearchParams).has('limit')).toBe(false)
    const keys = stockKeys(client)
    expect(keys).toContainEqual(['stocks', 'wb', ['shoes']])
    expect(keys).toContainEqual(['stocks', 'list', 'wb', ['shoes']])
    expect(keys).toHaveLength(2)
  })
})

describe('Запрос /api/stocks', () => {
  it('AC-3: по умолчанию — только mp=all; один запрос', async () => {
    renderApp('/stocks')
    await findRows()

    expect(stockRequests).toHaveLength(1)
    expect(sortedParams((stockRequests[0] as URLSearchParams).toString())).toEqual([['mp', 'all']])
  })

  it('AC-3: mp и cat из URL уходят; limit, status, from, to, period, cmp — нет', async () => {
    renderApp('/stocks?period=7&mp=wb&cat=sports&cat=shoes&cmp=0')
    await findRows()

    const params = stockRequests.at(-1) as URLSearchParams
    expect(params.get('mp')).toBe('wb')
    expect(params.getAll('cat')).toEqual(['shoes', 'sports'])
    for (const key of ['limit', 'status', 'from', 'to', 'period', 'cmp']) expect(params.has(key), key).toBe(false)
  })

  it('AC-3: свой период — from и to в запрос не уходят', async () => {
    renderApp('/stocks?from=2026-10-10&to=2026-10-20&mp=ozon')
    await findRows()

    const params = stockRequests.at(-1) as URLSearchParams
    expect(params.has('from')).toBe(false)
    expect(params.has('to')).toBe(false)
    expect(skus()).toEqual(OZON_SKUS)
  })

  it("AC-3: ключ запроса — ['stocks', 'list', mp, cat]", async () => {
    const { client } = renderApp('/stocks?mp=wb&cat=shoes&cat=home')
    await findRows()

    expect(stockKeys(client)).toEqual([['stocks', 'list', 'wb', ['shoes', 'home']]])
  })

  it("AC-3: ключ по умолчанию — ['stocks', 'list', 'all', []]", async () => {
    const { client } = renderApp('/stocks')
    await findRows()

    expect(stockKeys(client)).toEqual([['stocks', 'list', 'all', []]])
  })

  it('AC-3: смена площадки — новый запрос и новые строки', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    await user.click(panelButton('Маркетплейс', 'WB'))

    await waitFor(() => expect(stockRequests).toHaveLength(2))
    expect((stockRequests[1] as URLSearchParams).get('mp')).toBe('wb')
    await waitFor(() => expect(skus()).toEqual(WB_SKUS), WAIT)
  })

  it('AC-3: смена категорий — новый запрос с cat', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    await chooseCategory(user, /^Электроника/)

    await waitFor(() => expect(stockRequests).toHaveLength(2))
    expect((stockRequests[1] as URLSearchParams).getAll('cat')).toEqual(['electronics'])
    await waitFor(() => expect(skus()).toEqual([L.L3.sku]), WAIT)
  })

  it('AC-3: смена периода и сравнения — без нового запроса, строки те же, без скелетона', async () => {
    const { user, router } = renderApp('/stocks')
    await findRows()

    await user.click(panelButton('Период', '7 дней'))
    await waitFor(() => expect(searchStr(router)).toBe('?period=7'))
    await user.click(compareSwitch())
    await waitFor(() => expect(searchStr(router)).toContain('cmp=0'))

    await settle()
    expect(stockRequests).toHaveLength(1)
    expect(skus()).toEqual(ALL_SKUS)
    expect(within(getMain()).queryByLabelText(PAGE_TEXT.loading)).toBeNull()
  })

  it('AC-3: нажатия на плитки и ввод в поиск — без новых запросов', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    await user.click(tile('critical'))
    await user.click(tile('soon'))
    await user.type(getSearch(), 'коврик')
    await user.clear(getSearch())

    await settle()
    expect(stockRequests).toHaveLength(1)
  })
})

describe('Подзаголовок', () => {
  it('AC-4: «На 04.11.2026, 07:40 · скорость — средние выкупы в день за 14 дней» под h1', async () => {
    renderApp('/stocks')
    const h1 = await findH1()

    await waitFor(() => expect(elementsWithExactText(SUBTITLE, getMain())).not.toHaveLength(0), WAIT)
    const subtitle = leaf(getMain(), SUBTITLE)
    expect(follows(h1, subtitle)).toBe(true)
    // Пояснение про скорость — отдельным элементом (свой цвет --text-3)
    expect(elementsWithExactText(`${MIDDOT} ${PAGE_TEXT.speedNote}`, subtitle)).not.toHaveLength(0)
  })

  it('AC-4: дата и время — из строки updatedAt, без сдвига часового пояса (как spec 004 AC-2)', async () => {
    server.use(http.get('/api/meta', () => HttpResponse.json({ ...META_FIXTURE, updatedAt: '2026-11-03T23:05:00+03:00' })))
    renderApp('/stocks')
    await findH1()

    await waitFor(
      () => expect(elementsWithExactText(`На 03.11.2026, 23:05 ${MIDDOT} ${PAGE_TEXT.speedNote}`, getMain())).not.toHaveLength(0),
      WAIT,
    )
  })

  it('AC-4: пока /api/meta не пришёл — даты нет (скелетон), таблица уже показана', async () => {
    server.use(
      http.get('/api/meta', async () => {
        await delay('infinite')
        return HttpResponse.json(META_FIXTURE)
      }),
    )
    renderApp('/stocks')
    await findH1()
    await findRows()

    expect(norm(getMain().textContent)).not.toMatch(/На \d{2}\.\d{2}\.\d{4}/)
    expect(skus()).toEqual(ALL_SKUS)
  })

  it('AC-4, AC-23: ошибка /api/meta — только «скорость — …» без «· » и без даты', async () => {
    server.use(http.get('/api/meta', () => new HttpResponse(null, { status: 500 })))
    renderApp('/stocks')
    await findH1()
    await findRows()

    await waitFor(() => expect(elementsWithExactText(PAGE_TEXT.speedNote, getMain())).not.toHaveLength(0), WAIT)
    const text = norm(getMain().textContent)
    expect(text).not.toMatch(/На \d{2}\.\d{2}\.\d{4}/)
    expect(text).not.toContain(`${MIDDOT} ${PAGE_TEXT.speedNote}`)
  })
})

describe('Плитки-фильтры', () => {
  it('AC-5: group «Фильтр по статусу запаса» — четыре button в порядке Критично · Скоро закончится · Норма · Нет продаж', async () => {
    renderApp('/stocks')
    await findRows()

    const buttons = tiles()
    expect(buttons).toHaveLength(4)
    expect(tilesGroup()).toHaveAttribute('role', 'group')
    STATUS_ORDER.forEach((status, i) => {
      const b = buttons[i] as HTMLElement
      expect(b.tagName).toBe('BUTTON')
      expect(norm(b.textContent)).toContain(STATUS_TEXT[status])
    })
  })

  it('AC-5: в плитке — иконка aria-hidden, число и подпись; на ≥ 1200 — подсказка порога', async () => {
    renderApp('/stocks')
    await findRows()

    for (const status of STATUS_ORDER) {
      const t = tile(status)
      expect(hiddenIcons(t).length, status).toBeGreaterThan(0)
      expect(elementsWithExactText(STATUS_TEXT[status], t), status).not.toHaveLength(0)
      expect(elementsWithExactText(TILE_HINT[status], t), status).not.toHaveLength(0)
      expect(tileValue(t), status).not.toBeNull()
      // Порядок: иконка → число → подпись → подсказка
      const value = leaf(t, tileValue(t) as string)
      const label = leaf(t, STATUS_TEXT[status])
      const hint = leaf(t, TILE_HINT[status])
      expect(follows(hiddenIcons(t)[0] as HTMLElement, value)).toBe(true)
      expect(follows(value, label)).toBe(true)
      expect(follows(label, hint)).toBe(true)
    }
  })

  it('AC-5: у четырёх плиток разные иконки', async () => {
    renderApp('/stocks')
    await findRows()

    const icons = STATUS_ORDER.map((s) => tile(s).querySelector('svg')?.innerHTML ?? '')
    for (const icon of icons) expect(icon).not.toBe('')
    expect(new Set(icons).size).toBe(4)
  })

  it('AC-6: по умолчанию ни одна плитка не выбрана — aria-pressed="false", все 8 строк', async () => {
    renderApp('/stocks')
    await findRows()

    for (const status of STATUS_ORDER) expect(tile(status)).toHaveAttribute('aria-pressed', 'false')
    expect(skus()).toEqual(ALL_SKUS)
  })

  it.each(STATUS_ORDER)('AC-6: плитка «%s» оставляет только свой статус, aria-pressed="true"', async (status) => {
    const { user } = renderApp('/stocks')
    await findRows()

    await user.click(tile(status))

    await waitFor(() => expect(skus()).toEqual(SKUS_BY_STATUS[status]))
    for (const other of STATUS_ORDER) {
      expect(tile(other)).toHaveAttribute('aria-pressed', other === status ? 'true' : 'false')
    }
    for (const row of dataRows()) expect(elementsWithExactText(STATUS_TEXT[status], row)).not.toHaveLength(0)
  })

  it('AC-6: повторное нажатие снимает выбор — снова все статусы', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    await user.click(tile('critical'))
    await waitFor(() => expect(skus()).toEqual(SKUS_BY_STATUS.critical))
    await user.click(tile('critical'))

    await waitFor(() => expect(skus()).toEqual(ALL_SKUS))
    for (const status of STATUS_ORDER) expect(tile(status)).toHaveAttribute('aria-pressed', 'false')
  })

  it('AC-6: выбрана максимум одна — «Критично», затем «Скоро закончится»', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    await user.click(tile('critical'))
    await user.click(tile('soon'))

    await waitFor(() => expect(skus()).toEqual(SKUS_BY_STATUS.soon))
    expect(tile('critical')).toHaveAttribute('aria-pressed', 'false')
    expect(tile('soon')).toHaveAttribute('aria-pressed', 'true')
    expect(tiles().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
  })

  it('AC-6: плитки работают с клавиатуры — фокус на плитке, Enter и пробел', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    tile('ok').focus()
    expect(tile('ok')).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(tile('ok')).toHaveAttribute('aria-pressed', 'true'))
    await user.keyboard(' ')
    await waitFor(() => expect(tile('ok')).toHaveAttribute('aria-pressed', 'false'))
  })

  it('AC-7: без поиска числа на плитках совпадают с counts ответа — 3 · 2 · 2 · 1', async () => {
    renderApp('/stocks')
    await findRows()

    const counts = stocksResponse().counts
    expect(tileCounts()).toEqual({
      critical: String(counts.critical),
      soon: String(counts.soon),
      ok: String(counts.ok),
      noSales: String(counts.noSales),
    })
    expect(tileCounts()).toEqual({ critical: '3', soon: '2', ok: '2', noSales: '1' })
  })

  it('AC-7: площадка WB — числа по ответу 1 · 2 · 1 · 0', async () => {
    renderApp('/stocks?mp=wb')
    await findRows()

    expect(tileCounts()).toEqual({ critical: '1', soon: '2', ok: '1', noSales: '0' })
  })

  it('AC-7: числа считаются среди строк после поиска — «хоругвино» → 1 · 0 · 1 · 0', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    await user.type(getSearch(), 'хоругвино')

    await waitFor(() => expect(tileCounts()).toEqual({ critical: '1', soon: '0', ok: '1', noSales: '0' }))
  })

  it('AC-7: выбранная плитка на числа не влияет', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    await user.click(tile('critical'))
    await waitFor(() => expect(skus()).toEqual(SKUS_BY_STATUS.critical))
    expect(tileCounts()).toEqual({ critical: '3', soon: '2', ok: '2', noSales: '1' })

    await user.type(getSearch(), 'склад продавца')
    await waitFor(() => expect(tileCounts()).toEqual({ critical: '1', soon: '0', ok: '0', noSales: '1' }))
  })
})

describe('Поиск', () => {
  it('AC-8: label со скрытым текстом, input type="search" с подсказкой, лупа aria-hidden, maxLength 100', async () => {
    renderApp('/stocks')
    await findRows()

    const input = getSearch()
    expect(input.tagName).toBe('INPUT')
    expect(input).toHaveAttribute('type', 'search')
    expect(input).toHaveAttribute('placeholder', PAGE_TEXT.searchPlaceholder)
    expect(input).toHaveAttribute('maxlength', '100')
    expect(screen.getByRole('searchbox', { name: PAGE_TEXT.searchLabel })).toBe(input)
    const label = input.closest('label')
    if (!label) throw new Error('Поле поиска не внутри label')
    expect(hiddenIcons(label).length).toBeGreaterThan(0)
    // Текст подписи — внутри label (визуально скрыт; проверяется в e2e)
    expect(label.contains(leaf(label, PAGE_TEXT.searchLabel))).toBe(true)
  })

  it.each([
    ['склад', 'Коледино', [L.L1.sku]],
    ['склад без учёта регистра', 'ХОРУГВИНО', [L.L2.sku, L.L6.sku]],
    ['пробелы по краям', '   хоругвино  ', [L.L2.sku, L.L6.sku]],
    ['часть названия', 'куртка', [L.L2.sku]],
    ['артикул sku', '1702233456', [L.L3.sku]],
    ['часть артикула', '22000000', [L.L4.sku, L.L5.sku]],
    ['артикул продавца offerId', 'offer-160', [L.L8.sku]],
    ['склад с запятой', 'склад продавца, москва', [L.L3.sku, L.L8.sku]],
  ])('AC-8: поиск — %s («%s»)', async (_title, query, expected) => {
    const { user } = renderApp('/stocks')
    await findRows()

    await user.type(getSearch(), query)

    await waitFor(() => expect(skus()).toEqual(expected))
  })

  it('AC-8: применяется сразу при вводе, без запроса к API; очистка возвращает все строки', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    // «Коврик для йоги» — единственное совпадение
    await user.type(getSearch(), 'коврик')
    await waitFor(() => expect(skus()).toEqual([L.L5.sku]))
    await user.clear(getSearch())
    await waitFor(() => expect(skus()).toEqual(ALL_SKUS))

    await settle()
    expect(stockRequests).toHaveLength(1)
  })

  it('AC-8, AC-6: поиск и плитка вместе — «хоругвино» + «Норма» → одна строка', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    await user.type(getSearch(), 'хоругвино')
    await user.click(tile('ok'))

    await waitFor(() => expect(skus()).toEqual([L.L6.sku]))
  })

  it('AC-9: счётчик aria-live="polite" — «Позиций «товар × склад»: 8»', async () => {
    renderApp('/stocks')
    await findRows()

    const counter = findCounter()
    if (!counter) throw new Error('Нет счётчика')
    expect(counter).toHaveAttribute('aria-live', 'polite')
    expect(counterValue()).toBe('8')
    expect(elementsWithExactText('8', counter)).not.toHaveLength(0)
    // Справа от поиска — после поля в документе
    expect(follows(getSearch(), counter)).toBe(true)
  })

  it('AC-9: счётчик — строки после поиска и плитки', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    await user.click(tile('critical'))
    await waitFor(() => expect(counterValue()).toBe('3'))
    await user.type(getSearch(), 'хоругвино')
    await waitFor(() => expect(counterValue()).toBe('1'))
    await user.click(tile('critical'))
    await waitFor(() => expect(counterValue()).toBe('2'))
  })

  it('AC-9: большое число — с разрядами (formatInt): 1 000 позиций → «1 000»', async () => {
    serveItems(manyItems(1000))
    renderApp('/stocks')
    await findRows()

    await waitFor(() => expect(counterValue()).toBe('1 000'))
  })
})

describe('Таблица', () => {
  it('AC-10: порядок — как в ответе, клиент не пересортировывает', async () => {
    mockStocks(() => HttpResponse.json(stocksResponseOf([L.L5, L.L1, L.L8, L.L2])))
    renderApp('/stocks')
    await findRows()

    expect(skus()).toEqual([L.L5.sku, L.L1.sku, L.L8.sku, L.L2.sku])
  })

  it('AC-10: по умолчанию — дни по возрастанию, «нет продаж» в конце', async () => {
    renderApp('/stocks')
    await findRows()

    expect(skus()).toEqual(ALL_SKUS)
    expect(skus().at(-1)).toBe(L.L8.sku)
  })

  it('AC-10: «Дней запаса» — aria-sort="ascending", стрелка aria-hidden; в шапке нет кнопок', async () => {
    renderApp('/stocks')
    await findRows()

    const days = headers().find((h) => norm(h.textContent) === 'Дней запаса')
    if (!days) throw new Error(`Нет колонки «Дней запаса»: ${headerTexts().join(' | ')}`)
    expect(days).toHaveAttribute('aria-sort', 'ascending')
    expect(hiddenIcons(days).length).toBeGreaterThan(0)
    for (const h of headers()) {
      expect(within(h).queryByRole('button')).toBeNull()
      if (h !== days) expect(['ascending', 'descending']).not.toContain(h.getAttribute('aria-sort'))
    }
  })

  it('AC-11: section «Остатки по складам» → role="table" с aria-rowcount = строк + 1', async () => {
    renderApp('/stocks')
    await findRows()

    expect(getSection().tagName).toBe('SECTION')
    expect(getTable()).toHaveAttribute('aria-rowcount', '9')
  })

  it('AC-11: aria-rowcount следует за плиткой и поиском', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    await user.click(tile('critical'))
    await waitFor(() => expect(getTable()).toHaveAttribute('aria-rowcount', '4'))
    await user.type(getSearch(), 'хоругвино')
    await waitFor(() => expect(getTable()).toHaveAttribute('aria-rowcount', '2'))
  })

  it('AC-11: шапка — role="row" вне области прокрутки; тело — tabindex="0" с aria-label', async () => {
    renderApp('/stocks')
    await findRows()

    const scroll = getScroll()
    expect(scroll).toHaveAttribute('tabindex', '0')
    expect(getTable().contains(scroll)).toBe(true)
    const header = headers()[0]?.closest('[role="row"]')
    if (!header) throw new Error('Заголовки колонок не в role="row"')
    expect(scroll.contains(header)).toBe(false)
  })

  it('AC-11: у строк — role="row" и aria-rowindex 2…9 по порядку (1 — шапка)', async () => {
    renderApp('/stocks')
    await findRows()

    expect(dataRows().map((r) => r.getAttribute('aria-rowindex'))).toEqual(['2', '3', '4', '5', '6', '7', '8', '9'])
  })

  it('AC-11: строки не фокусируются по отдельности — внутри нет ссылок, кнопок и tabindex', async () => {
    renderApp('/stocks')
    await findRows()

    for (const row of dataRows()) expect(row.querySelectorAll('a[href], button, input, [tabindex]')).toHaveLength(0)
  })

  it('AC-11: виртуализация — из 1000 строк в DOM только видимые ± запас; aria-rowcount = 1001', async () => {
    serveItems(manyItems(1000))
    renderApp('/stocks')
    await findRows()

    expect(getTable()).toHaveAttribute('aria-rowcount', '1001')
    const count = dataRows().length
    expect(count).toBeGreaterThan(0)
    expect(count, 'строк в DOM').toBeLessThan(100)
    expect(dataRows()[0]).toHaveAttribute('aria-rowindex', '2')
    expect(norm(dataRows()[0]?.textContent)).toContain(manyName(0))
  })

  it('AC-11, AC-26: прокрутка до конца показывает последнюю строку «нет продаж» (aria-rowindex 1001)', async () => {
    serveItems(manyItems(1000))
    renderApp('/stocks')
    await findRows()

    const scroll = getScroll()
    Object.defineProperty(scroll, 'scrollTop', { configurable: true, writable: true, value: 1000 * 52 })
    fireEvent.scroll(scroll)

    await waitFor(() => expect(dataRows().some((r) => r.getAttribute('aria-rowindex') === '1001')).toBe(true), WAIT)
    const last = dataRows().find((r) => r.getAttribute('aria-rowindex') === '1001') as HTMLElement
    expect(norm(last.textContent)).toContain(manyName(999))
    expect(elementsWithExactText('Нет продаж', last)).not.toHaveLength(0)
    expect(elementsWithExactText('—', last)).not.toHaveLength(0)
    expect(dataRows().length).toBeLessThan(100)
  })

  it('AC-12: на 1440 колонки Товар · Площадка · Склад · Остаток · Продажи в день · Дней запаса · Статус', async () => {
    renderApp('/stocks')
    await findRows()

    expectSubsequence(headerTexts(), HEADERS_WIDE)
  })

  it.each(PAGE_ROWS.map((r) => [r.name, r] as const))('AC-12, AC-14: строка «%s» — все значения по порядку колонок', async (_name, expected) => {
    renderApp('/stocks')
    await findRows()

    const row = rowBySku(expected.sku)
    const name = leaf(row, expected.name)
    const art = leaf(row, `Арт. ${expected.sku}`)
    const mp = leaf(row, expected.mp)
    const warehouse = leaf(row, expected.warehouse)
    const stock = leaf(row, expected.stock)
    const speed = leaf(row, expected.speed)
    const days = leaf(row, expected.days)
    const status = leaf(row, expected.status)
    const chain = [name, art, mp, warehouse, stock, speed, days, status]
    for (let i = 1; i < chain.length; i += 1) {
      expect(follows(chain[i - 1] as HTMLElement, chain[i] as HTMLElement), `${expected.sku}: порядок ${i}`).toBe(true)
    }
    expect(norm(row.textContent)).not.toMatch(/NaN|Infinity|undefined|null|e\+/)
  })

  it('AC-12: схема — только у Ozon, с подсказкой title; у WB бейджа схемы нет', async () => {
    renderApp('/stocks')
    await findRows()

    for (const expected of PAGE_ROWS) {
      const row = rowBySku(expected.sku)
      if (expected.scheme === null) {
        expect(elementsWithExactText('FBO', row), expected.sku).toHaveLength(0)
        expect(elementsWithExactText('FBS', row), expected.sku).toHaveLength(0)
        continue
      }
      const badge = leaf(row, expected.scheme)
      const titled = badge.closest('[title]')
      expect(titled, `${expected.sku}: title у бейджа ${expected.scheme}`).not.toBeNull()
      expect(row.contains(titled)).toBe(true)
      expect(titled).toHaveAttribute('title', SCHEME_TITLE[expected.scheme])
      // Схема — рядом со складом: в одной ячейке
      expect(badge.closest('[role="cell"]')).toBe(leaf(row, expected.warehouse).closest('[role="cell"]'))
    }
  })

  it('AC-12: заглушка-превью — aria-hidden с иконкой, до названия; img нет', async () => {
    renderApp('/stocks')
    await findRows()

    for (const row of dataRows()) {
      const previews = hiddenIcons(row).filter((el) => norm(el.textContent) === '')
      expect(previews.length).toBeGreaterThan(0)
      expect(follows(previews[0] as HTMLElement, leaf(row, PAGE_ROWS.find((r) => r.sku === rowSkuByName(row))?.name ?? '?'))).toBe(true)
    }
    expect(getScroll().querySelector('img')).toBeNull()
  })

  it('AC-12, AC-15: бейдж статуса в строке — текст виден, иконка aria-hidden', async () => {
    renderApp('/stocks')
    await findRows()

    for (const expected of PAGE_ROWS) {
      const status = leaf(rowBySku(expected.sku), expected.status)
      expect(status.closest('[aria-hidden="true"]')).toBeNull()
      const holder = status.querySelector('svg') ? status : (status.parentElement as HTMLElement)
      const svgs = [...holder.querySelectorAll('svg')]
      expect(svgs.length, expected.sku).toBeGreaterThan(0)
      for (const svg of svgs) expect(svg.closest('[aria-hidden="true"]')).not.toBeNull()
    }
  })

  it('AC-14: в ячейке дней — полоса запаса aria-hidden (без текста и без иконки)', async () => {
    renderApp('/stocks')
    await findRows()

    for (const expected of PAGE_ROWS) {
      const row = rowBySku(expected.sku)
      const days = leaf(row, expected.days)
      const cell = days.closest('[role="cell"]')
      if (!cell) throw new Error(`${expected.sku}: дни не в role="cell"`)
      const bars = [...cell.querySelectorAll('[aria-hidden="true"]')].filter((el) => !el.querySelector('svg') && el.tagName !== 'svg' && norm(el.textContent) === '')
      expect(bars.length, `${expected.sku}: полоса`).toBeGreaterThan(0)
    }
  })

  it('AC-14: «нет продаж» — «—» вместо дней', async () => {
    renderApp('/stocks')
    await findRows()

    const row = rowBySku(L.L8.sku)
    expect(elementsWithExactText('—', row)).not.toHaveLength(0)
    expect(norm(row.textContent)).not.toMatch(/\d+ дн\./)
  })

  it('AC-12, AC-14: очень большие числа — без экспоненты и обрезания', async () => {
    // 1 234 567 / 100 000 ≈ 12,3 → «12 дн.», скоро
    mockStocks(() =>
      HttpResponse.json(stocksResponseOf([stockItem({ name: 'Большой запас', stock: 1_234_567, perDay: 100_000, days: 12.34567, status: 'soon' })])),
    )
    renderApp('/stocks')
    await findRows()

    const row = dataRows()[0] as HTMLElement
    expect(elementsWithExactText('1 234 567 шт', row)).not.toHaveLength(0)
    expect(elementsWithExactText('12 дн.', row)).not.toHaveLength(0)
    expect(norm(row.textContent)).toMatch(/100 ?000,0/)
    expect(norm(row.textContent)).not.toMatch(/e\+|Infinity|NaN/)
  })

  it('AC-17: на ≥ 640 карточек нет — только таблица', async () => {
    renderApp('/stocks')
    await findRows()

    expect(screen.queryByRole('list', { name: PAGE_TEXT.cards })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Показать ещё/ })).toBeNull()
  })
})

describe('Таблица на 768 px', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', createMatchMediaForWidth(768))
    vi.restoreAllMocks()
    stubVirtualLayout({ width: 720, height: 700 }, 68)
  })

  it('AC-13: колонки Товар · Склад · Остаток · В день · Запас · статус', async () => {
    renderApp('/stocks')
    await findRows()

    expectSubsequence(headerTexts(), HEADERS_NARROW)
    expect(skus()).toEqual(ALL_SKUS)
  })

  it('AC-13: бейдж площадки — в ячейке склада перед названием; бейдж статуса — в ячейке дней под ними', async () => {
    renderApp('/stocks')
    await findRows()

    for (const expected of PAGE_ROWS) {
      const row = rowBySku(expected.sku)
      const warehouse = leaf(row, expected.warehouse)
      const whCell = warehouse.closest('[role="cell"]') as HTMLElement
      const mpInCell = elementsWithExactText(expected.mp, whCell)
      expect(mpInCell.length, `${expected.sku}: площадка в ячейке склада`).toBeGreaterThan(0)
      expect(follows(mpInCell[0] as HTMLElement, warehouse)).toBe(true)

      const days = leaf(row, expected.days)
      const daysCell = days.closest('[role="cell"]') as HTMLElement
      const statusInCell = elementsWithExactText(expected.status, daysCell)
      expect(statusInCell.length, `${expected.sku}: статус в ячейке запаса`).toBeGreaterThan(0)
      expect(follows(days, statusInCell[0] as HTMLElement)).toBe(true)
    }
  })

  it('AC-13, AC-17: на 768 — таблица, а не карточки', async () => {
    renderApp('/stocks')
    await findRows()

    expect(screen.queryByRole('list', { name: PAGE_TEXT.cards })).toBeNull()
  })
})

describe('Ничего не найдено', () => {
  async function findNotFound(): Promise<HTMLElement> {
    const title = await within(await findMain()).findByText(PAGE_TEXT.notFoundTitle, {}, WAIT)
    let block: HTMLElement | null = title
    while (block && block !== getMain() && !within(block).queryByRole('button', { name: PAGE_TEXT.notFoundButton })) {
      block = block.parentElement
    }
    if (!block || block === getMain()) throw new Error('Кнопка «Сбросить поиск и статус» не в блоке «Ничего не найдено»')
    expect(elementsWithExactText(PAGE_TEXT.notFoundText, block)).not.toHaveLength(0)
    expect(block.closest('[role="alert"]')).toBeNull()
    expect(hiddenIcons(block).length, 'лупа — декоративная').toBeGreaterThan(0)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText(PAGE_TEXT.emptyTitle)).toBeNull()
    // Плитки и поиск остаются
    expect(tiles()).toHaveLength(4)
    expect(getSearch()).toBeInTheDocument()
    return block
  }

  it('AC-19: поиск без совпадений — «Ничего не найдено», плитки с нулями, поле с запросом', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    await user.type(getSearch(), 'xyz')

    await findNotFound()
    expect(getSearch()).toHaveValue('xyz')
    expect(tileCounts()).toEqual({ critical: '0', soon: '0', ok: '0', noSales: '0' })
    expect(counterValue()).toBe('0')
  })

  it('AC-19: «Сбросить поиск и статус» — очищает поле и снимает плитку; URL не меняется, запроса нет', async () => {
    const { user, router } = renderApp('/stocks?period=7&mp=wb')
    await findRows()
    const before = searchStr(router)

    await user.click(tile('critical'))
    await user.type(getSearch(), 'хоругвино')
    const block = await findNotFound()
    await user.click(within(block).getByRole('button', { name: PAGE_TEXT.notFoundButton }))

    await waitFor(() => expect(skus()).toEqual(WB_SKUS))
    expect(getSearch()).toHaveValue('')
    for (const status of STATUS_ORDER) expect(tile(status)).toHaveAttribute('aria-pressed', 'false')
    expect(searchStr(router)).toBe(before)
    expect(stockRequests).toHaveLength(1)
  })

  it('AC-19: только плитка дала 0 строк (mp=wb, «Нет продаж») — тоже «Ничего не найдено»', async () => {
    const { user } = renderApp('/stocks?mp=wb')
    await findRows()

    await user.click(tile('noSales'))

    const block = await findNotFound()
    expect(tile('noSales')).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(block).getByRole('button', { name: PAGE_TEXT.notFoundButton }))
    await waitFor(() => expect(skus()).toEqual(WB_SKUS))
  })
})

describe('Загрузка', () => {
  const hang = () =>
    mockStocks(async () => {
      await delay('infinite')
      return HttpResponse.json(stocksResponse())
    })

  async function expectSkeleton(): Promise<HTMLElement> {
    const busy = await within(await findMain()).findByLabelText(PAGE_TEXT.loading, {}, WAIT)
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(norm(busy.textContent)).toBe('')
    expect(screen.queryByRole('table')).toBeNull()
    expect(within(getMain()).queryByRole('alert')).toBeNull()
    expect(screen.queryByText(PAGE_TEXT.emptyTitle)).toBeNull()
    return busy
  }

  it('AC-20: первая загрузка — скелетон aria-busy; h1, плитки без чисел, счётчик без N, поле поиска доступно', async () => {
    hang()
    const { user } = renderApp('/stocks')
    await findH1()
    await expectSkeleton()

    expect(tiles()).toHaveLength(4)
    for (const status of STATUS_ORDER) {
      expect(norm(tile(status).textContent)).toContain(STATUS_TEXT[status])
      expect(tileValue(tile(status)), status).toBeNull()
    }
    const counter = findCounter()
    if (!counter) throw new Error('Счётчик во время загрузки должен быть (с полосой вместо N)')
    expect(counterValue()).toBe('')
    expect(getSearch()).toBeEnabled()
    await user.type(getSearch(), 'кор')
    expect(getSearch()).toHaveValue('кор')
  })

  it('AC-20: смена площадки — снова скелетон, старых строк нет', async () => {
    const { user } = renderApp('/stocks?mp=wb')
    await findRows()

    hang()
    await user.click(panelButton('Маркетплейс', 'Ozon'))

    await expectSkeleton()
    expect(norm(getMain().textContent)).not.toContain(L.L1.name)
  })

  it('AC-20: смена категорий — снова скелетон', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    hang()
    await chooseCategory(user, /^Обувь/)

    await expectSkeleton()
  })

  it('AC-20: после загрузки aria-busy в main нет', async () => {
    renderApp('/stocks')
    await findRows()

    expect(within(getMain()).queryByLabelText(PAGE_TEXT.loading)).toBeNull()
    expect(getMain().querySelector('[aria-busy="true"]')).toBeNull()
  })
})

describe('Пусто', () => {
  async function findEmptyBlock(): Promise<HTMLElement> {
    const title = await within(await findMain()).findByText(PAGE_TEXT.emptyTitle, {}, WAIT)
    let block: HTMLElement | null = title
    while (block && block !== getMain() && !within(block).queryByRole('button', { name: PAGE_TEXT.emptyButton })) {
      block = block.parentElement
    }
    if (!block || block === getMain()) throw new Error('Кнопка «Сбросить фильтры» не в блоке «На складах ничего нет»')
    expect(elementsWithExactText(PAGE_TEXT.emptyText, block)).not.toHaveLength(0)
    expect(block.closest('[role="alert"]')).toBeNull()
    expect(hiddenIcons(block).length, 'коробка в круге — декоративная').toBeGreaterThan(0)
    expect(screen.queryByRole('table')).toBeNull()
    expect(within(getMain()).queryByLabelText(PAGE_TEXT.loading)).toBeNull()
    expect(screen.queryByText(PAGE_TEXT.notFoundTitle)).toBeNull()
    return block
  }

  it('AC-21: 0 позиций — «На складах ничего нет», пояснение, «Сбросить фильтры»; плитки с нулями', async () => {
    mockStocks(() => HttpResponse.json(emptyStocksResponse()))
    renderApp('/stocks')

    await findEmptyBlock()
    expect(tileCounts()).toEqual({ critical: '0', soon: '0', ok: '0', noSales: '0' })
  })

  it('AC-21: «Сбросить фильтры» сбрасывает фильтры URL (spec 002 AC-15), страница та же', async () => {
    mockStocks((params) =>
      HttpResponse.json(params.getAll('cat').length > 0 ? emptyStocksResponse() : stocksResponse({ mp: params.get('mp') })),
    )
    const { user, router } = renderApp('/stocks?period=7&mp=wb&cat=kids&cmp=0')
    const block = await findEmptyBlock()

    await user.click(within(block).getByRole('button', { name: PAGE_TEXT.emptyButton }))

    await waitFor(() => expect(searchStr(router)).toBe(''))
    expect(router.state.location.pathname).toBe('/stocks')
    await findRows()
    expect(skus()).toEqual(ALL_SKUS)
  })
})

describe('Ошибка', () => {
  async function findError(): Promise<HTMLElement> {
    const title = await within(await findMain()).findByText(PAGE_TEXT.errorTitle, {}, WAIT)
    const alert = title.closest<HTMLElement>('[role="alert"]')
    if (!alert) throw new Error('Блок ошибки остатков без role="alert"')
    expect(elementsWithExactText(PAGE_TEXT.errorText, alert)).not.toHaveLength(0)
    const retry = within(alert).getByRole('button', { name: PAGE_TEXT.retry })
    expect(retry.querySelector('svg')).not.toBeNull()
    for (const svg of retry.querySelectorAll('svg')) expect(svg.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(hiddenIcons(alert).filter((el) => !retry.contains(el)).length, 'треугольник в круге').toBeGreaterThan(0)
    expect(screen.queryByRole('table')).toBeNull()
    expect(within(getMain()).queryByLabelText(PAGE_TEXT.loading)).toBeNull()
    return alert
  }

  const VALID = stocksResponse()
  const withItem = (patch: Record<string, unknown>) => ({ ...VALID, items: [{ ...VALID.items[0], ...patch }] })

  it.each([
    ['статус 500', () => HttpResponse.json({ message: 'Внутренняя ошибка' }, { status: 500 })],
    ['статус 404', () => HttpResponse.json({ message: 'Не найдено' }, { status: 404 })],
    ['сетевая ошибка', () => HttpResponse.error()],
    ['не по схеме: нет items', () => HttpResponse.json({ asOf: '2026-11-04', total: 0, counts: VALID.counts })],
    ['не по схеме: нет counts', () => HttpResponse.json({ asOf: '2026-11-04', total: 1, items: VALID.items })],
    ['не по схеме: строка вместо числа в stock', () => HttpResponse.json(withItem({ stock: 'много' }))],
    ['не по схеме: неизвестный статус', () => HttpResponse.json(withItem({ status: 'urgent' }))],
    ['не по схеме: days — строка', () => HttpResponse.json(withItem({ days: '3' }))],
    ['не по схеме: HTML вместо JSON', () => new HttpResponse('<html>oops</html>', { headers: { 'Content-Type': 'text/html' } })],
  ])('AC-22 / T5: ошибка /api/stocks (%s) — role="alert", плитки с «—», счётчик скрыт', async (_title, respond) => {
    mockStocks(respond)
    renderApp('/stocks')

    await findError()
    expect(tileCounts()).toEqual({ critical: '—', soon: '—', ok: '—', noSales: '—' })
    const counter = findCounter()
    expect(counter === null || counter.closest('[hidden], [aria-hidden="true"]') !== null, 'счётчик скрыт').toBe(true)
  })

  it('AC-22: технических деталей в блоке нет', async () => {
    mockStocks(() => HttpResponse.json({ message: 'Внутренняя ошибка: /src/mocks/server/core.ts' }, { status: 502 }))
    renderApp('/stocks')

    const alert = await findError()
    expect(norm(alert.textContent)).not.toMatch(/502|\/api\/|\/src\/|Error|Внутренняя ошибка|ZodError/)
  })

  it('AC-22: «Повторить» заново запрашивает /api/stocks с теми же фильтрами; при успехе — таблица', async () => {
    let fail = true
    mockStocks((params) => (fail ? new HttpResponse(null, { status: 500 }) : defaultStocks(params)))
    const { user } = renderApp('/stocks?mp=wb')
    const alert = await findError()
    const before = stockRequests.length

    fail = false
    await user.click(within(alert).getByRole('button', { name: PAGE_TEXT.retry }))

    await findRows()
    expect(stockRequests.length).toBeGreaterThan(before)
    expect((stockRequests.at(-1) as URLSearchParams).get('mp')).toBe('wb')
    expect(screen.queryByText(PAGE_TEXT.errorTitle)).toBeNull()
    expect(skus()).toEqual(WB_SKUS)
    expect(tileCounts()).toEqual({ critical: '1', soon: '2', ok: '1', noSales: '0' })
  })

  it('AC-22: «Повторить» и снова ошибка — блок остаётся', async () => {
    mockStocks(() => new HttpResponse(null, { status: 500 }))
    const { user } = renderApp('/stocks')
    const alert = await findError()
    const before = stockRequests.length

    await user.click(within(alert).getByRole('button', { name: PAGE_TEXT.retry }))

    await waitFor(() => expect(stockRequests.length).toBeGreaterThan(before))
    await findError()
  })

  it('AC-22: упал лишь фоновый перезапрос, а данные есть, — таблица остаётся', async () => {
    const { client } = renderApp('/stocks')
    await findRows()

    mockStocks(() => new HttpResponse(null, { status: 500 }))
    void client.invalidateQueries({ queryKey: ['stocks', 'list'] })

    await waitFor(() => expect(stockRequests.length).toBeGreaterThan(1))
    await settle()
    expect(screen.queryByText(PAGE_TEXT.errorTitle)).toBeNull()
    expect(within(getMain()).queryByRole('alert')).toBeNull()
    expect(skus()).toEqual(ALL_SKUS)
  })
})

describe('Независимость блоков', () => {
  it('AC-23: ошибка /api/meta не ломает таблицу, плитки и поиск', async () => {
    server.use(http.get('/api/meta', () => new HttpResponse(null, { status: 500 })))
    const { user } = renderApp('/stocks')
    await findRows()

    expect(skus()).toEqual(ALL_SKUS)
    expect(tileCounts()).toEqual({ critical: '3', soon: '2', ok: '2', noSales: '1' })
    await user.click(tile('soon'))
    await waitFor(() => expect(skus()).toEqual(SKUS_BY_STATUS.soon))
    await user.click(tile('soon'))
    await user.type(getSearch(), 'коледино')
    await waitFor(() => expect(skus()).toEqual([L.L1.sku]))
  })

  it('AC-23: ошибка /api/stocks не ломает панель фильтров — смена площадки работает', async () => {
    mockStocks(() => new HttpResponse(null, { status: 500 }))
    const { user, router } = renderApp('/stocks')
    await within(await findMain()).findByText(PAGE_TEXT.errorTitle, {}, WAIT)
    expect(within(filterPanel()).queryByRole('alert')).toBeNull()
    const before = stockRequests.length

    await user.click(panelButton('Маркетплейс', 'WB'))

    await waitFor(() => expect(searchStr(router)).toBe('?mp=wb'))
    await waitFor(() => expect(stockRequests.length).toBeGreaterThan(before))
    expect((stockRequests.at(-1) as URLSearchParams).get('mp')).toBe('wb')
  })
})

describe('Безопасность', () => {
  it('T3: название и склад с разметкой — текст, а не HTML', async () => {
    const evilName = '<img src=x onerror=alert(1)><b>Жирный</b>'
    const evilWarehouse = '<script>alert(1)</script>Склад'
    mockStocks(() => HttpResponse.json(stocksResponseOf([stockItem({ name: evilName, warehouse: evilWarehouse })])))
    renderApp('/stocks')
    await findRows()

    const row = dataRows()[0] as HTMLElement
    expect(elementsWithExactText(evilName, row)).not.toHaveLength(0)
    expect(elementsWithExactText(evilWarehouse, row)).not.toHaveLength(0)
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(getScroll().querySelector('b, script')).toBeNull()
  })

  it('T3: разметка в поле поиска — только значение поля, на странице не появляется', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    const evil = '<img src=x onerror=alert(1)>'
    await user.type(getSearch(), evil)

    await screen.findByText(PAGE_TEXT.notFoundTitle, {}, WAIT)
    expect(getSearch()).toHaveValue(evil)
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  it('Поиск: спецсимволы RegExp — обычный текст, страница не падает', async () => {
    const { user } = renderApp('/stocks')
    await findRows()

    await user.type(getSearch(), '.*')
    await screen.findByText(PAGE_TEXT.notFoundTitle, {}, WAIT)
    await user.clear(getSearch())
    await user.type(getSearch(), '(')
    await screen.findByText(PAGE_TEXT.notFoundTitle, {}, WAIT)
    await user.clear(getSearch())
    await user.type(getSearch(), '[[')
    await screen.findByText(PAGE_TEXT.notFoundTitle, {}, WAIT)
    await user.clear(getSearch())
    await waitFor(() => expect(skus()).toEqual(ALL_SKUS))
  })

  it('Поиск: текст не уходит в URL, в API и в хранилища браузера', async () => {
    const before = { local: Object.keys(localStorage), session: Object.keys(sessionStorage) }
    const added = (storage: Storage, was: string[]) => Object.keys(storage).filter((key) => !was.includes(key) && !/theme/i.test(key))
    const { user, router } = renderApp('/stocks')
    await findRows()
    const url = searchStr(router)

    await user.type(getSearch(), 'секрет-коледино')
    await user.click(tile('critical'))
    await settle()

    expect(searchStr(router)).toBe(url)
    expect(router.state.location.href).not.toMatch(/секрет|%D1%81%D0%B5%D0%BA|critical/i)
    for (const params of stockRequests) {
      expect(params.toString()).not.toMatch(/секрет|%D1%81|critical|q=/i)
    }
    expect(stockRequests).toHaveLength(1)
    expect(added(localStorage, before.local)).toEqual([])
    expect(added(sessionStorage, before.session)).toEqual([])
    for (const key of Object.keys(localStorage)) expect(localStorage.getItem(key) ?? '').not.toContain('секрет')
  })

  it('Поиск и плитка сбрасываются при перезагрузке (решение 3): новый рендер — пустое поле и все статусы', async () => {
    const first = renderApp('/stocks')
    await findRows()
    await first.user.type(getSearch(), 'хоругвино')
    await first.user.click(tile('ok'))
    await waitFor(() => expect(skus()).toEqual([L.L6.sku]))
    first.view.unmount()

    renderApp('/stocks')
    await findRows()
    expect(getSearch()).toHaveValue('')
    for (const status of STATUS_ORDER) expect(tile(status)).toHaveAttribute('aria-pressed', 'false')
    expect(skus()).toEqual(ALL_SKUS)
  })
})
