import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { META_FIXTURE, MIDDOT } from './filtersTestFixtures'
import { createMatchMediaForWidth, elementsWithExactText, kpiResponse, norm } from './kpiTestFixtures'
import { createAppRouter } from './router'
import { ResizeObserverStub, salesDailyResponse } from './salesChartTestFixtures'
import {
  EXPECTED_ORDER,
  EXPECTED_VALUES,
  MOBILE_CYCLE,
  MOBILE_LABEL,
  NAME_BY_SKU,
  rowSku,
  SKU,
  SUBTITLE,
  topProductsResponse,
} from './topProductsTestFixtures'

/*
 * Spec 006 «Топ товаров» — телефон (375 px, < 640): карточки вместо таблицы и кнопка
 * сортировки в шапке блока. Размеры (превью 44, кнопка 44, сетка 2 × 2, шрифты) —
 * в e2e/top-products.spec.ts; здесь — разметка, тексты, перебор метрик и запросы.
 */

const topRequests: URLSearchParams[] = []

function defaultTop(params: URLSearchParams) {
  return HttpResponse.json(
    topProductsResponse({ sort: params.get('sort'), limit: params.get('limit'), mp: params.get('mp') }),
  )
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
    topRequests.push(params)
    return defaultTop(params)
  }),
  http.get('/api/*', () => HttpResponse.json({ message: 'Недоступно в тесте топа' }, { status: 503 })),
)

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
const TOP = { name: 'Топ-10 товаров' } as const
const findTop = () => screen.findByRole('region', TOP)
const getTop = () => screen.getByRole('region', TOP)

/** Список карточек (ol) после загрузки. */
async function findList(): Promise<HTMLOListElement> {
  const top = await findTop()
  await waitFor(() => expect(top.querySelector('ol')).not.toBeNull(), WAIT)
  return top.querySelector('ol') as HTMLOListElement
}
const getList = () => {
  const list = getTop().querySelector('ol')
  if (!list) throw new Error('Нет списка карточек ol')
  return list
}
const cards = () => [...getList().children].filter((el): el is HTMLLIElement => el.tagName === 'LI')
const cardSkus = () => cards().map(rowSku)
const cardBySku = (sku: string) => {
  const card = cards().find((li) => rowSku(li) === sku)
  if (!card) throw new Error(`Нет карточки с артикулом ${sku}`)
  return card
}

/** Пары «подпись → значение» из dl карточки. */
function definitions(card: HTMLElement): [string, string][] {
  const dl = card.querySelector('dl')
  if (!dl) throw new Error(`В карточке нет dl: ${norm(card.textContent)}`)
  const terms = [...dl.querySelectorAll('dt')].map((dt) => norm(dt.textContent))
  const values = [...dl.querySelectorAll('dd')].map((dd) => norm(dd.textContent))
  expect(values).toHaveLength(terms.length)
  return terms.map((t, i) => [t, values[i] as string])
}

const sortCycleButton = () => within(getTop()).getByRole('button', { name: /^Сменить сортировку, сейчас:/ })

function expectSubtitle(text: string): void {
  expect(elementsWithExactText(text, getTop()), norm(getTop().textContent)).not.toHaveLength(0)
}

describe('Карточки на телефоне (< 640 px)', () => {
  it('AC-10: вместо таблицы — список ol, карточка на каждый товар в порядке ответа; таблицы нет', async () => {
    renderApp('/dashboard')
    const list = await findList()

    expect(list.tagName).toBe('OL')
    expect(cards()).toHaveLength(10)
    expect(cardSkus()).toEqual(EXPECTED_ORDER.revenue)
    expect(within(getTop()).queryByRole('table')).toBeNull()
    expect(within(getTop()).queryAllByRole('columnheader')).toEqual([])
  })

  it('AC-10: карточка — название, «№{#} · Арт. {sku}», бейдж площадки, превью aria-hidden', async () => {
    renderApp('/dashboard')
    await findList()

    cards().forEach((card, i) => {
      const sku = EXPECTED_ORDER.revenue[i] as string
      expect(elementsWithExactText(NAME_BY_SKU[sku] as string, card), `название ${sku}`).not.toHaveLength(0)
      expect(elementsWithExactText(`№${i + 1} ${MIDDOT} Арт. ${sku}`, card), norm(card.textContent)).not.toHaveLength(0)
      expect(elementsWithExactText(EXPECTED_VALUES[sku]?.mp as string, card), `бейдж ${sku}`).not.toHaveLength(0)
      const previews = [...card.querySelectorAll<HTMLElement>('[aria-hidden="true"]')].filter((el) => el.querySelector('svg'))
      expect(previews.length, `превью ${sku}`).toBeGreaterThan(0)
      for (const preview of previews) expect(norm(preview.textContent)).toBe('')
    })
  })

  it('AC-10: dl 2 × 2 — «Выручка», «Прибыль», «Заказы», «% выкупа» со значениями в форматах ru-RU', async () => {
    renderApp('/dashboard')
    await findList()

    for (const sku of EXPECTED_ORDER.revenue) {
      const v = EXPECTED_VALUES[sku]
      if (!v) throw new Error(sku)
      expect(definitions(cardBySku(sku)), sku).toEqual([
        ['Выручка', v.revenue],
        ['Прибыль', v.profit],
        ['Заказы', v.orders],
        ['% выкупа', v.buyout],
      ])
    }
  })

  it('AC-10, AC-5: % выкупа null — «—» и скрытый текст «нет данных»', async () => {
    const { user } = renderApp('/dashboard')
    await findList()

    // revenue → profit → orders: в топе по заказам есть P8 без % выкупа
    await user.click(sortCycleButton())
    await waitFor(() => expect(cardSkus()).toEqual(EXPECTED_ORDER.profit), WAIT)
    await user.click(sortCycleButton())
    await waitFor(() => expect(cardSkus()).toEqual(EXPECTED_ORDER.orders), WAIT)

    const card = cardBySku(SKU.P8)
    const dds = [...card.querySelectorAll('dd')]
    const buyout = dds[3] as HTMLElement
    expect(norm(buyout.textContent)).toMatch(/^—\s*нет данных$/)
    expect(within(buyout).getByText('нет данных').closest('.sr-only')).not.toBeNull()
    expect(elementsWithExactText(`№7 ${MIDDOT} Арт. ${SKU.P8}`, card)).not.toHaveLength(0)
  })
})

