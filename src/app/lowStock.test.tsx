import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { META_FIXTURE, MIDDOT, sortedParams } from './filtersTestFixtures'
import { createMatchMediaForWidth, elementsWithExactText, kpiResponse, norm } from './kpiTestFixtures'
import {
  DEFAULT_ROWS,
  EMPTY_TEXT,
  EMPTY_TITLE,
  emptyStocksResponse,
  ERROR_TEXT,
  ERROR_TITLE,
  EXPECTED_ROWS,
  L,
  LINK_NAME,
  LOADING_LABEL,
  LOW,
  NAME_BY_SKU,
  OZON_ROWS,
  rowSkuByName,
  STATUS_LABEL,
  type StockItem,
  stockItem,
  stocksResponse,
  stocksResponseOf,
  SUBTITLE,
  WB_ROWS,
} from './lowStockTestFixtures'
import { createAppRouter } from './router'
import { ResizeObserverStub, salesDailyResponse } from './salesChartTestFixtures'
import { topProductsResponse } from './topProductsTestFixtures'

/*
 * Spec 007 «Скоро закончится» — дашборд целиком через настоящий роутер (1440 px).
 * Ответ /api/stocks строит фикстура-«сервер» (lowStockTestFixtures.ts) по параметрам запроса;
 * ожидаемые строки и тексты посчитаны вручную по docs/domain.md и spec 007.
 *
 * CSS-модули jsdom не применяет: раскладка (2fr / 1fr, высота карточек), размеры, цвета,
 * наведение, многоточие и кольцо фокуса — в e2e/low-stock.spec.ts. Здесь — разметка,
 * тексты, состояния, запросы и ключ кэша.
 */

/** Параметры каждого запроса /api/stocks (AC-2). */
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
  http.get('/api/*', () => HttpResponse.json({ message: 'Недоступно в тесте остатков' }, { status: 503 })),
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

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  stockRequests.length = 0
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

/** Таймаут ожидания: ошибка может прийти после повтора, заданного в самом хуке. */
const WAIT = { timeout: 5000 }

const findLow = () => screen.findByRole('region', LOW)
const getLow = () => screen.getByRole('region', LOW)

/** Список строк (ul) после загрузки. */
async function findList(): Promise<HTMLUListElement> {
  const low = await findLow()
  await waitFor(() => expect(low.querySelector('ul > li')).not.toBeNull(), WAIT)
  return low.querySelector('ul') as HTMLUListElement
}
const getList = () => {
  const lists = getLow().querySelectorAll('ul')
  expect(lists).toHaveLength(1)
  return lists[0] as HTMLUListElement
}
const rows = () => [...getList().children] as HTMLElement[]
const skus = () => rows().map(rowSkuByName)
const rowBySku = (sku: string) => {
  const row = rows().find((r) => rowSkuByName(r) === sku)
  if (!row) throw new Error(`Нет строки «${NAME_BY_SKU[sku]}»: ${norm(getLow().textContent)}`)
  return row
}

function expectSubtitle(text: string): void {
  const low = getLow()
  expect(elementsWithExactText(text, low), norm(low.textContent)).not.toHaveLength(0)
}

const link = () => within(getLow()).getByRole('link', { name: LINK_NAME })

/** Шапка — заголовок, подзаголовок и ссылка — видна во всех состояниях блока. */
function expectHeader(subtitle: string = SUBTITLE.five): void {
  expect(within(getLow()).getByRole('heading', { level: 2, name: 'Скоро закончится' })).toBeInTheDocument()
  expectSubtitle(subtitle)
  expect(link()).toBeInTheDocument()
}

const expectNoList = () => expect(getLow().querySelector('ul')).toBeNull()

/** Декоративные иконки: svg внутри aria-hidden. */
const hiddenIcons = (root: Element) =>
  [...root.querySelectorAll<HTMLElement>('[aria-hidden="true"]')].filter((el) => el.querySelector('svg') || el.tagName === 'svg')

const filterPanel = () => screen.getByRole('search', { name: 'Фильтры' })
const panelButton = (group: string, name: string) =>
  within(within(filterPanel()).getByRole('group', { name: group })).getByRole('button', { name })
const compareSwitch = () => within(filterPanel()).getByRole('switch', { name: 'Сравнить с прошлым периодом' })

/** Ключи запросов остатков в кэше. */
const stockKeys = (client: QueryClient) =>
  client
    .getQueryCache()
    .getAll()
    .map((q) => q.queryKey)
    .filter((key) => key[0] === 'stocks')

/** Элементы a, b идут в документе именно в таком порядке. */
const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

/** Самый вложенный элемент строки с точным текстом. */
function leaf(root: Element, text: string): HTMLElement {
  const all = elementsWithExactText(text, root)
  const innermost = all.find((el) => !all.some((other) => other !== el && el.contains(other)))
  if (!innermost) throw new Error(`Нет «${text}» в «${norm(root.textContent)}»`)
  return innermost
}

// =====================================================================================

