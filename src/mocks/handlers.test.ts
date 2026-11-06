import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z, type ZodType } from 'zod'
import { metaResponseSchema } from '../entities/marketplace'
import { topProductsResponseSchema } from '../entities/product'
import { kpiResponseSchema, ordersResponseSchema, salesDailyResponseSchema } from '../entities/sale'
import { stocksResponseSchema } from '../entities/warehouse'
import * as sharedApi from '../shared/api'
import { generateRawData } from './generator'
import { createHandlers } from './handlers'

/*
 * HTTP-контракт фейкового BFF (spec 001, «Данные и API», «Контракт»).
 * Среда jsdom (по умолчанию): MSW сопоставляет относительные пути
 * обработчиков с location.origin.
 *
 * «Сейчас» — 04.11.2026 22:30 UTC, то есть 05.11.2026 01:30 по Москве:
 * «сегодня» должно быть 05.11, а не 04.11 (день по Москве).
 */

const NOW = new Date('2026-11-04T22:30:00Z')
const TODAY = '2026-11-05'
const SLOW = 180_000

const server = setupServer(
  ...createHandlers({ seed: 42, now: NOW }),
  // Последним — ловушка: сюда попадает только то, что не обработал BFF
  http.get('*', () => HttpResponse.json({ unhandled: true }, { status: 418 })),
)

beforeAll(async () => {
  server.listen({ onUnhandledFrame: 'error' })
  // Первый запрос прогревает генератор (может быть долгим)
  await get('/api/meta')
}, SLOW)
afterAll(() => server.close())

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(new URL(path, location.origin))
  return { status: response.status, body: await response.json() }
}

function parse<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) throw new Error(`ответ не по контракту: ${JSON.stringify(result.error.issues)}`)
  return result.data
}

const PERIOD = 'from=2026-10-05&to=2026-11-03'

// Тело ошибки по контракту: ровно { message }
const errorSchema = z.strictObject({ message: z.string() })

/**
 * Тело ошибки по контракту и docs/security.md: ровно { message }, на русском,
 * без стека, внутренних путей и эха ввода. `echo` — значения из запроса,
 * которых не должно быть в тексте. Возвращает текст для доп. проверок.
 */
