import { z } from 'zod'
import { dateSchema, finiteNumber, marketplaceIdSchema, momentSchema, periodSchema, schemeSchema } from '../../../shared/api'

// Ответы /api/kpi, /api/sales-daily, /api/orders (spec 001, «Контракт»).
// Доли — проценты 0–100; null — «не посчитать» (нет выкупов, выручка ≤ 0…).

const share = finiteNumber.nullable()

export const metricsSchema = z.object({
  ordersCount: finiteNumber,
  ordersSum: finiteNumber,
  buyoutsCount: finiteNumber,
  revenue: finiteNumber,
  buyoutRate: share,
  returnsCount: finiteNumber,
  returnsSum: finiteNumber,
  avgCheck: share,
  commission: finiteNumber,
  logistics: finiteNumber,
  costPrice: finiteNumber,
  profit: finiteNumber,
  margin: share,
})

const sparkline = z.array(share)

export const kpiResponseSchema = z.object({
  period: periodSchema,
  previousPeriod: periodSchema,
  current: metricsSchema,
  previous: metricsSchema,
  sparklines: z.object({
    ordersCount: sparkline,
    ordersSum: sparkline,
    buyoutsCount: sparkline,
    revenue: sparkline,
    buyoutRate: sparkline,
    returnsCount: sparkline,
    returnsSum: sparkline,
    avgCheck: sparkline,
    commission: sparkline,
    logistics: sparkline,
    costPrice: sparkline,
    profit: sparkline,
    margin: sparkline,
  }),
})

const dayValuesSchema = z.object({ revenue: finiteNumber, ordersCount: finiteNumber, profit: finiteNumber })

export const salesDailyResponseSchema = z.object({
  days: z.array(
    z.object({
      date: dateSchema,
      wb: dayValuesSchema,
      ozon: dayValuesSchema,
      total: dayValuesSchema,
      previousDate: dateSchema,
      previousTotal: dayValuesSchema,
    }),
  ),
})

export const orderStatusSchema = z.enum(['inTransit', 'bought', 'cancelled', 'returned'])

export const ordersResponseSchema = z.object({
  total: finiteNumber,
  counts: z.object({ all: finiteNumber, inTransit: finiteNumber, bought: finiteNumber, cancelled: finiteNumber, returned: finiteNumber }),
  items: z.array(
    z.object({
      id: z.string(),
      orderedAt: momentSchema,
      sku: z.string(),
      offerId: z.string(),
      name: z.string(),
      marketplace: marketplaceIdSchema,
      scheme: schemeSchema,
      warehouse: z.string(),
      price: finiteNumber,
      status: orderStatusSchema,
    }),
  ),
})

export type Metrics = z.infer<typeof metricsSchema>
export type KpiResponse = z.infer<typeof kpiResponseSchema>
export type SalesDailyResponse = z.infer<typeof salesDailyResponseSchema>
export type OrderStatus = z.infer<typeof orderStatusSchema>
export type OrdersResponse = z.infer<typeof ordersResponseSchema>
