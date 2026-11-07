import { skipToken, useQuery, type QueryKey } from '@tanstack/react-query'
import { getTopProducts, type TopProductsParams } from './getTopProducts'

/** Часть ключа без метрики: по ней видно, что сменилась только сортировка. */
const filtersKey = (params: TopProductsParams | null) =>
  ['top-products', params?.from, params?.to, params?.mp, params?.cat] as const

const sameFilters = (previousKey: QueryKey, key: readonly unknown[]) =>
  JSON.stringify(previousKey.slice(0, key.length)) === JSON.stringify(key)

/**
 * Топ товаров за период. Ключ — только то, что уходит в запрос (ADR-0007): сравнение и
 * направление сортировки на ответ не влияют. `params = null` — ждём /api/meta.
 *
 * Сменилась только метрика — до ответа показываем прежние строки (spec 006, AC-9): иначе
 * кнопка-заголовок исчезнет под скелетоном вместе с фокусом. Сменились фильтры — скелетон.
 */
export function useTopProducts(params: TopProductsParams | null) {
  const base = filtersKey(params)
  return useQuery({
    queryKey: [...base, params?.sort],
    queryFn: params ? ({ signal }) => getTopProducts(params, signal) : skipToken,
    placeholderData: (previous, previousQuery) =>
      previousQuery && sameFilters(previousQuery.queryKey, base) ? previous : undefined,
  })
}
