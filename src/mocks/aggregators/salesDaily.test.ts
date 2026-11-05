// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Order } from '../domain'
import { salesDaily } from './index'
import { boughtOrder, cancelledAfterShipOrder, inTransitOrder, jacketOrder, ZERO_DAY } from './testFixtures'

/*
 * Ряд по дням: WB и Ozon × (выручка, заказы, прибыль) + итог дня прошлого периода.
 * Деньги — по дню события, заказы — по дате заказа (docs/domain.md).
 */

type Filters = Parameters<typeof salesDaily>[1]

function filters(from: string, to: string, extra: Partial<Filters> = {}): Filters {
  return { from, to, mp: 'all', cat: [], ...extra }
}

// Период 01.10–07.10, прошлый — 24.09–30.09
const orders: Order[] = [
  // WB: заказ 02.10, выкуп 03.10; прибыль 1000 − 200 − 50 − 400 = 350
  boughtOrder({ id: 'w1', marketplace: 'wb', category: 'clothing', orderDate: '2026-10-02', boughtOn: '2026-10-03', price: 1000, commission: 200, delivery: 50, costPrice: 400 }),
  // Ozon: заказ 03.10, выкуп 05.10; прибыль 2000 − 300 − 100 − 900 = 700
  boughtOrder({
    id: 'z1',
    marketplace: 'ozon',
    scheme: 'FBO',
    warehouse: 'Хоругвино',
    category: 'electronics',
    orderDate: '2026-10-03',
    boughtOn: '2026-10-05',
    price: 2000,
    commission: 300,
    delivery: 100,
    costPrice: 900,
  }),
  // Ozon: заказ 03.10, ещё в пути
  inTransitOrder({ id: 'z2', marketplace: 'ozon', scheme: 'FBS', warehouse: 'Склад продавца, Москва', category: 'clothing', orderDate: '2026-10-03', price: 700 }),
  // Прошлый период: заказ 25.09, выкуп 26.09; прибыль 500 − 100 − 50 − 200 = 150
  boughtOrder({ id: 'p1', marketplace: 'wb', category: 'clothing', orderDate: '2026-09-25', boughtOn: '2026-09-26', price: 500, commission: 100, delivery: 50, costPrice: 200 }),
]

