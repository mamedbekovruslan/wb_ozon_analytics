// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Order } from '../domain'
import { kpi } from './index'
import {
  boughtOrder,
  cancelledAfterShipOrder,
  cancelledBeforeShipOrder,
  inTransitOrder,
  jacketOrder,
  METRIC_KEYS,
  returnedOrder,
} from './testFixtures'

/*
 * KPI по формулам docs/domain.md («Метрики», «Два правила учёта»).
 * Ожидаемые числа посчитаны вручную в комментариях, а не повторяют код.
 */

type Filters = Parameters<typeof kpi>[1]

function filters(from: string, to: string, extra: Partial<Filters> = {}): Filters {
  return { from, to, mp: 'all', cat: [], ...extra }
}

const sum = (points: readonly (number | null)[]) => points.reduce<number>((acc, v) => acc + (v ?? 0), 0)

// Набор для AC-12: все события внутри периода 01.10–10.10
const ac12Orders: Order[] = [
  // A: выкуп 03.10
  boughtOrder({ id: 'A', orderDate: '2026-10-01', boughtOn: '2026-10-03', price: 1000, commission: 200, delivery: 50, costPrice: 400 }),
  // B: выкуп 04.10, возврат 06.10
  returnedOrder({
    id: 'B',
    orderDate: '2026-10-02',
    boughtOn: '2026-10-04',
    returnedOn: '2026-10-06',
    price: 2000,
    commission: 500,
    delivery: 60,
    returnDelivery: 60,
    costPrice: 800,
  }),
  // C: отказ при получении 07.10 — логистика туда и обратно
  cancelledAfterShipOrder({ id: 'C', orderDate: '2026-10-03', cancelledOn: '2026-10-07', price: 3000, delivery: 70, returnDelivery: 70, costPrice: 1000 }),
  // D: отмена до отправки — денег нет
  cancelledBeforeShipOrder({ id: 'D', orderDate: '2026-10-04', cancelledOn: '2026-10-04', price: 500 }),
  // E: в пути
  inTransitOrder({ id: 'E', orderDate: '2026-10-09', price: 1500 }),
  // F: выкуп 08.10
  boughtOrder({ id: 'F', orderDate: '2026-10-05', boughtOn: '2026-10-08', price: 4000, commission: 1000, delivery: 100, costPrice: 1500 }),
]

