import { z } from 'zod'
import { categoryIdSchema, dateSchema, marketplaceIdSchema, momentSchema } from '../../../shared/api'

/** Ответ /api/meta: справочники и границы данных (spec 001, «Контракт»). */
export const metaResponseSchema = z.object({
  today: dateSchema,
  updatedAt: momentSchema,
  historyFrom: dateSchema,
  marketplaces: z.array(z.object({ id: marketplaceIdSchema, name: z.string() })),
  // productCount — число товаров справа в списке категорий (spec 002, AC-24)
  categories: z.array(z.object({ id: categoryIdSchema, name: z.string(), productCount: z.number().int().min(0) })),
})

export type MetaResponse = z.infer<typeof metaResponseSchema>
