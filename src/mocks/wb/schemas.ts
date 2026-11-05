import { z } from 'zod'

// Сырой формат WB по docs/domain/wb-api.md. Описаны только поля, которые
// использует BFF; лишние поля реального ответа zod отбрасывает.

const amountString = z.string().regex(/^-?\d+(\.\d+)?$/)

/** «Лента заказов» POST /api/analytics/v1/order-feed → data.orders[] */
const orderFeedOrder = z.object({
  nmId: z.number().int(),
  chrtId: z.number().int(),
  srid: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(['created', 'buyout', 'cancel', 'return', 'returnDefective']),
  cancelType: z.enum(['app', 'receipt', 'expire', 'other']).optional(),
  warehouseName: z.string(),
  warehouseRegion: z.string(),
  isMp: z.boolean(),
  destinationCity: z.string(),
  destinationDistrict: z.string(),
  sellerPrice: z.number(),
  isB2b: z.boolean(),
})

/** Детализация отчёта реализации POST /api/finance/v1/sales-reports/detailed */
const salesReportRow = z.object({
  rrdId: z.number().int(),
  srid: z.string(),
  nmId: z.number().int(),
  vendorCode: z.string(),
  title: z.string(),
  subjectName: z.string(),
  brandName: z.string(),
  docTypeName: z.enum(['Продажа', 'Возврат']),
  sellerOperName: z.enum(['Продажа', 'Возврат', 'Логистика']),
  quantity: z.number().int(),
  retailPriceWithDisc: amountString,
  forPay: amountString,
  commissionPercent: z.number(),
  deliveryService: amountString,
  deliveryAmount: z.number().int(),
  returnAmount: z.number().int(),
  officeName: z.string(),
  orderDt: z.string(),
  saleDt: z.string(),
  rrDate: z.string(),
})

/** Остатки POST /api/analytics/v1/stocks-report/wb-warehouses → data.items[] */
const stockItem = z.object({
  nmId: z.number().int(),
  chrtId: z.number().int(),
  warehouseId: z.number().int(),
  warehouseName: z.string(),
  regionName: z.string(),
  quantity: z.number().int().nonnegative(),
  inWayToClient: z.number().int().nonnegative(),
  inWayFromClient: z.number().int().nonnegative(),
})

export const wbRawSchemas = { orderFeedOrder, salesReportRow, stockItem }

export type WbOrderFeedOrder = z.infer<typeof orderFeedOrder>
export type WbSalesReportRow = z.infer<typeof salesReportRow>
export type WbStockItem = z.infer<typeof stockItem>

export type WbRawData = {
  orderFeed: WbOrderFeedOrder[]
  salesReport: WbSalesReportRow[]
  stocks: WbStockItem[]
}
