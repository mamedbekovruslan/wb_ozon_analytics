import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { META_FIXTURE } from './filtersTestFixtures'
import { CARD_LABELS, createMatchMediaForWidth, EXPECTED_CARDS, kpiResponse, norm } from './kpiTestFixtures'
import { createAppRouter } from './router'

/*
 * Spec 004 «KPI-карточки» — телефон (375 px). Раскладка сетки (колонки, размеры)
 * проверяется в e2e/kpi.spec.ts; здесь — то, что видно в DOM: «было» на телефоне
 * не показывается (AC-14), остальное содержимое карточек на месте.
 */

const server = setupServer(
  http.get('/api/meta', () => HttpResponse.json(META_FIXTURE)),
  http.get('/api/kpi', () => HttpResponse.json(kpiResponse())),
  http.get('/api/*', () => HttpResponse.json({ message: 'Недоступно в тесте KPI' }, { status: 503 })),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  vi.stubGlobal('matchMedia', createMatchMediaForWidth(375))
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

async function findCards(): Promise<HTMLElement[]> {
  const region = await screen.findByRole('region', { name: 'Ключевые показатели' })
  await waitFor(() => expect(within(region).getAllByRole('article')).toHaveLength(8), { timeout: 5000 })
  return within(region).getAllByRole('article')
}

describe('KPI на телефоне (< 640 px)', () => {
  it('AC-14: 8 карточек со значением и бейджем, «было» скрыто', async () => {
    renderApp('/dashboard')
    const cards = await findCards()

    expect(cards.map((card) => norm(within(card).getByRole('heading', { level: 3 }).textContent))).toEqual([
      ...CARD_LABELS,
    ])
    for (const card of cards) {
      const label = norm(within(card).getByRole('heading', { level: 3 }).textContent) as (typeof CARD_LABELS)[number]
      expect(norm(card.textContent)).toContain(EXPECTED_CARDS[label].value)
      expect(within(card).getByText(EXPECTED_CARDS[label].delta)).toBeInTheDocument()
      expect(within(card).queryByText(/^было/)).toBeNull()
    }
  })

  it('AC-16: «Сбросить фильтры» в блоке «Нет данных» работает и на телефоне', async () => {
    server.use(
      http.get('/api/kpi', ({ request }) =>
        new URL(request.url).searchParams.get('mp') === 'ozon'
          ? HttpResponse.json(kpiResponse({ current: { ordersCount: 0, buyoutsCount: 0, returnsCount: 0 } }))
          : HttpResponse.json(kpiResponse()),
      ),
    )
    const { user, router } = renderApp('/dashboard?mp=ozon')
    const region = await screen.findByRole('region', { name: 'Ключевые показатели' })
    await within(region).findByText('Нет данных за период', {}, { timeout: 5000 })

    await user.click(within(region).getByRole('button', { name: 'Сбросить фильтры' }))

    await waitFor(() => expect(router.state.location.searchStr).toBe(''))
    await findCards()
  })
})