describe('Секция «Скоро закончится»', () => {
  it('AC-1: section с видимым h2 «Скоро закончится», связь через aria-labelledby', async () => {
    renderApp('/dashboard')
    const low = await findLow()

    expect(low.tagName).toBe('SECTION')
    const h2 = within(low).getByRole('heading', { level: 2, name: 'Скоро закончится' })
    expect(h2.id).not.toBe('')
    expect(low.getAttribute('aria-labelledby')).toBe(h2.id)
    expect(h2.closest('.sr-only')).toBeNull()
    expect(h2).not.toHaveClass('sr-only')
  })

  it('AC-1: порядок KPI → график → «Скоро закончится» → «Топ-10 товаров»; блоки не вложены друг в друга', async () => {
    renderApp('/dashboard')
    const low = await findLow()
    const kpi = await screen.findByRole('region', { name: 'Ключевые показатели' })
    const chart = await screen.findByRole('region', { name: 'Продажи по дням' })
    const top = await screen.findByRole('region', { name: 'Топ-10 товаров' })

    expect(follows(kpi, chart)).toBe(true)
    expect(follows(chart, low)).toBe(true)
    expect(follows(low, top)).toBe(true)
    for (const other of [kpi, chart, top]) {
      expect(other.contains(low)).toBe(false)
      expect(low.contains(other)).toBe(false)
    }
  })

  it('AC-1: секция одна на странице', async () => {
    renderApp('/dashboard')
    await findList()

    expect(screen.getAllByRole('region', LOW)).toHaveLength(1)
  })
})

describe('Запрос /api/stocks', () => {
  it('AC-2: по умолчанию — mp=all и limit=5, без cat, from, to; один запрос', async () => {
    renderApp('/dashboard')
    await findList()

    expect(stockRequests).toHaveLength(1)
    expect(sortedParams((stockRequests[0] as URLSearchParams).toString())).toEqual([
      ['limit', '5'],
      ['mp', 'all'],
    ])
  })

  it('AC-2: фильтры из URL — mp и cat (повторяется, в порядке справочника); период, cmp и from/to не уходят', async () => {
    renderApp('/dashboard?period=7&mp=wb&cat=sports&cat=shoes&cmp=0')
    await findList()

    expect(stockRequests).toHaveLength(1)
    const params = stockRequests[0] as URLSearchParams
    expect(params.get('mp')).toBe('wb')
    expect(params.getAll('cat')).toEqual(['shoes', 'sports'])
    expect(params.get('limit')).toBe('5')
    for (const key of ['from', 'to', 'period', 'cmp']) expect(params.has(key), key).toBe(false)
  })

  it('AC-2: свой период в URL — from и to в запрос остатков всё равно не передаются', async () => {
    renderApp('/dashboard?from=2026-10-10&to=2026-10-20&mp=ozon')
    await findList()

    const params = stockRequests.at(-1) as URLSearchParams
    expect(params.get('mp')).toBe('ozon')
    expect(params.has('from')).toBe(false)
    expect(params.has('to')).toBe(false)
  })

  it('AC-2: блок не ждёт /api/meta — пока справочник грузится, остатки уже запрошены и показаны', async () => {
    server.use(
      http.get('/api/meta', async () => {
        await delay('infinite')
        return HttpResponse.json(META_FIXTURE)
      }),
    )
    renderApp('/dashboard?mp=wb')

    await findList()
    expect(skus()).toEqual(WB_ROWS)
    expect((stockRequests[0] as URLSearchParams).get('mp')).toBe('wb')
  })

  it('AC-2: ключ запроса — [\'stocks\', mp, cat]', async () => {
    const { client } = renderApp('/dashboard?mp=wb&cat=shoes&cat=home')
    await findList()

    expect(stockKeys(client)).toEqual([['stocks', 'wb', ['shoes', 'home']]])
  })

  it('AC-2: ключ по умолчанию — [\'stocks\', \'all\', []]', async () => {
    const { client } = renderApp('/dashboard')
    await findList()

    expect(stockKeys(client)).toEqual([['stocks', 'all', []]])
  })

  it('AC-2: смена площадки — новый запрос и новые строки', async () => {
    const { user } = renderApp('/dashboard')
    await findList()

    await user.click(panelButton('Маркетплейс', 'Ozon'))

    await waitFor(() => expect(stockRequests).toHaveLength(2))
    expect((stockRequests[1] as URLSearchParams).get('mp')).toBe('ozon')
    await waitFor(() => expect(skus()).toEqual(OZON_ROWS), WAIT)
  })

  it('AC-2: смена категорий — новый запрос с cat', async () => {
    const { user } = renderApp('/dashboard')
    await findList()

    await user.click(within(filterPanel()).getByRole('button', { name: /^Категории/ }))
    const list = await screen.findByRole('group', { name: 'Категории' })
    await user.click(within(list).getByRole('checkbox', { name: /^Электроника/ }))
    await user.click(within(list).getByRole('button', { name: 'Применить' }))

    await waitFor(() => expect(stockRequests).toHaveLength(2))
    expect((stockRequests[1] as URLSearchParams).getAll('cat')).toEqual(['electronics'])
    await waitFor(() => expect(skus()).toEqual([L.L3.sku]), WAIT)
  })

  it('AC-2: смена периода и переключение сравнения — без нового запроса, строки те же', async () => {
    const { user, router } = renderApp('/dashboard')
    await findList()
    expect(stockRequests).toHaveLength(1)

    await user.click(panelButton('Период', '7 дней'))
    await waitFor(() => expect(searchStr(router)).toBe('?period=7'))
    await user.click(compareSwitch())
    await waitFor(() => expect(searchStr(router)).toContain('cmp=0'))
    await user.click(panelButton('Период', '90 дней'))
    await waitFor(() => expect(searchStr(router)).toContain('period=90'))

    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
    expect(stockRequests).toHaveLength(1)
    expect(skus()).toEqual(DEFAULT_ROWS)
    // Скелетона при смене периода нет
    expect(within(getLow()).queryByLabelText(LOADING_LABEL)).toBeNull()
  })

  it('AC-2: прежние площадка и категории после «Назад» — ответ из кэша, без повторного запроса', async () => {
    const { user, router } = renderApp('/dashboard')
    await findList()

    await user.click(panelButton('Маркетплейс', 'WB'))
    await waitFor(() => expect(skus()).toEqual(WB_ROWS), WAIT)
    expect(stockRequests).toHaveLength(2)

    act(() => router.history.back())
    await waitFor(() => expect(searchStr(router)).toBe(''))
    await waitFor(() => expect(skus()).toEqual(DEFAULT_ROWS), WAIT)
    expect(stockRequests).toHaveLength(2)
  })
})