describe('kpi', () => {
  it('AC-12: метрики на ручном наборе совпадают с расчётом по формулам', () => {
    const { current } = kpi(ac12Orders, filters('2026-10-01', '2026-10-10'))

    // Заказы: A..F оформлены в периоде → 6 шт; 1000+2000+3000+500+1500+4000 = 12 000 ₽
    // Выкупы по дате выкупа: A, B, F → 3 шт (B считается, хотя позже вернули)
    // Возвраты: B → 1 шт, 2 000 ₽
    // Выручка: (1000 + 2000 + 4000) − 2000 = 5 000
    // % выкупа по итогу: выкуплены A, F (2); отменены C, D (2); возвращён B (1); E в пути не считается
    //   → 2 / 5 × 100 = 40
    // Средний чек: 7 000 / 3 = 2 333,33 (без вычета возвратов)
    // Комиссия: (200 + 500 + 1000) − 500 = 1 200
    // Логистика: A 50 + B 60 + 60 + C 70 + 70 + F 100 = 410
    // Себестоимость: (400 + 800 + 1500) − 800 = 1 900
    // Прибыль: 5000 − 1200 − 410 − 1900 = 1 490
    // Маржа: 1490 / 5000 × 100 = 29,8
    expect(current).toEqual({
      ordersCount: 6,
      ordersSum: 12_000,
      buyoutsCount: 3,
      revenue: 5000,
      buyoutRate: expect.closeTo(40, 6),
      returnsCount: 1,
      returnsSum: 2000,
      avgCheck: expect.closeTo(7000 / 3, 6),
      commission: 1200,
      logistics: 410,
      costPrice: 1900,
      profit: 1490,
      margin: expect.closeTo(29.8, 6),
    })
  })

  describe('AC-13: два правила учёта', () => {
    it('AC-13: куртка — 4 октября выручка +5 000, комиссия 1 250, логистика 80, себестоимость 2 000, прибыль +1 670', () => {
      const { current } = kpi([jacketOrder()], filters('2026-10-04', '2026-10-04'))

      expect(current).toMatchObject({
        revenue: 5000,
        commission: 1250,
        logistics: 80,
        costPrice: 2000,
        profit: 1670,
        buyoutsCount: 1,
        ordersCount: 0,
        returnsCount: 0,
      })
    })

    it('AC-13: куртка — 10 октября выручка −5 000, комиссия −1 250, логистика +80 (не возвращается), себестоимость −2 000, прибыль −1 830', () => {
      const { current } = kpi([jacketOrder()], filters('2026-10-10', '2026-10-10'))

      expect(current).toMatchObject({
        revenue: -5000,
        commission: -1250,
        logistics: 80,
        costPrice: -2000,
        profit: -1830,
        buyoutsCount: 0,
        returnsCount: 1,
        returnsSum: 5000,
        ordersCount: 0,
      })
    })

    it('AC-13: куртка — за весь октябрь выручка 0, комиссия 0, логистика 160, себестоимость 0, прибыль −160', () => {
      const { current } = kpi([jacketOrder()], filters('2026-10-01', '2026-10-31'))

      expect(current).toMatchObject({
        revenue: 0,
        commission: 0,
        logistics: 160,
        costPrice: 0,
        profit: -160,
        ordersCount: 1,
        ordersSum: 5000,
        buyoutsCount: 1,
        returnsCount: 1,
        // Средний чек без вычета возвратов: 5000 / 1
        avgCheck: 5000,
        // Итог заказа — «возвращён»: 0 / 1
        buyoutRate: 0,
      })
    })

    it('AC-13: куртка — 1 октября только заказ: счётчик заказов 1, денег нет', () => {
      const { current } = kpi([jacketOrder()], filters('2026-10-01', '2026-10-01'))

      expect(current).toMatchObject({
        ordersCount: 1,
        ordersSum: 5000,
        buyoutsCount: 0,
        returnsCount: 0,
        revenue: 0,
        commission: 0,
        logistics: 0,
        costPrice: 0,
        profit: 0,
        // % выкупа — по итогу заказа, оформленного 1.10: «возвращён»
        buyoutRate: 0,
      })
    })

    it('AC-13: 10 курток, 5 из которых вернули, дают % выкупа 50', () => {
      const orders: Order[] = []
      for (let i = 0; i < 5; i++) orders.push(jacketOrder(`returned-${i}`))
      for (let i = 0; i < 5; i++) {
        orders.push(
          boughtOrder({ id: `kept-${i}`, sku: 'JACKET', orderDate: '2026-10-01', boughtOn: '2026-10-04', price: 5000, commission: 1250, delivery: 80, costPrice: 2000 }),
        )
      }

      const { current } = kpi(orders, filters('2026-10-01', '2026-10-31'))

      expect(current.buyoutRate).toBeCloseTo(50, 6)
    })

    it('AC-13: выкуп заказа из прошлого периода относится к дню выкупа, а % выкупа — к периоду заказа', () => {
      // Заказ 28.09, выкуп 02.10: 1000 ₽, комиссия 100, доставка 50, себестоимость 300
      const order = boughtOrder({ id: 'X', orderDate: '2026-09-28', boughtOn: '2026-10-02', price: 1000, commission: 100, delivery: 50, costPrice: 300 })

      const { current, previous } = kpi([order], filters('2026-10-01', '2026-10-10'))

      // Текущий 01.10–10.10: выкуп и деньги есть, заказа нет
      // Прибыль: 1000 − 100 − 50 − 300 = 550
      expect(current).toMatchObject({
        ordersCount: 0,
        buyoutsCount: 1,
        revenue: 1000,
        profit: 550,
        buyoutRate: null,
      })
      // Прошлый 21.09–30.09: заказ есть, денег нет; итог заказа — «выкуплен» → 100 %
      expect(previous).toMatchObject({
        ordersCount: 1,
        ordersSum: 1000,
        buyoutsCount: 0,
        revenue: 0,
        profit: 0,
        buyoutRate: 100,
      })
    })

    it('AC-13: заказ в периоде с выкупом после периода — счётчик заказа и % выкупа есть, денег нет', () => {
      const order = boughtOrder({ id: 'Y', orderDate: '2026-10-08', boughtOn: '2026-10-12', price: 800, commission: 80, delivery: 40, costPrice: 300 })

      const { current } = kpi([order], filters('2026-10-01', '2026-10-10'))

      expect(current).toMatchObject({ ordersCount: 1, buyoutsCount: 0, revenue: 0, logistics: 0, buyoutRate: 100 })
    })

    it('AC-13: отказ при получении — логистика туда и обратно в день отмены, выручки нет', () => {
      const order = cancelledAfterShipOrder({ id: 'Z', orderDate: '2026-10-01', cancelledOn: '2026-10-05', price: 3000, delivery: 80, returnDelivery: 80 })

      const onCancelDay = kpi([order], filters('2026-10-05', '2026-10-05')).current
      const onOrderDay = kpi([order], filters('2026-10-01', '2026-10-01')).current

      // 80 + 80 = 160; прибыль 0 − 0 − 160 − 0 = −160
      expect(onCancelDay).toMatchObject({ revenue: 0, logistics: 160, profit: -160, ordersCount: 0 })
      expect(onOrderDay).toMatchObject({ ordersCount: 1, logistics: 0, profit: 0, buyoutRate: 0 })
    })
  })

  describe('AC-14: null вместо 0 и NaN', () => {
    it('AC-14: пустой период — счётчики и деньги 0, средний чек, % выкупа и маржа null', () => {
      const { current, previous } = kpi([], filters('2026-10-01', '2026-10-10'))

      for (const metrics of [current, previous]) {
        expect(metrics).toEqual({
          ordersCount: 0,
          ordersSum: 0,
          buyoutsCount: 0,
          revenue: 0,
          buyoutRate: null,
          returnsCount: 0,
          returnsSum: 0,
          avgCheck: null,
          commission: 0,
          logistics: 0,
          costPrice: 0,
          profit: 0,
          margin: null,
        })
      }
    })

    it('AC-14: только заказы «в пути» — % выкупа и средний чек null', () => {
      const orders = [inTransitOrder({ id: 'T1', orderDate: '2026-10-02', price: 1000 }), inTransitOrder({ id: 'T2', orderDate: '2026-10-03', price: 2000 })]

      const { current } = kpi(orders, filters('2026-10-01', '2026-10-10'))

      expect(current.ordersCount).toBe(2)
      expect(current.buyoutRate).toBeNull()
      expect(current.avgCheck).toBeNull()
    })

    it('AC-14: выручка < 0 (в дне только возврат) — маржа null', () => {
      const { current } = kpi([jacketOrder()], filters('2026-10-10', '2026-10-10'))

      expect(current.revenue).toBe(-5000)
      expect(current.margin).toBeNull()
    })

    it('AC-14: выручка = 0 при расходах на логистику — маржа null', () => {
      const order = cancelledAfterShipOrder({ id: 'Z', orderDate: '2026-10-01', cancelledOn: '2026-10-05', price: 3000, delivery: 80, returnDelivery: 80 })

      const { current } = kpi([order], filters('2026-10-01', '2026-10-10'))

      expect(current.revenue).toBe(0)
      expect(current.margin).toBeNull()
    })

    it('AC-14: в метриках и sparkline нет NaN и бесконечностей', () => {
      const result = kpi([jacketOrder()], filters('2026-10-01', '2026-10-31'))
      const empty = kpi([], filters('2026-10-01', '2026-10-31'))

      for (const r of [result, empty]) {
        for (const value of [...Object.values(r.current), ...Object.values(r.previous)]) {
          expect(value === null || Number.isFinite(value)).toBe(true)
        }
        for (const key of METRIC_KEYS) {
          for (const point of r.sparklines[key]) {
            expect(point === null || Number.isFinite(point)).toBe(true)
          }
        }
      }
    })
  })

  describe('AC-15: прошлый период', () => {
    it('AC-15: для 05.10–03.11 прошлый период 05.09–04.10', () => {
      const result = kpi([], filters('2026-10-05', '2026-11-03'))

      expect(result.period).toEqual({ from: '2026-10-05', to: '2026-11-03' })
      expect(result.previousPeriod).toEqual({ from: '2026-09-05', to: '2026-10-04' })
    })

    it.each([
      // один день → предыдущий день
      ['2026-10-04', '2026-10-04', '2026-10-03', '2026-10-03'],
      // 7 дней через границу года: 01.01–07.01 → 25.12–31.12
      ['2026-01-01', '2026-01-07', '2025-12-25', '2025-12-31'],
      // март високосного года (31 день) → 30.01–29.02
      ['2024-03-01', '2024-03-31', '2024-01-30', '2024-02-29'],
    ])('AC-15: для %s–%s прошлый период %s–%s', (from, to, prevFrom, prevTo) => {
      expect(kpi([], filters(from, to)).previousPeriod).toEqual({ from: prevFrom, to: prevTo })
    })

    it('AC-15: метрики прошлого периода считаются ровно по его границам', () => {
      const orders = [
        inTransitOrder({ id: 'before-prev', orderDate: '2026-09-04', price: 1 }),
        inTransitOrder({ id: 'prev-first', orderDate: '2026-09-05', price: 10 }),
        inTransitOrder({ id: 'prev-last', orderDate: '2026-10-04', price: 100 }),
        inTransitOrder({ id: 'cur-first', orderDate: '2026-10-05', price: 1000 }),
      ]

      const { current, previous } = kpi(orders, filters('2026-10-05', '2026-11-03'))

      // Прошлый 05.09–04.10: 10 + 100; 04.09 не входит, 05.10 уже текущий
      expect(previous).toMatchObject({ ordersCount: 2, ordersSum: 110 })
      expect(current).toMatchObject({ ordersCount: 1, ordersSum: 1000 })
    })
  })

  describe('AC-16: фильтры площадки и категорий', () => {
    const orders: Order[] = [
      boughtOrder({ id: 'wb-cl', marketplace: 'wb', category: 'clothing', orderDate: '2026-10-02', boughtOn: '2026-10-03', price: 1000, commission: 0, delivery: 0, costPrice: 0 }),
      boughtOrder({
        id: 'oz-el',
        marketplace: 'ozon',
        scheme: 'FBO',
        warehouse: 'Хоругвино',
        category: 'electronics',
        orderDate: '2026-10-02',
        boughtOn: '2026-10-03',
        price: 3000,
        commission: 0,
        delivery: 0,
        costPrice: 0,
      }),
      boughtOrder({ id: 'wb-sh', marketplace: 'wb', category: 'shoes', orderDate: '2026-10-04', boughtOn: '2026-10-05', price: 200, commission: 0, delivery: 0, costPrice: 0 }),
      // В прошлом периоде (21.09–30.09) — только Ozon
      boughtOrder({
        id: 'oz-prev',
        marketplace: 'ozon',
        scheme: 'FBS',
        warehouse: 'Склад продавца, Москва',
        category: 'electronics',
        orderDate: '2026-09-25',
        boughtOn: '2026-09-26',
        price: 700,
        commission: 0,
        delivery: 0,
        costPrice: 0,
      }),
    ]

    it.each([
      // [описание, mp, cat, выручка, заказы]
      ['все площадки, пустой список категорий = все категории', 'all', [], 4200, 3],
      ['только WB', 'wb', [], 1200, 2],
      ['только Ozon', 'ozon', [], 3000, 1],
      ['одна категория', 'all', ['clothing'], 1000, 1],
      ['две категории', 'all', ['clothing', 'electronics'], 4000, 2],
      ['WB + категория, которой у WB нет', 'wb', ['electronics'], 0, 0],
    ] as const)('AC-16: %s', (_title, mp, cat, revenue, ordersCount) => {
      const { current } = kpi(orders, filters('2026-10-01', '2026-10-10', { mp, cat: [...cat] }))

      expect(current.revenue).toBe(revenue)
      expect(current.ordersCount).toBe(ordersCount)
    })

    it('AC-16: фильтр применяется и к прошлому периоду, и к sparkline', () => {
      const wbOnly = kpi(orders, filters('2026-10-01', '2026-10-10', { mp: 'wb' }))
      const all = kpi(orders, filters('2026-10-01', '2026-10-10'))

      expect(all.previous.revenue).toBe(700)
      expect(wbOnly.previous.revenue).toBe(0)
      // Сумма точек sparkline выручки = выручка периода: 1000 + 200
      expect(sum(wbOnly.sparklines.revenue)).toBe(1200)
    })
  })

  describe('AC-18: sparkline из 14 точек', () => {
    it('AC-18: для каждой метрики есть sparkline из 14 точек', () => {
      const { sparklines } = kpi(ac12Orders, filters('2026-10-01', '2026-10-30'))

      expect(Object.keys(sparklines).sort()).toEqual([...METRIC_KEYS].sort())
      for (const key of METRIC_KEYS) expect(sparklines[key]).toHaveLength(14)
    })

    it('AC-18: 15 дней — день i попадает в точку floor(i × 14 / 15): дни 0 и 1 → точка 0, день 14 → точка 13', () => {
      // floor(0)=0, floor(14/15)=0, floor(28/15)=1, …, floor(196/15)=13
      const orders = [
        boughtOrder({ id: 'd0', orderDate: '2026-10-01', boughtOn: '2026-10-01', price: 100, commission: 0, delivery: 0, costPrice: 0 }),
        boughtOrder({ id: 'd1', orderDate: '2026-10-02', boughtOn: '2026-10-02', price: 200, commission: 0, delivery: 0, costPrice: 0 }),
        boughtOrder({ id: 'd2', orderDate: '2026-10-03', boughtOn: '2026-10-03', price: 400, commission: 0, delivery: 0, costPrice: 0 }),
        boughtOrder({ id: 'd14', orderDate: '2026-10-15', boughtOn: '2026-10-15', price: 800, commission: 0, delivery: 0, costPrice: 0 }),
      ]

      const { sparklines } = kpi(orders, filters('2026-10-01', '2026-10-15'))

      expect(sparklines.revenue).toEqual([300, 400, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 800])
      expect(sparklines.ordersCount).toEqual([2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
    })

    it('AC-18: 28 дней — по 2 дня в точке', () => {
      // i=1 → floor(14/28)=0; i=2 → 1; i=26 → 13; i=27 → floor(378/28)=13
      const orders = [
        inTransitOrder({ id: 'i1', orderDate: '2026-10-02', price: 1 }),
        inTransitOrder({ id: 'i2', orderDate: '2026-10-03', price: 1 }),
        inTransitOrder({ id: 'i26', orderDate: '2026-10-27', price: 1 }),
        inTransitOrder({ id: 'i27', orderDate: '2026-10-28', price: 1 }),
      ]

      const { sparklines } = kpi(orders, filters('2026-10-01', '2026-10-28'))

      expect(sparklines.ordersCount).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2])
    })

    it('AC-18: 30 дней (05.10–03.11) — дни 0–2 в точке 0, день 3 в точке 1; сумма точек = итог периода', () => {
      // floor(2×14/30)=0, floor(3×14/30)=1
      const orders = [
        inTransitOrder({ id: 'i0', orderDate: '2026-10-05', price: 1 }),
        inTransitOrder({ id: 'i2', orderDate: '2026-10-07', price: 1 }),
        inTransitOrder({ id: 'i3', orderDate: '2026-10-08', price: 1 }),
        inTransitOrder({ id: 'i29', orderDate: '2026-11-03', price: 1 }),
      ]

      const result = kpi(orders, filters('2026-10-05', '2026-11-03'))

      expect(result.sparklines.ordersCount).toHaveLength(14)
      expect(result.sparklines.ordersCount[0]).toBe(2)
      expect(result.sparklines.ordersCount[1]).toBe(1)
      expect(result.sparklines.ordersCount[13]).toBe(1)
      expect(sum(result.sparklines.ordersCount)).toBe(result.current.ordersCount)
    })

    it.each([
      [7, '2026-10-01', '2026-10-07'],
      [1, '2026-10-01', '2026-10-01'],
    ])('AC-18: в периоде меньше 14 дней (%i) — точка на день', (days, from, to) => {
      const orders = [inTransitOrder({ id: 'first', orderDate: from, price: 1 })]

      const { sparklines } = kpi(orders, filters(from, to))

      for (const key of METRIC_KEYS) expect(sparklines[key]).toHaveLength(days)
      expect(sparklines.ordersCount[0]).toBe(1)
    })

    it('AC-18: ровно 14 дней — точка на день', () => {
      const orders = [inTransitOrder({ id: 'last', orderDate: '2026-10-14', price: 1 })]

      const { sparklines } = kpi(orders, filters('2026-10-01', '2026-10-14'))

      expect(sparklines.ordersCount).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
    })
  })
})