describe('salesDaily', () => {
  it('AC-17: по точке на каждый день периода, включая дни без продаж; WB + Ozon = итог; прошлый период той же длины', () => {
    const { days } = salesDaily(orders, filters('2026-10-01', '2026-10-07'))

    expect(days).toEqual([
      { date: '2026-10-01', wb: ZERO_DAY, ozon: ZERO_DAY, total: ZERO_DAY, previousDate: '2026-09-24', previousTotal: ZERO_DAY },
      {
        date: '2026-10-02',
        wb: { revenue: 0, ordersCount: 1, profit: 0 },
        ozon: ZERO_DAY,
        total: { revenue: 0, ordersCount: 1, profit: 0 },
        previousDate: '2026-09-25',
        previousTotal: { revenue: 0, ordersCount: 1, profit: 0 },
      },
      {
        date: '2026-10-03',
        wb: { revenue: 1000, ordersCount: 0, profit: 350 },
        ozon: { revenue: 0, ordersCount: 2, profit: 0 },
        total: { revenue: 1000, ordersCount: 2, profit: 350 },
        previousDate: '2026-09-26',
        previousTotal: { revenue: 500, ordersCount: 0, profit: 150 },
      },
      { date: '2026-10-04', wb: ZERO_DAY, ozon: ZERO_DAY, total: ZERO_DAY, previousDate: '2026-09-27', previousTotal: ZERO_DAY },
      {
        date: '2026-10-05',
        wb: ZERO_DAY,
        ozon: { revenue: 2000, ordersCount: 0, profit: 700 },
        total: { revenue: 2000, ordersCount: 0, profit: 700 },
        previousDate: '2026-09-28',
        previousTotal: ZERO_DAY,
      },
      { date: '2026-10-06', wb: ZERO_DAY, ozon: ZERO_DAY, total: ZERO_DAY, previousDate: '2026-09-29', previousTotal: ZERO_DAY },
      { date: '2026-10-07', wb: ZERO_DAY, ozon: ZERO_DAY, total: ZERO_DAY, previousDate: '2026-09-30', previousTotal: ZERO_DAY },
    ])
  })

  it('AC-17: пустой период — точки на все дни с нулями', () => {
    const { days } = salesDaily([], filters('2026-10-01', '2026-10-10'))

    expect(days).toHaveLength(10)
    for (const day of days) {
      expect(day.total).toEqual(ZERO_DAY)
      expect(day.previousTotal).toEqual(ZERO_DAY)
    }
  })

  it.each([
    // через границу года
    ['2025-12-30', '2026-01-02', ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']],
    // через 29 февраля високосного года
    ['2028-02-28', '2028-03-01', ['2028-02-28', '2028-02-29', '2028-03-01']],
    // один день
    ['2026-10-04', '2026-10-04', ['2026-10-04']],
  ])('AC-17: %s–%s — дни идут подряд без пропусков', (from, to, expected) => {
    const { days } = salesDaily([], filters(from, to))

    expect(days.map((d) => d.date)).toEqual(expected)
  })

  it('AC-15: даты прошлого периода — той же длины и непосредственно перед текущим (05.10–03.11 → 05.09–04.10)', () => {
    const { days } = salesDaily([], filters('2026-10-05', '2026-11-03'))

    expect(days).toHaveLength(30)
    expect(days[0]?.previousDate).toBe('2026-09-05')
    expect(days[29]?.previousDate).toBe('2026-10-04')
  })

  it('AC-13: куртка — +5 000 / +1 670 на 4 октября, −5 000 / −1 830 на 10 октября, заказ 1 октября', () => {
    const { days } = salesDaily([jacketOrder()], filters('2026-10-01', '2026-10-10'))
    const byDate = new Map(days.map((d) => [d.date, d.total]))

    expect(byDate.get('2026-10-01')).toEqual({ revenue: 0, ordersCount: 1, profit: 0 })
    expect(byDate.get('2026-10-04')).toEqual({ revenue: 5000, ordersCount: 0, profit: 1670 })
    expect(byDate.get('2026-10-10')).toEqual({ revenue: -5000, ordersCount: 0, profit: -1830 })
    // Итого за 10 дней: выручка 0, прибыль −160
    expect(days.reduce((s, d) => s + d.total.revenue, 0)).toBe(0)
    expect(days.reduce((s, d) => s + d.total.profit, 0)).toBe(-160)
  })

  it('AC-13: отказ при получении — в день отмены прибыль −(доставка + обратная доставка)', () => {
    const order = cancelledAfterShipOrder({ id: 'c', orderDate: '2026-10-01', cancelledOn: '2026-10-03', price: 3000, delivery: 80, returnDelivery: 80 })

    const { days } = salesDaily([order], filters('2026-10-01', '2026-10-03'))

    expect(days[0]?.total).toEqual({ revenue: 0, ordersCount: 1, profit: 0 })
    expect(days[2]?.total).toEqual({ revenue: 0, ordersCount: 0, profit: -160 })
  })

  it('AC-16: фильтр площадки — у другой площадки нули, итог = выбранная площадка', () => {
    const { days } = salesDaily(orders, filters('2026-10-01', '2026-10-07', { mp: 'ozon' }))

    for (const day of days) {
      expect(day.wb).toEqual(ZERO_DAY)
      expect(day.total).toEqual(day.ozon)
    }
    // 03.10: два заказа Ozon; 05.10: выручка 2000
    expect(days[2]?.total.ordersCount).toBe(2)
    expect(days[4]?.total.revenue).toBe(2000)
    // Прошлый период — тоже только Ozon: заказ p1 (WB) не попадает
    expect(days.every((d) => d.previousTotal.ordersCount === 0 && d.previousTotal.revenue === 0)).toBe(true)
  })

  it('AC-16: фильтр категорий — учитываются только выбранные категории', () => {
    const { days } = salesDaily(orders, filters('2026-10-01', '2026-10-07', { cat: ['electronics'] }))

    // Остаётся только z1: заказ 03.10, выкуп 05.10
    expect(days[2]?.total).toEqual({ revenue: 0, ordersCount: 1, profit: 0 })
    expect(days[4]?.total).toEqual({ revenue: 2000, ordersCount: 0, profit: 700 })
    expect(days[1]?.total).toEqual(ZERO_DAY)
  })
})
