import { dayNumber, toMskIso } from '../lib/dates'
import { round2 } from '../lib/money'
import { deriveSeed } from '../lib/random'
import { wbWarehouse, type WbOrderFeedOrder, type WbRawData, type WbSalesReportRow } from '../wb'
import type { PlannedOrder } from './plan'
import { shippedBeforeCancel, visibleOutcome } from './plan'

// План заказов WB → «Лента заказов» и детализация отчёта реализации
// в форме docs/domain/wb-api.md. Строки отчёта — только по событиям,
// которые уже произошли к моменту отсечки («сейчас»).

const STATUS_BY_OUTCOME = { inTransit: 'created', bought: 'buyout', cancelled: 'cancel' } as const

const CANCEL_TYPE = { beforeShip: 'app', receipt: 'receipt', expire: 'expire' } as const

const DESTINATIONS = [
  ['Москва', 'Центральный'],
  ['Санкт-Петербург', 'Северо-Западный'],
  ['Казань', 'Приволжский'],
  ['Екатеринбург', 'Уральский'],
  ['Новосибирск', 'Сибирский'],
  ['Краснодар', 'Южный'],
] as const

/** ID заказа в духе WB ("7513432034713632943.1.0"); уникален за счёт дня и номера в дне. */
function sridOf(seed: number, o: PlannedOrder): string {
  const prefix = deriveSeed(seed, `srid:${o.date}:${o.index}`)
  return `${prefix}${String(dayNumber(o.date)).padStart(5, '0')}${String(o.index).padStart(4, '0')}.1.0`
}

const reportDay = (date: string) => `${date}T00:00:00Z`

export function writeWb(seed: number, orders: readonly PlannedOrder[], cutoffMs: number): Omit<WbRawData, 'stocks'> {
  const orderFeed: WbOrderFeedOrder[] = []
  const salesReport: WbSalesReportRow[] = []
  let rrdId = 1

  for (const o of orders) {
    const srid = sridOf(seed, o)
    const outcome = visibleOutcome(o, cutoffMs)
    const destination = DESTINATIONS[o.index % DESTINATIONS.length] ?? DESTINATIONS[0]

    let status: WbOrderFeedOrder['status']
    let updatedMs = o.orderedMs
    if (outcome === 'returned') {
      status = o.returnDefective ? 'returnDefective' : 'return'
      updatedMs = o.returnedMs ?? updatedMs
    } else {
      status = STATUS_BY_OUTCOME[outcome]
      if (outcome === 'bought') updatedMs = o.boughtMs ?? updatedMs
      if (outcome === 'cancelled') updatedMs = o.cancelledMs ?? updatedMs
    }

    const feed: WbOrderFeedOrder = {
      nmId: Number(o.product.sku),
      chrtId: Number(o.product.sku) * 10 + (o.index % 3),
      srid,
      createdAt: toMskIso(o.orderedMs),
      updatedAt: toMskIso(updatedMs),
      status,
      warehouseName: o.warehouse.name,
      warehouseRegion: wbWarehouse(o.warehouse.name).region,
      // Генератор изображает только склады WB (docs/domain/wb-api.md)
      isMp: false,
      destinationCity: destination[0],
      destinationDistrict: destination[1],
      sellerPrice: o.price,
      isB2b: false,
    }
    if (outcome === 'cancelled' && o.cancelKind) feed.cancelType = CANCEL_TYPE[o.cancelKind]
    orderFeed.push(feed)

    const row = (p: Pick<WbSalesReportRow, 'docTypeName' | 'sellerOperName' | 'rrDate'> & Partial<WbSalesReportRow>): WbSalesReportRow => ({
      rrdId: rrdId++,
      srid,
      nmId: feed.nmId,
      vendorCode: o.product.offerId,
      title: o.product.name,
      subjectName: o.product.name.split(' ')[0] ?? o.product.name,
      brandName: 'Saldo',
      quantity: 0,
      retailPriceWithDisc: '0',
      forPay: '0',
      commissionPercent: o.commissionPercent,
      deliveryService: '0',
      deliveryAmount: 0,
      returnAmount: 0,
      officeName: o.warehouse.name,
      orderDt: reportDay(o.date),
      saleDt: reportDay(p.rrDate),
      ...p,
    })
    const priceStr = o.price.toFixed(2)
    const forPayStr = round2(o.price - o.commission).toFixed(2)
    const logistics = (date: string, amount: number, back: boolean) =>
      row({
        docTypeName: 'Продажа',
        sellerOperName: 'Логистика',
        rrDate: date,
        deliveryService: amount.toFixed(2),
        deliveryAmount: back ? 0 : 1,
        returnAmount: back ? 1 : 0,
      })

    if ((outcome === 'bought' || outcome === 'returned') && o.boughtOn) {
      salesReport.push(
        row({ docTypeName: 'Продажа', sellerOperName: 'Продажа', rrDate: o.boughtOn, quantity: 1, retailPriceWithDisc: priceStr, forPay: forPayStr }),
        logistics(o.boughtOn, o.delivery, false),
      )
    }
    if (outcome === 'returned' && o.returnedOn) {
      salesReport.push(
        row({ docTypeName: 'Возврат', sellerOperName: 'Возврат', rrDate: o.returnedOn, quantity: 1, retailPriceWithDisc: priceStr, forPay: forPayStr }),
        logistics(o.returnedOn, o.returnDelivery, true),
      )
    }
    if (outcome === 'cancelled' && o.cancelledOn && shippedBeforeCancel(o)) {
      salesReport.push(logistics(o.cancelledOn, o.delivery, false), logistics(o.cancelledOn, o.returnDelivery, true))
    }
  }
  return { orderFeed, salesReport }
}
