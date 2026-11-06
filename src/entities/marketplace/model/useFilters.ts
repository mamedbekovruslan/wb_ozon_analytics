import { resolveFilters, type FiltersSearch, type ResolvedFilters } from '../../../shared/api'
import { useFiltersSearch } from '../../../shared/lib'
import { useMeta } from '../api/useMeta'
import type { MetaResponse } from './meta'

export type FiltersState = {
  /** Фильтры из URL — есть сразу */
  search: FiltersSearch
  /** Даты периода зависят от «сегодня» из /api/meta: null, пока его нет */
  filters: ResolvedFilters | null
  meta: MetaResponse | undefined
  metaStatus: 'pending' | 'error' | 'success'
}

export function useFilters(): FiltersState {
  const search = useFiltersSearch()
  const meta = useMeta()
  return {
    search,
    filters: meta.data ? resolveFilters(search, meta.data) : null,
    meta: meta.data,
    metaStatus: meta.status,
  }
}
