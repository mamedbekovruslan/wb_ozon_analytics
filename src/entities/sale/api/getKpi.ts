import { apiGet, toApiParams, type ResolvedFilters } from '../../../shared/api'
import { kpiResponseSchema, type KpiResponse } from '../model/schemas'

export type KpiParams = Pick<ResolvedFilters, 'from' | 'to' | 'mp' | 'cat'>

export function getKpi(params: KpiParams, signal?: AbortSignal): Promise<KpiResponse> {
  return apiGet(`/api/kpi?${toApiParams(params).toString()}`, kpiResponseSchema, signal)
}
