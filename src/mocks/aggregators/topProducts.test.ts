// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Order } from '../domain'
import { topProducts } from './index'
import {
  boughtOrder,
  cancelledAfterShipOrder,
  cancelledBeforeShipOrder,
  inTransitOrder,
  returnedOrder,
} from './testFixtures'

/*
 * Топ товаров за период 01.10–10.10. Расчёт по товарам (формулы docs/domain.md):
 *
 * A (WB, Одежда): 2 выкупа по 1000 (комиссия 100, доставка 50, себестоимость 300) + 1 отмена до отправки
 *   выручка 2000; заказы 3; % выкупа 2/3 = 66,67; прибыль 2000 − 200 − 100 − 600 = 1100
 * B (Ozon FBO, Электроника): 1 выкуп 5000 (комиссия 500, доставка 100, себестоимость 4000)
 *   выручка 5000; заказы 1; % выкупа 100; прибыль 5000 − 500 − 100 − 4000 = 400
 * C (WB, Обувь): 1 выкуп 2500 (200, 50, 500) + 1 возврат 2000 в периоде (200 / 50+50 / 500) + 2 в пути
 *   выручка 2500 + 2000 − 2000 = 2500; заказы 4; % выкупа 1/2 = 50
 *   прибыль (2500 − 200 − 50 − 500) + (0 − 0 − 100 − 0) = 1750 − 100 = 1650
 * D (Ozon FBS, Дом и кухня): 2 отказа при получении (80 + 80 каждый)
 *   выручка 0; заказы 2; % выкупа 0; прибыль −320
 *
 * По выручке: B, C, A, D. По заказам: C, A, D, B. По % выкупа: B, A, C, D. По прибыли: C, A, B, D.
 */

type Filters = Parameters<typeof topProducts>[1]

function filters(extra: Partial<Filters> = {}): Filters {
  return { from: '2026-10-01', to: '2026-10-10', mp: 'all', cat: [], ...extra }
}

const productA = { sku: 'A', offerId: 'ART-A', name: 'Футболка базовая', marketplace: 'wb', category: 'clothing' } as const
const productB = {
  sku: 'B',
  offerId: 'ART-B',
  name: 'Наушники беспроводные',
  marketplace: 'ozon',
  scheme: 'FBO',
  warehouse: 'Хоругвино',
  category: 'electronics',
} as const
const productC = { sku: 'C', offerId: 'ART-C', name: 'Кроссовки беговые', marketplace: 'wb', category: 'shoes' } as const
const productD = {
  sku: 'D',
  offerId: 'ART-D',
  name: 'Чайник электрический',
  marketplace: 'ozon',
  scheme: 'FBS',
  warehouse: 'Склад продавца, Москва',
  category: 'home',
} as const

const orders: Order[] = [
  boughtOrder({ ...productA, id: 'A1', orderDate: '2026-10-01', boughtOn: '2026-10-03', price: 1000, commission: 100, delivery: 50, costPrice: 300 }),
  boughtOrder({ ...productA, id: 'A2', orderDate: '2026-10-02', boughtOn: '2026-10-04', price: 1000, commission: 100, delivery: 50, costPrice: 300 }),
  cancelledBeforeShipOrder({ ...productA, id: 'A3', orderDate: '2026-10-03', cancelledOn: '2026-10-03', price: 1000, costPrice: 300 }),

  boughtOrder({ ...productB, id: 'B1', orderDate: '2026-10-02', boughtOn: '2026-10-05', price: 5000, commission: 500, delivery: 100, costPrice: 4000 }),

  boughtOrder({ ...productC, id: 'C1', orderDate: '2026-10-01', boughtOn: '2026-10-02', price: 2500, commission: 200, delivery: 50, costPrice: 500 }),
  returnedOrder({
    ...productC,
    id: 'C2',
    orderDate: '2026-10-01',
    boughtOn: '2026-10-03',
    returnedOn: '2026-10-08',
    price: 2000,
    commission: 200,
    delivery: 50,
    returnDelivery: 50,
    costPrice: 500,
  }),
  inTransitOrder({ ...productC, id: 'C3', orderDate: '2026-10-09', price: 2500, costPrice: 500 }),
  inTransitOrder({ ...productC, id: 'C4', orderDate: '2026-10-10', price: 2500, costPrice: 500 }),

  cancelledAfterShipOrder({ ...productD, id: 'D1', orderDate: '2026-10-02', cancelledOn: '2026-10-06', price: 1990, delivery: 80, returnDelivery: 80 }),
  cancelledAfterShipOrder({ ...productD, id: 'D2', orderDate: '2026-10-03', cancelledOn: '2026-10-07', price: 1990, delivery: 80, returnDelivery: 80 }),
]

const skus = (items: readonly { sku: string }[]) => items.map((i) => i.sku)

describe('topProducts', () => {
  it.each([
    ['revenue', ['B', 'C', 'A', 'D']],
    ['orders', ['C', 'A', 'D', 'B']],
    ['buyoutRate', ['B', 'A', 'C', 'D']],
    ['profit', ['C', 'A', 'B', 'D']],
  ] as const)('AC-19: сортировка по %s — по убыванию', (sort, expected) => {
    const { items } = topProducts(orders, filters(), { sort, limit: 10 })

    expect(skus(items)).toEqual(expected)
  })

  it('AC-19: значения метрик товара посчитаны по формулам', () => {
    const { items } = topProducts(orders, filters(), { sort: 'revenue', limit: 10 })
    const byS = new Map(items.map((i) => [i.sku, i]))

    expect(byS.get('A')).toEqual({
      sku: 'A',
      name: 'Футболка базовая',
      offerId: 'ART-A',
      marketplace: 'wb',
      category: 'clothing',
      revenue: 2000,
      ordersCount: 3,
      buyoutRate: expect.closeTo(200 / 3, 6),
      profit: 1100,
    })
    expect(byS.get('B')).toMatchObject({ marketplace: 'ozon', category: 'electronics', revenue: 5000, ordersCount: 1, buyoutRate: 100, profit: 400 })
    expect(byS.get('C')).toMatchObject({ revenue: 2500, ordersCount: 4, buyoutRate: 50, profit: 1650 })
    expect(byS.get('D')).toMatchObject({ revenue: 0, ordersCount: 2, buyoutRate: 0, profit: -320 })
  })

  it('AC-19: limit = N отдаёт N лучших', () => {
    const { items } = topProducts(orders, filters(), { sort: 'revenue', limit: 2 })

    expect(skus(items)).toEqual(['B', 'C'])
  })

  it('AC-19: пустой период — пустой список', () => {
    const { items } = topProducts(orders, filters({ from: '2026-11-01', to: '2026-11-03' }), { sort: 'revenue', limit: 10 })

    expect(items).toEqual([])
  })

  it('AC-16: фильтр площадки', () => {
    const { items } = topProducts(orders, filters({ mp: 'wb' }), { sort: 'revenue', limit: 10 })

    expect(skus(items)).toEqual(['C', 'A'])
  })

  it('AC-16: фильтр категорий; пустой список = все категории', () => {
    const one = topProducts(orders, filters({ cat: ['electronics'] }), { sort: 'revenue', limit: 10 })
    const all = topProducts(orders, filters({ cat: [] }), { sort: 'revenue', limit: 10 })

    expect(skus(one.items)).toEqual(['B'])
    expect(all.items).toHaveLength(4)
  })
})
