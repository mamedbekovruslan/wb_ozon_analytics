import { useEffect } from 'react'
import { useMeta } from '../entities/marketplace'
import { normalizeFiltersSearch, stringifySearchQuery } from '../shared/api'
import { useFiltersSearch, useSetFiltersSearch } from '../shared/lib'

/**
 * Годятся ли даты своего периода, видно только по границам данных из /api/meta.
 * Когда они пришли, лишнее убирается из URL заменой записи истории (AC-6, AC-10).
 */
export function FiltersUrlSync() {
  const search = useFiltersSearch()
  const setSearch = useSetFiltersSearch()
  const { data: meta } = useMeta()

  useEffect(() => {
    if (!meta) return
    const normalized = normalizeFiltersSearch(search, meta)
    if (stringifySearchQuery(normalized) !== stringifySearchQuery(search)) setSearch(normalized, { replace: true })
  }, [meta, search, setSearch])

  return null
}
