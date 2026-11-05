// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Order } from '../domain'
import { ordersPage } from './index'
import { boughtOrder, cancelledBeforeShipOrder, inTransitOrder, returnedOrder } from './testFixtures'

/*
 * Страница заказов: период фильтрует по дате заказа, по умолчанию сортировка
 * по дате по убыванию, limit по умолчанию 50; поиск без учёта регистра;
 * counts учитывают поиск и фильтры, но не выбранный статус.
 */

type Query = Parameters<typeof ordersPage>[1]

function query(extra: Partial<Query> = {}): Query {
  return { from: '2026-10-01', to: '2026-10-31', mp: 'all', cat: [], ...extra }
}

const money = { commission: 0, delivery: 0, costPrice: 0 }

const orders: Order[] = [
  boughtOrder({
    ...money,
    id: 'WB-1001',
    sku: '47254354',
    offerId: 'KURT-001',
    name: 'Куртка зимняя мужская',
    category: 'clothing',
    warehouse: 'Коледино',
    orderDate: '2026-10-05',
    orderedAt: '2026-10-05T10:00:00+03:00',
    boughtOn: '2026-10-08',
    price: 5000,
  }),
  cancelledBeforeShipOrder({
    id: 'WB-1002',
    sku: '11111111',
    offerId: 'RUN-42',
    name: 'Кроссовки беговые',
    category: 'shoes',
    warehouse: 'Подольск',
    orderDate: '2026-10-05',
    orderedAt: '2026-10-05T18:30:00+03:00',
    cancelledOn: '2026-10-06',
    price: 3500,
  }),
  inTransitOrder({
    id: '9121072335-0187-1',
    marketplace: 'ozon',
    scheme: 'FBO',
    sku: '9880276314',
    offerId: 'PHONE-128',
    name: 'Смартфон 128 ГБ',
    category: 'electronics',
    warehouse: 'Хоругвино',
    orderDate: '2026-10-10',
    orderedAt: '2026-10-10T09:00:00+03:00',
    price: 28_990,
  }),
  returnedOrder({
    ...money,
    id: '9121072335-0188-1',
    marketplace: 'ozon',
    scheme: 'FBS',
    sku: '1234567890',
    offerId: 'KETTLE-1',
    name: 'Чайник электрический',
    category: 'home',
    warehouse: 'Склад продавца, Москва',
    orderDate: '2026-10-20',
    orderedAt: '2026-10-20T23:59:00+03:00',
    boughtOn: '2026-10-23',
    returnedOn: '2026-10-28',
    returnDelivery: 0,
    price: 1990,
  }),
  boughtOrder({
    ...money,
    id: 'WB-1003',
    sku: '22222222',
    offerId: 'KURT-002',
    name: 'Куртка демисезонная',
    category: 'clothing',
    warehouse: 'Электросталь',
    // Начало последнего дня периода — входит
    orderDate: '2026-10-31',
    orderedAt: '2026-10-31T00:00:00+03:00',
    boughtOn: '2026-11-02',
    price: 4000,
  }),
  // Вне периода: 30.09 23:00 и 01.11 00:30 по Москве
  boughtOrder({
    ...money,
    id: 'WB-0999',
    offerId: 'KURT-003',
    name: 'Куртка летняя',
    orderDate: '2026-09-30',
    orderedAt: '2026-09-30T23:00:00+03:00',
    boughtOn: '2026-10-02',
    price: 3000,
  }),
  inTransitOrder({ id: 'WB-1004', offerId: 'KURT-004', name: 'Куртка детская', orderDate: '2026-11-01', orderedAt: '2026-11-01T00:30:00+03:00', price: 2500 }),
]

const ids = (items: readonly { id: string }[]) => items.map((i) => i.id)

const ALL_COUNTS = { all: 5, inTransit: 1, bought: 2, cancelled: 1, returned: 1 }

