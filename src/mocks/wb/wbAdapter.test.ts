// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Order } from '../domain'
import { wbAdapter } from './index'

/*
 * AC-9: каждая строка таблицы «Соответствие доменной модели» из
 * docs/domain/wb-api.md проверена на вручную собранной сырой записи.
 * Записи — в форме «Ленты заказов» (data.orders[]), детализации отчёта
 * реализации и остатков на складах WB.
 */

type WbRaw = Parameters<typeof wbAdapter>[0]
type Catalog = Parameters<typeof wbAdapter>[1]
type FeedOrder = WbRaw['orderFeed'][number]
type ReportRow = WbRaw['salesReport'][number]
type StockItem = WbRaw['stocks'][number]

const NM_ID = 47254354

// Справочник продавца: артикул продавца, название, категория и себестоимость по nmId.
// Допущение о форме справочника — см. отчёт qa (вопрос о типе catalog).
const catalog: Catalog = [
  { sku: String(NM_ID), offerId: 'KURT-001', name: 'Куртка зимняя мужская', category: 'clothing', marketplace: 'wb', costPrice: 2000 },
]

// Строки «Логистика» тоже должны иметь docTypeName из набора «Продажа» / «Возврат»
// (docs/domain/wb-api.md, «Набор значений»). Какой именно — см. вопрос в отчёте qa.
const LOGISTICS_DOC_TYPE = 'Продажа'

function feedOrder(p: Partial<FeedOrder> & Pick<FeedOrder, 'srid' | 'status' | 'createdAt' | 'updatedAt'>): FeedOrder {
  return {
    nmId: NM_ID,
    chrtId: 101,
    warehouseName: 'Коледино',
    warehouseRegion: 'Центральный',
    isMp: false,
    destinationCity: 'Москва',
    destinationDistrict: 'Центральный',
    sellerPrice: 5000,
    isB2b: false,
    ...p,
  }
}

let rrdId = 1

function reportRow(p: Partial<ReportRow> & Pick<ReportRow, 'srid' | 'docTypeName' | 'sellerOperName' | 'rrDate'>): ReportRow {
  return {
    nmId: NM_ID,
    vendorCode: 'KURT-001',
    title: 'Куртка зимняя мужская',
    subjectName: 'Куртки',
    brandName: 'Saldo',
    quantity: 0,
    retailPriceWithDisc: '0',
    forPay: '0',
    commissionPercent: 25,
    deliveryService: '0',
    deliveryAmount: 0,
    returnAmount: 0,
    officeName: 'Коледино',
    orderDt: '2026-10-01T00:00:00Z',
    saleDt: `${p.rrDate}T00:00:00Z`,
    rrdId: rrdId++,
    ...p,
  }
}

const saleRow = (srid: string, day: string, price: string, forPay: string) =>
  reportRow({ srid, docTypeName: 'Продажа', sellerOperName: 'Продажа', quantity: 1, retailPriceWithDisc: price, forPay, rrDate: day, saleDt: `${day}T00:00:00Z` })

const returnRow = (srid: string, day: string, price: string, forPay: string) =>
  reportRow({ srid, docTypeName: 'Возврат', sellerOperName: 'Возврат', quantity: 1, retailPriceWithDisc: price, forPay, rrDate: day, saleDt: `${day}T00:00:00Z` })

const deliveryRow = (srid: string, day: string, amount: string) =>
  reportRow({ srid, docTypeName: LOGISTICS_DOC_TYPE, sellerOperName: 'Логистика', deliveryService: amount, deliveryAmount: 1, returnAmount: 0, rrDate: day })

const backDeliveryRow = (srid: string, day: string, amount: string) =>
  reportRow({ srid, docTypeName: LOGISTICS_DOC_TYPE, sellerOperName: 'Логистика', deliveryService: amount, deliveryAmount: 0, returnAmount: 1, rrDate: day })

