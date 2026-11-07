// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Order, StockRow } from '../domain'
import { stocks } from './index'
import { boughtOrder, cancelledBeforeShipOrder, inTransitOrder, returnedOrder, stockRow } from './testFixtures'

/*
 * Остатки (docs/domain.md, «Остатки»; spec 001, «Контракт»):
 * скорость = число заказов с boughtOn в последних 14 днях ВКЛЮЧАЯ «сегодня» / 14,
 * дни запаса = остаток / скорость; скорость 0 → «нет продаж» (days = null);
 * статус: критично < 7 · скоро 7–14 · норма > 14.
 *
 * «Сегодня» — 05.11.2026, окно — 23.10–05.11 (9 дней октября + 5 ноября = 14).
 */

const TODAY = '2026-11-05'
const WINDOW = [
  '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29',
  '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05',
]

function buyouts(sku: string, warehouse: string, dates: readonly string[]): Order[] {
  return dates.map((date, i) =>
    boughtOrder({ id: `${sku}-${warehouse}-${i}`, sku, warehouse, orderDate: date, boughtOn: date, price: 100, commission: 0, delivery: 0, costPrice: 0 }),
  )
}

const rows: StockRow[] = [
  // R1: 10 шт, 7 выкупов в окне (включая возвращённый — boughtOn есть) → 0,5/день → 20 дней → норма
  stockRow({ sku: 'S1', warehouse: 'Коледино', stock: 10 }),
  // R2: 7 шт, 14 выкупов → 1/день → 7 дней → скоро (граница 7 включительно)
  stockRow({ sku: 'S1', warehouse: 'Казань', stock: 7 }),
  // R3: 3 шт, 7 выкупов → 0,5/день → 6 дней → критично
  stockRow({ sku: 'S2', warehouse: 'Коледино', stock: 3 }),
  // R4: 5 шт, выкупов в окне нет → нет продаж
  stockRow({ sku: 'S2', warehouse: 'Подольск', stock: 5 }),
  // R5: 0 шт, 14 выкупов → 0 дней → критично
  stockRow({ sku: 'S3', warehouse: 'Коледино', stock: 0 }),
  // R6: 14 шт, 14 выкупов → 14 дней → скоро (граница 14 включительно)
  stockRow({ sku: 'S4', warehouse: 'Коледино', stock: 14 }),
  // R7: 15 шт, 14 выкупов → 15 дней → норма
  stockRow({ sku: 'S4', warehouse: 'Казань', stock: 15 }),
  // R8: Ozon FBO, Электроника, 0 шт, продаж нет
  stockRow({ sku: 'S5', warehouse: 'Хоругвино', stock: 0, marketplace: 'ozon', scheme: 'FBO', category: 'electronics' }),
]

const orders: Order[] = [
  // R1: 6 выкупов + 1 возвращённый (выкуп 05.11 — последний день окна) = 7; выкуп 22.10 — вне окна
  ...buyouts('S1', 'Коледино', ['2026-10-23', '2026-10-25', '2026-10-28', '2026-10-30', '2026-11-01', '2026-11-03']),
  returnedOrder({
    id: 'S1-ret',
    sku: 'S1',
    warehouse: 'Коледино',
    orderDate: '2026-11-02',
    boughtOn: '2026-11-05',
    returnedOn: '2026-11-05',
    price: 100,
    commission: 0,
    delivery: 0,
    returnDelivery: 0,
    costPrice: 0,
  }),
  boughtOrder({ id: 'S1-old', sku: 'S1', warehouse: 'Коледино', orderDate: '2026-10-20', boughtOn: '2026-10-22', price: 100, commission: 0, delivery: 0, costPrice: 0 }),
  // R2: по выкупу каждый день окна
  ...buyouts('S1', 'Казань', WINDOW),
  // R3: 7 выкупов
  ...buyouts('S2', 'Коледино', WINDOW.slice(0, 7)),
  // R4: выкуп вне окна, заказ в пути и отмена — продаж в окне нет
  boughtOrder({ id: 'S2-old', sku: 'S2', warehouse: 'Подольск', orderDate: '2026-10-20', boughtOn: '2026-10-22', price: 100, commission: 0, delivery: 0, costPrice: 0 }),
  inTransitOrder({ id: 'S2-way', sku: 'S2', warehouse: 'Подольск', orderDate: '2026-11-04', price: 100 }),
  cancelledBeforeShipOrder({ id: 'S2-cnl', sku: 'S2', warehouse: 'Подольск', orderDate: '2026-11-01', cancelledOn: '2026-11-01', price: 100 }),
  // R5, R6, R7: по 14 выкупов
  ...buyouts('S3', 'Коледино', WINDOW),
  ...buyouts('S4', 'Коледино', WINDOW),
  ...buyouts('S4', 'Казань', WINDOW),
]

