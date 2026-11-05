import { addDays } from '../lib/dates'
import { round2 } from '../lib/money'
import { createRandom, deriveSeed } from '../lib/random'
import { fboWarehouseByName, OZON_SELLER_WAREHOUSE, type OzonFboStockItem, type OzonFbsStockItem } from '../ozon'
import { wbWarehouse, type WbStockItem } from '../wb'
import type { Product } from './catalog'
import { fbsStocksUpdatedAt } from './ozonRaw'
import type { PlannedOrder } from './plan'

// Остатки на «сегодня». Остаток подбирается под скорость продаж за 14 дней
// так, чтобы на экране был живой набор статусов: немного «критично» и
// «скоро закончится», большинство — «норма», у редких товаров — «нет продаж».

/** Выкупы за последние 14 дней включая «сегодня» (до момента отсечки), по паре «товар × склад». */
function recentBuyouts(orders: readonly PlannedOrder[], today: string, cutoffMs: number): Map<string, number> {
  const from = addDays(today, -13)
  const counts = new Map<string, number>()
  for (const o of orders) {
    if (o.boughtOn === null || o.boughtMs === null || o.boughtOn < from || o.boughtMs > cutoffMs) continue
    const key = `${o.product.sku}|${o.warehouse.name}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

export function generateStocks(
  seed: number,
  products: readonly Product[],
  orders: readonly PlannedOrder[],
  today: string,
  cutoffMs: number,
): { wb: WbStockItem[]; fbo: OzonFboStockItem[]; fbs: OzonFbsStockItem[] } {
  const buyouts = recentBuyouts(orders, today, cutoffMs)
  const wb: WbStockItem[] = []
  const fbo: OzonFboStockItem[] = []
  const fbs: OzonFbsStockItem[] = []

  for (const product of products) {
    for (const warehouse of product.warehouses) {
      const random = createRandom(deriveSeed(seed, `stock:${today}:${product.sku}:${warehouse.name}`))
      const sold = buyouts.get(`${product.sku}|${warehouse.name}`) ?? 0
      const perDay = sold / 14
      let stock: number
      if (perDay === 0) {
        stock = random.chance(0.25) ? 0 : random.int(3, 60)
      } else {
        const r = random.next()
        const days = r < 0.13 ? random.next() * 6.5 : r < 0.3 ? 7 + random.next() * 7 : 15 + random.next() * 45
        stock = Math.round(perDay * days)
      }
      const sku = Number(product.sku)

      if (product.marketplace === 'wb') {
        // Одежду и обувь раскладываем по размерам; остальное — один размер
        const sizes = product.category === 'clothing' || product.category === 'shoes' ? 3 : 1
        let left = stock
        for (let k = 0; k < sizes; k++) {
          const quantity = k === sizes - 1 ? left : random.int(0, left)
          left -= quantity
          wb.push({
            nmId: sku,
            chrtId: sku * 10 + k,
            warehouseId: wbWarehouse(warehouse.name).id,
            warehouseName: warehouse.name,
            regionName: 'Россия',
            quantity,
            inWayToClient: random.int(0, 3),
            inWayFromClient: random.int(0, 1),
          })
        }
      } else if (warehouse.scheme === 'FBS') {
        const reserved = random.int(0, 2)
        fbs.push({
          sku,
          offer_id: product.offerId,
          product_id: 500_000 + (sku % 1_000_000),
          warehouse_id: OZON_SELLER_WAREHOUSE.id,
          present: stock + reserved,
          reserved,
          free_stock: stock,
          updated_at: fbsStocksUpdatedAt(today),
        })
      } else {
        const info = fboWarehouseByName(warehouse.name)
        const ads = round2(perDay)
        fbo.push({
          sku,
          offer_id: product.offerId,
          name: product.name,
          warehouse_id: info.id,
          warehouse_name: info.apiName,
          available_stock_count: stock,
          ads,
          idc: ads > 0 ? Math.round(stock / ads) : 0,
        })
      }
    }
  }
  return { wb, fbo, fbs }
}
