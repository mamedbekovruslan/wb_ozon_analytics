import type { TopProduct, TopSort } from '../../../entities/product'

export type SortDir = 'desc' | 'asc'

export type TopSortState = { sort: TopSort; dir: SortDir }

export const DEFAULT_TOP_SORT: TopSortState = { sort: 'revenue', dir: 'desc' }

/** Таблица «Сортировка» spec 006: заголовок колонки, подзаголовок, подпись мобильной кнопки. */
export const TOP_SORTS: Record<TopSort, { column: string; caption: string; button: string }> = {
  revenue: { column: 'Выручка', caption: 'по выручке', button: 'По выручке' },
  orders: { column: 'Заказы', caption: 'по заказам', button: 'По заказам' },
  buyoutRate: { column: '% выкупа', caption: 'по % выкупа', button: 'По % выкупа' },
  profit: { column: 'Прибыль', caption: 'по прибыли', button: 'По прибыли' },
}

/** Порядок колонок таблицы. */
export const TABLE_SORT_ORDER: readonly TopSort[] = ['revenue', 'orders', 'buyoutRate', 'profit']

/** Порядок перебора мобильной кнопкой (Dashboard.dc.html, `cycleSort`). */
const MOBILE_CYCLE: readonly TopSort[] = ['revenue', 'profit', 'orders', 'buyoutRate']

/** Подзаголовок блока: «по выручке за период», «по выручке, по возрастанию за период». */
export const topSubtitle = ({ sort, dir }: TopSortState) =>
  `${TOP_SORTS[sort].caption}${dir === 'asc' ? ', по возрастанию' : ''} за период`

/** Клик по заголовку: другая метрика — по убыванию; та же — смена направления. */
export const toggleTopSort = (current: TopSortState, sort: TopSort): TopSortState =>
  current.sort === sort ? { sort, dir: current.dir === 'desc' ? 'asc' : 'desc' } : { sort, dir: 'desc' }

/** Мобильная кнопка: следующая метрика по кругу, всегда по убыванию. */
export const nextMobileSort = (current: TopSort): TopSortState => {
  const next = MOBILE_CYCLE[(MOBILE_CYCLE.indexOf(current) + 1) % MOBILE_CYCLE.length] ?? 'revenue'
  return { sort: next, dir: 'desc' }
}

/**
 * Порядок строк (AC-20). Сервер уже отсортировал по метрике по убыванию, поэтому значения
 * не сравниваются: `asc` — разворот ответа. Только у «% выкупа» товары без значения
 * сервер ставит в конец — там они и остаются, в исходном порядке.
 */
export function sortTopItems<T extends TopProduct>(items: readonly T[], sort: TopSort, dir: SortDir): T[] {
  if (dir === 'desc') return [...items]
  if (sort !== 'buyoutRate') return [...items].reverse()
  const withValue = items.filter((item) => item.buyoutRate !== null)
  const withoutValue = items.filter((item) => item.buyoutRate === null)
  return [...withValue.reverse(), ...withoutValue]
}