describe('Строки списка', () => {
  it('AC-3: список — ul, строка — li; по умолчанию 5 строк в порядке ответа (по дням по возрастанию)', async () => {
    renderApp('/dashboard')
    const list = await findList()

    expect(list.tagName).toBe('UL')
    for (const row of rows()) expect(row.tagName).toBe('LI')
    expect(skus()).toEqual(DEFAULT_ROWS)
  })

  it('AC-3: позиции ok и noSales не показываются (mp=wb: в ответе 4 позиции, строк 3)', async () => {
    renderApp('/dashboard?mp=wb')
    await findList()

    expect(skus()).toEqual(WB_ROWS)
    expect(norm(getLow().textContent)).not.toContain(L.L7.name)
  })

  it('AC-3: ok и noSales в середине ответа тоже пропускаются, остальные — в порядке ответа', async () => {
    mockStocks(() => HttpResponse.json(stocksResponseOf([L.L1, L.L6, L.L8, L.L2])))
    renderApp('/dashboard')
    await findList()

    expect(skus()).toEqual([L.L1.sku, L.L2.sku])
    expect(norm(getLow().textContent)).not.toContain(L.L6.name)
    expect(norm(getLow().textContent)).not.toContain(L.L8.name)
  })

  it('AC-3: порядок — как в ответе, клиент не пересортировывает', async () => {
    // Ответ «как есть»: сначала «скоро», потом «критично»
    mockStocks(() => HttpResponse.json(stocksResponseOf([L.L5, L.L4, L.L2])))
    renderApp('/dashboard')
    await findList()

    expect(skus()).toEqual([L.L5.sku, L.L4.sku, L.L2.sku])
  })

  it('AC-3: в ответе больше 5 подходящих позиций — показываются первые 5', async () => {
    const seven = Array.from({ length: 7 }, (_, i) =>
      stockItem({ sku: `90000000${i}`, name: `Позиция номер ${i + 1}`, stock: i, perDay: 1, days: i, status: 'critical' }),
    )
    mockStocks(() => HttpResponse.json(stocksResponseOf(seven)))
    renderApp('/dashboard')
    await findList()

    expect(rows()).toHaveLength(5)
    expect(rows().map((r) => norm(r.textContent).match(/Позиция номер \d/)?.[0])).toEqual([
      'Позиция номер 1',
      'Позиция номер 2',
      'Позиция номер 3',
      'Позиция номер 4',
      'Позиция номер 5',
    ])
  })

  it('AC-3: одна подходящая позиция — одна строка', async () => {
    renderApp('/dashboard?cat=electronics')
    await findList()

    expect(skus()).toEqual([L.L3.sku])
  })

  it('AC-4: название, бейдж площадки, склад, «· {шт} · {скорость}», дни и бейдж статуса — по каждой строке', async () => {
    renderApp('/dashboard')
    await findList()

    for (const sku of DEFAULT_ROWS) {
      const expected = EXPECTED_ROWS[sku]
      if (!expected) throw new Error(sku)
      const row = rowBySku(sku)
      const text = norm(row.textContent)

      const name = leaf(row, expected.name)
      const mp = leaf(row, expected.mp)
      const warehouse = leaf(row, expected.warehouse)
      const days = leaf(row, expected.days)
      const status = leaf(row, expected.status)
      expect(text, sku).toContain(expected.meta)
      // Порядок: название → площадка → склад → «· шт · скорость» → дни → статус
      expect(follows(name, mp), `${sku}: название перед площадкой`).toBe(true)
      expect(follows(mp, warehouse), `${sku}: площадка перед складом`).toBe(true)
      expect(text.indexOf(expected.warehouse)).toBeLessThan(text.indexOf(expected.meta))
      expect(text.indexOf(expected.meta)).toBeLessThan(text.indexOf(expected.days))
      expect(follows(days, status), `${sku}: дни перед статусом`).toBe(true)
    }
  })

  it('AC-4, AC-8: тексты строки из макета — «20 шт · 6,1/день» и «3 дн.» (Куртка, Ozon FBO)', async () => {
    renderApp('/dashboard')
    await findList()

    const row = rowBySku(L.L2.sku)
    expect(norm(row.textContent)).toContain(`${MIDDOT} 20 шт ${MIDDOT} 6,1/день`)
    expect(elementsWithExactText('3 дн.', row)).not.toHaveLength(0)
    expect(elementsWithExactText('Критично', row)).not.toHaveLength(0)
  })

  it('AC-4, AC-9: 14,5 дня — «14 дн.» и «Скоро закончится»; ноль на складе — «0 дн.», «0 шт» и «Критично»', async () => {
    renderApp('/dashboard')
    await findList()

    const soon = rowBySku(L.L5.sku)
    expect(elementsWithExactText('14 дн.', soon)).not.toHaveLength(0)
    expect(elementsWithExactText('Скоро закончится', soon)).not.toHaveLength(0)
    const zero = rowBySku(L.L1.sku)
    expect(elementsWithExactText('0 дн.', zero)).not.toHaveLength(0)
    expect(norm(zero.textContent)).toContain(`${MIDDOT} 0 шт ${MIDDOT} 2,5/день`)
    expect(elementsWithExactText('Критично', zero)).not.toHaveLength(0)
  })

  it('AC-4: заглушка-превью — aria-hidden, с иконкой, без текста и без img', async () => {
    renderApp('/dashboard')
    await findList()

    for (const row of rows()) {
      const previews = hiddenIcons(row).filter((el) => norm(el.textContent) === '')
      expect(previews.length, rowSkuByName(row)).toBeGreaterThan(0)
      // Превью — первым в строке, до названия
      const name = leaf(row, NAME_BY_SKU[rowSkuByName(row)] as string)
      expect(follows(previews[0] as HTMLElement, name)).toBe(true)
    }
    expect(getList().querySelector('img')).toBeNull()
  })

  it('AC-4: очень большие числа — без экспоненты и обрезания', async () => {
    // 1 234 567 / 100 000 ≈ 12,3 → «12 дн.», «Скоро закончится»
    mockStocks(() =>
      HttpResponse.json(
        stocksResponseOf([stockItem({ name: 'Большой запас', stock: 1_234_567, perDay: 100_000, days: 12.34567, status: 'soon' })]),
      ),
    )
    renderApp('/dashboard')
    await findList()

    const row = rows()[0] as HTMLElement
    expect(norm(row.textContent)).toContain('1 234 567 шт')
    expect(elementsWithExactText('12 дн.', row)).not.toHaveLength(0)
    expect(norm(row.textContent)).not.toMatch(/e\+|Infinity|NaN/)
  })

  it('AC-5: бейдж площадки — «WB» у WB, «Ozon» у Ozon', async () => {
    renderApp('/dashboard')
    await findList()

    for (const sku of DEFAULT_ROWS) {
      const expected = EXPECTED_ROWS[sku] as (typeof EXPECTED_ROWS)[string]
      const row = rowBySku(sku)
      expect(elementsWithExactText(expected.mp, row), sku).not.toHaveLength(0)
      const other = expected.mp === 'WB' ? 'Ozon' : 'WB'
      expect(elementsWithExactText(other, row), sku).toHaveLength(0)
    }
  })

  it('AC-6: бейдж схемы — только у Ozon («FBO» / «FBS»); у WB (scheme = null) его нет', async () => {
    renderApp('/dashboard')
    await findList()

    expect(elementsWithExactText('FBO', rowBySku(L.L2.sku))).not.toHaveLength(0)
    expect(elementsWithExactText('FBS', rowBySku(L.L3.sku))).not.toHaveLength(0)
    for (const sku of WB_ROWS) {
      const row = rowBySku(sku)
      expect(elementsWithExactText('FBO', row), sku).toHaveLength(0)
      expect(elementsWithExactText('FBS', row), sku).toHaveLength(0)
      expect(norm(row.textContent)).not.toMatch(/FBO|FBS|null/)
    }
  })

  it('AC-6: схема идёт после бейджа площадки и перед складом', async () => {
    renderApp('/dashboard')
    await findList()

    const row = rowBySku(L.L2.sku)
    const mp = leaf(row, 'Ozon')
    const scheme = leaf(row, 'FBO')
    const warehouse = leaf(row, 'Хоругвино')
    expect(follows(mp, scheme)).toBe(true)
    expect(follows(scheme, warehouse)).toBe(true)
  })

  it('AC-7: бейдж статуса — текст и иконка aria-hidden; у «Критично» и «Скоро закончится» разные иконки', async () => {
    renderApp('/dashboard')
    await findList()

    const iconOf = (sku: string, label: string) => {
      const badge = leaf(rowBySku(sku), label)
      // Иконка — внутри бейджа или рядом с текстом в том же бейдже
      const holder = badge.querySelector('svg') ? badge : (badge.parentElement as HTMLElement)
      const svgs = [...holder.querySelectorAll('svg')]
      expect(svgs.length, `${sku}: иконка статуса`).toBeGreaterThan(0)
      for (const svg of svgs) expect(svg.closest('[aria-hidden="true"]'), sku).not.toBeNull()
      return svgs.map((s) => s.innerHTML).join('')
    }
    const critical = iconOf(L.L2.sku, STATUS_LABEL.critical)
    const soon = iconOf(L.L4.sku, STATUS_LABEL.soon)
    expect(critical).not.toBe(soon)
    // У одного статуса — одна и та же иконка
    expect(iconOf(L.L3.sku, STATUS_LABEL.critical)).toBe(critical)
  })

  it('AC-7: статус не передаётся одним цветом — текст статуса виден (не sr-only, не aria-hidden)', async () => {
    renderApp('/dashboard')
    await findList()

    for (const sku of DEFAULT_ROWS) {
      const expected = EXPECTED_ROWS[sku] as (typeof EXPECTED_ROWS)[string]
      const badge = leaf(rowBySku(sku), expected.status)
      expect(badge.closest('.sr-only'), sku).toBeNull()
      expect(badge.closest('[aria-hidden="true"]'), sku).toBeNull()
    }
  })

  it('AC-4: строки не фокусируются — ни tabindex, ни ссылок и кнопок внутри списка', async () => {
    renderApp('/dashboard')
    await findList()

    expect(getList().querySelectorAll('a[href], button, input, [tabindex]')).toHaveLength(0)
  })
})

