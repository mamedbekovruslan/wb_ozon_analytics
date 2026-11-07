// Тестовые фикстуры spec 008 «Страница «Остатки»». Только для *.test.tsx в app/.
//
// Базовый набор — восемь позиций из lowStockTestFixtures.ts (L1…L8), все четыре статуса.
// Дни запаса = остаток / скорость (docs/domain.md), на экране — целые вниз; полоса —
// min(100, дни / 30 × 100) % (spec 008, AC-14). Ожидаемые тексты посчитаны вручную.
//
//  #   артикул     площадка схема склад                   шт     в день  дни (точно)  на экране   статус
//  L1  210000001   WB       —     Коледино                0 шт   2,5     0            0 дн.       Критично
//  L2  1650293384  Ozon     FBO   Хоругвино               20 шт  6,1     3,28…        3 дн.       Критично
//  L3  1702233456  Ozon     FBS   Склад продавца, Москва  69 шт  10,0    6,9          6 дн.       Критично
//  L4  220000004   WB       —     Электросталь            70 шт  10,0    7            7 дн.       Скоро закончится
//  L5  220000005   WB       —     Подольск               145 шт  10,0    14,5         14 дн.      Скоро закончится
//  L6  1688800112  Ozon     FBO   Хоругвино              150 шт  10,0    15           15 дн.      Норма
//  L7  230000007   WB       —     Казань               1 000 шт  0,1     14 005,6…    14 005 дн.  Норма
//  L8  1601010101  Ozon     FBS   Склад продавца, Москва   5 шт  0,0     null         —           Нет продаж
//
// Порядок ответа (дни по возрастанию, «нет продаж» — в конце): L1 … L8.
// Плитки без поиска: критично 3 · скоро 2 · норма 2 · нет продаж 1; всего 8.
//   mp=wb   → L1, L4, L5, L7 → 1 · 2 · 1 · 0
//   mp=ozon → L2, L3, L6, L8 → 2 · 0 · 1 · 1
//   поиск «хоругвино»       → L2, L6 → 1 · 0 · 1 · 0
//   поиск «склад продавца»  → L3, L8 → 1 · 0 · 0 · 1
import { vi } from 'vitest'
import type { StockStatus } from '../entities/warehouse'
import { L, type StockItem } from './lowStockTestFixtures'

export const STATUS_ORDER = ['critical', 'soon', 'ok', 'noSales'] as const satisfies readonly StockStatus[]

export const STATUS_TEXT: Record<StockStatus, string> = {
  critical: 'Критично',
  soon: 'Скоро закончится',
  ok: 'Норма',
  noSales: 'Нет продаж',
}

/** Подсказки порога на плитках (≥ 1200). */
export const TILE_HINT: Record<StockStatus, string> = {
  critical: '< 7 дней',
  soon: '7–14 дней',
  ok: '> 14 дней',
  noSales: '0 за 14 дней',
}

export type ExpectedStockRow = {
  sku: string
  name: string
  mp: 'WB' | 'Ozon'
  scheme: 'FBO' | 'FBS' | null
  warehouse: string
  stock: string
  speed: string
  days: string
  status: string
}

const row = (item: StockItem, r: Omit<ExpectedStockRow, 'sku' | 'name'>): ExpectedStockRow => ({ sku: item.sku, name: item.name, ...r })

/** Пробелы обычные: norm сводит неразрывные к обычным. */
export const PAGE_ROWS: readonly ExpectedStockRow[] = [
  // 0 / 2,5 = 0 → «0 дн.»
  row(L.L1, { mp: 'WB', scheme: null, warehouse: 'Коледино', stock: '0 шт', speed: '2,5', days: '0 дн.', status: 'Критично' }),
  // 20 / 6,1 ≈ 3,28 → «3 дн.» (пример из макета)
  row(L.L2, { mp: 'Ozon', scheme: 'FBO', warehouse: 'Хоругвино', stock: '20 шт', speed: '6,1', days: '3 дн.', status: 'Критично' }),
  // 69 / 10 = 6,9 → «6 дн.»
  row(L.L3, { mp: 'Ozon', scheme: 'FBS', warehouse: 'Склад продавца, Москва', stock: '69 шт', speed: '10,0', days: '6 дн.', status: 'Критично' }),
  // 70 / 10 = 7 → граница «скоро»
  row(L.L4, { mp: 'WB', scheme: null, warehouse: 'Электросталь', stock: '70 шт', speed: '10,0', days: '7 дн.', status: 'Скоро закончится' }),
  // 145 / 10 = 14,5 → «14 дн.», скоро
  row(L.L5, { mp: 'WB', scheme: null, warehouse: 'Подольск', stock: '145 шт', speed: '10,0', days: '14 дн.', status: 'Скоро закончится' }),
  // 150 / 10 = 15 → норма
  row(L.L6, { mp: 'Ozon', scheme: 'FBO', warehouse: 'Хоругвино', stock: '150 шт', speed: '10,0', days: '15 дн.', status: 'Норма' }),
  // 1000 / 0,0714 ≈ 14 005,6 → «14 005 дн.»; скорость 0,0714 → «0,1»
  row(L.L7, { mp: 'WB', scheme: null, warehouse: 'Казань', stock: '1 000 шт', speed: '0,1', days: '14 005 дн.', status: 'Норма' }),
  // скорость 0 → «—», нет продаж
  row(L.L8, { mp: 'Ozon', scheme: 'FBS', warehouse: 'Склад продавца, Москва', stock: '5 шт', speed: '0,0', days: '—', status: 'Нет продаж' }),
]

