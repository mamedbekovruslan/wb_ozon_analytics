import type { CategoryId, FiltersSearch } from '../../../shared/api'
import { formatCategoriesCount } from '../../../shared/lib'

export type CategoryOption = { id: CategoryId; name: string; productCount: number }

/** Пусто — все категории: параметр в URL не пишется. */
export function withCategories(search: FiltersSearch, cat: CategoryId[]): FiltersSearch {
  const { cat: _cat, ...rest } = search
  return cat.length > 0 ? { ...rest, cat } : rest
}

/** Переключает категорию в выборке, сохраняя порядок справочника. */
export function toggleCategory(selected: readonly CategoryId[], id: CategoryId, options: readonly CategoryOption[]): CategoryId[] {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return options.map((option) => option.id).filter((optionId) => next.has(optionId))
}

/** Кнопка «Категории»: все · Обувь, Одежда · Обувь, Одежда +3 */
export function categoriesSummary(selected: readonly CategoryId[], options: readonly CategoryOption[]): string {
  if (selected.length === 0) return 'все'
  const names = options.filter((option) => selected.includes(option.id)).map((option) => option.name)
  const shown = names.slice(0, 2).join(', ')
  return names.length > 2 ? `${shown} +${names.length - 2}` : shown
}

/** Мобильная сводка: все категории · 1 категория · 5 категорий */
export const categoriesCountLabel = (count: number) => (count === 0 ? 'все категории' : formatCategoriesCount(count))
