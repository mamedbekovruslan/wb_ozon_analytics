import { MOBILE_QUERY, useMediaQuery } from '../../../shared/lib'
import { FilterPanel } from './FilterPanel'
import { MobileFilterBar } from './MobileFilterBar'

/** Фильтры страницы: панель от 640 px, на телефоне — кнопка, сводка и bottom sheet (DESIGN_SPEC § 2, 3). */
export function FilterBar() {
  const isMobile = useMediaQuery(MOBILE_QUERY)
  return isMobile ? <MobileFilterBar /> : <FilterPanel />
}
