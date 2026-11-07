import { apiGet, type ResolvedFilters } from '../../../shared/api'
import { stocksResponseSchema, type StocksResponse } from '../model/schemas'

/** Остатки — на «сегодня»: период на них не влияет, только площадка и категории (spec 001). */
export type StocksParams = Pick<ResolvedFilters, 'mp' | 'cat'> & { limit?: number }

export function getStocks(params: StocksParams, signal?: AbortSignal): Promise<StocksResponse> {
  const query = new URLSearchParams({ mp: params.mp })
  for (const id of params.cat) query.append('cat', id)
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  return apiGet(`/api/stocks?${query.toString()}`, stocksResponseSchema, signal)
}
