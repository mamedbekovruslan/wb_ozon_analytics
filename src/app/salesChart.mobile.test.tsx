import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { META_FIXTURE, MIDDOT } from './filtersTestFixtures'
import { createMatchMediaForWidth, elementsWithExactText, kpiResponse, norm } from './kpiTestFixtures'
import { createAppRouter } from './router'
import {
  bodyRows,
  emptyDay,
  EXPECTED,
  legendItems,
  ResizeObserverStub,
  salesDailyResponse,
} from './salesChartTestFixtures'

/*
 * Spec 005 «График продаж по дням» — телефон (375 px). Раскладка (переключатель на всю
 * ширину, сетка 3 колонки, высоты 40 / 180 / 240) проверяется в e2e/sales-chart.spec.ts;
 * здесь — что на телефоне то же содержимое и те же действия, что на десктопе.
 */

let salesRequests = 0

const server = setupServer(
  http.get('/api/meta', () => HttpResponse.json(META_FIXTURE)),
  http.get('/api/kpi', () => HttpResponse.json(kpiResponse())),
  http.get('/api/sales-daily', ({ request }) => {
    salesRequests += 1
    const params = new URL(request.url).searchParams
    return HttpResponse.json(salesDailyResponse({ from: params.get('from'), to: params.get('to'), mp: params.get('mp') }))
  }),
  http.get('/api/*', () => HttpResponse.json({ message: 'Недоступно в тесте графика' }, { status: 503 })),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  salesRequests = 0
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
const findChart = () => screen.findByRole('region', { name: 'Продажи по дням' })

describe('График на телефоне (< 640 px)', () => {
  it('AC-1, AC-3, AC-5, AC-15: секция, переключатель, легенда и таблица на месте', async () => {
    renderApp('/dashboard')
    const chart = await findChart()
    const table = await within(chart).findByRole('table', {}, WAIT)

    expect(within(chart).getByRole('heading', { level: 2, name: 'Продажи по дням' })).toBeInTheDocument()
    const group = within(chart).getByRole('group', { name: 'Метрика графика' })
    expect(within(group).getAllByRole('button').map((b) => norm(b.textContent))).toEqual(['Выручка', 'Заказы', 'Прибыль'])
    expect(within(group).getByRole('button', { name: 'Выручка' })).toHaveAttribute('aria-pressed', 'true')
    expect(legendItems(chart)).toEqual([`WB ${EXPECTED.Выручка.wb}`, `Ozon ${EXPECTED.Выручка.ozon}`, 'Прошлый период'])
    expect(bodyRows(table)).toHaveLength(30)
    expect(within(chart).getByRole('img', { name: /^Столбцы по дням/ })).toBeInTheDocument()
  })

  it('AC-3, AC-4: переключение на «Заказы» без нового запроса и на телефоне', async () => {
    const { user } = renderApp('/dashboard')
    const chart = await findChart()
    await within(chart).findByRole('table', {}, WAIT)

    await user.click(within(within(chart).getByRole('group', { name: 'Метрика графика' })).getByRole('button', { name: 'Заказы' }))

    expect(
      elementsWithExactText(`${EXPECTED.Заказы.total} за период ${MIDDOT} было ${EXPECTED.Заказы.prev}`, chart),
    ).not.toHaveLength(0)
    expect(salesRequests).toBe(1)
  })

  it('AC-16: «Сбросить фильтры» в блоке «Нет продаж за период» работает и на телефоне', async () => {
    server.use(
      http.get('/api/sales-daily', ({ request }) => {
        salesRequests += 1
        const params = new URL(request.url).searchParams
        const mp = params.get('mp')
        return HttpResponse.json(
          salesDailyResponse({ from: params.get('from'), to: params.get('to'), mp, map: mp === 'ozon' ? emptyDay : undefined }),
        )
      }),
    )
    const { user, router } = renderApp('/dashboard?mp=ozon')
    const chart = await findChart()
    await within(chart).findByText('Нет продаж за период', {}, WAIT)

    await user.click(within(chart).getByRole('button', { name: 'Сбросить фильтры' }))

    await waitFor(() => expect(router.state.location.searchStr).toBe(''))
    await within(await findChart()).findByRole('table', {}, WAIT)
  })
})
