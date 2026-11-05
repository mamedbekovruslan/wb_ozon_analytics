// @vitest-environment node
import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import type { Order } from '../domain'
import { generateRawData } from '../generator'
import { wbAdapter } from '../wb'
import { ozonAdapter } from './index'

/*
 * AC-10: каждая строка таблицы «Соответствие доменной модели» и таблицы складов
 * из docs/domain/ozon-api.md проверена на вручную собранной сырой записи.
 * AC-11: обе площадки дают записи одного доменного типа.
 */

type OzonRaw = Parameters<typeof ozonAdapter>[0]
type Catalog = Parameters<typeof ozonAdapter>[1]
type FboPosting = OzonRaw['fboPostings'][number]
type FbsPosting = OzonRaw['fbsPostings'][number]
type ReturnItem = OzonRaw['returns'][number]
type Accrual = OzonRaw['accruals'][number]
type FboStockItem = OzonRaw['fboStocks'][number]
type FbsStockItem = OzonRaw['fbsStocks'][number]
type StatusLogEntry = OzonRaw['statusLog'][number]

const PHONE_SKU = 9880276314
const KETTLE_SKU = 1234567890

// Допущение о форме справочника продавца — см. отчёт qa (вопрос о типе catalog)
const catalog: Catalog = [
  { sku: String(PHONE_SKU), offerId: 'PHONE-128', name: 'Смартфон 128 ГБ', category: 'electronics', marketplace: 'ozon', costPrice: 20_000 },
  { sku: String(KETTLE_SKU), offerId: 'KETTLE-1', name: 'Чайник электрический', category: 'home', marketplace: 'ozon', costPrice: 900 },
]

const rub = (amount: string) => ({ amount, currency: 'RUB' as const })

function product(sku: number) {
  return sku === PHONE_SKU
    ? { sku, offer_id: 'PHONE-128', name: 'Смартфон 128 ГБ', quantity: 1, price: rub('28990') }
    : { sku, offer_id: 'KETTLE-1', name: 'Чайник электрический', quantity: 1, price: rub('3490') }
}

function financial(sku: number, commission: number) {
  const price = sku === PHONE_SKU ? 28_990 : 3490
  return {
    products: [
      { product_id: sku, price, old_price: price, payout: price - commission, commission: { amount: commission, percent: 15, currency: 'RUB' as const } },
    ],
  }
}

const cancellation = (afterShip: boolean) => ({
  cancel_reason_id: afterShip ? 352 : 402,
  cancel_reason: afterShip ? 'Покупатель отказался при получении' : 'Отменено покупателем',
  cancellation_initiator: 'Клиент',
  cancelled_after_ship: afterShip,
})

function fboPosting(
  p: Partial<FboPosting> & Pick<FboPosting, 'posting_number' | 'status' | 'created_at'> & { sku?: number; warehouseName?: string; commission?: number },
): FboPosting {
  const { sku = PHONE_SKU, warehouseName = 'ХОРУГВИНО_РФЦ', commission = 4348.5, ...rest } = p
  return {
    order_id: 9121072335,
    order_number: p.posting_number.split('-').slice(0, 2).join('-'),
    substatus: '',
    in_process_at: p.created_at,
    products: [product(sku)],
    analytics_data: { warehouse_id: 1020000000, warehouse_name: warehouseName },
    financial_data: financial(sku, commission),
    cancellation: null,
    ...rest,
  }
}

function fbsPosting(
  p: Partial<FbsPosting> & Pick<FbsPosting, 'posting_number' | 'status' | 'in_process_at'> & { sku?: number; commission?: number },
): FbsPosting {
  const { sku = KETTLE_SKU, commission = 523.5, ...rest } = p
  return {
    order_id: 2000000000,
    order_number: p.posting_number.split('-').slice(0, 2).join('-'),
    substatus: '',
    products: [product(sku)],
    analytics_data: { warehouse: 'Склад продавца, Москва' },
    financial_data: financial(sku, commission),
    cancellation: null,
    delivery_schema: 'fbs',
    ...rest,
  }
}

let accrualSeq = 1

