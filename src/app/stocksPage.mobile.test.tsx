import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StockStatus } from '../entities/warehouse'
import { META_FIXTURE } from './filtersTestFixtures'
import { createMatchMediaForWidth, elementsWithExactText, norm } from './kpiTestFixtures'
import { emptyStocksResponse, L, rowSkuByName, type StockItem, stocksResponse } from './lowStockTestFixtures'
import { createAppRouter } from './router'
import { ResizeObserverStub } from './salesChartTestFixtures'
import { ALL_SKUS, manyItems, manyName, PAGE_ROWS, PAGE_TEXT, SKUS_BY_STATUS, STATUS_ORDER, STATUS_TEXT } from './stocksPageTestFixtures'

/*
 * Spec 008 «Страница «Остатки»» — телефон (375 px): карточки вместо таблицы и «Показать ещё».
 * Раскладка (плитки 2 × 2, поле 44, отступы), стили карточек и отсутствие горизонтальной
 * прокрутки — в e2e/stocks.spec.ts. Здесь — разметка, тексты, порядок, «Показать ещё» и состояния.
 */

const stockRequests: URLSearchParams[] = []

function defaultStocks(params: URLSearchParams) {
  return HttpResponse.json(stocksResponse({ mp: params.get('mp'), cat: params.getAll('cat'), limit: params.get('limit') }))
}

const server = setupServer(
  http.get('/api/meta', () => HttpResponse.json(META_FIXTURE)),
  http.get('/api/stocks', ({ request }) => {
    const params = new URL(request.url).searchParams
    stockRequests.push(params)
    return defaultStocks(params)
  }),
  http.get('/api/*', () => HttpResponse.json({ message: 'Недоступно в тесте страницы остатков' }, { status: 503 })),
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

const serveItems = (items: readonly StockItem[]) =>
  mockStocks((params) => HttpResponse.json(stocksResponse({ mp: params.get('mp'), cat: params.getAll('cat'), items })))

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

const getMain = () => screen.getByRole('main')
// Роутер рисует страницу асинхронно: до первого ожидания main ещё нет
const findMain = () => screen.findByRole('main', {}, WAIT)
const getList = () => screen.getByRole('list', { name: PAGE_TEXT.cards })
const cards = () => [...getList().children] as HTMLElement[]
const skus = () => cards().map(rowSkuByName)
const cardNames = () => cards().map((li) => norm(li.textContent).match(/Позиция \d{4}/)?.[0] ?? '?')

async function findCards(): Promise<HTMLElement[]> {
  await screen.findByRole('list', { name: PAGE_TEXT.cards }, WAIT)
  await waitFor(() => expect(cards().length).toBeGreaterThan(0), WAIT)
  return cards()
}

const moreButton = () => screen.queryByRole('button', { name: /^Показать ещё/ })
const moreText = () => norm(moreButton()?.textContent)

const tilesGroup = () => screen.getByRole('group', { name: PAGE_TEXT.tilesGroup })
function tile(status: StockStatus): HTMLElement {
  const found = within(tilesGroup())
    .getAllByRole('button')
    .filter((b) => norm(b.textContent).includes(STATUS_TEXT[status]))
  if (found.length !== 1) throw new Error(`Плитка «${STATUS_TEXT[status]}»: найдено ${found.length}`)
  return found[0] as HTMLElement
}
const getSearch = () => screen.getByLabelText(PAGE_TEXT.searchLabel) as HTMLInputElement

const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

function leaf(root: Element, text: string): HTMLElement {
  const all = elementsWithExactText(text, root)
  const innermost = all.find((el) => !all.some((other) => other !== el && el.contains(other)))
  if (!innermost) throw new Error(`Нет «${text}» в «${norm(root.textContent)}»`)
  return innermost
}

const hiddenIcons = (root: Element) =>
  [...root.querySelectorAll<HTMLElement>('[aria-hidden="true"]')].filter((el) => el.querySelector('svg') || el.tagName === 'svg')

/** Перебор адреса — как смена фильтров в листе «Фильтры» (сам лист проверен в spec 002). */
const goTo = (router: ReturnType<typeof createAppRouter>, href: string) => act(() => router.history.push(href))

// =====================================================================================

describe('Карточки на телефоне', () => {
  it('AC-17: вместо таблицы — ul «Остатки» с карточками li в порядке ответа', async () => {
    renderApp('/stocks')
    await findCards()

    expect(getList().tagName).toBe('UL')
    for (const li of cards()) expect(li.tagName).toBe('LI')
    expect(skus()).toEqual(ALL_SKUS)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('region', { name: PAGE_TEXT.section })).toBeNull()
  })

  it.each(PAGE_ROWS.map((r) => [r.name, r] as const))('AC-17: карточка «%s» — верх, сетка «Остаток / В день / Запас», низ', async (_name, expected) => {
    renderApp('/stocks')
    await findCards()

    const card = cards().find((li) => rowSkuByName(li) === expected.sku)
    if (!card) throw new Error(`Нет карточки ${expected.sku}`)

    const preview = hiddenIcons(card).find((el) => norm(el.textContent) === '')
    if (!preview) throw new Error('Нет заглушки-превью')
    const name = leaf(card, expected.name)
    const mp = leaf(card, expected.mp)
    const warehouse = leaf(card, expected.warehouse)
    const stockLabel = leaf(card, 'Остаток')
    const stock = leaf(card, expected.stock)
    const speedLabel = leaf(card, 'В день')
    const speed = leaf(card, expected.speed)
    const daysLabel = leaf(card, 'Запас')
    const days = leaf(card, expected.days)
    const status = leaf(card, expected.status)
    const chain = [preview, name, mp, warehouse, stockLabel, stock, speedLabel, speed, daysLabel, days, status]
    for (let i = 1; i < chain.length; i += 1) {
      expect(follows(chain[i - 1] as HTMLElement, chain[i] as HTMLElement), `${expected.sku}: порядок ${i}`).toBe(true)
    }

    if (expected.scheme) {
      const scheme = leaf(card, expected.scheme)
      expect(follows(mp, scheme)).toBe(true)
      expect(follows(scheme, warehouse)).toBe(true)
    } else {
      expect(elementsWithExactText('FBO', card)).toHaveLength(0)
      expect(elementsWithExactText('FBS', card)).toHaveLength(0)
    }

    // Низ: бейдж статуса и полоса запаса (aria-hidden, без текста и иконки)
    const bars = [...card.querySelectorAll('[aria-hidden="true"]')].filter(
      (el) => !el.querySelector('svg') && el.tagName !== 'svg' && norm(el.textContent) === '' && follows(status, el),
    )
    expect(bars.length, 'полоса запаса после бейджа статуса').toBeGreaterThan(0)
    expect(status.closest('[aria-hidden="true"]')).toBeNull()
    expect(card.querySelector('img')).toBeNull()
  })

  it('AC-17: карточки не фокусируются — внутри нет ссылок, кнопок и tabindex', async () => {
    renderApp('/stocks')
    await findCards()

    for (const li of cards()) expect(li.querySelectorAll('a[href], button, input, [tabindex]')).toHaveLength(0)
  })

  it('AC-5, AC-8, AC-9: на телефоне — те же плитки, поле поиска и счётчик', async () => {
    renderApp('/stocks')
    await findCards()

    expect(within(tilesGroup()).getAllByRole('button')).toHaveLength(4)
    expect(getSearch()).toHaveAttribute('type', 'search')
    const counter = [...getMain().querySelectorAll('[aria-live="polite"]')].find((el) => norm(el.textContent).startsWith(PAGE_TEXT.counterPrefix))
    expect(norm(counter?.textContent)).toBe(`${PAGE_TEXT.counterPrefix} 8`)
  })

  it('AC-6, AC-8: плитка и поиск фильтруют карточки', async () => {
    const { user } = renderApp('/stocks')
    await findCards()

    await user.click(tile('critical'))
    await waitFor(() => expect(skus()).toEqual(SKUS_BY_STATUS.critical))
    await user.click(tile('critical'))
    await user.type(getSearch(), 'хоругвино')
    await waitFor(() => expect(skus()).toEqual([L.L2.sku, L.L6.sku]))
  })
})

