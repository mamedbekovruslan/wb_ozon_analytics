import type { StockStatus, StocksResponse } from '../../../entities/warehouse'

// Поиск, плитки статусов и «Показать ещё» работают в браузере по уже загруженному
// списку (spec 008, решение пользователя 2): без запросов к API при каждом нажатии.

export type StockItem = StocksResponse['items'][number]

/** Порядок плиток (DESIGN_SPEC § 6, «Остатки») */
export const STOCK_STATUSES: readonly StockStatus[] = ['critical', 'soon', 'ok', 'noSales']

/** Подсказка порога на плитке (≥ 1200, Stock.dc.html) */
export const STATUS_HINT: Record<StockStatus, string> = {
  critical: '< 7 дней',
  soon: '7–14 дней',
  ok: '> 14 дней',
  noSales: '0 за 14 дней',
}

/** Длина поиска ограничена, как `q` у /api/orders (spec 008, «Безопасность») */
export const SEARCH_MAX_LENGTH = 100

/** Телефон: сначала 8 карточек, затем по 20 (Stock.dc.html, AC-18) */
export const CARDS_INITIAL = 8
export const CARDS_STEP = 20

/** Шкала полосы запаса — 0–30 дней (DESIGN_SPEC § 6) */
const BAR_SCALE_DAYS = 30

/**
 * Строки, в названии, артикуле (sku, offerId) или складе которых есть подстрока запроса
 * без учёта регистра и пробелов по краям. Сравнение подстрокой, а не RegExp: ввод — просто текст.
 */
export function searchStocks(items: readonly StockItem[], query: string): readonly StockItem[] {
  const needle = query.trim().toLocaleLowerCase('ru-RU')
  if (needle === '') return items
  return items.filter((item) =>
    [item.name, item.sku, item.offerId, item.warehouse].some((field) => field.toLocaleLowerCase('ru-RU').includes(needle)),
  )
}

/** Только выбранный статус; null — все статусы. */
export function filterByStatus(items: readonly StockItem[], status: StockStatus | null): readonly StockItem[] {
  return status === null ? items : items.filter((item) => item.status === status)
}

/** Числа на плитках: позиции каждого статуса среди строк, прошедших поиск (AC-7). */
export function countByStatus(items: readonly StockItem[]): Record<StockStatus, number> {
  const counts: Record<StockStatus, number> = { critical: 0, soon: 0, ok: 0, noSales: 0 }
  for (const item of items) counts[item.status] += 1
  return counts
}

/** Заполнение полосы запаса, %: min(100, дни / 30 × 100); у «нет продаж» — 0 (AC-14). */
export function stockBarPercent(days: number | null): number {
  if (days === null || days <= 0) return 0
  return Math.min(100, (days / BAR_SCALE_DAYS) * 100)
}

/** Сколько карточек добавит «Показать ещё»: min(20, оставшиеся) (AC-18). */
export function showMoreCount(total: number, shown: number): number {
  return Math.max(0, Math.min(CARDS_STEP, total - shown))
}