/** Начисление за день по отправлению: цена продажи (0 — не продажа) и доставка со знаком «−». */
function accrual(p: { posting: string; date: string; sku: number; schema: 'fbo' | 'fbs'; salePrice: string; saleCommission: string; delivery: string }): Accrual {
  return {
    date: p.date,
    accrual_id: `acc-${accrualSeq++}`,
    unit_number: p.posting,
    posting: {
      delivery_schema: p.schema,
      products: [
        {
          sku: p.sku,
          commission: { sale_price: rub(p.salePrice), sale_commission: rub(p.saleCommission) },
          delivery: { total_accrued: rub(p.delivery) },
        },
      ],
    },
    total_amount: rub((Number(p.salePrice) + Number(p.saleCommission) + Number(p.delivery)).toFixed(2)),
  }
}

function returnItem(p: { posting: string; sku: number; schema: 'Fbo' | 'Fbs'; returnDate: string; commission: string }): ReturnItem {
  const base = product(p.sku)
  return {
    id: `ret-${p.posting}`,
    posting_number: p.posting,
    order_id: '24540784250',
    order_number: p.posting.split('-').slice(0, 2).join('-'),
    schema: p.schema,
    type: 'FullReturn',
    return_reason_name: 'Не подошёл товар',
    product: {
      sku: p.sku,
      offer_id: base.offer_id,
      name: base.name,
      quantity: 1,
      price: { currency_code: 'RUB', price: base.price.amount },
      commission_percent: 15,
      commission: { currency_code: 'RUB', price: p.commission },
    },
    logistic: { return_date: p.returnDate },
    visual: { status: { sys_name: 'ArrivedAtReturnPlace' } },
  }
}

const statusLog = (posting: string, changedAt: string): StatusLogEntry => ({ posting_number: posting, status: 'cancelled', changed_at: changedAt })

function raw(p: Partial<OzonRaw>): OzonRaw {
  return { fboPostings: [], fbsPostings: [], returns: [], accruals: [], fboStocks: [], fbsStocks: [], statusLog: [], ...p }
}

function adaptById(input: OzonRaw, id: string): Order {
  const order = ozonAdapter(input, catalog).orders.find((o) => o.id === id)
  if (!order) throw new Error(`адаптер не вернул заказ ${id}`)
  return order
}

function logisticsByDate(order: Order): Record<string, number> {
  const result: Record<string, number> = {}
  for (const { date, amount } of order.logistics) result[date] = (result[date] ?? 0) + amount
  return result
}

// --- Сценарии ---

// FBO, доставлено: заказ 01.10 22:30 UTC = 02.10 01:30 МСК, продажа 05.10
const FBO_BOUGHT = '1000000001-0001-1'
// FBO, доставлено и возвращено 09.10 22:30 UTC = 10.10 по Москве
const FBO_RETURNED = '1000000002-0001-1'
// FBS, доставлено: начало обработки 01.10 21:00 UTC = 02.10 00:00 МСК
const FBS_BOUGHT = '2000000005-0001-1'
// FBS, отмена до отправки; запись о смене статуса 03.10 21:30 UTC = 04.10 МСК
const FBS_CANCEL_BEFORE = '2000000001-0001-1'
// FBS, отказ при получении 07.10; в /returns есть запись — её нужно игнорировать
const FBS_CANCEL_AFTER = '2000000002-0001-1'

