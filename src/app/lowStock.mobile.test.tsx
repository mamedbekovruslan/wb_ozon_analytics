import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
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
  ERROR_TEXT,
  ERROR_TITLE,
  EXPECTED_ROWS,
  L,
  LINK_NAME,
  LOADING_LABEL,
  LOW,
  rowSkuByName,
  stocksResponse,
  SUBTITLE,
} from './lowStockTestFixtures'
import { createAppRouter } from './router'
import { ResizeObserverStub, salesDailyResponse } from './salesChartTestFixtures'
import { topProductsResponse } from './topProductsTestFixtures'

/*
 * Spec 007 «Скоро закончится» — телефон (375 px). Раскладка в одну колонку, высота ссылки 44
 * и кнопок состояний 44, отсутствие горизонтальной прокрутки и многоточие — в e2e/low-stock.spec.ts.
 * Здесь — что на телефоне тот же блок: на своём месте, с теми же строками, ссылкой и состояниями.
 */

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
  vi.stubGlobal('matchMedia', createMatchMediaForWidth(375))
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})
afterEach(() => {
  server.resetHandlers()
  vi.unstubAllGlobals()
})
afterAll(() => server.close())

function renderApp(url: string) {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [url] }) })
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

const WAIT = { timeout: 5000 }
const findLow = () => screen.findByRole('region', LOW)
const getLow = () => screen.getByRole('region', LOW)

async function findList(): Promise<HTMLUListElement> {
  const low = await findLow()
  await waitFor(() => expect(low.querySelector('ul > li')).not.toBeNull(), WAIT)
  return low.querySelector('ul') as HTMLUListElement
}
const rows = () => [...(getLow().querySelector('ul') as HTMLUListElement).children] as HTMLElement[]
const skus = () => rows().map(rowSkuByName)
const link = () => within(getLow()).getByRole('link', { name: LINK_NAME })
const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('Блок на телефоне (375 px)', () => {
  it('AC-1: на телефоне порядок тот же — KPI → график → «Скоро закончится» → топ', async () => {
    renderApp('/dashboard')
    const low = await findLow()
    const kpi = await screen.findByRole('region', { name: 'Ключевые показатели' })
    const chart = await screen.findByRole('region', { name: 'Продажи по дням' })
    const top = await screen.findByRole('region', { name: 'Топ-10 товаров' })

    expect(follows(kpi, chart)).toBe(true)
    expect(follows(chart, low)).toBe(true)
    expect(follows(low, top)).toBe(true)
    expect(within(low).getByRole('heading', { level: 2, name: 'Скоро закончится' })).toBeInTheDocument()
  })

  it('AC-3, AC-4: те же 5 строк ul > li с названием, площадкой, складом, «· шт · скорость», днями и статусом', async () => {
    renderApp('/dashboard')
    const list = await findList()

    expect(list.tagName).toBe('UL')
    expect(skus()).toEqual(DEFAULT_ROWS)
    for (const row of rows()) {
      const expected = EXPECTED_ROWS[rowSkuByName(row)]
      if (!expected) throw new Error(norm(row.textContent))
      for (const text of [expected.name, expected.mp, expected.warehouse, expected.days, expected.status]) {
        expect(elementsWithExactText(text, row), text).not.toHaveLength(0)
      }
      expect(norm(row.textContent)).toContain(expected.meta)
    }
    expect(norm(rows()[1]?.textContent)).toContain(`${MIDDOT} 20 шт ${MIDDOT} 6,1/день`)
  })

  it('AC-10: подзаголовок по числу строк и на телефоне', async () => {
    renderApp('/dashboard?mp=ozon')
    await findList()

    expect(elementsWithExactText(SUBTITLE.two, getLow())).not.toHaveLength(0)
  })

  it('AC-11: ссылка «Все остатки» на /stocks с фильтрами URL и на телефоне', async () => {
    renderApp('/dashboard?mp=wb&cat=shoes')
    await findList()

    const href = new URL(link().getAttribute('href') ?? '', 'http://localhost')
    expect(href.pathname).toBe('/stocks')
    expect(sortedParams(href.search)).toEqual([
      ['cat', 'shoes'],
      ['mp', 'wb'],
    ])
  })

  it('AC-12: загрузка — скелетон aria-busy, шапка и ссылка видны', async () => {
    mockStocks(async () => {
      await delay('infinite')
      return HttpResponse.json(stocksResponse())
    })
    renderApp('/dashboard')
    const low = await findLow()

    const busy = await within(low).findByLabelText(LOADING_LABEL)
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(elementsWithExactText(SUBTITLE.five, low)).not.toHaveLength(0)
    expect(link()).toBeInTheDocument()
    expect(low.querySelector('ul')).toBeNull()
  })
})

describe('Состояния на телефоне', () => {
  it('AC-13: «Сбросить фильтры» в блоке «Ничего не заканчивается» работает и на телефоне', async () => {
    const { user, router } = renderApp('/dashboard?cat=kids')
    const low = await findLow()
    await within(low).findByText(EMPTY_TITLE, {}, WAIT)
    expect(elementsWithExactText(EMPTY_TEXT, low)).not.toHaveLength(0)

    await user.click(within(low).getByRole('button', { name: 'Сбросить фильтры' }))

    await waitFor(() => expect(router.state.location.searchStr).toBe(''))
    await findList()
    expect(skus()).toEqual(DEFAULT_ROWS)
  })

  it('AC-14: ошибка — role="alert" с «Повторить», после успеха — список', async () => {
    let fail = true
    mockStocks((params) => (fail ? new HttpResponse(null, { status: 500 }) : defaultStocks(params)))
    const { user } = renderApp('/dashboard')
    const low = await findLow()
    const title = await within(low).findByText(ERROR_TITLE, {}, WAIT)
    const alert = title.closest<HTMLElement>('[role="alert"]')
    if (!alert) throw new Error('Нет role="alert"')
    expect(elementsWithExactText(ERROR_TEXT, alert)).not.toHaveLength(0)

    fail = false
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }))

    await findList()
    expect(skus()).toEqual(DEFAULT_ROWS)
    expect(skus()[0]).toBe(L.L1.sku)
  })
})
