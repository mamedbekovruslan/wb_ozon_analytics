import { skipToken, useQuery } from '@tanstack/react-query'
import { getKpi, type KpiParams } from './getKpi'

/**
 * KPI за период по фильтрам. Ключ — только то, что уходит в запрос (ADR-0007):
 * сравнение (`cmp`) на ответ не влияет, поэтому его переключение не перезапрашивает данные.
 * `params = null` — даты ещё неизвестны (ждём /api/meta), запрос не отправляется.
 */
export function useKpi(params: KpiParams | null) {
  return useQuery({
    queryKey: ['kpi', params?.from, params?.to, params?.mp, params?.cat],
    queryFn: params ? ({ signal }) => getKpi(params, signal) : skipToken,
  })
}
