import { catalogLookup, type CatalogItem, type LogisticsCharge, type Order, type Outcome, type StockRow } from '../domain'
import { mskDateOf, parseMoment, toMskIso } from '../lib/dates'
import { parseAmount, round2 } from '../lib/money'
import type { WbOrderFeedOrder, WbRawData, WbSalesReportRow } from './schemas'

// Сырые данные WB → доменная модель по таблице соответствия docs/domain/wb-api.md.
// Незнакомое значение — ошибка: лучше заметить, чем тихо посчитать неверно.

const OUTCOME_BY_STATUS: Record<WbOrderFeedOrder['status'], Outcome> = {
  created: 'inTransit',
  buyout: 'bought',
  cancel: 'cancelled',
  return: 'returned',
  returnDefective: 'returned',
}

const KNOWN_OPERATIONS = new Set<string>(['Продажа', 'Возврат', 'Логистика'])

/** saleDt и orderDt — календарная дата в виде 2026-03-21T00:00:00Z: берётся как есть. */
const reportDate = (value: string) => value.slice(0, 10)

type OrderRows = { sale?: WbSalesReportRow; ret?: WbSalesReportRow; logistics: LogisticsCharge[] }

function groupReport(rows: readonly WbSalesReportRow[]): Map<string, OrderRows> {
  const bySrid = new Map<string, OrderRows>()
  for (const row of rows) {
    if (!KNOWN_OPERATIONS.has(row.sellerOperName)) {
      throw new Error(`Незнакомое обоснование оплаты WB: ${row.sellerOperName}`)
    }
    let group = bySrid.get(row.srid)
    if (!group) {
      group = { logistics: [] }
      bySrid.set(row.srid, group)
    }
    if (row.sellerOperName === 'Логистика') {
      const amount = parseAmount(row.deliveryService)
      if (amount !== 0) group.logistics.push({ date: row.rrDate, amount })
    } else if (row.docTypeName === 'Продажа' && row.sellerOperName === 'Продажа') {
      group.sale = row
    } else if (row.docTypeName === 'Возврат') {
      group.ret = row
    }
  }
  return bySrid
}

/** Всё, что WB удержал из цены строки: retailPriceWithDisc − forPay. */
const commissionOf = (row: WbSalesReportRow) => round2(parseAmount(row.retailPriceWithDisc) - parseAmount(row.forPay))

export function wbAdapter(raw: WbRawData, catalog: readonly CatalogItem[]): { orders: Order[]; stocks: StockRow[] } {
  const product = catalogLookup(catalog)
  const report = groupReport(raw.salesReport)

  const orders = raw.orderFeed.map((feed): Order => {
    const outcome = OUTCOME_BY_STATUS[feed.status]
    if (!outcome) throw new Error(`Незнакомый статус заказа WB: ${String(feed.status)}`)
    const item = product(String(feed.nmId))
    const rows = report.get(feed.srid) ?? { logistics: [] }

    const wasBought = outcome === 'bought' || outcome === 'returned'
    if (wasBought && !rows.sale) throw new Error(`Нет строки «Продажа» для заказа WB ${feed.srid}`)
    if (outcome === 'returned' && !rows.ret) throw new Error(`Нет строки «Возврат» для заказа WB ${feed.srid}`)

    const createdMs = parseMoment(feed.createdAt)
    return {
      id: feed.srid,
      marketplace: 'wb',
      // Схема показывается только у Ozon (решение продукта под макеты)
      scheme: null,
      sku: String(feed.nmId),
      offerId: item.offerId,
      name: item.name,
      category: item.category,
      warehouse: feed.warehouseName,
      orderedAt: toMskIso(createdMs),
      orderDate: mskDateOf(feed.createdAt),
      price: feed.sellerPrice,
      outcome,
      boughtOn: wasBought && rows.sale ? reportDate(rows.sale.saleDt) : null,
      cancelledOn: outcome === 'cancelled' ? mskDateOf(feed.updatedAt) : null,
      returnedOn: outcome === 'returned' && rows.ret ? reportDate(rows.ret.saleDt) : null,
      commission: wasBought && rows.sale ? commissionOf(rows.sale) : 0,
      commissionRefund: outcome === 'returned' && rows.ret ? commissionOf(rows.ret) : 0,
      costPrice: item.costPrice,
      logistics: rows.logistics,
    }
  })

  // Остаток — сумма по размерам (chrtId) товара на складе
  const stockByKey = new Map<string, StockRow>()
  for (const s of raw.stocks) {
    const sku = String(s.nmId)
    const key = `${sku}|${s.warehouseName}`
    const existing = stockByKey.get(key)
    if (existing) {
      existing.stock += s.quantity
      continue
    }
    const item = product(sku)
    stockByKey.set(key, {
      sku,
      offerId: item.offerId,
      name: item.name,
      category: item.category,
      marketplace: 'wb',
      scheme: null,
      warehouse: s.warehouseName,
      stock: s.quantity,
    })
  }

  return { orders, stocks: [...stockByKey.values()] }
}
