import { useQuery } from '@tanstack/react-query'
import type { StocksParams } from './getStocks'
import { getStocks } from './getStocks'

/**
 * Все позиции «товар × склад» по площадке и категориям — для страницы «Остатки» (spec 008).
 * Без лимита: поиск, плитки статусов и «Показать ещё» работают в браузере по этому списку.
 * Свой ключ: у блока «Скоро закончится» ['stocks', mp, cat] — там пять позиций, здесь все.
 */
export function useStocks(params: Omit<StocksParams, 'limit'>) {
  return useQuery({
    queryKey: ['stocks', 'list', params.mp, params.cat],
    queryFn: ({ signal }) => getStocks(params, signal),
  })
}