const key = (item: { sku: string; warehouse: string }) => `${item.sku}/${item.warehouse}`

describe('stocks', () => {
  it('AC-20: скорость продаж, дни запаса и статус по каждой паре «товар × склад»', () => {
    const result = stocks(rows, orders, { today: TODAY, mp: 'all', cat: [] })
    const byKey = new Map(result.items.map((i) => [key(i), i]))

    expect(byKey.get('S1/Коледино')).toEqual({
      sku: 'S1',
      name: 'Товар S1',
      offerId: 'ART-S1',
      marketplace: 'wb',
      scheme: null,
      warehouse: 'Коледино',
      category: 'clothing',
      stock: 10,
      perDay: 0.5,
      days: 20,
      status: 'ok',
    })
    expect(byKey.get('S1/Казань')).toMatchObject({ perDay: 1, days: 7, status: 'soon' })
    expect(byKey.get('S2/Коледино')).toMatchObject({ perDay: 0.5, days: 6, status: 'critical' })
    expect(byKey.get('S2/Подольск')).toMatchObject({ perDay: 0, days: null, status: 'noSales' })
    expect(byKey.get('S3/Коледино')).toMatchObject({ stock: 0, perDay: 1, days: 0, status: 'critical' })
    expect(byKey.get('S4/Коледино')).toMatchObject({ perDay: 1, days: 14, status: 'soon' })
    expect(byKey.get('S4/Казань')).toMatchObject({ perDay: 1, days: 15, status: 'ok' })
    expect(byKey.get('S5/Хоругвино')).toMatchObject({ marketplace: 'ozon', scheme: 'FBO', stock: 0, perDay: 0, days: null, status: 'noSales' })
  })

  it('AC-20: окно 14 дней включает «сегодня» и не включает 15-й день назад', () => {
    // На складе S1/Коледино выкупы 22.10 (вне окна) и 05.11 (в окне): в счёт идут 7, а не 8
    const result = stocks(rows, orders, { today: TODAY, mp: 'all', cat: [] })
    const item = result.items.find((i) => key(i) === 'S1/Коледино')

    expect(item?.perDay).toBe(7 / 14)
  })

  it('AC-20: «сегодня» сдвигает окно — те же данные днём позже дают другую скорость', () => {
    // 06.11: окно 24.10–06.11, выкуп 23.10 у S1/Коледино выпадает → 6 / 14
    const result = stocks(rows, orders, { today: '2026-11-06', mp: 'all', cat: [] })
    const item = result.items.find((i) => key(i) === 'S1/Коледино')

    expect(item?.perDay).toBeCloseTo(6 / 14, 10)
    expect(result.asOf).toBe('2026-11-06')
  })

  it('AC-21: сортировка по дням запаса по возрастанию, «нет продаж» в конце; счётчики по статусам', () => {
    const result = stocks(rows, orders, { today: TODAY, mp: 'all', cat: [] })
    const order = result.items.map(key)

    // 0, 6, 7, 14, 15, 20, затем «нет продаж» в любом порядке
    expect(order.slice(0, 6)).toEqual(['S3/Коледино', 'S2/Коледино', 'S1/Казань', 'S4/Коледино', 'S4/Казань', 'S1/Коледино'])
    expect([...order.slice(6)].sort()).toEqual(['S2/Подольск', 'S5/Хоругвино'])
    expect(result.counts).toEqual({ critical: 2, soon: 2, ok: 2, noSales: 2 })
    expect(result.total).toBe(8)
    expect(result.asOf).toBe(TODAY)
  })

  it('AC-21: фильтр по статусу не меняет счётчики', () => {
    const result = stocks(rows, orders, { today: TODAY, mp: 'all', cat: [], status: 'critical' })

    expect(result.items.map(key)).toEqual(['S3/Коледино', 'S2/Коледино'])
    expect(result.counts).toEqual({ critical: 2, soon: 2, ok: 2, noSales: 2 })
  })

  it('AC-21: limit обрезает список после сортировки', () => {
    const result = stocks(rows, orders, { today: TODAY, mp: 'all', cat: [], limit: 3 })

    expect(result.items.map(key)).toEqual(['S3/Коледино', 'S2/Коледино', 'S1/Казань'])
    expect(result.counts).toEqual({ critical: 2, soon: 2, ok: 2, noSales: 2 })
  })

  it('AC-16: фильтры площадки и категорий применяются к остаткам и счётчикам', () => {
    const ozon = stocks(rows, orders, { today: TODAY, mp: 'ozon', cat: [] })
    const electronics = stocks(rows, orders, { today: TODAY, mp: 'all', cat: ['electronics'] })
    const wbClothing = stocks(rows, orders, { today: TODAY, mp: 'wb', cat: ['clothing'] })

    for (const result of [ozon, electronics]) {
      expect(result.items.map(key)).toEqual(['S5/Хоругвино'])
      expect(result.counts).toEqual({ critical: 0, soon: 0, ok: 0, noSales: 1 })
    }
    expect(wbClothing.items).toHaveLength(7)
    expect(wbClothing.counts).toEqual({ critical: 2, soon: 2, ok: 2, noSales: 1 })
  })

  it('AC-20: нет остатков — пустой список и нулевые счётчики', () => {
    const result = stocks([], orders, { today: TODAY, mp: 'all', cat: [] })

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
    expect(result.counts).toEqual({ critical: 0, soon: 0, ok: 0, noSales: 0 })
  })
})