export const ALL_SKUS = PAGE_ROWS.map((r) => r.sku)
export const SKUS_BY_STATUS: Record<StockStatus, string[]> = {
  critical: [L.L1.sku, L.L2.sku, L.L3.sku],
  soon: [L.L4.sku, L.L5.sku],
  ok: [L.L6.sku, L.L7.sku],
  noSales: [L.L8.sku],
}
export const WB_SKUS = [L.L1.sku, L.L4.sku, L.L5.sku, L.L7.sku]
export const OZON_SKUS = [L.L2.sku, L.L3.sku, L.L6.sku, L.L8.sku]

/** Подсказки схемы (AC-12). */
export const SCHEME_TITLE = { FBO: 'Хранение и доставка — Ozon', FBS: 'Хранение и сборка — продавец' } as const

export const PAGE_TEXT = {
  h1: 'Остатки',
  tilesGroup: 'Фильтр по статусу запаса',
  searchLabel: 'Поиск по названию, артикулу или складу',
  searchPlaceholder: 'Товар, артикул или склад',
  counterPrefix: 'Позиций «товар × склад»:',
  section: 'Остатки по складам',
  scroll: 'Список остатков, прокручивается',
  cards: 'Остатки',
  loading: 'Загружаем остатки',
  speedNote: 'скорость — средние выкупы в день за 14 дней',
  emptyTitle: 'На складах ничего нет',
  emptyText: 'По выбранным площадке и категориям остатков не найдено.',
  emptyButton: 'Сбросить фильтры',
  notFoundTitle: 'Ничего не найдено',
  notFoundText: 'Измените запрос или выберите другой статус.',
  notFoundButton: 'Сбросить поиск и статус',
  errorTitle: 'Не удалось загрузить остатки',
  errorText: 'Проверьте соединение и повторите.',
  retry: 'Повторить',
} as const

/** Колонки таблицы по ширине (AC-12, AC-13). */
export const HEADERS_WIDE = ['Товар', 'Площадка', 'Склад', 'Остаток', 'Продажи в день', 'Дней запаса', 'Статус'] as const
export const HEADERS_NARROW = ['Товар', 'Склад', 'Остаток', 'В день', 'Запас · статус'] as const

/**
 * Синтетический набор из n позиций: «Позиция 0001»… Дни = i (скорость 1, остаток i),
 * статус по целым дням; последняя — «нет продаж». Площадки чередуются: чётные — WB
 * (Коледино), нечётные — Ozon FBO (Хоругвино).
 *
 * n = 30: критично 7 (i = 0…6) · скоро 8 (7…14) · норма 14 (15…28) · нет продаж 1 (29);
 *         WB — 15 позиций, Ozon — 15.
 */
export function manyItems(n: number): StockItem[] {
  return Array.from({ length: n }, (_, i): StockItem => {
    const last = i === n - 1
    const wb = i % 2 === 0
    const status: StockItem['status'] = last ? 'noSales' : i < 7 ? 'critical' : i <= 14 ? 'soon' : 'ok'
    return {
      sku: String(500_000_000 + i),
      name: `Позиция ${String(i + 1).padStart(4, '0')}`,
      offerId: `MANY-${i}`,
      marketplace: wb ? 'wb' : 'ozon',
      scheme: wb ? null : 'FBO',
      warehouse: wb ? 'Коледино' : 'Хоругвино',
      category: 'shoes',
      stock: i,
      perDay: last ? 0 : 1,
      days: last ? null : i,
      status,
    }
  })
}

export const manyName = (i: number) => `Позиция ${String(i + 1).padStart(4, '0')}`

/**
 * Виртуальная таблица в jsdom: у элементов нет размеров. Даём области прокрутки высоту 620
 * (как на 1440), строкам — 52, чтобы виртуализация (TanStack Virtual) вела себя как в браузере:
 * рисовала видимые строки ± запас. Остальные элементы — без изменений.
 */
export function stubVirtualLayout(viewport = { width: 1400, height: 620 }, rowHeight = 52): void {
  const isScroll = (el: Element) => el.getAttribute('aria-label') === PAGE_TEXT.scroll
  const isVirtualRow = (el: Element) => {
    const scroll = el.parentElement?.closest(`[aria-label="${PAGE_TEXT.scroll}"]`)
    return Boolean(scroll) && (el.getAttribute('role') === 'row' || el.hasAttribute('data-index'))
  }
  const size = (el: Element, axis: 'width' | 'height'): number | null => {
    if (isScroll(el)) return viewport[axis]
    if (isVirtualRow(el)) return axis === 'height' ? rowHeight : viewport.width
    return null
  }

  const originalRect = Element.prototype.getBoundingClientRect
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const h = size(this, 'height')
    if (h === null) return originalRect.call(this)
    const w = size(this, 'width') ?? 0
    return { x: 0, y: 0, top: 0, left: 0, width: w, height: h, right: w, bottom: h, toJSON: () => ({}) } as DOMRect
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return size(this, 'height') ?? 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return size(this, 'width') ?? 0
  })
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
    return size(this, 'height') ?? 0
  })
}
