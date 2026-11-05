import { dayNumber, mskMidnight } from '../lib/dates'
import { round2 } from '../lib/money'
import { deriveSeed } from '../lib/random'
import {
  fboWarehouseByName,
  OZON_SELLER_WAREHOUSE,
  type OzonAccrual,
  type OzonFboPosting,
  type OzonFbsPosting,
  type OzonRawData,
  type OzonReturnItem,
  type OzonStatusLogEntry,
} from '../ozon'
import type { PlannedOrder } from './plan'
import { shippedBeforeCancel, visibleOutcome } from './plan'

// План заказов Ozon → отправления FBO/FBS, возвраты, начисления и журнал
// статусов BFF в форме docs/domain/ozon-api.md. Время Ozon — UTC.

const rub = (value: number) => ({ amount: value.toFixed(2), currency: 'RUB' as const })

/** UTC с микросекундами, как у FBO в документации: 2026-05-10T23:59:51.653736Z */
function utcMicros(seed: number, ms: number, key: string): string {
  const micros = String(deriveSeed(seed, key) % 1000).padStart(3, '0')
  return `${new Date(ms).toISOString().slice(0, 23)}${micros}Z`
}

const utc = (ms: number) => `${new Date(ms).toISOString().slice(0, 19)}Z`

/** Промежуточный статус в пути — по числу дней с заказа. */
function transitStatus(o: PlannedOrder, today: string): { status: string; substatus: string } {
  const days = dayNumber(today) - dayNumber(o.date)
  if (days <= 0) return { status: 'awaiting_packaging', substatus: 'posting_created' }
  if (days === 1) return { status: 'awaiting_deliver', substatus: 'posting_transferring_to_delivery' }
  return { status: 'delivering', substatus: 'posting_on_way_to_pickup_point' }
}

export function writeOzon(seed: number, orders: readonly PlannedOrder[], today: string, cutoffMs: number): Omit<OzonRawData, 'fboStocks' | 'fbsStocks'> {
  const fboPostings: OzonFboPosting[] = []
  const fbsPostings: OzonFbsPosting[] = []
  const returns: OzonReturnItem[] = []
  const accruals: OzonAccrual[] = []
  const statusLog: OzonStatusLogEntry[] = []

  for (const o of orders) {
    const day = String(dayNumber(o.date)).padStart(5, '0')
    const orderNumber = `${day}${String(o.index).padStart(5, '0')}-${String(1000 + (deriveSeed(seed, `on:${o.date}:${o.index}`) % 9000))}`
    const postingNumber = `${orderNumber}-1`
    const orderId = 30_000_000_000 + dayNumber(o.date) * 100_000 + o.index
    const sku = Number(o.product.sku)
    const isFbs = o.warehouse.scheme === 'FBS'
    const outcome = visibleOutcome(o, cutoffMs)

    let status: { status: string; substatus: string }
    if (outcome === 'cancelled') status = { status: 'cancelled', substatus: 'posting_canceled' }
    else if (outcome === 'bought' || outcome === 'returned') status = { status: 'delivered', substatus: 'posting_received' }
    else status = transitStatus(o, today)

    const common = {
      posting_number: postingNumber,
      order_id: orderId,
      order_number: orderNumber,
      ...status,
      products: [{ sku, offer_id: o.product.offerId, name: o.product.name, quantity: 1, price: { amount: String(o.price), currency: 'RUB' as const } }],
      financial_data: {
        products: [
          {
            product_id: sku,
            price: o.price,
            old_price: o.product.basePrice,
            payout: round2(o.price - o.commission),
            commission: { amount: o.commission, percent: o.commissionPercent, currency: 'RUB' as const },
          },
        ],
      },
      cancellation:
        outcome === 'cancelled'
          ? {
              cancel_reason_id: shippedBeforeCancel(o) ? 352 : 402,
              cancel_reason: o.cancelKind === 'receipt' ? 'Покупатель отказался при получении' : o.cancelKind === 'expire' ? 'Истёк срок хранения' : 'Отменено покупателем',
              cancellation_initiator: 'Клиент',
              cancelled_after_ship: shippedBeforeCancel(o),
            }
          : null,
    }

    if (isFbs) {
      fbsPostings.push({ ...common, in_process_at: utc(o.orderedMs), analytics_data: { warehouse: OZON_SELLER_WAREHOUSE.name }, delivery_schema: 'fbs' })
    } else {
      const warehouse = fboWarehouseByName(o.warehouse.name)
      fboPostings.push({
        ...common,
        created_at: utcMicros(seed, o.orderedMs, `ca:${postingNumber}`),
        // Обработка начинается через минуту-другую после создания
        in_process_at: utcMicros(seed, o.orderedMs + 90_000, `ip:${postingNumber}`),
        analytics_data: { warehouse_id: warehouse.id, warehouse_name: warehouse.apiName },
      })
    }

    const schema = isFbs ? 'fbs' : 'fbo'
    const accrualOn = (date: string, n: number, sale: boolean, delivery: number) => {
      const salePrice = sale ? o.price : 0
      const saleCommission = sale ? -o.commission : 0
      accruals.push({
        date,
        accrual_id: `${postingNumber}-${n}`,
        unit_number: postingNumber,
        posting: {
          delivery_schema: schema,
          products: [{ sku, commission: { sale_price: rub(salePrice), sale_commission: rub(saleCommission) }, delivery: { total_accrued: rub(-delivery) } }],
        },
        total_amount: rub(round2(salePrice + saleCommission - delivery)),
      })
    }

    if ((outcome === 'bought' || outcome === 'returned') && o.boughtOn) accrualOn(o.boughtOn, 1, true, o.delivery)
    if (outcome === 'returned' && o.returnedOn && o.returnedMs !== null) {
      accrualOn(o.returnedOn, 2, false, o.returnDelivery)
      returns.push({
        id: `${orderId}`,
        posting_number: postingNumber,
        order_id: String(orderId),
        order_number: orderNumber,
        schema: isFbs ? 'Fbs' : 'Fbo',
        type: 'FullReturn',
        return_reason_name: o.returnDefective ? 'Товар с браком' : 'Не подошёл товар',
        product: {
          sku,
          offer_id: o.product.offerId,
          name: o.product.name,
          quantity: 1,
          price: { currency_code: 'RUB', price: String(o.price) },
          commission_percent: String(o.commissionPercent),
          commission: { currency_code: 'RUB', price: o.commission.toFixed(2) },
        },
        logistic: { return_date: utcMicros(seed, o.returnedMs, `rd:${postingNumber}`) },
        visual: { status: { sys_name: 'ReturnedToSeller' } },
      })
    }
    if (outcome === 'cancelled' && o.cancelledOn && o.cancelledMs !== null) {
      if (shippedBeforeCancel(o)) {
        accrualOn(o.cancelledOn, 1, false, o.delivery)
        accrualOn(o.cancelledOn, 2, false, o.returnDelivery)
      }
      statusLog.push({ posting_number: postingNumber, status: 'cancelled', changed_at: utc(o.cancelledMs) })
    }
  }

  return { fboPostings, fbsPostings, returns, accruals, statusLog }
}

/** Время обновления остатков FBS: «сегодня» 07:40 по Москве. */
export const fbsStocksUpdatedAt = (today: string) => utc(mskMidnight(today) + (7 * 60 + 40) * 60_000)
