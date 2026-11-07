import { useQuery } from '@tanstack/react-query'
import type { StocksParams } from './getStocks'
import { getStocks } from './getStocks'

/**
 * Сколько позиций с наименьшим запасом показывать («Скоро закончится», spec 007). Ответ
 * отсортирован по дням запаса по возрастанию, поэтому все «критично» и «скоро» идут раньше
 * «нормы» и «нет продаж» — пяти позиций ответа хватает.
 */
export const LOW_STOCK_LIMIT = 5

/**
 * Позиции с наименьшим запасом. Период и сравнение на остатки не влияют (ADR-0007), /api/meta
 * не нужен — площадка и категории есть в URL. Лимит постоянный, поэтому в ключ не входит;
 * у страницы «Остатки» (6b) должен быть свой ключ, иначе её список и эти пять позиций
 * попадут в одну запись кэша.
 */
export function useLowStock(params: Omit<StocksParams, 'limit'>) {
  return useQuery({
    queryKey: ['stocks', params.mp, params.cat],
    queryFn: ({ signal }) => getStocks({ ...params, limit: LOW_STOCK_LIMIT }, signal),
  })
}