describe('Подзаголовок', () => {
  it('AC-10: 5 строк — «5 позиций с наименьшим запасом»', async () => {
    renderApp('/dashboard')
    await findList()

    expectSubtitle(SUBTITLE.five)
  })

  it.each([
    ['/dashboard?mp=wb', SUBTITLE.three, 3],
    ['/dashboard?mp=ozon', SUBTITLE.two, 2],
    ['/dashboard?cat=electronics', SUBTITLE.one, 1],
    ['/dashboard?cat=shoes&cat=home', SUBTITLE.two, 2],
  ])('AC-10: %s — подзаголовок по фактическому числу строк: «%s»', async (url, subtitle, count) => {
    renderApp(url)
    await findList()

    expect(rows()).toHaveLength(count)
    expectSubtitle(subtitle)
    expect(elementsWithExactText(SUBTITLE.five, getLow())).toHaveLength(0)
  })

  it('AC-10: 4 строки — «4 позиции…»', async () => {
    mockStocks(() => HttpResponse.json(stocksResponseOf([L.L1, L.L2, L.L3, L.L4, L.L6])))
    renderApp('/dashboard')
    await findList()

    expect(rows()).toHaveLength(4)
    expectSubtitle(SUBTITLE.four)
  })

  it('AC-10: подзаголовок — под h2 в той же шапке, а не внутри списка', async () => {
    renderApp('/dashboard?mp=wb')
    await findList()

    const h2 = within(getLow()).getByRole('heading', { level: 2 })
    const subtitle = leaf(getLow(), SUBTITLE.three)
    expect(follows(h2, subtitle)).toBe(true)
    expect(getList().contains(subtitle)).toBe(false)
  })
})

