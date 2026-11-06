import { apiGet, toApiParams } from '../../../shared/api'
import { salesDailyResponseSchema, type SalesDailyResponse } from '../model/schemas'
import type { KpiParams } from './getKpi'

/** Те же фильтры, что у KPI: период, площадка, категории. */
export type SalesDailyParams = KpiParams

export function getSalesDaily(params: SalesDailyParams, signal?: AbortSignal): Promise<SalesDailyResponse> {
  return apiGet(`/api/sales-daily?${toApiParams(params).toString()}`, salesDailyResponseSchema, signal)
}
