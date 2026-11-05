// @vitest-environment node
import type { ZodType } from 'zod'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Order } from '../domain'
import { ozonAdapter, ozonRawSchemas } from '../ozon'
import { wbAdapter, wbRawSchemas } from '../wb'
import { generateRawData } from './index'

/*
 * Генератор: детерминизм по seed, стабильность прошлых дней, объём и
 * правдоподобие данных, форма сырых записей по docs/domain/*.
 * Генерация ~100 тыс. заказов дорогая — делаем её один раз на файл.
 */

type RawData = ReturnType<typeof generateRawData>

const SEED = 20_261_105
const TODAY = '2026-11-05'
// Через месяц: заказы 03.11 к этому дню старше 30 дней
const LATER_TODAY = '2026-12-05'
const SLOW = 180_000

const CATEGORY_IDS = ['accessories', 'beauty', 'clothing', 'electronics', 'home', 'kids', 'shoes', 'sports']

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function toOrders(raw: RawData): Order[] {
  return [...wbAdapter(raw.wb, raw.catalog).orders, ...ozonAdapter(raw.ozon, raw.catalog).orders]
}

/** % выкупа по итогу заказов: выкуплены / (выкуплены + отменены + возвращены) × 100 (docs/domain.md). */
function buyoutRateOf(orders: readonly Order[]): number {
  let bought = 0
  let completed = 0
  for (const o of orders) {
    if (o.outcome === 'inTransit') continue
    completed++
    if (o.outcome === 'bought') bought++
  }
  return (bought / completed) * 100
}

/** Первая запись, не прошедшая схему: индекс и текст ошибки, иначе null. */
function firstInvalid(schema: ZodType, items: readonly unknown[]): { index: number; issues: string } | null {
  for (let i = 0; i < items.length; i++) {
    const result = schema.safeParse(items[i])
    if (!result.success) return { index: i, issues: JSON.stringify(result.error.issues) }
  }
  return null
}

function eventDates(o: Order): string[] {
  return [o.orderDate, o.boughtOn, o.cancelledOn, o.returnedOn, ...o.logistics.map((l) => l.date)].filter(
    (d): d is string => d !== null,
  )
}

/** «Личность» заказа — то, что не меняется со временем (AC-2): всё, кроме статуса и событий. */
const identity = (o: Order) => ({
  id: o.id,
  marketplace: o.marketplace,
  scheme: o.scheme,
  sku: o.sku,
  warehouse: o.warehouse,
  price: o.price,
  orderedAt: o.orderedAt,
})

/** «Сегодня» минус 24 месяца (п. 14): 05.11.2028 → 05.11.2026. */
function historyFromOf(today: string): string {
  return `${Number(today.slice(0, 4)) - 2}${today.slice(4)}`
}

let raw: RawData
let orders: Order[]

beforeAll(() => {
  raw = generateRawData({ seed: SEED, today: TODAY })
  orders = toOrders(raw)
}, SLOW)