describe('Ссылка «Все остатки»', () => {
  it('AC-11: ссылка с именем «Все остатки» и стрелкой aria-hidden; ведёт на /stocks', async () => {
    renderApp('/dashboard')
    await findList()

    const a = link()
    expect(a.tagName).toBe('A')
    expect(a).toHaveAccessibleName(LINK_NAME)
    expect(norm(a.textContent)).toBe(LINK_NAME)
    const svgs = [...a.querySelectorAll('svg')]
    expect(svgs.length).toBeGreaterThan(0)
    for (const svg of svgs) expect(svg.closest('[aria-hidden="true"]')).not.toBeNull()
    const href = new URL(a.getAttribute('href') ?? '', 'http://localhost')
    expect(href.pathname).toBe('/stocks')
    expect(href.search).toBe('')
  })

  it('AC-11: текущие параметры фильтров URL сохраняются (?mp=wb&cat=shoes)', async () => {
    renderApp('/dashboard?mp=wb&cat=shoes')
    await findList()

    const href = new URL(link().getAttribute('href') ?? '', 'http://localhost')
    expect(href.pathname).toBe('/stocks')
    expect(sortedParams(href.search)).toEqual([
      ['cat', 'shoes'],
      ['mp', 'wb'],
    ])
  })

  it('AC-11: все параметры фильтров — период, площадка, категории, сравнение — переходят как есть', async () => {
    const { router } = renderApp('/dashboard?period=7&mp=wb&cat=shoes&cat=sports&cmp=0')
    await findList()

    const href = new URL(link().getAttribute('href') ?? '', 'http://localhost')
    expect(href.pathname).toBe('/stocks')
    expect(sortedParams(href.search)).toEqual(sortedParams(searchStr(router)))
  })

  it('AC-11: ссылка следует за фильтрами — после выбора «WB» в href появляется mp=wb', async () => {
    const { user } = renderApp('/dashboard')
    await findList()

    await user.click(panelButton('Маркетплейс', 'WB'))

    await waitFor(() => expect(new URL(link().getAttribute('href') ?? '', 'http://localhost').searchParams.get('mp')).toBe('wb'))
  })

  it('AC-11: переход по ссылке — /stocks с теми же параметрами; дашборда на этом адресе нет (до фичи 6b)', async () => {
    const { user, router } = renderApp('/dashboard?mp=wb&cat=shoes')
    await findList()

    await user.click(link())

    await waitFor(() => expect(router.state.location.pathname).toBe('/stocks'))
    expect(sortedParams(searchStr(router))).toEqual([
      ['cat', 'shoes'],
      ['mp', 'wb'],
    ])
    await waitFor(() => expect(screen.queryByRole('region', LOW)).toBeNull())
  })

  it('AC-11: ссылка видна во всех состояниях — загрузка, пусто, ошибка', async () => {
    mockStocks(async () => {
      await delay('infinite')
      return HttpResponse.json(emptyStocksResponse())
    })
    const first = renderApp('/dashboard')
    await within(await findLow()).findByLabelText(LOADING_LABEL)
    expect(link()).toBeInTheDocument()
    first.view.unmount()

    mockStocks(() => HttpResponse.json(emptyStocksResponse()))
    const second = renderApp('/dashboard')
    await within(await findLow()).findByText(EMPTY_TITLE, {}, WAIT)
    expect(link()).toBeInTheDocument()
    second.view.unmount()

    mockStocks(() => new HttpResponse(null, { status: 500 }))
    renderApp('/dashboard')
    await within(await findLow()).findByText(ERROR_TITLE, {}, WAIT)
    expect(link()).toBeInTheDocument()
  })
})

