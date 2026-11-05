import { z } from 'zod'

// Сырой формат Ozon по docs/domain/ozon-api.md. Описаны только поля, которые
// использует BFF; лишние поля реального ответа zod отбрасывает. Статус
// отправления — любая строка: незнакомый статус отсекает адаптер, а не схема.

const amountString = z.string().regex(/^-?\d+(\.\d+)?$/)
const money = z.object({ amount: amountString, currency: z.literal('RUB') })

const product = z.object({
  sku: z.number().int(),
  offer_id: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  price: money,
})

const financialData = z.object({
  products: z.array(
    z.object({
      product_id: z.number().int(),
      price: z.number(),
      old_price: z.number(),
      payout: z.number(),
      commission: z.object({ amount: z.number(), percent: z.number(), currency: z.literal('RUB') }),
    }),
  ),
})

const cancellation = z
  .object({
    cancel_reason_id: z.number().int(),
    cancel_reason: z.string(),
    cancellation_initiator: z.string(),
    cancelled_after_ship: z.boolean(),
  })
  .nullable()

/** POST /v3/posting/fbo/list → postings[] */
const fboPosting = z.object({
  posting_number: z.string(),
  order_id: z.number().int(),
  order_number: z.string(),
  status: z.string(),
  substatus: z.string(),
  created_at: z.string(),
  in_process_at: z.string(),
  products: z.array(product).min(1),
  analytics_data: z.object({ warehouse_id: z.number().int(), warehouse_name: z.string() }),
  financial_data: financialData,
  cancellation,
})

/** POST /v4/posting/fbs/list → postings[] */
const fbsPosting = z.object({
  posting_number: z.string(),
  order_id: z.number().int(),
  order_number: z.string(),
  status: z.string(),
  substatus: z.string(),
  in_process_at: z.string(),
  products: z.array(product).min(1),
  analytics_data: z.object({ warehouse: z.string() }),
  financial_data: financialData,
  cancellation,
  delivery_schema: z.string(),
})

/** POST /v1/returns/list → returns[] */
const returnItem = z.object({
  id: z.string(),
  posting_number: z.string(),
  order_id: z.string(),
  order_number: z.string(),
  schema: z.enum(['Fbo', 'Fbs']),
  type: z.string(),
  return_reason_name: z.string(),
  product: z.object({
    sku: z.number().int(),
    offer_id: z.string(),
    name: z.string(),
    quantity: z.number().int().positive(),
    price: z.object({ currency_code: z.string(), price: amountString }),
    // В примере документации — строка ("1.2"), встречается и число
    commission_percent: z.union([z.number(), z.string()]),
    commission: z.object({ currency_code: z.string(), price: amountString }),
  }),
  logistic: z.object({ return_date: z.string() }),
  visual: z.object({ status: z.object({ sys_name: z.string() }) }),
})

/** POST /v1/finance/accrual/by-day → accruals[] */
const accrual = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accrual_id: z.string(),
  unit_number: z.string(),
  posting: z.object({
    delivery_schema: z.string(),
    products: z.array(
      z.object({
        sku: z.number().int(),
        commission: z.object({ sale_price: money, sale_commission: money }),
        delivery: z.object({ total_accrued: money }),
      }),
    ),
  }),
  total_amount: money,
})

/** POST /v1/analytics/stocks → items[] */
const fboStockItem = z.object({
  sku: z.number().int(),
  offer_id: z.string(),
  name: z.string(),
  warehouse_id: z.number().int(),
  warehouse_name: z.string(),
  available_stock_count: z.number().int().nonnegative(),
  ads: z.number(),
  idc: z.number(),
})

/** POST /v1/product/info/warehouse/stocks → stocks[] */
const fbsStockItem = z.object({
  sku: z.number().int(),
  offer_id: z.string(),
  product_id: z.number().int(),
  warehouse_id: z.number().int(),
  present: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
  free_stock: z.number().int().nonnegative(),
  updated_at: z.string(),
})

/** Журнал статусов нашего BFF — не API Ozon: в API нет даты отмены */
const statusLogEntry = z.object({
  posting_number: z.string(),
  status: z.string(),
  changed_at: z.string(),
})

export const ozonRawSchemas = { fboPosting, fbsPosting, returnItem, accrual, fboStockItem, fbsStockItem, statusLogEntry }

export type OzonFboPosting = z.infer<typeof fboPosting>
export type OzonFbsPosting = z.infer<typeof fbsPosting>
export type OzonReturnItem = z.infer<typeof returnItem>
export type OzonAccrual = z.infer<typeof accrual>
export type OzonFboStockItem = z.infer<typeof fboStockItem>
export type OzonFbsStockItem = z.infer<typeof fbsStockItem>
export type OzonStatusLogEntry = z.infer<typeof statusLogEntry>

export type OzonRawData = {
  fboPostings: OzonFboPosting[]
  fbsPostings: OzonFbsPosting[]
  returns: OzonReturnItem[]
  accruals: OzonAccrual[]
  fboStocks: OzonFboStockItem[]
  fbsStocks: OzonFbsStockItem[]
  statusLog: OzonStatusLogEntry[]
}
