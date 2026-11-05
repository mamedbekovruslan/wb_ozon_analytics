import type { CategoryId, Marketplace, Outcome } from '../domain'
import { addDays, dayNumber, mskMidnight } from '../lib/dates'
import { round2 } from '../lib/money'
import { createRandom, deriveSeed, weightedIndex, type Random } from '../lib/random'
import type { Product, ProductWarehouse } from './catalog'

// План заказов: каждый день строится от seed + календарная дата (ADR-0004),
// поэтому заказы дня одинаковы при любом «сегодня». Итог заказа и даты
// событий тоже решаются при создании; что из этого уже произошло к
// «сейчас» — решает visibleOutcome.

export type CancelKind = 'beforeShip' | 'receipt' | 'expire'

export type PlannedOrder = {
  date: string
  index: number
  product: Product
  warehouse: ProductWarehouse
  orderedMs: number
  price: number
  finalOutcome: 'bought' | 'cancelled' | 'returned'
  cancelKind: CancelKind | null
  boughtOn: string | null
  boughtMs: number | null
  cancelledOn: string | null
  cancelledMs: number | null
  returnedOn: string | null
  returnedMs: number | null
  returnDefective: boolean
  commission: number
  commissionPercent: number
  delivery: number
  returnDelivery: number
}

/** Доля выкупленных и оставленных у покупателя (WB); у Ozon чуть выше. Ориентиры — docs/domain.md. */
const KEEP_RATE: Record<CategoryId, number> = {
  clothing: 0.4,
  shoes: 0.55,
  electronics: 0.88,
  beauty: 0.85,
  home: 0.86,
  sports: 0.76,
  kids: 0.72,
  accessories: 0.8,
}

/** Какая часть невыкупленных — возвраты после выкупа (остальное — отмены). */
const RETURN_SHARE: Record<CategoryId, number> = {
  clothing: 0.3,
  shoes: 0.3,
  electronics: 0.25,
  beauty: 0.15,
  home: 0.2,
  sports: 0.25,
  kids: 0.25,
  accessories: 0.25,
}

/** Комиссия площадки, % от цены. */
const COMMISSION: Record<Marketplace, Record<CategoryId, number>> = {
  wb: { shoes: 24, clothing: 25, electronics: 14, beauty: 22, home: 18, sports: 19, kids: 17, accessories: 23 },
  ozon: { shoes: 20, clothing: 21, electronics: 11, beauty: 19, home: 15, sports: 16, kids: 14, accessories: 19 },
}

// Сезонность по месяцам (январь = 0): общая и по категориям
const MONTH_VOLUME = [0.9, 0.95, 1, 0.98, 0.97, 0.95, 0.95, 1, 1.02, 1.05, 1.18, 1.22]
const CATEGORY_SEASON: Partial<Record<CategoryId, readonly number[]>> = {
  clothing: [1.3, 1.2, 1, 0.9, 0.85, 0.8, 0.8, 0.9, 1.05, 1.25, 1.35, 1.35],
  shoes: [1.2, 1.1, 1.05, 1, 0.95, 0.9, 0.9, 1, 1.1, 1.2, 1.25, 1.2],
  sports: [1.1, 1, 1, 1.1, 1.25, 1.3, 1.3, 1.2, 1, 0.9, 0.85, 0.9],
  kids: [0.9, 0.9, 0.95, 1, 1, 1, 1.1, 1.4, 1.4, 1, 1.05, 1.3],
  electronics: [0.95, 0.95, 1, 1, 1, 0.95, 0.95, 1, 1, 1.05, 1.3, 1.35],
}
// Понедельник = 0
const WEEKDAY = [1.02, 1, 1, 1.02, 1.05, 0.96, 0.95]
// Ночью заказывают меньше
const HOUR_WEIGHTS = [0.4, 0.25, 0.15, 0.1, 0.1, 0.2, 0.4, 0.7, 0.9, 1, 1.1, 1.2, 1.3, 1.3, 1.2, 1.2, 1.2, 1.3, 1.4, 1.5, 1.6, 1.5, 1.2, 0.8]
const HOUR_CUMULATIVE = cumulate(HOUR_WEIGHTS)

function cumulate(weights: readonly number[]): number[] {
  let acc = 0
  return weights.map((w) => (acc += w))
}

// Тренд роста магазина привязан к абсолютной дате, а не к окну истории (AC-2).
// После 05.11.2026 рост выходит на плато: окно истории «едет» за реальной
// датой, и без плато объём со временем вышел бы за 90–110 тыс. заказов (AC-3).
const TREND_FROM = dayNumber('2024-11-05')
const TREND_DAYS = 730
const TREND_START = 0.85
const TREND_END = 1.15
const BASE_ORDERS_PER_DAY = 126

function trend(date: string): number {
  const t = Math.min(1, Math.max(0, (dayNumber(date) - TREND_FROM) / TREND_DAYS))
  return TREND_START + (TREND_END - TREND_START) * t
}

const monthOf = (date: string) => Number(date.slice(5, 7)) - 1
const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7

/** Случайный момент дня по Москве: часы — по весам, минуты и секунды — равномерно. */
function momentIn(random: Random, date: string): number {
  const hour = weightedIndex(HOUR_CUMULATIVE, random.next())
  return mskMidnight(date) + hour * 3_600_000 + random.int(0, 3_599_999)
}