const scenario = (): OzonRaw =>
  raw({
    fboPostings: [
      fboPosting({ posting_number: FBO_BOUGHT, status: 'delivered', substatus: 'posting_received', created_at: '2026-10-01T22:30:00Z' }),
      fboPosting({ posting_number: FBO_RETURNED, status: 'delivered', substatus: 'posting_received', created_at: '2026-10-01T10:00:00Z', warehouseName: 'ПУШКИНО_1_РФЦ' }),
    ],
    fbsPostings: [
      fbsPosting({ posting_number: FBS_BOUGHT, status: 'delivered', substatus: 'posting_received', in_process_at: '2026-10-01T21:00:00Z' }),
      fbsPosting({ posting_number: FBS_CANCEL_BEFORE, status: 'cancelled', substatus: 'posting_canceled', in_process_at: '2026-10-02T09:00:00Z', cancellation: cancellation(false) }),
      fbsPosting({ posting_number: FBS_CANCEL_AFTER, status: 'cancelled', substatus: 'posting_canceled', in_process_at: '2026-10-02T09:00:00Z', cancellation: cancellation(true) }),
    ],
    accruals: [
      accrual({ posting: FBO_BOUGHT, date: '2026-10-05', sku: PHONE_SKU, schema: 'fbo', salePrice: '28990.00', saleCommission: '-4348.50', delivery: '-85.00' }),
      accrual({ posting: FBO_RETURNED, date: '2026-10-05', sku: PHONE_SKU, schema: 'fbo', salePrice: '28990.00', saleCommission: '-4348.50', delivery: '-85.00' }),
      accrual({ posting: FBO_RETURNED, date: '2026-10-10', sku: PHONE_SKU, schema: 'fbo', salePrice: '0.00', saleCommission: '0.00', delivery: '-85.00' }),
      accrual({ posting: FBS_BOUGHT, date: '2026-10-04', sku: KETTLE_SKU, schema: 'fbs', salePrice: '3490.00', saleCommission: '-523.50', delivery: '-60.00' }),
      accrual({ posting: FBS_CANCEL_AFTER, date: '2026-10-07', sku: KETTLE_SKU, schema: 'fbs', salePrice: '0.00', saleCommission: '0.00', delivery: '-80.00' }),
      accrual({ posting: FBS_CANCEL_AFTER, date: '2026-10-07', sku: KETTLE_SKU, schema: 'fbs', salePrice: '0.00', saleCommission: '0.00', delivery: '-80.00' }),
    ],
    returns: [
      returnItem({ posting: FBO_RETURNED, sku: PHONE_SKU, schema: 'Fbo', returnDate: '2026-10-09T22:30:00Z', commission: '4348.50' }),
      returnItem({ posting: FBS_CANCEL_AFTER, sku: KETTLE_SKU, schema: 'Fbs', returnDate: '2026-10-07T12:00:00Z', commission: '523.50' }),
      returnItem({ posting: FBS_CANCEL_BEFORE, sku: KETTLE_SKU, schema: 'Fbs', returnDate: '2026-10-05T12:00:00Z', commission: '523.50' }),
    ],
    statusLog: [statusLog(FBS_CANCEL_BEFORE, '2026-10-03T21:30:00Z'), statusLog(FBS_CANCEL_AFTER, '2026-10-07T10:00:00Z')],
  })

