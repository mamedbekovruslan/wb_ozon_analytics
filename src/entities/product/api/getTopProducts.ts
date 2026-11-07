import { apiGet, toApiParams, type ResolvedFilters } from '../../../shared/api'
import { topProductsResponseSchema, type TopProductsResponse, type TopSort } from '../model/schemas'

/** Фильтры периода, площадки и категорий + метрика, по которой строится топ. */
export type TopProductsParams = Pick<ResolvedFilters, 'from' | 'to' | 'mp' | 'cat'> & { sort: TopSort }

/** Сколько товаров в топе дашборда (spec 006). */
const TOP_LIMIT = 10

export function getTopProducts(params: TopProductsParams, signal?: AbortSignal): Promise<TopProductsResponse> {
  const query = toApiParams(params)
  query.set('sort', params.sort)
  query.set('limit', String(TOP_LIMIT))
  return apiGet(`/api/top-products?${query.toString()}`, topProductsResponseSchema, signal)
}
