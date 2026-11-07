import type { StockStatus } from './schemas'

/** Подписи статусов запаса (DESIGN_SPEC § 4, «Бейджи»): общие для бейджа и плиток «Остатков» */
export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  critical: 'Критично',
  soon: 'Скоро закончится',
  ok: 'Норма',
  noSales: 'Нет продаж',
}