/** Событие через `days` дней после заказа, днём (8:00–21:59 по Москве). */
function eventAfter(random: Random, date: string, days: number): { date: string; ms: number } {
  const day = addDays(date, days)
  return { date: day, ms: mskMidnight(day) + random.int(8, 21) * 3_600_000 + random.int(0, 3_599_999) }
}

// Веса товаров по месяцам: считаются один раз на каталог, а не на каждый день
const weightsCache = new WeakMap<readonly Product[], Map<number, number[]>>()

function cumulativeWeights(products: readonly Product[], month: number): number[] {
  let byMonth = weightsCache.get(products)
  if (!byMonth) {
    byMonth = new Map()
    weightsCache.set(products, byMonth)
  }
  const cached = byMonth.get(month)
  if (cached) return cached
  const result = cumulate(products.map((p) => p.popularity * (CATEGORY_SEASON[p.category]?.[month] ?? 1)))
  byMonth.set(month, result)
  return result
}

export function planDay(seed: number, date: string, products: readonly Product[]): PlannedOrder[] {
  const random = createRandom(deriveSeed(seed, `day:${date}`))
  const month = monthOf(date)
  const mean = BASE_ORDERS_PER_DAY * trend(date) * (MONTH_VOLUME[month] ?? 1) * (WEEKDAY[weekdayOf(date)] ?? 1)
  const count = Math.round(mean * (0.85 + random.next() * 0.3))
  const cumulative = cumulativeWeights(products, month)
  const warehouseCumulative = new Map<Product, number[]>()

  const orders: PlannedOrder[] = []
  for (let index = 0; index < count; index++) {
    const product = products[weightedIndex(cumulative, random.next())]
    if (!product) throw new Error('пустой каталог')
    let whCumulative = warehouseCumulative.get(product)
    if (!whCumulative) {
      whCumulative = cumulate(product.warehouses.map((w) => w.weight))
      warehouseCumulative.set(product, whCumulative)
    }
    const warehouse = product.warehouses[weightedIndex(whCumulative, random.next())]
    if (!warehouse) throw new Error(`у товара ${product.sku} нет складов`)

    const discounted = random.chance(0.3)
    const price = discounted ? Math.round(product.basePrice * (0.8 + random.next() * 0.15)) : product.basePrice

    // Итог заказа
    const keep = Math.min(0.95, KEEP_RATE[product.category] + (product.marketplace === 'ozon' ? 0.04 : 0))
    const r = random.next()
    const finalOutcome = r < keep ? 'bought' : r < keep + (1 - keep) * RETURN_SHARE[product.category] ? 'returned' : 'cancelled'

    // До пункта выдачи: 2–6 дней, со склада продавца (FBS) — на день дольше
    const deliveryDays = random.int(2, 6) + (warehouse.scheme === 'FBS' ? 1 : 0)
    const commissionPercent = COMMISSION[product.marketplace][product.category]
    const delivery = round2(Math.min(300, 40 + price * 0.012 + random.next() * 15))

    const order: PlannedOrder = {
      date,
      index,
      product,
      warehouse,
      orderedMs: momentIn(random, date),
      price,
      finalOutcome,
      cancelKind: null,
      boughtOn: null,
      boughtMs: null,
      cancelledOn: null,
      cancelledMs: null,
      returnedOn: null,
      returnedMs: null,
      returnDefective: false,
      commission: round2((price * commissionPercent) / 100),
      commissionPercent,
      delivery,
      returnDelivery: round2(delivery * (0.9 + random.next() * 0.2)),
    }

    if (finalOutcome === 'cancelled') {
      const k = random.next()
      order.cancelKind = k < 0.35 ? 'beforeShip' : k < 0.8 ? 'receipt' : 'expire'
      // До отправки — в тот же или на следующий день; отказ — в день доставки;
      // не забрал — после срока хранения
      const days = order.cancelKind === 'beforeShip' ? random.int(0, 1) : order.cancelKind === 'receipt' ? deliveryDays : deliveryDays + random.int(5, 7)
      let event = eventAfter(random, date, days)
      // Отмена не раньше самого заказа: поздний вечерний заказ отменяют уже назавтра
      if (event.ms <= order.orderedMs) event = eventAfter(random, date, days + 1)
      order.cancelledOn = event.date
      order.cancelledMs = event.ms
    } else {
      const bought = eventAfter(random, date, deliveryDays)
      order.boughtOn = bought.date
      order.boughtMs = bought.ms
      if (finalOutcome === 'returned') {
        const returned = eventAfter(random, bought.date, random.int(2, 14))
        order.returnedOn = returned.date
        order.returnedMs = returned.ms
        order.returnDefective = random.chance(0.15)
      }
    }
    orders.push(order)
  }
  return orders
}

/**
 * Что из запланированного уже произошло к моменту `cutoffMs` — «сейчас»
 * (или конец «сегодня», если время не задано).
 */
export function visibleOutcome(order: PlannedOrder, cutoffMs: number): Outcome {
  const happened = (ms: number | null) => ms !== null && ms <= cutoffMs
  if (order.finalOutcome === 'cancelled') return happened(order.cancelledMs) ? 'cancelled' : 'inTransit'
  if (!happened(order.boughtMs)) return 'inTransit'
  return order.finalOutcome === 'returned' && happened(order.returnedMs) ? 'returned' : 'bought'
}

/** Отмена, при которой товар уже ехал к покупателю: доставка и обратная доставка. */
export const shippedBeforeCancel = (order: PlannedOrder) => order.cancelKind === 'receipt' || order.cancelKind === 'expire'
