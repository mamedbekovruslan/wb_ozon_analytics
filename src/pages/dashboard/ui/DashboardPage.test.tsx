import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { handlers } from '../../../mocks/handlers'
import { DashboardPage } from './DashboardPage'

/*
 * Дымовой интеграционный тест: доказывает, что связка
 * Vitest + jsdom + Testing Library + MSW (ADR-0009) работает.
 * С фичи 1 (AC-28) проверка идёт через /api/meta вместо удалённого /api/health.
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
  return render(
    <QueryClientProvider client={client}>
      <DashboardPage />
    </QueryClientProvider>,
  )
}

describe('DashboardPage (временная)', () => {
  it(
    'AC-28: показывает загрузку, затем «работает», когда /api/meta ответил',
    async () => {
      renderPage()

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Аналитика продавца WB + Ozon')
      expect(screen.getByText('проверяем…', { exact: false })).toBeInTheDocument()
      expect(await screen.findByText('работает', {}, { timeout: SLOW })).toBeInTheDocument()
    },
    SLOW,
  )

  it('AC-28: показывает «недоступен», когда /api/meta вернул ошибку', async () => {
    server.use(http.get('/api/meta', () => new HttpResponse(null, { status: 500 })))
    renderPage()

    expect(await screen.findByText('недоступен')).toBeInTheDocument()
  })

  it('AC-28: источник проверки — /api/meta, а не /api/health: health «жив», meta нет → «недоступен»', async () => {
    server.use(
      http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),
      http.get('/api/meta', () => new HttpResponse(null, { status: 500 })),
    )
    renderPage()

    expect(await screen.findByText('недоступен')).toBeInTheDocument()
  })

  it('AC-28: показывает «недоступен», когда /api/meta ответил не по контракту', async () => {
    server.use(http.get('/api/meta', () => HttpResponse.json({ status: 'ok' })))
    renderPage()

    expect(await screen.findByText('недоступен')).toBeInTheDocument()
  })
})
