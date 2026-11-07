import { LOW_STOCK_LIMIT, type StocksResponse } from '../../../entities/warehouse'

type StockItem = StocksResponse['items'][number]

/** Позиция, которую показывает блок: только «критично» и «скоро закончится». */
export type LowStockItem = StockItem & { status: 'critical' | 'soon' }

/** Сколько строк в блоке «Скоро закончится» (DESIGN_SPEC § 4) — столько же, сколько запрашиваем. */
export const LOW_STOCK_ROWS = LOW_STOCK_LIMIT

const isLow = (item: StockItem): item is LowStockItem => item.status === 'critical' || item.status === 'soon'

/** Строки блока (spec 007, AC-3): «критично» и «скоро» в порядке ответа, не больше пяти. */
export function pickLowStockItems(items: readonly StockItem[]): LowStockItem[] {
  return items.filter(isLow).slice(0, LOW_STOCK_ROWS)
}

function positionsWord(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'позиция'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'позиции'
  return 'позиций'
}

/**
 * Подзаголовок (spec 007, AC-10): при данных — фактическое число строк; без данных
 * (загрузка, пусто, ошибка) — текст макета «5 позиций…».
 */
export function lowStockSubtitle(count?: number): string {
  const n = count === undefined || count === 0 ? LOW_STOCK_ROWS : count
  // Пробелы обычные, как в макете
  return `${n} ${positionsWord(n)} с наименьшим запасом`
}
