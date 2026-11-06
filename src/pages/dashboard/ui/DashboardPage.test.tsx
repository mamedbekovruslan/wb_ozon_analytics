import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { handlers } from '../../../mocks/handlers'
import { DashboardPage } from './DashboardPage'

/*
 * Дымовой интеграционный тест страницы: связка Vitest + jsdom + Testing Library + MSW
 * (ADR-0009) с настоящим фейковым API. Spec 004 AC-3: временная проверка
 * «Фейковый API: работает / недоступен» удалена — страница показывает заголовок «Дашборд»
 * и KPI с числами из фейкового API (значит, /api/meta и /api/kpi отвечают).
 */

// Первый запрос запускает генерацию данных — ждём дольше обычного
const SLOW = 60_000

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderPage() {
  // Свой клиент на каждый тест: кэш не перетекает между тестами,
  // без повторов — ошибка видна сразу
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Панель фильтров и KPI читают URL — нужен роутер;
  // минимальный, чтобы тест слоя pages не зависел от app
  const router = createRouter({
    routeTree: createRootRoute({ component: DashboardPage }),
    history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
  })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const LABELS = ['Выручка', 'Заказы', 'Выкупы', '% выкупа', 'Возвраты', 'Средний чек', 'Прибыль', 'Маржа']

describe('DashboardPage', () => {
  it(
    'AC-3: заголовок «Дашборд», затем 8 KPI-карточек с числами из фейкового API',
    async () => {
      renderPage()

      expect(await screen.findByRole('heading', { level: 1, name: 'Дашборд' })).toBeInTheDocument()

      const region = await screen.findByRole('region', { name: 'Ключевые показатели' })
      await waitFor(() => expect(within(region).getAllByRole('article')).toHaveLength(8), { timeout: SLOW })
      const cards = within(region).getAllByRole('article')
      expect(cards.map((card) => within(card).getByRole('heading', { level: 3 }).textContent?.trim())).toEqual(LABELS)
      for (const card of cards) {
        // Под подписью — число из ответа API
        const withoutLabel = (card.textContent ?? '').replace(
          within(card).getByRole('heading', { level: 3 }).textContent ?? '',
          '',
        )
        expect(withoutLabel).toMatch(/\d/)
      }
    },
    SLOW,
  )

  it('AC-3: временного содержимого нет — ни проверки «Фейковый API», ни старого заголовка', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Дашборд' })

    expect(screen.queryByText(/Фейковый API/)).toBeNull()
    expect(screen.queryByText(/проверяем…/)).toBeNull()
    expect(screen.queryByText(/^работает$/)).toBeNull()
    expect(screen.queryByText(/^недоступен$/)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Аналитика продавца WB + Ozon' })).toBeNull()
  })

  it('AC-3: /api/meta вернул ошибку — на странице блок ошибки KPI, а не «недоступен»', async () => {
    server.use(http.get('/api/meta', () => new HttpResponse(null, { status: 500 })))
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Дашборд' })).toBeInTheDocument()
    const title = await screen.findByText('Не удалось загрузить показатели', {}, { timeout: 5000 })
    expect(title.closest('[role="alert"]')).not.toBeNull()
    expect(screen.queryByText(/недоступен/)).toBeNull()
  })

  it('AC-3: /api/meta ответил не по контракту — тоже блок ошибки', async () => {
    server.use(http.get('/api/meta', () => HttpResponse.json({ status: 'ok' })))
    renderPage()

    const title = await screen.findByText('Не удалось загрузить показатели', {}, { timeout: 5000 })
    expect(title.closest('[role="alert"]')).not.toBeNull()
  })
})
