import { useQuery } from '@tanstack/react-query'
import { getMeta } from './getMeta'

/** Справочники и границы данных. Один ключ на всё приложение — запрос не дублируется. */
export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: ({ signal }) => getMeta(signal),
  })
}