describe('Кнопка сортировки на телефоне', () => {
  it('AC-11: на 375 в блоке одна кнопка — смена сортировки (заголовков-кнопок нет)', async () => {
    renderApp('/dashboard')
    await findList()

    const buttons = within(getTop()).getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toBe(sortCycleButton())
  })

  it('AC-11: кнопка «По выручке» с aria-label «Сменить сортировку, сейчас: По выручке»; стрелка aria-hidden', async () => {
    renderApp('/dashboard')
    await findList()

    const button = sortCycleButton()
    expect(button).toHaveAccessibleName('Сменить сортировку, сейчас: По выручке')
    expect(norm(button.textContent)).toBe('По выручке')
    const svgs = [...button.querySelectorAll('svg')]
    expect(svgs.length).toBeGreaterThan(0)
    for (const svg of svgs) expect(svg.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('AC-11: нажатия перебирают метрики по кругу revenue → profit → orders → buyoutRate → revenue, всегда по убыванию', async () => {
    const { user } = renderApp('/dashboard')
    await findList()

    const steps = [...MOBILE_CYCLE.slice(1), MOBILE_CYCLE[0]] as typeof MOBILE_CYCLE
    for (const sort of steps) {
      await user.click(sortCycleButton())

      await waitFor(() => expect(sortCycleButton()).toHaveAccessibleName(`Сменить сортировку, сейчас: ${MOBILE_LABEL[sort]}`))
      expect(norm(sortCycleButton().textContent)).toBe(MOBILE_LABEL[sort])
      await waitFor(() => expect(cardSkus()).toEqual(EXPECTED_ORDER[sort]), WAIT)
      expectSubtitle(SUBTITLE[sort])
      // Номера — по показанному порядку
      cards().forEach((card, i) => expect(norm(card.textContent)).toContain(`№${i + 1} ${MIDDOT} Арт.`))
    }
    // По одному запросу на каждую новую метрику: profit, orders, buyoutRate (выручка — из кэша или заново)
    expect(topRequests.map((p) => p.get('sort')).slice(0, 4)).toEqual(['revenue', 'profit', 'orders', 'buyoutRate'])
  })

  it('AC-11, AC-2: запрос новой метрики — с sort и limit=10, фильтры те же', async () => {
    const { user } = renderApp('/dashboard?mp=ozon')
    await findList()

    await user.click(sortCycleButton())

    await waitFor(() => expect(topRequests).toHaveLength(2))
    const params = topRequests[1] as URLSearchParams
    expect(params.get('sort')).toBe('profit')
    expect(params.get('limit')).toBe('10')
    expect(params.get('mp')).toBe('ozon')
  })

  it('AC-14: на телефоне загрузка — скелетон aria-busy, подзаголовок виден, карточек нет', async () => {
    mockTop(async () => {
      await delay('infinite')
      return HttpResponse.json(topProductsResponse())
    })
    renderApp('/dashboard')
    const top = await findTop()

    await within(top).findByLabelText('Загружаем топ товаров')
    expect(top.querySelector('[aria-label="Загружаем топ товаров"]')).toHaveAttribute('aria-busy', 'true')
    expectSubtitle(SUBTITLE.revenue)
    expect(top.querySelector('ol')).toBeNull()
  })
})

describe('Состояния на телефоне', () => {
  it('AC-15: «Сбросить фильтры» в блоке «Нет продаж за период» работает и на телефоне', async () => {
    mockTop((params) => (params.get('mp') === 'ozon' ? HttpResponse.json({ items: [] }) : defaultTop(params)))
    const { user, router } = renderApp('/dashboard?mp=ozon')
    const top = await findTop()
    await within(top).findByText('Нет продаж за период', {}, WAIT)
    expect(elementsWithExactText('Топ появится, когда будет хотя бы один выкуп.', top)).not.toHaveLength(0)

    await user.click(within(top).getByRole('button', { name: 'Сбросить фильтры' }))

    await waitFor(() => expect(router.state.location.searchStr).toBe(''))
    await findList()
    expect(cardSkus()).toEqual(EXPECTED_ORDER.revenue)
  })

  it('AC-16: ошибка — блок role="alert" с «Повторить» и на телефоне', async () => {
    let fail = true
    mockTop((params) => (fail ? new HttpResponse(null, { status: 500 }) : defaultTop(params)))
    const { user } = renderApp('/dashboard')
    const top = await findTop()
    const title = await within(top).findByText('Не удалось загрузить товары', {}, WAIT)
    const alert = title.closest<HTMLElement>('[role="alert"]')
    if (!alert) throw new Error('Нет role="alert"')

    fail = false
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }))

    await findList()
    expect(cardSkus()).toEqual(EXPECTED_ORDER.revenue)
  })
})