describe('Загрузка', () => {
  /** Контейнер скелетона: aria-busy, aria-label; шапка видна; строк данных нет. */
  async function expectSkeleton(): Promise<HTMLElement> {
    const low = await findLow()
    const busy = await within(low).findByLabelText(LOADING_LABEL)
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expectHeader(SUBTITLE.five)
    expect(busy.closest('ul')).toBeNull()
    expect(within(low).queryByRole('alert')).toBeNull()
    expect(within(low).queryByText(EMPTY_TITLE)).toBeNull()
    return busy
  }

  /** Строки скелетона: дети контейнера (допускается одна обёртка). */
  function skeletonRows(busy: HTMLElement): Element[] {
    let el: Element = busy
    while (el.children.length === 1 && el.firstElementChild) el = el.firstElementChild
    return [...el.children]
  }

  it('AC-12: первая загрузка — скелетон из 5 строк, заголовок, подзаголовок «5 позиций…» и ссылка видны', async () => {
    mockStocks(async () => {
      await delay('infinite')
      return HttpResponse.json(stocksResponse())
    })
    renderApp('/dashboard')

    const busy = await expectSkeleton()
    expect(skeletonRows(busy)).toHaveLength(5)
    expect(norm(busy.textContent)).toBe('')
  })

  it('AC-12, AC-10: смена площадки — снова скелетон, старых строк нет, подзаголовок — текст макета', async () => {
    const { user } = renderApp('/dashboard?mp=wb')
    await findList()
    expectSubtitle(SUBTITLE.three)

    mockStocks(async () => {
      await delay('infinite')
      return HttpResponse.json(stocksResponse())
    })
    await user.click(panelButton('Маркетплейс', 'Ozon'))

    await expectSkeleton()
    expect(norm(getLow().textContent)).not.toContain(L.L1.name)
    expect(elementsWithExactText(SUBTITLE.three, getLow())).toHaveLength(0)
  })

  it('AC-12: смена категорий — снова скелетон', async () => {
    const { user } = renderApp('/dashboard')
    await findList()

    mockStocks(async () => {
      await delay('infinite')
      return HttpResponse.json(stocksResponse())
    })
    await user.click(within(filterPanel()).getByRole('button', { name: /^Категории/ }))
    const list = await screen.findByRole('group', { name: 'Категории' })
    await user.click(within(list).getByRole('checkbox', { name: /^Обувь/ }))
    await user.click(within(list).getByRole('button', { name: 'Применить' }))

    await expectSkeleton()
  })

  it('AC-12: после загрузки скелетона и aria-busy нет', async () => {
    renderApp('/dashboard')
    await findList()

    expect(within(getLow()).queryByLabelText(LOADING_LABEL)).toBeNull()
    expect(getLow().querySelector('[aria-busy="true"]')).toBeNull()
  })
})

describe('Пусто', () => {
  async function findEmptyBlock(): Promise<HTMLElement> {
    const low = await findLow()
    const title = await within(low).findByText(EMPTY_TITLE, {}, WAIT)
    let block: HTMLElement | null = title
    while (block && block !== low && !within(block).queryByRole('button', { name: 'Сбросить фильтры' })) {
      block = block.parentElement
    }
    if (!block || block === low) throw new Error('Кнопка «Сбросить фильтры» не в блоке «Ничего не заканчивается»')
    expect(elementsWithExactText(EMPTY_TEXT, block)).not.toHaveLength(0)
    expect(block.closest('[role="alert"]')).toBeNull()
    expect(hiddenIcons(block).length, 'галочка в круге — декоративная').toBeGreaterThan(0)
    expectHeader(SUBTITLE.five)
    expectNoList()
    expect(within(low).queryByLabelText(LOADING_LABEL)).toBeNull()
    return block
  }

  it('AC-13: пустой ответ — «Ничего не заканчивается», пояснение и «Сбросить фильтры»', async () => {
    mockStocks(() => HttpResponse.json(emptyStocksResponse()))
    renderApp('/dashboard')

    await findEmptyBlock()
  })

  it.each([
    ['только норма (cat=kids)', '/dashboard?cat=kids'],
    ['только «нет продаж» (cat=beauty)', '/dashboard?cat=beauty'],
  ])('AC-13: в ответе нет critical / soon — %s — тоже «пусто»', async (_title, url) => {
    renderApp(url)

    await findEmptyBlock()
    expect(stockRequests).toHaveLength(1)
  })

  it('AC-13: в ответе только ok и noSales (в любом порядке) — «пусто»', async () => {
    mockStocks(() => HttpResponse.json(stocksResponseOf([L.L6, L.L7, L.L8])))
    renderApp('/dashboard')

    await findEmptyBlock()
  })

  it('AC-13: «Сбросить фильтры» сбрасывает все фильтры, как в spec 002 AC-15', async () => {
    const { user, router } = renderApp('/dashboard?period=7&mp=wb&cat=kids&cmp=0')
    const block = await findEmptyBlock()

    await user.click(within(block).getByRole('button', { name: 'Сбросить фильтры' }))

    await waitFor(() => expect(searchStr(router)).toBe(''))
    expect(router.state.location.pathname).toBe('/dashboard')
    await findList()
    expect(skus()).toEqual(DEFAULT_ROWS)
  })
})

