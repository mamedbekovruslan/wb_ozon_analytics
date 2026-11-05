import { z } from 'zod'
import { categoryIdSchema, dateSchema, finiteNumber, marketplaceIdSchema, schemeSchema } from '../../../shared/api'

export const stockStatusSchema = z.enum(['critical', 'soon', 'ok', 'noSales'])

/** Ответ /api/stocks (spec 001, «Контракт»). */
export const stocksResponseSchema = z.object({
  asOf: dateSchema,
  total: finiteNumber,
  counts: z.object({ critical: finiteNumber, soon: finiteNumber, ok: finiteNumber, noSales: finiteNumber }),
  items: z.array(
    z.object({
      sku: z.string(),
      name: z.string(),
      offerId: z.string(),
      marketplace: marketplaceIdSchema,
      scheme: schemeSchema,
      warehouse: z.string(),
      category: categoryIdSchema,
      stock: finiteNumber,
      perDay: finiteNumber,
      days: finiteNumber.nullable(),
      status: stockStatusSchema,
    }),
  ),
})

export type StockStatus = z.infer<typeof stockStatusSchema>
export type StocksResponse = z.infer<typeof stocksResponseSchema>