describe('generateRawData', () => {
  describe('AC-1: детерминизм', () => {
    it(
      'AC-1: одинаковые seed и «сегодня» дают полностью одинаковые данные',
      () => {
        const again = generateRawData({ seed: SEED, today: TODAY })

        // Сравнение строк, а не toEqual: diff на сотнях тысяч записей нечитаем
        const same = JSON.stringify(again) === JSON.stringify(raw)
        expect(same).toBe(true)
      },
      SLOW,
    )

    it(
      'AC-1: другой seed даёт другие данные (генератор действительно зависит от seed)',
      () => {
        const other = generateRawData({ seed: SEED + 1, today: TODAY })

        expect(JSON.stringify(other.wb.orderFeed) === JSON.stringify(raw.wb.orderFeed)).toBe(false)
      },
      SLOW,
    )
  })

  describe('AC-2: прошлые дни не меняются при сдвиге «сегодня»', () => {
    let laterOrders: Order[]

    beforeAll(() => {
      laterOrders = toOrders(generateRawData({ seed: SEED, today: LATER_TODAY }))
    }, SLOW)

    const ofDay = (list: readonly Order[], day: string) =>
      list
        .filter((o) => o.orderDate === day)
        .map(identity)
        .sort((a, b) => a.id.localeCompare(b.id))

    it.each([
      // позавчера: многие заказы ещё в пути
      addDays(TODAY, -2),
      // давно: всё завершено
      '2025-06-15',
    ])('AC-2: заказы дня %s совпадают (номера, товары, цены, склады) при «сегодня» на месяц позже', (day) => {
      const before = ofDay(orders, day)
      const after = ofDay(laterOrders, day)

      expect(before.length).toBeGreaterThan(0)
      expect(after).toEqual(before)
    })

    it('AC-2: у заказов, бывших «в пути», через месяц есть итог — меняется только статус', () => {
      const day = addDays(TODAY, -2)
      const laterById = new Map(laterOrders.map((o) => [o.id, o]))
      const wasInTransit = orders.filter((o) => o.orderDate === day && o.outcome === 'inTransit')

      expect(wasInTransit.length).toBeGreaterThan(0)
      for (const o of wasInTransit) {
        expect(laterById.get(o.id)?.outcome).not.toBe('inTransit')
      }
    })
  })

  describe('AC-3: объём и состав', () => {
    it('AC-3: 90–110 тыс. заказов', () => {
      expect(orders.length).toBeGreaterThanOrEqual(90_000)
      expect(orders.length).toBeLessThanOrEqual(110_000)
    })

    it('AC-3: 380–420 SKU в каталоге, все заказы — по товарам каталога', () => {
      expect(raw.catalog.length).toBeGreaterThanOrEqual(380)
      expect(raw.catalog.length).toBeLessThanOrEqual(420)
      const catalogSkus = new Set(raw.catalog.map((item) => item.sku))
      expect(orders.find((o) => !catalogSkus.has(o.sku))).toBeUndefined()
    })

    it('AC-3: ровно 8 категорий из макета', () => {
      expect([...new Set(orders.map((o) => o.category))].sort()).toEqual(CATEGORY_IDS)
    })

    it('AC-3: обе площадки и не меньше 10 складов', () => {
      expect(new Set(orders.map((o) => o.marketplace))).toEqual(new Set(['wb', 'ozon']))
      expect(new Set(orders.map((o) => o.warehouse)).size).toBeGreaterThanOrEqual(10)
    })

    it('AC-3: история — 24 месяца до «сегодня»', () => {
      const dates = orders.map((o) => o.orderDate).sort()

      // 24 месяца до 05.11.2026 — 05.11.2024; первые заказы — в первые дни окна
      expect(dates[0] >= '2024-11-05').toBe(true)
      expect(dates[0] <= '2024-11-12').toBe(true)
      expect(dates[dates.length - 1] <= TODAY).toBe(true)
      expect(dates[dates.length - 1] >= addDays(TODAY, -1)).toBe(true)
    })
  })

  describe('AC-4: % выкупа по категориям', () => {
    it('AC-4: «Одежда» — 30–60 %', () => {
      const rate = buyoutRateOf(orders.filter((o) => o.category === 'clothing'))

      expect(rate).toBeGreaterThanOrEqual(30)
      expect(rate).toBeLessThanOrEqual(60)
    })

    it('AC-4: «Электроника» — 85–95 %', () => {
      const rate = buyoutRateOf(orders.filter((o) => o.category === 'electronics'))

      expect(rate).toBeGreaterThanOrEqual(85)
      expect(rate).toBeLessThanOrEqual(95)
    })
  })

  describe('AC-5: схемы FBO / FBS', () => {
    it('AC-5: у Ozon есть отправления и FBO, и FBS', () => {
      expect(raw.ozon.fboPostings.length).toBeGreaterThan(0)
      expect(raw.ozon.fbsPostings.length).toBeGreaterThan(0)
      const schemes = new Set(orders.filter((o) => o.marketplace === 'ozon').map((o) => o.scheme))
      expect(schemes).toEqual(new Set(['FBO', 'FBS']))
    })

    it('AC-5: у WB все заказы со склада WB (isMp = false), схема в доменной модели — null', () => {
      expect(raw.wb.orderFeed.every((o) => o.isMp === false)).toBe(true)
      expect(orders.filter((o) => o.marketplace === 'wb').every((o) => o.scheme === null)).toBe(true)
    })
  })

  describe('AC-6: события и «сегодня»', () => {
    it('AC-6: ни одно событие (заказ, выкуп, отмена, возврат, логистика) не позже «сегодня»', () => {
      const late = orders.find((o) => eventDates(o).some((d) => d > TODAY))

      expect(late).toBeUndefined()
    })

    it('AC-6: среди заказов последних 7 дней есть незавершённые', () => {
      const weekStart = addDays(TODAY, -6)

      expect(orders.some((o) => o.orderDate >= weekStart && o.outcome === 'inTransit')).toBe(true)
    })

    it('AC-6: заказы старше 30 дней все завершены', () => {
      // старше 30 дней: дата заказа раньше «сегодня − 30»
      const border = addDays(TODAY, -30)
      const stuck = orders.find((o) => o.orderDate < border && o.outcome === 'inTransit')

      expect(stuck).toBeUndefined()
    })

    it('AC-6: события идут в правильном порядке: заказ ≤ выкуп ≤ возврат, заказ ≤ отмена', () => {
      const broken = orders.find(
        (o) =>
          (o.boughtOn !== null && o.boughtOn < o.orderDate) ||
          (o.cancelledOn !== null && o.cancelledOn < o.orderDate) ||
          (o.returnedOn !== null && (o.boughtOn === null || o.returnedOn < o.boughtOn)),
      )

      expect(broken).toBeUndefined()
    })
  })

  describe('AC-7: сырые записи WB по docs/domain/wb-api.md', () => {
    it('AC-7: каждая запись ленты заказов проходит wbRawSchemas.orderFeedOrder', () => {
      expect(raw.wb.orderFeed.length).toBeGreaterThan(0)
      expect(firstInvalid(wbRawSchemas.orderFeedOrder, raw.wb.orderFeed)).toBeNull()
    })

    it('AC-7: каждая строка отчёта реализации проходит wbRawSchemas.salesReportRow', () => {
      expect(raw.wb.salesReport.length).toBeGreaterThan(0)
      expect(firstInvalid(wbRawSchemas.salesReportRow, raw.wb.salesReport)).toBeNull()
    })

    it('AC-7: каждая строка остатков проходит wbRawSchemas.stockItem', () => {
      expect(raw.wb.stocks.length).toBeGreaterThan(0)
      expect(firstInvalid(wbRawSchemas.stockItem, raw.wb.stocks)).toBeNull()
    })

    it('AC-7: моменты ленты заказов — с поясом +03:00', () => {
      expect(raw.wb.orderFeed.every((o) => o.createdAt.endsWith('+03:00') && o.updatedAt.endsWith('+03:00'))).toBe(true)
    })

    it('AC-7: схемы не пропускают запись с неверными типами (nmId строкой, сумма отчёта числом)', () => {
      const [order] = raw.wb.orderFeed
      const [row] = raw.wb.salesReport

      expect(wbRawSchemas.orderFeedOrder.safeParse({ ...order, nmId: String(order?.nmId) }).success).toBe(false)
      // В отчёте реализации суммы — строки ("376.99")
      expect(wbRawSchemas.salesReportRow.safeParse({ ...row, retailPriceWithDisc: 376.99 }).success).toBe(false)
    })
  })

  describe('AC-8: сырые записи Ozon по docs/domain/ozon-api.md', () => {
    it.each([
      ['fboPostings', 'fboPosting'],
      ['fbsPostings', 'fbsPosting'],
      ['returns', 'returnItem'],
      ['accruals', 'accrual'],
      ['fboStocks', 'fboStockItem'],
      ['fbsStocks', 'fbsStockItem'],
      ['statusLog', 'statusLogEntry'],
    ] as const)('AC-8: каждая запись ozon.%s проходит ozonRawSchemas.%s', (list, schema) => {
      const items: readonly unknown[] = raw.ozon[list]

      expect(items.length).toBeGreaterThan(0)
      expect(firstInvalid(ozonRawSchemas[schema], items)).toBeNull()
    })

    it('AC-8: моменты времени отправлений — в UTC (Z)', () => {
      expect(raw.ozon.fboPostings.every((p) => p.created_at.endsWith('Z'))).toBe(true)
      expect(raw.ozon.fbsPostings.every((p) => p.in_process_at.endsWith('Z'))).toBe(true)
    })

    it('AC-8: схемы не пропускают запись с неверными типами (цена числом, нет даты создания)', () => {
      const [posting] = raw.ozon.fboPostings
      const [accrual] = raw.ozon.accruals

      expect(ozonRawSchemas.fboPosting.safeParse({ ...posting, created_at: undefined }).success).toBe(false)
      // Суммы начислений — строки в объектах { amount, currency }
      expect(ozonRawSchemas.accrual.safeParse({ ...accrual, total_amount: 100 }).success).toBe(false)
    })
  })

  describe('п. 17: в отправлениях Ozon ровно одна единица товара', () => {
    it('п. 17: каждое отправление FBO и FBS — один товар с quantity = 1', () => {
      const postings = [...raw.ozon.fboPostings, ...raw.ozon.fbsPostings]
      const multi = postings.find((p) => p.products.length !== 1 || p.products[0]?.quantity !== 1)

      expect(multi).toBeUndefined()
    })
  })

  describe('п. 18: «сейчас» (now) внутри дня «сегодня»', () => {
    // 05.11.2026 10:00 по Москве
    const NOW = new Date(`${TODAY}T10:00:00+03:00`)
    const isAfterNow = (iso: string) => Date.parse(iso) > NOW.getTime()

    let nowRaw: RawData
    let nowOrders: Order[]

    beforeAll(() => {
      nowRaw = generateRawData({ seed: SEED, today: TODAY, now: NOW })
      nowOrders = toOrders(nowRaw)
    }, SLOW)

    it('п. 18: после адаптеров нет заказов, оформленных позже now', () => {
      expect(nowOrders.length).toBeGreaterThan(0)
      expect(nowOrders.find((o) => isAfterNow(o.orderedAt))).toBeUndefined()
    })

    it('п. 18: в сырых данных нет моментов позже now (оформление, смена статуса, отмена, возврат)', () => {
      expect(nowRaw.wb.orderFeed.find((o) => isAfterNow(o.createdAt) || isAfterNow(o.updatedAt))).toBeUndefined()
      expect(nowRaw.ozon.fboPostings.find((p) => isAfterNow(p.created_at) || isAfterNow(p.in_process_at))).toBeUndefined()
      expect(nowRaw.ozon.fbsPostings.find((p) => isAfterNow(p.in_process_at))).toBeUndefined()
      expect(nowRaw.ozon.statusLog.find((e) => isAfterNow(e.changed_at))).toBeUndefined()
      expect(nowRaw.ozon.returns.find((r) => isAfterNow(r.logistic.return_date))).toBeUndefined()
    })

    it('п. 18: события по дням (выкуп, отмена, возврат, логистика) не позже «сегодня»', () => {
      expect(nowOrders.find((o) => eventDates(o).some((d) => d > TODAY))).toBeUndefined()
    })

    it('п. 18: без now у «сегодня» есть заказы позже 10:00; с now — только до 10:00, и они есть', () => {
      const todayWithout = orders.filter((o) => o.orderDate === TODAY)
      const todayWithNow = nowOrders.filter((o) => o.orderDate === TODAY)

      // Те же seed и «сегодня»: без now весь день «сегодня» уже прошёл
      expect(todayWithout.some((o) => isAfterNow(o.orderedAt))).toBe(true)
      expect(todayWithNow.length).toBeGreaterThan(0)
      expect(todayWithNow.every((o) => !isAfterNow(o.orderedAt))).toBe(true)
      expect(todayWithNow.length).toBeLessThan(todayWithout.length)
    })

    it('п. 18: заказы с now — те же, что без now, оформленные не позже now (номера, товары, цены, склады, время)', () => {
      const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)
      const expected = orders.filter((o) => !isAfterNow(o.orderedAt)).map(identity).sort(byId)
      const actual = nowOrders.map(identity).sort(byId)

      expect(actual.length).toBe(expected.length)
      // Первое расхождение вместо diff на 100 тыс. записей
      const i = expected.findIndex((e, k) => JSON.stringify(e) !== JSON.stringify(actual[k]))
      expect(i === -1 ? null : { без_now: expected[i], с_now: actual[i] }).toBeNull()
    })

    it('п. 18: заказ, все события которого были до «сегодня», с now не меняется целиком', () => {
      const nowById = new Map(nowOrders.map((o) => [o.id, o]))
      const settled = orders.filter((o) => eventDates(o).every((d) => d < TODAY))

      expect(settled.length).toBeGreaterThan(0)
      const changed = settled.find((o) => JSON.stringify(nowById.get(o.id)) !== JSON.stringify(o))
      expect(changed === undefined ? null : { без_now: changed, с_now: nowById.get(changed.id) }).toBeNull()
    })
  })

  describe('AC-3 / п. 19: объём на плато при «сегодня» далеко в будущем', () => {
    it.each(['2028-11-05', '2030-11-05'])(
      'AC-3 / п. 19: «сегодня» = %s — 90–110 тыс. заказов за 24 месяца',
      (today) => {
        const futureOrders = toOrders(generateRawData({ seed: SEED, today }))

        expect(futureOrders.length).toBeGreaterThanOrEqual(90_000)
        expect(futureOrders.length).toBeLessThanOrEqual(110_000)

        // Окно истории сдвинулось за «сегодня»: 24 месяца до него
        let first = futureOrders[0]?.orderDate ?? ''
        let last = first
        for (const o of futureOrders) {
          if (o.orderDate < first) first = o.orderDate
          if (o.orderDate > last) last = o.orderDate
        }
        const historyFrom = historyFromOf(today)
        expect(first >= historyFrom).toBe(true)
        expect(first <= addDays(historyFrom, 7)).toBe(true)
        expect(last <= today).toBe(true)
      },
      SLOW,
    )
  })
})
