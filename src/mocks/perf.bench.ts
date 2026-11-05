// @vitest-environment node
// Замеры фейкового BFF (ADR-0004, ADR-0009): цель — < 100 мс на запрос на
// прогретых данных. Запуск вручную: npx vitest bench --run src/mocks/perf.bench.ts
// В обычный `npm test` и CI не входит.
import { describe, it } from 'vitest'
import { kpi, ordersPage, salesDaily, stocks, topProducts } from './aggregators'
import { generateRawData } from './generator'
import { ozonAdapter } from './ozon'
import { wbAdapter } from './wb'

const TODAY = '2026-11-05'

describe('фейковый BFF', () => {
  it('первая генерация и эндпоинты на прогретых данных', { timeout: 600_000 }, async ({ bench }) => {
    // Генерация — один раз при первом запросе: меряем прямо, без повторов
    const started = performance.now()
    const raw = generateRawData({ seed: 1, today: TODAY })
    const wb = wbAdapter(raw.wb, raw.catalog)
    const ozon = ozonAdapter(raw.ozon, raw.catalog)
    console.log(`генерация + адаптеры: ${Math.round(performance.now() - started)} мс`)

    const orders = [...wb.orders, ...ozon.orders]
    const stockRows = [...wb.stocks, ...ozon.stocks]
    const month = { from: '2026-10-07', to: TODAY, mp: 'all' as const, cat: [] }
    const year = { from: '2025-11-06', to: TODAY, mp: 'all' as const, cat: [] }

    await bench.compare(
      bench('/api/kpi, 30 дней', () => void kpi(orders, month)),
      bench('/api/kpi, год', () => void kpi(orders, year)),
      bench('/api/sales-daily, год', () => void salesDaily(orders, year)),
      bench('/api/top-products, 30 дней', () => void topProducts(orders, month)),
      bench('/api/stocks', () => void stocks(stockRows, orders, { today: TODAY, mp: 'all', cat: [] })),
      bench('/api/orders, год, поиск', () => void ordersPage(orders, { ...year, q: 'куртка' })),
      bench('/api/orders, вся история', () => void ordersPage(orders, { from: '2024-11-05', to: TODAY, mp: 'all', cat: [] })),
    )
  })
})