/*
 * Spec 007 «Скоро закончится», AC-9: статус — по целым дням, как показ «N дн.»:
 * d = floor(остаток / скорость); критично d < 7 · скоро 7 ≤ d ≤ 14 · норма d ≥ 15.
 * Порядок позиций — по точным дням, как раньше.
 *
 * Отдельный набор, чтобы не менять счётчики проверок выше:
 *   F1: 29 шт, 28 выкупов в окне (по 2 в день) → 2/день  → 14,5 дня → floor 14 → soon (раньше было бы ok)
 *   F2: 69 шт, 140 выкупов (по 10 в день)      → 10/день → 6,9 дня  → floor 6  → critical
 *   F3: 28 шт, 28 выкупов                      → 2/день  → 14 дней   → soon
 *   F4: 30 шт, 28 выкупов                      → 2/день  → 15 дней   → ok
 *   F5: 209 шт, 14 выкупов                     → 1/день  → 209 дней  → ok
 */
describe('stocks — статус по целым дням (spec 007)', () => {
  const repeat = (times: number) => WINDOW.flatMap((date) => Array.from({ length: times }, () => date))

  const floorRows: StockRow[] = [
    stockRow({ sku: 'F1', warehouse: 'Коледино', stock: 29 }),
    stockRow({ sku: 'F2', warehouse: 'Казань', stock: 69, marketplace: 'ozon', scheme: 'FBS', category: 'electronics' }),
    stockRow({ sku: 'F3', warehouse: 'Подольск', stock: 28 }),
    stockRow({ sku: 'F4', warehouse: 'Электросталь', stock: 30 }),
    stockRow({ sku: 'F5', warehouse: 'Коледино', stock: 209 }),
  ]
  const floorOrders: Order[] = [
    ...buyouts('F1', 'Коледино', repeat(2)),
    ...buyouts('F2', 'Казань', repeat(10)),
    ...buyouts('F3', 'Подольск', repeat(2)),
    ...buyouts('F4', 'Электросталь', repeat(2)),
    ...buyouts('F5', 'Коледино', WINDOW),
  ]
  const run = () => stocks(floorRows, floorOrders, { today: TODAY, mp: 'all', cat: [] })
  const byKey = () => new Map(run().items.map((i) => [key(i), i]))

  it('AC-9: 14,5 дня — soon (число «14 дн.» и бейдж «Скоро закончится» не расходятся)', () => {
    expect(byKey().get('F1/Коледино')).toMatchObject({ stock: 29, perDay: 2, status: 'soon' })
  })

  it('AC-9: 6,9 дня — critical', () => {
    expect(byKey().get('F2/Казань')).toMatchObject({ stock: 69, perDay: 10, status: 'critical' })
  })

  it('AC-9: прежние границы — 14 дней → soon, 15 дней → ok', () => {
    expect(byKey().get('F3/Подольск')).toMatchObject({ perDay: 2, status: 'soon' })
    expect(byKey().get('F4/Электросталь')).toMatchObject({ perDay: 2, status: 'ok' })
    expect(byKey().get('F5/Коледино')).toMatchObject({ perDay: 1, status: 'ok' })
  })

  it('AC-9: порядок — по точным дням: 6,9 → 14 → 14,5 → 15 → 209', () => {
    expect(run().items.map(key)).toEqual(['F2/Казань', 'F3/Подольск', 'F1/Коледино', 'F4/Электросталь', 'F5/Коледино'])
  })

  it('AC-9: счётчики — по новым статусам', () => {
    expect(run().counts).toEqual({ critical: 1, soon: 2, ok: 2, noSales: 0 })
  })

  it('AC-9, AC-3: limit со статусом по целым дням — critical / soon (включая 14,5 дня) идут раньше ok', () => {
    const result = stocks(floorRows, floorOrders, { today: TODAY, mp: 'all', cat: [], limit: 3 })
    expect(result.items.map((i) => i.status)).toEqual(['critical', 'soon', 'soon'])
  })
})