function stockItem(p: Partial<StockItem>): StockItem {
  return {
    nmId: NM_ID,
    chrtId: 101,
    warehouseId: 507,
    warehouseName: 'Коледино',
    regionName: 'Россия',
    quantity: 0,
    inWayToClient: 0,
    inWayFromClient: 0,
    ...p,
  }
}

function raw(p: Partial<WbRaw>): WbRaw {
  return { orderFeed: [], salesReport: [], stocks: [], ...p }
}

function adaptOne(orderFeed: FeedOrder[], salesReport: ReportRow[] = []): Order {
  const { orders } = wbAdapter(raw({ orderFeed, salesReport }), catalog)
  expect(orders).toHaveLength(1)
  const [order] = orders
  if (!order) throw new Error('адаптер не вернул заказ')
  return order
}

/** Логистика заказа по дням: сумма списаний за каждый день. */
function logisticsByDate(order: Order): Record<string, number> {
  const result: Record<string, number> = {}
  for (const { date, amount } of order.logistics) result[date] = (result[date] ?? 0) + amount
  return result
}

describe('wbAdapter', () => {
  describe('AC-9: поля заказа', () => {
    const order = () =>
      adaptOne([
        feedOrder({
          srid: 'wb-srid-0001',
          status: 'created',
          createdAt: '2026-11-04T00:30:00+03:00',
          updatedAt: '2026-11-04T00:30:00+03:00',
          warehouseName: 'Электросталь',
          sellerPrice: 399.68,
        }),
      ])

    it('AC-9: площадка всегда wb, схема FBO/FBS — null', () => {
      expect(order()).toMatchObject({ marketplace: 'wb', scheme: null })
    })

    it('AC-9: ID заказа — srid как есть', () => {
      expect(order().id).toBe('wb-srid-0001')
    })

    it('AC-9: артикул площадки — nmId, число → строка (47254354 → "47254354")', () => {
      expect(order().sku).toBe('47254354')
    })

    it('AC-9: артикул продавца, название, категория и себестоимость — из справочника продавца по nmId', () => {
      expect(order()).toMatchObject({ offerId: 'KURT-001', name: 'Куртка зимняя мужская', category: 'clothing', costPrice: 2000 })
    })

    it('AC-9: склад — warehouseName как есть', () => {
      expect(order().warehouse).toBe('Электросталь')
    })

    it('AC-9: дата и время заказа — createdAt уже по Москве: 00:30 +03:00 остаётся тем же днём', () => {
      const { orderedAt, orderDate } = order()

      expect(new Date(orderedAt).getTime()).toBe(new Date('2026-11-04T00:30:00+03:00').getTime())
      expect(orderedAt).toMatch(/\+03:00$/)
      // В UTC это было бы 03.11 — перевод пояса не нужен
      expect(orderDate).toBe('2026-11-04')
    })

    it('AC-9: цена заказа — sellerPrice ленты (число)', () => {
      expect(order().price).toBeCloseTo(399.68, 10)
    })

    it('AC-9: status = created → итог «в пути», событий и денег нет', () => {
      expect(order()).toMatchObject({
        outcome: 'inTransit',
        boughtOn: null,
        cancelledOn: null,
        returnedOn: null,
        commission: 0,
        commissionRefund: 0,
        logistics: [],
      })
    })
  })

  describe('AC-9: выкуп', () => {
    const srid = 'wb-buyout'
    const order = () =>
      adaptOne(
        [feedOrder({ srid, status: 'buyout', createdAt: '2026-10-01T12:00:00+03:00', updatedAt: '2026-10-04T15:00:00+03:00' })],
        [saleRow(srid, '2026-10-04', '5000.00', '3750.00'), deliveryRow(srid, '2026-10-04', '80.00')],
      )

    it('AC-9: status = buyout → «выкуплен», дата выкупа — saleDt строки «Продажа»', () => {
      expect(order()).toMatchObject({ outcome: 'bought', boughtOn: '2026-10-04', cancelledOn: null, returnedOn: null })
    })

    it('AC-9: комиссия выкупа = retailPriceWithDisc − forPay строки «Продажа» (5000 − 3750 = 1250)', () => {
      expect(order()).toMatchObject({ commission: 1250, commissionRefund: 0 })
    })

    it('AC-9: доставка к покупателю — deliveryService строки «Логистика» с deliveryAmount = 1, дата — rrDate', () => {
      expect(logisticsByDate(order())).toEqual({ '2026-10-04': 80 })
    })

    it('AC-9: суммы отчёта — строки с копейками → числа ("399.68" − "300.00" = 99,68)', () => {
      const o = adaptOne(
        [feedOrder({ srid: 'wb-kop', status: 'buyout', sellerPrice: 399.68, createdAt: '2026-10-01T12:00:00+03:00', updatedAt: '2026-10-03T12:00:00+03:00' })],
        [saleRow('wb-kop', '2026-10-03', '399.68', '300.00'), deliveryRow('wb-kop', '2026-10-03', '45.50')],
      )

      expect(o.commission).toBeCloseTo(99.68, 10)
      expect(logisticsByDate(o)['2026-10-03']).toBeCloseTo(45.5, 10)
    })

    it('AC-9: saleDt берётся частью ГГГГ-ММ-ДД без перевода часового пояса', () => {
      // 22:30Z при переводе в Москву дало бы 05.10 — по правилу остаётся 04.10
      const o = adaptOne(
        [feedOrder({ srid: 'wb-tz', status: 'buyout', createdAt: '2026-10-01T12:00:00+03:00', updatedAt: '2026-10-05T01:00:00+03:00' })],
        [{ ...saleRow('wb-tz', '2026-10-04', '5000.00', '3750.00'), saleDt: '2026-10-04T22:30:00Z' }],
      )

      expect(o.boughtOn).toBe('2026-10-04')
    })
  })

  describe('AC-9: возврат', () => {
    const jacket = (status: 'return' | 'returnDefective') => {
      const srid = `wb-${status}`
      return adaptOne(
        // updatedAt ленты — 12.10, но дата возврата берётся только из отчёта (10.10)
        [feedOrder({ srid, status, createdAt: '2026-10-01T12:00:00+03:00', updatedAt: '2026-10-12T09:00:00+03:00' })],
        [
          saleRow(srid, '2026-10-04', '5000.00', '3750.00'),
          deliveryRow(srid, '2026-10-04', '80.00'),
          returnRow(srid, '2026-10-10', '5000.00', '3750.00'),
          backDeliveryRow(srid, '2026-10-10', '80.00'),
        ],
      )
    }

    it.each(['return', 'returnDefective'] as const)('AC-9: status = %s → «возвращён»; выкуп 04.10, возврат — saleDt строки «Возврат» (10.10)', (status) => {
      expect(jacket(status)).toMatchObject({ outcome: 'returned', boughtOn: '2026-10-04', returnedOn: '2026-10-10', cancelledOn: null })
    })

    it('AC-9: комиссия возврата = retailPriceWithDisc − forPay строки «Возврат»; комиссия выкупа сохраняется', () => {
      expect(jacket('return')).toMatchObject({ commission: 1250, commissionRefund: 1250 })
    })

    it('AC-9: обратная доставка — строка «Логистика» с returnAmount = 1, своим днём', () => {
      expect(logisticsByDate(jacket('return'))).toEqual({ '2026-10-04': 80, '2026-10-10': 80 })
    })
  })

  describe('AC-9: отмена', () => {
    it('AC-9: cancelType = app — отмена до отправки, дата — день updatedAt по Москве, логистики нет', () => {
      const o = adaptOne([
        feedOrder({ srid: 'wb-app', status: 'cancel', cancelType: 'app', createdAt: '2026-10-02T20:00:00+03:00', updatedAt: '2026-10-03T00:10:00+03:00' }),
      ])

      // 00:10 +03:00 — это 03.10 по Москве (в UTC было бы 02.10)
      expect(o).toMatchObject({ outcome: 'cancelled', cancelledOn: '2026-10-03', boughtOn: null, returnedOn: null, commission: 0, commissionRefund: 0 })
      expect(o.logistics).toEqual([])
    })

    it.each(['receipt', 'expire'] as const)('AC-9: cancelType = %s — товар ехал к покупателю: доставка и обратная доставка в день отмены', (cancelType) => {
      const srid = `wb-${cancelType}`
      const o = adaptOne(
        [feedOrder({ srid, status: 'cancel', cancelType, createdAt: '2026-10-01T12:00:00+03:00', updatedAt: '2026-10-08T18:00:00+03:00' })],
        [deliveryRow(srid, '2026-10-08', '80.00'), backDeliveryRow(srid, '2026-10-08', '80.00')],
      )

      expect(o).toMatchObject({ outcome: 'cancelled', cancelledOn: '2026-10-08', boughtOn: null, commission: 0 })
      expect(logisticsByDate(o)).toEqual({ '2026-10-08': 160 })
    })

    it('AC-9: cancelType = other — тоже отмена', () => {
      const o = adaptOne([
        feedOrder({ srid: 'wb-other', status: 'cancel', cancelType: 'other', createdAt: '2026-10-01T12:00:00+03:00', updatedAt: '2026-10-02T12:00:00+03:00' }),
      ])

      expect(o).toMatchObject({ outcome: 'cancelled', cancelledOn: '2026-10-02' })
    })
  })

  describe('AC-9: остатки', () => {
    it('AC-9: остаток — сумма quantity по размерам (chrtId) товара на складе; товары в пути не входят', () => {
      const { stocks } = wbAdapter(
        raw({
          stocks: [
            stockItem({ chrtId: 101, warehouseName: 'Коледино', quantity: 3, inWayToClient: 5, inWayFromClient: 2 }),
            stockItem({ chrtId: 102, warehouseName: 'Коледино', quantity: 4, inWayToClient: 1 }),
            stockItem({ chrtId: 101, warehouseId: 120762, warehouseName: 'Казань', quantity: 6 }),
          ],
        }),
        catalog,
      )

      const byWarehouse = new Map(stocks.map((s) => [s.warehouse, s]))
      expect(stocks).toHaveLength(2)
      expect(byWarehouse.get('Коледино')).toEqual({
        sku: '47254354',
        offerId: 'KURT-001',
        name: 'Куртка зимняя мужская',
        category: 'clothing',
        marketplace: 'wb',
        scheme: null,
        warehouse: 'Коледино',
        stock: 7,
      })
      expect(byWarehouse.get('Казань')?.stock).toBe(6)
    })
  })

  describe('AC-9: незнакомые значения — ошибка, а не тихий неверный расчёт', () => {
    it('AC-9: незнакомый статус ленты заказов → адаптер бросает ошибку', () => {
      // Значение вне enum документации: проверяем поведение адаптера, а не типов
      const unknownStatus = 'lost' as unknown as FeedOrder['status']
      const feed = [feedOrder({ srid: 'wb-x', status: unknownStatus, createdAt: '2026-10-01T12:00:00+03:00', updatedAt: '2026-10-01T12:00:00+03:00' })]

      expect(() => wbAdapter(raw({ orderFeed: feed }), catalog)).toThrow()
    })

    it('AC-9: незнакомое обоснование для оплаты (sellerOperName) → адаптер бросает ошибку', () => {
      const srid = 'wb-fine'
      const feed = [feedOrder({ srid, status: 'buyout', createdAt: '2026-10-01T12:00:00+03:00', updatedAt: '2026-10-04T12:00:00+03:00' })]
      const report = [
        saleRow(srid, '2026-10-04', '5000.00', '3750.00'),
        reportRow({ srid, docTypeName: 'Продажа', sellerOperName: 'Штраф' as unknown as ReportRow['sellerOperName'], rrDate: '2026-10-04' }),
      ]

      expect(() => wbAdapter(raw({ orderFeed: feed, salesReport: report }), catalog)).toThrow()
    })
  })
})