describe('ozonAdapter', () => {
  describe('AC-10: поля заказа', () => {
    it('AC-10: площадка всегда ozon; ID заказа — posting_number', () => {
      expect(adaptById(scenario(), FBO_BOUGHT)).toMatchObject({ id: FBO_BOUGHT, marketplace: 'ozon' })
    })

    it('AC-10: схема — по методу: /v3/posting/fbo/list → FBO, /v4/posting/fbs/list → FBS', () => {
      expect(adaptById(scenario(), FBO_BOUGHT).scheme).toBe('FBO')
      expect(adaptById(scenario(), FBS_BOUGHT).scheme).toBe('FBS')
    })

    it('AC-10: артикул площадки — products[].sku, число → строка', () => {
      expect(adaptById(scenario(), FBO_BOUGHT).sku).toBe('9880276314')
    })

    it('AC-10: артикул продавца и название — offer_id и name как есть; категория и себестоимость — из справочника', () => {
      expect(adaptById(scenario(), FBO_BOUGHT)).toMatchObject({ offerId: 'PHONE-128', name: 'Смартфон 128 ГБ', category: 'electronics', costPrice: 20_000 })
      expect(adaptById(scenario(), FBS_BOUGHT)).toMatchObject({ offerId: 'KETTLE-1', name: 'Чайник электрический', category: 'home', costPrice: 900 })
    })

    it('AC-10: цена — products[].price.amount, строка → число ("28990" → 28990)', () => {
      expect(adaptById(scenario(), FBO_BOUGHT).price).toBe(28_990)
      expect(adaptById(scenario(), FBS_BOUGHT).price).toBe(3490)
    })

    it('AC-10: FBO — дата заказа created_at, 22:30 UTC относится к следующему дню по Москве', () => {
      const { orderedAt, orderDate } = adaptById(scenario(), FBO_BOUGHT)

      expect(orderedAt).toMatch(/\+03:00$/)
      expect(new Date(orderedAt).getTime()).toBe(new Date('2026-10-01T22:30:00Z').getTime())
      expect(orderDate).toBe('2026-10-02')
    })

    it('AC-10: FBS — дата заказа in_process_at, переводится из UTC в Москву', () => {
      const { orderedAt, orderDate } = adaptById(scenario(), FBS_BOUGHT)

      expect(orderedAt).toMatch(/\+03:00$/)
      expect(new Date(orderedAt).getTime()).toBe(new Date('2026-10-01T21:00:00Z').getTime())
      expect(orderDate).toBe('2026-10-02')
    })

    it('AC-10: время FBO с микросекундами (23:59:51.653736Z) — тоже следующий день по Москве', () => {
      const input = raw({
        fboPostings: [fboPosting({ posting_number: '1000000009-0001-1', status: 'delivering', created_at: '2026-05-10T23:59:51.653736Z' })],
      })

      const order = adaptById(input, '1000000009-0001-1')

      expect(order.orderDate).toBe('2026-05-11')
      expect(order.orderedAt).toMatch(/^2026-05-11T02:59:51.*\+03:00$/)
    })
  })

  describe('AC-10: склады', () => {
    it.each([
      ['ХОРУГВИНО_РФЦ', 'Хоругвино'],
      ['ПУШКИНО_1_РФЦ', 'Пушкино'],
      ['ГРИВНО_РФЦ', 'Гривно'],
      ['КАЗАНЬ_РФЦ', 'Казань'],
      ['НОВОСИБИРСК_РФЦ', 'Новосибирск'],
    ])('AC-10: склад FBO %s → «%s»', (apiName, ourName) => {
      const input = raw({ fboPostings: [fboPosting({ posting_number: '1000000010-0001-1', status: 'delivering', created_at: '2026-10-01T10:00:00Z', warehouseName: apiName })] })

      expect(adaptById(input, '1000000010-0001-1').warehouse).toBe(ourName)
    })

    it('AC-10: склад FBS — analytics_data.warehouse как есть', () => {
      expect(adaptById(scenario(), FBS_BOUGHT).warehouse).toBe('Склад продавца, Москва')
    })

    it('AC-10: незнакомый склад FBO → адаптер бросает ошибку, а не угадывает', () => {
      const input = raw({ fboPostings: [fboPosting({ posting_number: '1000000011-0001-1', status: 'delivering', created_at: '2026-10-01T10:00:00Z', warehouseName: 'ОМСК_РФЦ' })] })

      expect(() => ozonAdapter(input, catalog)).toThrow()
    })
  })

  describe('AC-10: статусы и события', () => {
    it.each(['awaiting_packaging', 'awaiting_deliver', 'delivering'])('AC-10: status = %s → «в пути», событий и денег нет', (status) => {
      const input = raw({ fbsPostings: [fbsPosting({ posting_number: '2000000020-0001-1', status, in_process_at: '2026-11-04T08:00:00Z' })] })

      expect(adaptById(input, '2000000020-0001-1')).toMatchObject({
        outcome: 'inTransit',
        boughtOn: null,
        cancelledOn: null,
        returnedOn: null,
        commission: 0,
        commissionRefund: 0,
        logistics: [],
      })
    })

    it('AC-10: delivered → «выкуплен», дата выкупа — date начисления с sale_price по отправлению', () => {
      expect(adaptById(scenario(), FBO_BOUGHT)).toMatchObject({ outcome: 'bought', boughtOn: '2026-10-05', returnedOn: null, cancelledOn: null })
      expect(adaptById(scenario(), FBS_BOUGHT)).toMatchObject({ outcome: 'bought', boughtOn: '2026-10-04' })
    })

    it('AC-10: комиссия выкупа — financial_data.products[].commission.amount', () => {
      expect(adaptById(scenario(), FBO_BOUGHT)).toMatchObject({ commission: 4348.5, commissionRefund: 0 })
    })

    it('AC-10: логистика — delivery.total_accrued начислений по модулю ("-85.00" → 85), дата — date начисления', () => {
      expect(logisticsByDate(adaptById(scenario(), FBO_BOUGHT))).toEqual({ '2026-10-05': 85 })
    })

    it('AC-10: возврат — запись /v1/returns/list у доставленного отправления; дата return_date 22:30 UTC → следующий день по Москве', () => {
      expect(adaptById(scenario(), FBO_RETURNED)).toMatchObject({
        outcome: 'returned',
        boughtOn: '2026-10-05',
        returnedOn: '2026-10-10',
        cancelledOn: null,
      })
    })

    it('AC-10: комиссия возврата — product.commission.price записи возврата, строка → число', () => {
      expect(adaptById(scenario(), FBO_RETURNED)).toMatchObject({ commission: 4348.5, commissionRefund: 4348.5 })
    })

    it('AC-10: у возвращённого — доставка в день продажи и обратная доставка в день возврата', () => {
      expect(logisticsByDate(adaptById(scenario(), FBO_RETURNED))).toEqual({ '2026-10-05': 85, '2026-10-10': 85 })
    })

    it('AC-10: cancelled, cancelled_after_ship = false — отмена до отправки, дата из журнала статусов (21:30 UTC → следующий день), логистики нет', () => {
      const order = adaptById(scenario(), FBS_CANCEL_BEFORE)

      expect(order).toMatchObject({ outcome: 'cancelled', cancelledOn: '2026-10-04', boughtOn: null, commission: 0, commissionRefund: 0 })
      expect(order.logistics).toEqual([])
    })

    it('AC-10: cancelled, cancelled_after_ship = true — отказ при получении: доставка и обратная доставка в день отмены', () => {
      const order = adaptById(scenario(), FBS_CANCEL_AFTER)

      expect(order).toMatchObject({ outcome: 'cancelled', cancelledOn: '2026-10-07', boughtOn: null, commission: 0 })
      expect(logisticsByDate(order)).toEqual({ '2026-10-07': 160 })
    })

    it('AC-10: запись возврата у отменённого (не доставленного) отправления игнорируется — это отказ, уже учтён как отмена', () => {
      for (const id of [FBS_CANCEL_AFTER, FBS_CANCEL_BEFORE]) {
        expect(adaptById(scenario(), id)).toMatchObject({ outcome: 'cancelled', returnedOn: null, commissionRefund: 0 })
      }
    })

    it('AC-10: незнакомый статус отправления → адаптер бросает ошибку', () => {
      const input = raw({ fbsPostings: [fbsPosting({ posting_number: '2000000030-0001-1', status: 'arbitration', in_process_at: '2026-10-01T10:00:00Z' })] })

      expect(() => ozonAdapter(input, catalog)).toThrow()
    })
  })

  describe('п. 17: отправление с несколькими единицами товара', () => {
    // Правило деления логистики, комиссии и возврата между единицами не описано —
    // адаптер не угадывает, а бросает ошибку
    const twoProducts = () => [product(PHONE_SKU), product(KETTLE_SKU)]
    const twoFinancial = () => ({
      products: [...financial(PHONE_SKU, 4348.5).products, ...financial(KETTLE_SKU, 523.5).products],
    })

    it('п. 17: контроль — то же отправление FBO и FBS с одной единицей адаптируется без ошибки', () => {
      const input = raw({
        fboPostings: [fboPosting({ posting_number: '1000000050-0001-1', status: 'delivering', created_at: '2026-10-01T10:00:00Z' })],
        fbsPostings: [fbsPosting({ posting_number: '2000000050-0001-1', status: 'delivering', in_process_at: '2026-10-01T10:00:00Z' })],
      })

      expect(() => ozonAdapter(input, catalog)).not.toThrow()
    })

    it('п. 17: FBO, товар с quantity = 2 → адаптер бросает ошибку', () => {
      const input = raw({
        fboPostings: [
          fboPosting({
            posting_number: '1000000051-0001-1',
            status: 'delivering',
            created_at: '2026-10-01T10:00:00Z',
            products: [{ ...product(PHONE_SKU), quantity: 2 }],
          }),
        ],
      })

      expect(() => ozonAdapter(input, catalog)).toThrow()
    })

    it('п. 17: FBS, товар с quantity = 2 → адаптер бросает ошибку', () => {
      const input = raw({
        fbsPostings: [
          fbsPosting({
            posting_number: '2000000051-0001-1',
            status: 'delivering',
            in_process_at: '2026-10-01T10:00:00Z',
            products: [{ ...product(KETTLE_SKU), quantity: 2 }],
          }),
        ],
      })

      expect(() => ozonAdapter(input, catalog)).toThrow()
    })

    it('п. 17: FBO, два разных товара в отправлении → адаптер бросает ошибку', () => {
      const input = raw({
        fboPostings: [
          fboPosting({
            posting_number: '1000000052-0001-1',
            status: 'delivering',
            created_at: '2026-10-01T10:00:00Z',
            products: twoProducts(),
            financial_data: twoFinancial(),
          }),
        ],
      })

      expect(() => ozonAdapter(input, catalog)).toThrow()
    })

    it('п. 17: FBS, два разных товара в отправлении → адаптер бросает ошибку', () => {
      const input = raw({
        fbsPostings: [
          fbsPosting({
            posting_number: '2000000052-0001-1',
            status: 'delivering',
            in_process_at: '2026-10-01T10:00:00Z',
            products: twoProducts(),
            financial_data: twoFinancial(),
          }),
        ],
      })

      expect(() => ozonAdapter(input, catalog)).toThrow()
    })

    it('п. 17: одно «плохое» отправление среди нормальных — ошибка, а не молчаливый пропуск', () => {
      const input = scenario()
      input.fbsPostings.push(
        fbsPosting({
          posting_number: '2000000053-0001-1',
          status: 'delivering',
          in_process_at: '2026-10-01T10:00:00Z',
          products: [{ ...product(KETTLE_SKU), quantity: 2 }],
        }),
      )

      expect(() => ozonAdapter(input, catalog)).toThrow()
    })
  })

  describe('AC-10: остатки', () => {
    it('AC-10: остаток FBO — available_stock_count, склад по таблице складов, схема FBO', () => {
      const item: FboStockItem = {
        sku: PHONE_SKU,
        offer_id: 'PHONE-128',
        name: 'Смартфон 128 ГБ',
        warehouse_id: 1020000000,
        warehouse_name: 'КАЗАНЬ_РФЦ',
        available_stock_count: 12,
        ads: 0.4,
        idc: 30,
      }

      const { stocks } = ozonAdapter(raw({ fboStocks: [item] }), catalog)

      expect(stocks).toEqual([
        {
          sku: '9880276314',
          offerId: 'PHONE-128',
          name: 'Смартфон 128 ГБ',
          category: 'electronics',
          marketplace: 'ozon',
          scheme: 'FBO',
          warehouse: 'Казань',
          stock: 12,
        },
      ])
    })

    describe('остаток FBS', () => {
      // Справочника складов продавца в контракте нет — берём warehouse_id,
      // который генератор кладёт в остатки FBS (см. вопрос в отчёте qa)
      let sellerWarehouseId: FbsStockItem['warehouse_id']

      beforeAll(() => {
        const generated = generateRawData({ seed: 1, today: '2026-11-05' })
        const first = generated.ozon.fbsStocks[0]
        if (!first) throw new Error('генератор не создал остатков FBS')
        sellerWarehouseId = first.warehouse_id
      }, 120_000)

      it('AC-10: остаток FBS — free_stock (не present и не reserved), склад «Склад продавца, Москва», схема FBS', () => {
        const item: FbsStockItem = {
          sku: KETTLE_SKU,
          offer_id: 'KETTLE-1',
          product_id: 555_001,
          warehouse_id: sellerWarehouseId,
          present: 7,
          reserved: 2,
          free_stock: 5,
          updated_at: '2026-11-05T06:00:00Z',
        }

        const { stocks } = ozonAdapter(raw({ fbsStocks: [item] }), catalog)

        expect(stocks).toEqual([
          {
            sku: '1234567890',
            offerId: 'KETTLE-1',
            name: 'Чайник электрический',
            category: 'home',
            marketplace: 'ozon',
            scheme: 'FBS',
            warehouse: 'Склад продавца, Москва',
            stock: 5,
          },
        ])
      })
    })
  })
})