describe('Ошибка', () => {
  async function findLowError(): Promise<HTMLElement> {
    const low = await findLow()
    const title = await within(low).findByText(ERROR_TITLE, {}, WAIT)
    const alert = title.closest<HTMLElement>('[role="alert"]')
    if (!alert) throw new Error('Блок ошибки остатков без role="alert"')
    expect(low.contains(alert)).toBe(true)
    expect(elementsWithExactText(ERROR_TEXT, alert)).not.toHaveLength(0)
    const retry = within(alert).getByRole('button', { name: 'Повторить' })
    // Иконка обновления в кнопке — декоративная
    expect(retry.querySelector('svg')).not.toBeNull()
    for (const svg of retry.querySelectorAll('svg')) expect(svg.closest('[aria-hidden="true"]')).not.toBeNull()
    // Треугольник в круге — декоративный, вне кнопки
    expect(hiddenIcons(alert).filter((el) => !retry.contains(el)).length).toBeGreaterThan(0)
    expectHeader(SUBTITLE.five)
    expectNoList()
    expect(within(low).queryByLabelText(LOADING_LABEL)).toBeNull()
    return alert
  }

  const VALID = stocksResponse({ limit: 5 })
  const withItem = (patch: Record<string, unknown>) => ({ ...VALID, items: [{ ...VALID.items[0], ...patch }] })

  it.each([
    ['статус 500', () => HttpResponse.json({ message: 'Внутренняя ошибка' }, { status: 500 })],
    ['статус 404', () => HttpResponse.json({ message: 'Не найдено' }, { status: 404 })],
    ['статус 400', () => HttpResponse.json({ message: 'Неизвестный статус запаса' }, { status: 400 })],
    ['сетевая ошибка', () => HttpResponse.error()],
    ['ответ не по схеме: нет items', () => HttpResponse.json({ asOf: '2026-11-04', total: 0, counts: VALID.counts })],
    ['ответ не по схеме: нет counts', () => HttpResponse.json({ asOf: '2026-11-04', total: 1, items: VALID.items })],
    ['ответ не по схеме: строка вместо числа в stock', () => HttpResponse.json(withItem({ stock: 'много' }))],
    ['ответ не по схеме: неизвестный статус', () => HttpResponse.json(withItem({ status: 'urgent' }))],
    ['ответ не по схеме: неизвестная площадка', () => HttpResponse.json(withItem({ marketplace: 'avito' }))],
    ['ответ не по схеме: неизвестная схема', () => HttpResponse.json(withItem({ scheme: 'DBS' }))],
    ['ответ не по схеме: нет perDay', () => {
      const item: Partial<StockItem> = { ...VALID.items[0] }
      delete item.perDay
      return HttpResponse.json({ ...VALID, items: [item] })
    }],
    ['ответ не по схеме: HTML вместо JSON', () => new HttpResponse('<html>oops</html>', { headers: { 'Content-Type': 'text/html' } })],
  ])('AC-14 / T5: ошибка /api/stocks (%s) — блок role="alert"', async (_title, respond) => {
    mockStocks(respond)
    renderApp('/dashboard')

    await findLowError()
  })

  it('AC-14: технических деталей (статус, путь, стек) в блоке ошибки нет', async () => {
    mockStocks(() => HttpResponse.json({ message: 'Внутренняя ошибка: /src/mocks/server/core.ts' }, { status: 502 }))
    renderApp('/dashboard')

    const alert = await findLowError()
    expect(norm(alert.textContent)).not.toMatch(/502|\/api\/|\/src\/|Error|Внутренняя ошибка|Сервер вернул|ZodError/)
  })

  it('AC-14: «Повторить» заново запрашивает /api/stocks, при успехе — список', async () => {
    let fail = true
    mockStocks((params) => (fail ? new HttpResponse(null, { status: 500 }) : defaultStocks(params)))
    const { user } = renderApp('/dashboard?mp=wb')
    const alert = await findLowError()
    const before = stockRequests.length

    fail = false
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }))

    await findList()
    expect(stockRequests.length).toBeGreaterThan(before)
    // Повтор — с теми же фильтрами
    expect((stockRequests.at(-1) as URLSearchParams).get('mp')).toBe('wb')
    expect(within(getLow()).queryByText(ERROR_TITLE)).toBeNull()
    expect(skus()).toEqual(WB_ROWS)
    expectSubtitle(SUBTITLE.three)
  })

  it('AC-14: «Повторить» и снова ошибка — блок ошибки остаётся', async () => {
    mockStocks(() => new HttpResponse(null, { status: 500 }))
    const { user } = renderApp('/dashboard')
    const alert = await findLowError()
    const before = stockRequests.length

    await user.click(within(alert).getByRole('button', { name: 'Повторить' }))

    await waitFor(() => expect(stockRequests.length).toBeGreaterThan(before))
    await findLowError()
  })

  it('AC-14: упал лишь фоновый перезапрос, а данные есть, — список остаётся', async () => {
    const { client } = renderApp('/dashboard')
    await findList()
    expect(stockRequests).toHaveLength(1)

    mockStocks(() => new HttpResponse(null, { status: 500 }))
    // Фоновый перезапрос тех же данных (ключ из spec: ['stocks', mp, cat])
    void client.invalidateQueries({ queryKey: ['stocks'] })

    await waitFor(() => expect(stockRequests.length).toBeGreaterThan(1))
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
    expect(within(getLow()).queryByText(ERROR_TITLE)).toBeNull()
    expect(within(getLow()).queryByRole('alert')).toBeNull()
    expect(skus()).toEqual(DEFAULT_ROWS)
  })
})

