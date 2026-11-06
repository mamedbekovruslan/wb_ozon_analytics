import { skipToken, useQuery } from '@tanstack/react-query'
import { getSalesDaily, type SalesDailyParams } from './getSalesDaily'

/**
 * Продажи по дням за период. Ключ — только то, что уходит в запрос (ADR-0007):
 * сравнение и выбранная метрика графика на ответ не влияют и данные не перезапрашивают.
 * `params = null` — даты ещё неизвестны (ждём /api/meta), запрос не отправляется.
 */
export function useSalesDaily(params: SalesDailyParams | null) {
  return useQuery({
    queryKey: ['sales-daily', params?.from, params?.to, params?.mp, params?.cat],
    queryFn: params ? ({ signal }) => getSalesDaily(params, signal) : skipToken,
  })
}
