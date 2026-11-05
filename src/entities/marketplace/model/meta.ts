import { z } from 'zod'
import { categoryIdSchema, dateSchema, marketplaceIdSchema, momentSchema } from '../../../shared/api'

/** Ответ /api/meta: справочники и границы данных (spec 001, «Контракт»). */
export const metaResponseSchema = z.object({
  today: dateSchema,
  updatedAt: momentSchema,
  historyFrom: dateSchema,
  marketplaces: z.array(z.object({ id: marketplaceIdSchema, name: z.string() })),
  categories: z.array(z.object({ id: categoryIdSchema, name: z.string() })),
})

export type MetaResponse = z.infer<typeof metaResponseSchema>