describe('Независимость блоков', () => {
  it('AC-15: ошибка остатков не ломает KPI, график, топ и панель фильтров', async () => {
    mockStocks(() => new HttpResponse(null, { status: 500 }))
    const { user, router } = renderApp('/dashboard')
    await within(await findLow()).findByText(ERROR_TITLE, {}, WAIT)

    const kpi = screen.getByRole('region', { name: 'Ключевые показатели' })
    await waitFor(() => expect(within(kpi).getAllByRole('article')).toHaveLength(8), WAIT)
    expect(within(kpi).queryByRole('alert')).toBeNull()
    const chart = screen.getByRole('region', { name: 'Продажи по дням' })
    await within(chart).findByRole('table', {}, WAIT)
    expect(within(chart).queryByRole('alert')).toBeNull()
    const top = screen.getByRole('region', { name: 'Топ-10 товаров' })
    await within(top).findByRole('table', {}, WAIT)
    expect(within(top).queryByRole('alert')).toBeNull()

    const before = stockRequests.length
    await user.click(panelButton('Маркетплейс', 'WB'))
    await waitFor(() => expect(searchStr(router)).toBe('?mp=wb'))
    await waitFor(() => expect(stockRequests.length).toBeGreaterThan(before))
    expect((stockRequests.at(-1) as URLSearchParams).get('mp')).toBe('wb')
  })

  it('AC-15: ошибка /api/meta не ломает блок остатков', async () => {
    server.use(http.get('/api/meta', () => new HttpResponse(null, { status: 500 })))
    renderApp('/dashboard')

    await findList()
    expect(skus()).toEqual(DEFAULT_ROWS)
    expect(within(getLow()).queryByRole('alert')).toBeNull()
  })

  it('AC-15: ошибка KPI не ломает блок остатков', async () => {
    server.use(http.get('/api/kpi', () => new HttpResponse(null, { status: 500 })))
    renderApp('/dashboard')

    await screen.findByText('Не удалось загрузить показатели', {}, WAIT)
    await findList()
    expect(within(getLow()).queryByRole('alert')).toBeNull()
    expect(skus()).toEqual(DEFAULT_ROWS)
  })

  it('AC-15: ошибка графика не ломает блок остатков', async () => {
    server.use(http.get('/api/sales-daily', () => new HttpResponse(null, { status: 500 })))
    renderApp('/dashboard')

    await screen.findByText('График не загрузился', {}, WAIT)
    await findList()
    expect(within(getLow()).queryByRole('alert')).toBeNull()
    expect(skus()).toEqual(DEFAULT_ROWS)
  })

  it('AC-15: ошибка топа не ломает блок остатков', async () => {
    server.use(http.get('/api/top-products', () => new HttpResponse(null, { status: 500 })))
    renderApp('/dashboard')

    await screen.findByText('Не удалось загрузить товары', {}, WAIT)
    await findList()
    expect(within(getLow()).queryByRole('alert')).toBeNull()
    expectSubtitle(SUBTITLE.five)
  })

  it('AC-15: остатки грузятся, пока остальные блоки ещё ждут ответа', async () => {
    const forever = async () => {
      await delay('infinite')
      return HttpResponse.json({})
    }
    server.use(http.get('/api/kpi', forever), http.get('/api/sales-daily', forever), http.get('/api/top-products', forever))
    renderApp('/dashboard')

    await findList()
    expect(skus()).toEqual(DEFAULT_ROWS)
  })
})

describe('Безопасность', () => {
  it('T3: название и склад с разметкой выводятся как текст', async () => {
    const evilName = '<img src=x onerror=alert(1)><b>Жирный</b>'
    const evilWarehouse = '<script>alert(1)</script>Склад'
    mockStocks(() => HttpResponse.json(stocksResponseOf([stockItem({ name: evilName, warehouse: evilWarehouse })])))
    renderApp('/dashboard')
    await findList()

    const row = rows()[0] as HTMLElement
    expect(elementsWithExactText(evilName, row)).not.toHaveLength(0)
    expect(elementsWithExactText(evilWarehouse, row)).not.toHaveLength(0)
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(getList().querySelector('b, script')).toBeNull()
  })

  it('T2/T3: название вида «=HYPERLINK(…)» — обычный текст, без ссылки', async () => {
    const formula = '=HYPERLINK("http://evil.example","Кроссовки")'
    mockStocks(() => HttpResponse.json(stocksResponseOf([stockItem({ name: formula })])))
    renderApp('/dashboard')
    await findList()

    expect(elementsWithExactText(formula, rows()[0] as HTMLElement)).not.toHaveLength(0)
    expect(getList().querySelector('a')).toBeNull()
  })

  it('T4: мусор в URL — запрос с значениями по умолчанию, ссылка «Все остатки» без мусора', async () => {
    renderApp('/dashboard?mp=hack&cat=%3Cscript%3E&cat=shoes&limit=999&status=critical')
    await findList()

    const params = stockRequests.at(-1) as URLSearchParams
    expect(params.get('mp')).toBe('all')
    expect(params.getAll('cat')).toEqual(['shoes'])
    expect(params.get('limit')).toBe('5')
    expect(params.has('status')).toBe(false)

    const href = new URL(link().getAttribute('href') ?? '', 'http://localhost')
    expect(href.pathname).toBe('/stocks')
    expect(sortedParams(href.search)).toEqual([['cat', 'shoes']])
    expect(link().getAttribute('href') ?? '').not.toMatch(/script|hack|limit|status/i)
  })

  it('T4: ссылка «Все остатки» — относительный путь приложения, не внешний адрес', async () => {
    renderApp('/dashboard?mp=wb')
    await findList()

    const raw = link().getAttribute('href') ?? ''
    expect(raw.startsWith('/stocks')).toBe(true)
    expect(raw).not.toMatch(/^(https?:|javascript:|\/\/)/i)
    expect(link()).not.toHaveAttribute('target')
  })

  it('T9: блок ничего не пишет в localStorage и sessionStorage (кроме темы)', async () => {
    const before = { local: Object.keys(localStorage), session: Object.keys(sessionStorage) }
    const added = (storage: Storage, was: string[]) =>
      Object.keys(storage).filter((key) => !was.includes(key) && !/theme/i.test(key))
    const { user } = renderApp('/dashboard')
    await findList()
    await user.click(panelButton('Маркетплейс', 'Ozon'))
    await waitFor(() => expect(skus()).toEqual(OZON_ROWS), WAIT)

    expect(added(localStorage, before.local)).toEqual([])
    expect(added(sessionStorage, before.session)).toEqual([])
  })
})
