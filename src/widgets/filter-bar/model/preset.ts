import { DEFAULT_PRESET, resolveFilters, type DataBounds, type FiltersSearch, type PeriodPreset } from '../../../shared/api'

/**
 * Какой пресет отмечен. С границами данных — точно (невалидный свой период → пресет);
 * без них (загрузка /api/meta) — по виду URL: заданы обе даты — свой период.
 */
export function presetOf(search: FiltersSearch, bounds: DataBounds | undefined): PeriodPreset | null {
  if (bounds) return resolveFilters(search, bounds).preset
  return search.from && search.to ? null : (search.period ?? DEFAULT_PRESET)
}