describe('Показать ещё', () => {
  it('AC-18: 8 строк и меньше — все карточки, кнопки нет', async () => {
    renderApp('/stocks')
    await findCards()

    expect(cards()).toHaveLength(8)
    expect(moreButton()).toBeNull()
  })

  it('AC-18: 30 строк — 8 карточек и «Показать ещё 20»; затем 28 и «Показать ещё 2»; затем 30 без кнопки', async () => {
    serveItems(manyItems(30))
    const { user } = renderApp('/stocks')
    await findCards()

    expect(cards()).toHaveLength(8)
    expect(cardNames()).toEqual(Array.from({ length: 8 }, (_, i) => manyName(i)))
    expect(moreText()).toBe('Показать ещё 20')

    await user.click(moreButton() as HTMLElement)
    await waitFor(() => expect(cards()).toHaveLength(28))
    expect(cardNames()).toEqual(Array.from({ length: 28 }, (_, i) => manyName(i)))
    expect(moreText()).toBe('Показать ещё 2')

    await user.click(moreButton() as HTMLElement)
    await waitFor(() => expect(cards()).toHaveLength(30))
    expect(moreButton()).toBeNull()
    expect(stockRequests).toHaveLength(1)
  })

  it('AC-18: 9 строк — «Показать ещё 1»', async () => {
    serveItems(manyItems(9))
    renderApp('/stocks')
    await findCards()

    expect(cards()).toHaveLength(8)
    expect(moreText()).toBe('Показать ещё 1')
  })

  it('AC-18: смена плитки возвращает к 8 — «Норма» (14 строк) → 8 и «Показать ещё 6»', async () => {
    serveItems(manyItems(30))
    const { user } = renderApp('/stocks')
    await findCards()
    await user.click(moreButton() as HTMLElement)
    await waitFor(() => expect(cards()).toHaveLength(28))

    await user.click(tile('ok'))

    await waitFor(() => expect(cards()).toHaveLength(8))
    expect(moreText()).toBe('Показать ещё 6')
  })

  it('AC-18: смена поиска возвращает к 8, даже если строк столько же', async () => {
    serveItems(manyItems(30))
    const { user } = renderApp('/stocks')
    await findCards()
    await user.click(moreButton() as HTMLElement)
    await waitFor(() => expect(cards()).toHaveLength(28))

    // «позиция 00» есть во всех 30 названиях
    await user.type(getSearch(), 'позиция 00')

    await waitFor(() => expect(cards()).toHaveLength(8))
    expect(moreText()).toBe('Показать ещё 20')
  })

  it('AC-18: смена площадки возвращает к 8 — WB (15 строк) → 8 и «Показать ещё 7»', async () => {
    serveItems(manyItems(30))
    const { user, router } = renderApp('/stocks')
    await findCards()
    await user.click(moreButton() as HTMLElement)
    await waitFor(() => expect(cards()).toHaveLength(28))

    await goTo(router, '/stocks?mp=wb')

    await waitFor(() => expect(cards()).toHaveLength(8), WAIT)
    expect(cardNames()[0]).toBe(manyName(0))
    expect(moreText()).toBe('Показать ещё 7')
  })

  it('AC-18: смена категорий возвращает к 8', async () => {
    serveItems(manyItems(30))
    const { user, router } = renderApp('/stocks')
    await findCards()
    await user.click(moreButton() as HTMLElement)
    await waitFor(() => expect(cards()).toHaveLength(28))

    // Все 30 позиций — в категории «Обувь»: строк столько же, но список снова с начала
    await goTo(router, '/stocks?cat=shoes')

    await waitFor(() => expect(stockRequests).toHaveLength(2))
    await waitFor(() => expect(cards()).toHaveLength(8), WAIT)
    expect(moreText()).toBe('Показать ещё 20')
  })
})

