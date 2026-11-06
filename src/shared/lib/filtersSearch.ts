import { useNavigate, useSearch } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { parseFiltersSearch, type FiltersSearch } from '../api'

// Фильтры живут в URL (ADR-0007): чтение и запись — только через эти хуки,
// чтобы формат адреса задавался в одном месте (shared/api/filters).

/** Текущие фильтры из URL в чистом виде. */
export function useFiltersSearch(): FiltersSearch {
  // strict: false — фильтры общие для всех страниц, хук не привязан к маршруту
  const raw = useSearch({ strict: false })
  return useMemo(() => parseFiltersSearch(raw), [raw])
}

/** Записывает фильтры в URL. По умолчанию — новой записью истории, чтобы «Назад» возвращал прошлый выбор. */
export function useSetFiltersSearch(): (next: FiltersSearch, options?: { replace?: boolean }) => void {
  const navigate = useNavigate()
  return useCallback(
    (next, options) => {
      void navigate({ to: '.', search: parseFiltersSearch(next), replace: options?.replace ?? false })
    },
    [navigate],
  )
}
