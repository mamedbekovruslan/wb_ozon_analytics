import type { CatalogItem } from '../domain'
import { addDays, addMonths, mskMidnight } from '../lib/dates'
import type { OzonRawData } from '../ozon'
import type { WbRawData } from '../wb'
import { generateCatalog, toCatalog } from './catalog'
import { writeOzon } from './ozonRaw'
import { planDay, type PlannedOrder } from './plan'
import { generateStocks } from './stocks'
import { writeWb } from './wbRaw'

// Генератор фейкового BFF (ADR-0004, ADR-0010): сырые данные в форме
// API WB и Ozon (docs/domain/*) плюс справочник продавца.

export type RawData = {
  catalog: CatalogItem[]
  wb: WbRawData
  ozon: OzonRawData
}

/** Начало истории: «сегодня» минус 24 месяца (spec 001, «Уточнения», п. 14). */
export const historyFromOf = (today: string) => addMonths(today, -24)

/**
 * `now` — момент «сейчас»: заказы и события позже него ещё не наступили
 * (утром в демо нет вечерних заказов). Без `now` — весь день «сегодня».
 */
export function generateRawData({ seed, today, now }: { seed: number; today: string; now?: Date }): RawData {
  const cutoffMs = now ? now.getTime() : mskMidnight(addDays(today, 1)) - 1
  const products = generateCatalog(seed)

  const wbOrders: PlannedOrder[] = []
  const ozonOrders: PlannedOrder[] = []
  for (let day = historyFromOf(today); day <= today; day = addDays(day, 1)) {
    for (const order of planDay(seed, day, products)) {
      if (order.orderedMs > cutoffMs) continue
      if (order.product.marketplace === 'wb') wbOrders.push(order)
      else ozonOrders.push(order)
    }
  }

  const stocks = generateStocks(seed, products, [...wbOrders, ...ozonOrders], today, cutoffMs)
  return {
    catalog: toCatalog(products),
    wb: { ...writeWb(seed, wbOrders, cutoffMs), stocks: stocks.wb },
    ozon: { ...writeOzon(seed, ozonOrders, today, cutoffMs), fboStocks: stocks.fbo, fbsStocks: stocks.fbs },
  }
}
