import { z } from 'zod'

// Общие примитивы контракта /api/... (spec 001, «Контракт»). Их используют
// схемы ответов разных сущностей, поэтому они в shared, а не в одном слайсе.

/** Календарный день ГГГГ-ММ-ДД (по Москве) */
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Момент времени ISO 8601 со смещением (+03:00) */
export const momentSchema = z.iso.datetime({ offset: true })

export const marketplaceIdSchema = z.enum(['wb', 'ozon'])

export const categoryIdSchema = z.enum(['shoes', 'clothing', 'electronics', 'beauty', 'home', 'sports', 'kids', 'accessories'])

export const schemeSchema = z.enum(['FBO', 'FBS']).nullable()

/** Деньги и счётчики — конечные числа: NaN и бесконечность в ответе — ошибка контракта */
export const finiteNumber = z.number().refine(Number.isFinite)

export const periodSchema = z.object({ from: dateSchema, to: dateSchema })

export type MarketplaceId = z.infer<typeof marketplaceIdSchema>
export type CategoryId = z.infer<typeof categoryIdSchema>