function expectSafeError(body: unknown, echo: readonly string[] = []): string {
  expect(body).toEqual({ message: expect.any(String) })
  const { message } = parse(errorSchema, body)
  expect(message.length).toBeGreaterThan(0)
  // На русском
  expect(message).toMatch(/[А-Яа-яЁё]/)
  // Без технических деталей: стека, внутренних путей, имён классов ошибок
  expect(message).not.toMatch(/\s+at\s+\S+\s*\(|\.tsx?\b|node_modules|src\/|mocks\/|ZodError|TypeError|Error:/)
  // Ввод пользователя не отражается как есть (T3/T4)
  expect(message).not.toContain('<script>')
  for (const value of echo) expect(message).not.toContain(value)
  return message
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Эндпоинты с периодом и их схемы ответа
const periodEndpoints: [string, ZodType][] = [
  ['/api/kpi', kpiResponseSchema],
  ['/api/sales-daily', salesDailyResponseSchema],
  ['/api/top-products', topProductsResponseSchema],
  ['/api/orders', ordersResponseSchema],
]

const validRequests: [string, ZodType][] = [
  ['/api/meta', metaResponseSchema],
  [`/api/kpi?${PERIOD}`, kpiResponseSchema],
  [`/api/kpi?${PERIOD}&mp=wb&cat=shoes&cat=sports`, kpiResponseSchema],
  [`/api/sales-daily?${PERIOD}`, salesDailyResponseSchema],
  [`/api/sales-daily?${PERIOD}&mp=ozon&cat=electronics`, salesDailyResponseSchema],
  [`/api/top-products?${PERIOD}`, topProductsResponseSchema],
  [`/api/top-products?${PERIOD}&sort=profit&limit=5`, topProductsResponseSchema],
  ['/api/stocks', stocksResponseSchema],
  ['/api/stocks?mp=ozon&cat=electronics&status=critical&limit=10', stocksResponseSchema],
  [`/api/orders?${PERIOD}`, ordersResponseSchema],
  [
    `/api/orders?${PERIOD}&mp=wb&cat=clothing&q=${encodeURIComponent('а')}&status=bought&sort=price&dir=asc&offset=10&limit=20`,
    ordersResponseSchema,
  ],
]

describe('handlers', () => {
  describe('AC-23: валидные запросы → 200 и тело по zod-схеме из entities/*', () => {
    it.each(validRequests)('AC-23: GET %s', async (path, schema) => {
      const { status, body } = await get(path)

      expect(status).toBe(200)
      parse(schema, body)
    })

    it('AC-23: «сегодня» как границу периода можно запрашивать (to = сегодня по Москве)', async () => {
      const { status } = await get(`/api/kpi?from=2026-11-01&to=${TODAY}`)

      expect(status).toBe(200)
    })
  })

  describe('AC-24: невалидные параметры → 400 с { message } на русском, без стека', () => {
    it.each([
      ['дата не в формате ГГГГ-ММ-ДД (05.10.2026)', '/api/kpi?from=05.10.2026&to=2026-11-03'],
      ['дата без ведущего нуля (2026-10-5)', '/api/sales-daily?from=2026-10-5&to=2026-11-03'],
      ['мусор вместо даты', `/api/orders?from=${encodeURIComponent('<script>')}&to=2026-11-03`],
      ['from позже to', '/api/kpi?from=2026-11-03&to=2026-10-05'],
      ['to позже «сегодня»', '/api/kpi?from=2026-11-01&to=2026-11-06'],
      ['неизвестная площадка', `/api/kpi?${PERIOD}&mp=hack`],
      ['неизвестная площадка в остатках', '/api/stocks?mp=hack'],
      ['неизвестная категория', `/api/top-products?${PERIOD}&cat=weapons`],
      ['неизвестная категория рядом с известной', `/api/sales-daily?${PERIOD}&cat=shoes&cat=weapons`],
      ['limit заказов больше 200', `/api/orders?${PERIOD}&limit=201`],
      ['limit топа товаров больше 50', `/api/top-products?${PERIOD}&limit=51`],
    ])('AC-24: %s → 400', async (_title, path) => {
      const { status, body } = await get(path)

      expect(status).toBe(400)
      expectSafeError(body)
    })

    it.each([
      ['несуществующая дата (2026-02-30)', '/api/orders?from=2026-02-30&to=2026-03-05'],
      ['пустое from', '/api/kpi?from=&to=2026-11-03'],
      ['пустое from в заказах', '/api/orders?from=&to=2026-11-03'],
      ['пустое to', '/api/sales-daily?from=2026-10-05&to='],
      ['нет from', '/api/top-products?to=2026-11-03'],
      ['нет ни from, ни to', '/api/kpi'],
    ])('AC-24 / п. 13: %s → 400', async (_title, path) => {
      const { status, body } = await get(path)

      expect(status).toBe(400)
      expectSafeError(body)
    })
  })

  describe('AC-24 / п. 13: период и начало истории', () => {
    let historyFrom: string

    beforeAll(async () => {
      historyFrom = parse(metaResponseSchema, (await get('/api/meta')).body).historyFrom
    })

    it.each(periodEndpoints)(
      'AC-24 / п. 13: %s — from на день раньше historyFrom → 400 «За это время данных нет»',
      async (endpoint) => {
        const from = addDays(historyFrom, -1)
        const { status, body } = await get(`${endpoint}?from=${from}&to=${addDays(historyFrom, 29)}`)

        expect(status).toBe(400)
        const message = expectSafeError(body, [from])
        expect(message).toMatch(/За это время данных нет/)
      },
    )

    it('AC-24 / п. 13: ряд по дням с from далеко в прошлом (1900-01-01) → 400, а не сотни тысяч точек', async () => {
      const { status, body } = await get('/api/sales-daily?from=1900-01-01&to=2026-11-03')

      expect(status).toBe(400)
      const message = expectSafeError(body, ['1900-01-01'])
      expect(message).toMatch(/За это время данных нет/)
    })

    it.each(periodEndpoints)('AC-24 / п. 13: %s — from = historyFrom → 200 по контракту', async (endpoint, schema) => {
      const { status, body } = await get(`${endpoint}?from=${historyFrom}&to=${addDays(historyFrom, 29)}`)

      expect(status).toBe(200)
      parse(schema, body)
    })

    it('AC-24 / п. 13: прошлый период целиком до начала истории — 200, за те дни нули и null в долях', async () => {
      const to = addDays(historyFrom, 29)
      const kpi = parse(kpiResponseSchema, (await get(`/api/kpi?from=${historyFrom}&to=${to}`)).body)

      // 30 дней → прошлый период — 30 дней непосредственно перед historyFrom
      expect(kpi.previousPeriod).toEqual({ from: addDays(historyFrom, -30), to: addDays(historyFrom, -1) })
      // Первый заказ — в день historyFrom (п. 14), текущий период не пустой
      expect(kpi.current.ordersCount).toBeGreaterThan(0)
      expect(kpi.previous).toMatchObject({
        ordersCount: 0,
        ordersSum: 0,
        buyoutsCount: 0,
        revenue: 0,
        returnsCount: 0,
        returnsSum: 0,
        profit: 0,
        // AC-14: нет завершённых заказов, нет выкупов, выручка ≤ 0
        buyoutRate: null,
        avgCheck: null,
        margin: null,
      })

      const { days } = parse(salesDailyResponseSchema, (await get(`/api/sales-daily?from=${historyFrom}&to=${to}`)).body)
      expect(days).toHaveLength(30)
      for (const day of days) {
        expect(day.previousTotal).toEqual({ revenue: 0, ordersCount: 0, profit: 0 })
      }
    })

    it('AC-24 / п. 13: прошлый период частично до начала истории — 200, дни истории учтены', async () => {
      // 30 дней с historyFrom + 10 → прошлый период с historyFrom − 20 по historyFrom + 9
      const kpi = parse(
        kpiResponseSchema,
        (await get(`/api/kpi?from=${addDays(historyFrom, 10)}&to=${addDays(historyFrom, 39)}`)).body,
      )

      expect(kpi.previousPeriod).toEqual({ from: addDays(historyFrom, -20), to: addDays(historyFrom, 9) })
      expect(kpi.previous.ordersCount).toBeGreaterThan(0)
    })
  })

  describe('п. 13: пустое значение необязательного параметра — как его отсутствие', () => {
    it('п. 13: /api/orders с limit= → 200 и 50 строк, как без limit', async () => {
      const { status, body } = await get(`/api/orders?${PERIOD}&limit=`)
      const page = parse(ordersResponseSchema, body)

      expect(status).toBe(200)
      expect(page.items).toHaveLength(50)
      expect(page).toEqual(parse(ordersResponseSchema, (await get(`/api/orders?${PERIOD}`)).body))
    })

    it.each([
      [`/api/orders?${PERIOD}&q=&status=&sort=&dir=&offset=&limit=&mp=&cat=`, `/api/orders?${PERIOD}`],
      [`/api/kpi?${PERIOD}&mp=&cat=`, `/api/kpi?${PERIOD}`],
      [`/api/sales-daily?${PERIOD}&mp=&cat=`, `/api/sales-daily?${PERIOD}`],
      [`/api/top-products?${PERIOD}&sort=&limit=&mp=&cat=`, `/api/top-products?${PERIOD}`],
      ['/api/stocks?mp=&cat=&status=&limit=', '/api/stocks'],
    ])('п. 13: GET %s → 200 и то же тело, что без пустых параметров', async (withEmpty, plain) => {
      const empty = await get(withEmpty)
      const expected = await get(plain)

      expect(empty.status).toBe(200)
      expect(expected.status).toBe(200)
      expect(empty.body).toEqual(expected.body)
    })
  })

  describe('п. 18: «сейчас» из createHandlers', () => {
    it('п. 18: заказы «сегодня» — только оформленные не позже now (05.11 01:30 по Москве)', async () => {
      const page = parse(ordersResponseSchema, (await get(`/api/orders?from=${TODAY}&to=${TODAY}&limit=200`)).body)

      for (const item of page.items) {
        expect(Date.parse(item.orderedAt)).toBeLessThanOrEqual(NOW.getTime())
      }
    })
  })

  describe('AC-25: не больше 200 строк заказов в ответе', () => {
    it('AC-25: limit = 200 отдаёт ровно 200 строк, хотя заказов за историю больше', async () => {
      const meta = parse(metaResponseSchema, (await get('/api/meta')).body)
      const { body } = await get(`/api/orders?from=${meta.historyFrom}&to=${TODAY}&limit=200`)
      const page = parse(ordersResponseSchema, body)

      expect(page.total).toBeGreaterThan(200)
      expect(page.items).toHaveLength(200)
    })

    it('AC-25: без limit — 50 строк', async () => {
      const page = parse(ordersResponseSchema, (await get(`/api/orders?${PERIOD}`)).body)

      expect(page.items).toHaveLength(50)
    })
  })

  describe('AC-26: /api/meta', () => {
    it('AC-26: категории, площадки, «сегодня» по Москве, время обновления и начало истории', async () => {
      const meta = parse(metaResponseSchema, (await get('/api/meta')).body)

      expect(meta.today).toBe(TODAY)
      expect(meta.marketplaces).toEqual([
        { id: 'wb', name: 'WB' },
        { id: 'ozon', name: 'Ozon' },
      ])
      // productCount добавлен spec 002 (AC-24), его значения проверяются ниже
      expect(meta.categories).toEqual([
        { id: 'shoes', name: 'Обувь', productCount: expect.any(Number) },
        { id: 'clothing', name: 'Одежда', productCount: expect.any(Number) },
        { id: 'electronics', name: 'Электроника', productCount: expect.any(Number) },
        { id: 'beauty', name: 'Красота', productCount: expect.any(Number) },
        { id: 'home', name: 'Дом и кухня', productCount: expect.any(Number) },
        { id: 'sports', name: 'Спорт', productCount: expect.any(Number) },
        { id: 'kids', name: 'Детские товары', productCount: expect.any(Number) },
        { id: 'accessories', name: 'Аксессуары', productCount: expect.any(Number) },
      ])
      expect(Number.isNaN(Date.parse(meta.updatedAt))).toBe(false)
      expect(Date.parse(meta.updatedAt)).toBeLessThanOrEqual(NOW.getTime())
      // 24 месяца до 05.11.2026
      expect(meta.historyFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(meta.historyFrom >= '2024-11-04' && meta.historyFrom <= '2024-11-06').toBe(true)
    })
  })

  describe('spec 002, AC-24: число товаров у категорий в /api/meta', () => {
    // Каталог продавца при тех же seed и «сейчас», что у обработчиков
    let catalog: { sku: string; category: string }[]

    beforeAll(() => {
      catalog = generateRawData({ seed: 42, today: TODAY, now: NOW }).catalog
    }, SLOW)

    it('AC-24: ответ проходит обновлённую metaResponseSchema, productCount — целое ≥ 0 у каждой категории', async () => {
      const { status, body } = await get('/api/meta')
      const meta = parse(metaResponseSchema, body)

      expect(status).toBe(200)
      expect(meta.categories).toHaveLength(8)
      for (const category of meta.categories) {
        expect(Number.isInteger(category.productCount)).toBe(true)
        expect(category.productCount).toBeGreaterThanOrEqual(0)
      }
    })

    it('AC-24: productCount — число SKU каталога в категории', async () => {
      const meta = parse(metaResponseSchema, (await get('/api/meta')).body)

      for (const category of meta.categories) {
        const skus = new Set(catalog.filter((item) => item.category === category.id).map((item) => item.sku))
        expect({ id: category.id, productCount: category.productCount }).toEqual({
          id: category.id,
          productCount: skus.size,
        })
      }
    })

    it('AC-24: сумма productCount по категориям равна размеру каталога', async () => {
      const meta = parse(metaResponseSchema, (await get('/api/meta')).body)
      const sum = meta.categories.reduce((acc, category) => acc + category.productCount, 0)

      expect(sum).toBe(catalog.length)
    })
  })

  describe('эндпоинты на сгенерированных данных', () => {
    it('AC-15: /api/kpi для 05.10–03.11 — прошлый период 05.09–04.10', async () => {
      const result = parse(kpiResponseSchema, (await get(`/api/kpi?${PERIOD}`)).body)

      expect(result.period).toEqual({ from: '2026-10-05', to: '2026-11-03' })
      expect(result.previousPeriod).toEqual({ from: '2026-09-05', to: '2026-10-04' })
    })

    it('AC-17: /api/sales-daily — 30 точек, WB + Ozon = итог дня', async () => {
      const { days } = parse(salesDailyResponseSchema, (await get(`/api/sales-daily?${PERIOD}`)).body)

      expect(days).toHaveLength(30)
      for (const day of days) {
        expect(day.wb.revenue + day.ozon.revenue).toBeCloseTo(day.total.revenue, 2)
        expect(day.wb.ordersCount + day.ozon.ordersCount).toBe(day.total.ordersCount)
        expect(day.wb.profit + day.ozon.profit).toBeCloseTo(day.total.profit, 2)
      }
    })

    it('AC-19: /api/top-products по умолчанию — 10 товаров по выручке по убыванию', async () => {
      const { items } = parse(topProductsResponseSchema, (await get(`/api/top-products?${PERIOD}`)).body)

      expect(items).toHaveLength(10)
      for (let i = 1; i < items.length; i++) {
        expect(items[i - 1]?.revenue ?? 0).toBeGreaterThanOrEqual(items[i]?.revenue ?? 0)
      }
    })

    it('AC-20: /api/stocks — на «сегодня», фильтр по периоду не действует', async () => {
      const plain = parse(stocksResponseSchema, (await get('/api/stocks')).body)
      const withPeriod = parse(stocksResponseSchema, (await get('/api/stocks?from=2026-10-01&to=2026-10-02')).body)

      expect(plain.asOf).toBe(TODAY)
      expect(withPeriod).toEqual(plain)
    })

    it('AC-21: /api/stocks — по дням запаса по возрастанию, «нет продаж» в конце; счётчики не зависят от статуса', async () => {
      const all = parse(stocksResponseSchema, (await get('/api/stocks')).body)
      const critical = parse(stocksResponseSchema, (await get('/api/stocks?status=critical')).body)

      const days = all.items.map((i) => i.days)
      const firstNoSales = days.indexOf(null)
      const withDays = firstNoSales === -1 ? days : days.slice(0, firstNoSales)
      for (let i = 1; i < withDays.length; i++) {
        expect(withDays[i - 1] ?? 0).toBeLessThanOrEqual(withDays[i] ?? 0)
      }
      if (firstNoSales !== -1) expect(days.slice(firstNoSales).every((d) => d === null)).toBe(true)

      const { critical: c, soon, ok, noSales } = all.counts
      expect(c + soon + ok + noSales).toBe(all.total)
      expect(critical.counts).toEqual(all.counts)
      expect(critical.items.every((i) => i.status === 'critical')).toBe(true)
    })

    it('AC-22: /api/orders — по умолчанию по дате по убыванию; counts.all = total без фильтра статуса', async () => {
      const page = parse(ordersResponseSchema, (await get(`/api/orders?${PERIOD}`)).body)

      for (let i = 1; i < page.items.length; i++) {
        const prev = Date.parse(page.items[i - 1]?.orderedAt ?? '')
        const next = Date.parse(page.items[i]?.orderedAt ?? '')
        expect(prev).toBeGreaterThanOrEqual(next)
      }
      expect(page.counts.all).toBe(page.total)
    })
  })

  describe('AC-28: временный /api/health удалён', () => {
    it('AC-28: BFF не обрабатывает /api/health', async () => {
      const { status, body } = await get('/api/health')

      // 418 отдаёт ловушка в конце списка — значит, обработчика health нет
      expect(status).toBe(418)
      expect(body).toEqual({ unhandled: true })
    })

    it('AC-28: файла shared/api/health.ts нет, shared/api не экспортирует getHealth', () => {
      expect(Object.keys(import.meta.glob('../shared/api/health.ts'))).toEqual([])
      expect('getHealth' in sharedApi).toBe(false)
    })
  })
})
