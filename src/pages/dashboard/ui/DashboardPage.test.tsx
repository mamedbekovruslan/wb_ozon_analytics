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
 * Уйдёт вместе с временной страницей и /api/health в фиче 1.
 */

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
  it('показывает загрузку, затем «работает», когда фейковый API ответил', async () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Аналитика продавца WB + Ozon')
    expect(screen.getByText('проверяем…', { exact: false })).toBeInTheDocument()
    expect(await screen.findByText('работает')).toBeInTheDocument()
  })

  it('показывает «недоступен», когда API вернул ошибку', async () => {
    server.use(http.get('/api/health', () => new HttpResponse(null, { status: 500 })))
    renderPage()

    expect(await screen.findByText('недоступен')).toBeInTheDocument()
  })
})