describe('Состояния на телефоне', () => {
  it('AC-19: ничего не найдено — блок вместо карточек, «Сбросить поиск и статус» возвращает список', async () => {
    const { user } = renderApp('/stocks')
    await findCards()

    await user.type(getSearch(), 'xyz')
    await screen.findByText(PAGE_TEXT.notFoundTitle, {}, WAIT)
    expect(screen.queryByRole('list', { name: PAGE_TEXT.cards })).toBeNull()
    expect(elementsWithExactText(PAGE_TEXT.notFoundText, getMain())).not.toHaveLength(0)

    await user.click(within(getMain()).getByRole('button', { name: PAGE_TEXT.notFoundButton }))
    await findCards()
    expect(getSearch()).toHaveValue('')
    expect(skus()).toEqual(ALL_SKUS)
  })

  it('AC-20: загрузка — aria-busy «Загружаем остатки», карточек нет, плитки без чисел', async () => {
    mockStocks(async () => {
      await delay('infinite')
      return HttpResponse.json(stocksResponse())
    })
    renderApp('/stocks')

    const busy = await within(await findMain()).findByLabelText(PAGE_TEXT.loading, {}, WAIT)
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(norm(busy.textContent)).toBe('')
    expect(screen.queryByRole('list', { name: PAGE_TEXT.cards })).toBeNull()
    expect(getSearch()).toBeEnabled()
    for (const status of STATUS_ORDER) expect(norm(tile(status).textContent)).not.toMatch(/^\d/)
  })

  it('AC-21: пусто — «На складах ничего нет» и «Сбросить фильтры», которая сбрасывает URL', async () => {
    mockStocks((params) => HttpResponse.json(params.get('mp') === 'wb' ? emptyStocksResponse() : stocksResponse()))
    const { user, router } = renderApp('/stocks?mp=wb')

    await within(await findMain()).findByText(PAGE_TEXT.emptyTitle, {}, WAIT)
    expect(elementsWithExactText(PAGE_TEXT.emptyText, getMain())).not.toHaveLength(0)
    expect(screen.queryByRole('list', { name: PAGE_TEXT.cards })).toBeNull()

    await user.click(within(getMain()).getByRole('button', { name: PAGE_TEXT.emptyButton }))
    await waitFor(() => expect(router.state.location.searchStr).toBe(''))
    expect(router.state.location.pathname).toBe('/stocks')
    await findCards()
  })

  it('AC-22: ошибка — role="alert" с «Повторить»; после успеха — карточки', async () => {
    let fail = true
    mockStocks((params) => (fail ? new HttpResponse(null, { status: 500 }) : defaultStocks(params)))
    const { user } = renderApp('/stocks')
    const title = await within(await findMain()).findByText(PAGE_TEXT.errorTitle, {}, WAIT)
    const alert = title.closest<HTMLElement>('[role="alert"]')
    if (!alert) throw new Error('Нет role="alert"')
    expect(elementsWithExactText(PAGE_TEXT.errorText, alert)).not.toHaveLength(0)

    fail = false
    await user.click(within(alert).getByRole('button', { name: PAGE_TEXT.retry }))

    await findCards()
    expect(skus()).toEqual(ALL_SKUS)
  })
})
