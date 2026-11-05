import { z } from 'zod'
import { categoryIdSchema, finiteNumber, marketplaceIdSchema } from '../../../shared/api'

/** Ответ /api/top-products (spec 001, «Контракт»). */
export const topProductsResponseSchema = z.object({
  items: z.array(
    z.object({
      sku: z.string(),
      name: z.string(),
      offerId: z.string(),
      marketplace: marketplaceIdSchema,
      category: categoryIdSchema,
      revenue: finiteNumber,
      ordersCount: finiteNumber,
      buyoutRate: finiteNumber.nullable(),
      profit: finiteNumber,
    }),
  ),
})

export type TopProductsResponse = z.infer<typeof topProductsResponseSchema>