describe('AC-11: единая доменная модель WB и Ozon', () => {
  const ORDER_KEYS = [
    'boughtOn',
    'cancelledOn',
    'category',
    'commission',
    'commissionRefund',
    'costPrice',
    'id',
    'logistics',
    'marketplace',
    'name',
    'offerId',
    'orderDate',
    'orderedAt',
    'outcome',
    'price',
    'returnedOn',
    'scheme',
    'sku',
    'warehouse',
  ]
  const STOCK_KEYS = ['category', 'marketplace', 'name', 'offerId', 'scheme', 'sku', 'stock', 'warehouse']

  type WbRaw = Parameters<typeof wbAdapter>[0]

  const wbCatalog: Parameters<typeof wbAdapter>[1] = [
    { sku: '47254354', offerId: 'KURT-001', name: 'Куртка зимняя мужская', category: 'clothing', marketplace: 'wb', costPrice: 2000 },
  ]

  const wbRaw: WbRaw = {
    orderFeed: [
      {
        srid: 'wb-srid-0001',
        nmId: 47254354,
        chrtId: 101,
        createdAt: '2026-11-04T12:00:00+03:00',
        updatedAt: '2026-11-04T12:00:00+03:00',
        status: 'created',
        warehouseName: 'Коледино',
        warehouseRegion: 'Центральный',
        isMp: false,
        destinationCity: 'Москва',
        destinationDistrict: 'Центральный',
        sellerPrice: 5000,
        isB2b: false,
      },
    ],
    salesReport: [],
    stocks: [
      { nmId: 47254354, chrtId: 101, warehouseId: 507, warehouseName: 'Коледино', regionName: 'Россия', quantity: 3, inWayToClient: 0, inWayFromClient: 0 },
    ],
  }

  const ozonRaw = (): OzonRaw =>
    raw({
      fboPostings: [fboPosting({ posting_number: '1000000040-0001-1', status: 'delivering', created_at: '2026-11-04T09:00:00Z' })],
      fboStocks: [
        {
          sku: PHONE_SKU,
          offer_id: 'PHONE-128',
          name: 'Смартфон 128 ГБ',
          warehouse_id: 1020000000,
          warehouse_name: 'ХОРУГВИНО_РФЦ',
          available_stock_count: 4,
          ads: 0,
          idc: 0,
        },
      ],
    })

  it('AC-11: заказы обеих площадок — один тип с одинаковым набором полей, отличается поле площадки', () => {
    const wb = wbAdapter(wbRaw, wbCatalog)
    const ozon = ozonAdapter(ozonRaw(), catalog)

    expectTypeOf(wb.orders).toEqualTypeOf(ozon.orders)
    expectTypeOf(wb.stocks).toEqualTypeOf(ozon.stocks)

    const [wbOrder] = wb.orders
    const [ozonOrder] = ozon.orders
    expect(Object.keys(wbOrder ?? {}).sort()).toEqual(ORDER_KEYS)
    expect(Object.keys(ozonOrder ?? {}).sort()).toEqual(ORDER_KEYS)
    expect(wbOrder?.marketplace).toBe('wb')
    expect(ozonOrder?.marketplace).toBe('ozon')
  })

  it('AC-11: остатки обеих площадок — один тип с одинаковым набором полей', () => {
    const [wbStock] = wbAdapter(wbRaw, wbCatalog).stocks
    const [ozonStock] = ozonAdapter(ozonRaw(), catalog).stocks

    expect(Object.keys(wbStock ?? {}).sort()).toEqual(STOCK_KEYS)
    expect(Object.keys(ozonStock ?? {}).sort()).toEqual(STOCK_KEYS)
    expect(wbStock?.marketplace).toBe('wb')
    expect(ozonStock?.marketplace).toBe('ozon')
  })
})