describe('ordersPage', () => {
  it('AC-22: по умолчанию — заказы периода по дате и времени по убыванию, всего найдено и счётчики', () => {
    const page = ordersPage(orders, query())

    expect(ids(page.items)).toEqual(['WB-1003', '9121072335-0188-1', '9121072335-0187-1', 'WB-1002', 'WB-1001'])
    expect(page.total).toBe(5)
    expect(page.counts).toEqual(ALL_COUNTS)
  })

  it('AC-22: строка заказа содержит поля контракта, статус = итог заказа', () => {
    const page = ordersPage(orders, query())
    const phone = page.items.find((i) => i.id === '9121072335-0187-1')

    expect(phone).toEqual({
      id: '9121072335-0187-1',
      orderedAt: '2026-10-10T09:00:00+03:00',
      sku: '9880276314',
      offerId: 'PHONE-128',
      name: 'Смартфон 128 ГБ',
      marketplace: 'ozon',
      scheme: 'FBO',
      warehouse: 'Хоругвино',
      price: 28_990,
      status: 'inTransit',
    })
  })

  it.each([
    ['date', 'asc', ['WB-1001', 'WB-1002', '9121072335-0187-1', '9121072335-0188-1', 'WB-1003']],
    ['price', 'asc', ['9121072335-0188-1', 'WB-1002', 'WB-1003', 'WB-1001', '9121072335-0187-1']],
    ['price', 'desc', ['9121072335-0187-1', 'WB-1001', 'WB-1003', 'WB-1002', '9121072335-0188-1']],
  ] as const)('AC-22: сортировка sort=%s, dir=%s', (sort, dir, expected) => {
    expect(ids(ordersPage(orders, query({ sort, dir })).items)).toEqual(expected)
  })

  it('AC-22: страница по offset/limit, total — всё найденное', () => {
    const page = ordersPage(orders, query({ offset: 1, limit: 2 }))

    expect(ids(page.items)).toEqual(['9121072335-0188-1', '9121072335-0187-1'])
    expect(page.total).toBe(5)
  })

  it('AC-22: offset за пределами — пустая страница, total сохраняется', () => {
    const page = ordersPage(orders, query({ offset: 10, limit: 2 }))

    expect(page.items).toEqual([])
    expect(page.total).toBe(5)
  })

  it('AC-22: limit по умолчанию 50', () => {
    const many: Order[] = []
    for (let i = 0; i < 60; i++) {
      many.push(inTransitOrder({ id: `N-${String(i).padStart(3, '0')}`, orderDate: '2026-10-15', orderedAt: `2026-10-15T10:${String(i % 60).padStart(2, '0')}:00+03:00`, price: 100 }))
    }

    const page = ordersPage(many, query())

    expect(page.items).toHaveLength(50)
    expect(page.total).toBe(60)
  })

  it.each([
    ['по названию без учёта регистра', 'куРТКА', ['WB-1003', 'WB-1001']],
    ['по части названия', 'смартф', ['9121072335-0187-1']],
    ['по артикулу продавца без учёта регистра', 'kurt-002', ['WB-1003']],
    ['по номеру заказа (части)', '0188', ['9121072335-0188-1']],
  ])('AC-22: поиск %s', (_title, q, expected) => {
    const page = ordersPage(orders, query({ q }))

    expect(ids(page.items)).toEqual(expected)
    expect(page.total).toBe(expected.length)
    expect(page.counts.all).toBe(expected.length)
  })

  it('AC-22: поиск без совпадений — пусто, все счётчики 0', () => {
    const page = ordersPage(orders, query({ q: 'холодильник' }))

    expect(page.items).toEqual([])
    expect(page.total).toBe(0)
    expect(page.counts).toEqual({ all: 0, inTransit: 0, bought: 0, cancelled: 0, returned: 0 })
  })

  it('AC-22: фильтр по статусу; счётчики не зависят от выбранного статуса', () => {
    const page = ordersPage(orders, query({ status: 'bought' }))

    expect(ids(page.items)).toEqual(['WB-1003', 'WB-1001'])
    expect(page.total).toBe(2)
    expect(page.counts).toEqual(ALL_COUNTS)
  })

  it('AC-22: счётчики учитывают поиск, но не статус', () => {
    const page = ordersPage(orders, query({ q: 'куртка', status: 'cancelled' }))

    expect(page.items).toEqual([])
    expect(page.counts).toEqual({ all: 2, inTransit: 0, bought: 2, cancelled: 0, returned: 0 })
  })

  it('AC-16: фильтр площадки и категорий применяется к строкам и счётчикам', () => {
    const ozon = ordersPage(orders, query({ mp: 'ozon' }))
    const clothing = ordersPage(orders, query({ cat: ['clothing'] }))

    expect(ids(ozon.items)).toEqual(['9121072335-0188-1', '9121072335-0187-1'])
    expect(ozon.counts).toEqual({ all: 2, inTransit: 1, bought: 0, cancelled: 0, returned: 1 })
    expect(ids(clothing.items)).toEqual(['WB-1003', 'WB-1001'])
    expect(clothing.counts.all).toBe(2)
  })
})
