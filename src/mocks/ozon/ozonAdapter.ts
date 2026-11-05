import { catalogLookup, type CatalogItem, type LogisticsCharge, type Order, type Outcome, type Scheme, type StockRow } from '../domain'
import { mskDateOf, parseMoment, toMskIso } from '../lib/dates'
import { parseAmount } from '../lib/money'
import type { OzonAccrual, OzonFboPosting, OzonFbsPosting, OzonRawData, OzonReturnItem } from './schemas'
import { fboWarehouseName, sellerWarehouseName } from './warehouses'

// Сырые данные Ozon → доменная модель по таблице соответствия docs/domain/ozon-api.md.

const IN_TRANSIT = new Set(['awaiting_packaging', 'awaiting_deliver', 'delivering'])

type Posting = (OzonFboPosting | OzonFbsPosting) & { scheme: Scheme; warehouse: string; orderedAtRaw: string }

type PostingAccruals = { saleDate: string | null; logistics: LogisticsCharge[] }

function groupAccruals(accruals: readonly OzonAccrual[]): Map<string, PostingAccruals> {
  const byPosting = new Map<string, PostingAccruals>()
  for (const a of accruals) {
    let group = byPosting.get(a.unit_number)
    if (!group) {
      group = { saleDate: null, logistics: [] }
      byPosting.set(a.unit_number, group)
    }
    for (const p of a.posting.products) {
      if (parseAmount(p.commission.sale_price.amount) > 0) group.saleDate = a.date
      // Ozon списывает со знаком «−»: в доменной модели — расход по модулю
      const delivery = Math.abs(parseAmount(p.delivery.total_accrued.amount))
      if (delivery !== 0) group.logistics.push({ date: a.date, amount: delivery })
    }
  }
  return byPosting
}

function outcomeOf(posting: Posting, ret: OzonReturnItem | undefined): Outcome {
  if (IN_TRANSIT.has(posting.status)) return 'inTransit'
  if (posting.status === 'cancelled') return 'cancelled'
  // Возврат — только у доставленного; у отменённого это отказ при получении
  if (posting.status === 'delivered') return ret ? 'returned' : 'bought'
  throw new Error(`Незнакомый статус отправления Ozon: ${posting.status}`)
}

export function ozonAdapter(raw: OzonRawData, catalog: readonly CatalogItem[]): { orders: Order[]; stocks: StockRow[] } {
  const product = catalogLookup(catalog)
  const accruals = groupAccruals(raw.accruals)
  const returns = new Map(raw.returns.map((r) => [r.posting_number, r]))
  const cancelMoments = new Map(raw.statusLog.filter((e) => e.status === 'cancelled').map((e) => [e.posting_number, e.changed_at]))

  const postings: Posting[] = [
    ...raw.fboPostings.map((p) => ({ ...p, scheme: 'FBO' as const, warehouse: fboWarehouseName(p.analytics_data.warehouse_name), orderedAtRaw: p.created_at })),
    ...raw.fbsPostings.map((p) => ({ ...p, scheme: 'FBS' as const, warehouse: p.analytics_data.warehouse, orderedAtRaw: p.in_process_at })),
  ]

  const orders: Order[] = []
  for (const posting of postings) {
    const ret = returns.get(posting.posting_number)
    const outcome = outcomeOf(posting, ret)
    const money = accruals.get(posting.posting_number) ?? { saleDate: null, logistics: [] }
    const wasBought = outcome === 'bought' || outcome === 'returned'
    if (wasBought && !money.saleDate) throw new Error(`Нет начисления продажи для отправления Ozon ${posting.posting_number}`)

    let cancelledOn: string | null = null
    if (outcome === 'cancelled') {
      const moment = cancelMoments.get(posting.posting_number)
      if (!moment) throw new Error(`Нет даты отмены для отправления Ozon ${posting.posting_number}`)
      cancelledOn = mskDateOf(moment)
    }

    // Несколько единиц в отправлении генератор не создаёт, а правило деления
    // логистики, комиссии и возврата между ними не описано (spec 001, «Уточнения», п. 17)
    const units = posting.products.flatMap((p) => Array.from({ length: p.quantity }, () => p))
    if (units.length !== 1) throw new Error(`Отправление Ozon ${posting.posting_number} с несколькими единицами товара не поддерживается`)
    for (const p of units) {
      const item = product(String(p.sku))
      const financial = posting.financial_data.products.find((f) => f.product_id === p.sku)
      if (!financial) throw new Error(`Нет финансовых данных товара ${p.sku} в отправлении ${posting.posting_number}`)
      orders.push({
        id: posting.posting_number,
        marketplace: 'ozon',
        scheme: posting.scheme,
        sku: String(p.sku),
        offerId: p.offer_id,
        name: p.name,
        category: item.category,
        warehouse: posting.warehouse,
        orderedAt: toMskIso(parseMoment(posting.orderedAtRaw)),
        orderDate: mskDateOf(posting.orderedAtRaw),
        price: parseAmount(p.price.amount),
        outcome,
        boughtOn: wasBought ? money.saleDate : null,
        cancelledOn,
        returnedOn: outcome === 'returned' && ret ? mskDateOf(ret.logistic.return_date) : null,
        commission: wasBought ? financial.commission.amount : 0,
        commissionRefund: outcome === 'returned' && ret ? parseAmount(ret.product.commission.price) : 0,
        costPrice: item.costPrice,
        logistics: money.logistics,
      })
    }
  }

  const stocks: StockRow[] = [
    ...raw.fboStocks.map((s) => stockRow(product(String(s.sku)), 'FBO', fboWarehouseName(s.warehouse_name), s.available_stock_count, s.offer_id)),
    ...raw.fbsStocks.map((s) => stockRow(product(String(s.sku)), 'FBS', sellerWarehouseName(s.warehouse_id), s.free_stock, s.offer_id)),
  ]

  return { orders, stocks }
}

function stockRow(item: CatalogItem, scheme: Scheme, warehouse: string, stock: number, offerId: string): StockRow {
  return {
    sku: item.sku,
    offerId,
    name: item.name,
    category: item.category,
    marketplace: 'ozon',
    scheme,
    warehouse,
    stock,
  }
}
