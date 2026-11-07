// Тестовые фикстуры spec 007 «Скоро закончится». Только для *.test.tsx в app/.
//
// Восемь позиций «товар × склад» с разными статусами. Дни запаса = остаток / скорость
// (docs/domain.md), на экране — целые вниз; статус — по тем же целым дням (spec 007,
// «Дни запаса и статус»): критично d < 7 · скоро 7 ≤ d ≤ 14 · норма d ≥ 15 · нет продаж perDay = 0.
// Статусы и ожидаемые тексты ниже посчитаны вручную, а не форматтерами приложения.
//
//  #   sku         площадка схема склад                    категория    шт    /день   дни (точно)  на экране  статус
//  L1  210000001   wb       —     Коледино                 shoes          0    2,5     0            0 дн.      critical
//  L2  1650293384  ozon     FBO   Хоругвино                clothing      20    6,1     3,28…        3 дн.      critical
//  L3  1702233456  ozon     FBS   Склад продавца, Москва   electronics   69   10       6,9          6 дн.      critical
//  L4  220000004   wb       —     Электросталь             home          70   10       7            7 дн.      soon
//  L5  220000005   wb       —     Подольск                 sports       145   10      14,5         14 дн.      soon (раньше было бы ok)
//  L6  1688800112  ozon     FBO   Хоругвино                clothing     150   10      15           15 дн.      ok
//  L7  230000007   wb       —     Казань                   kids        1000    0,0714 14 005,6…    —          ok
//  L8  1601010101  ozon     FBS   Склад продавца, Москва   beauty         5    0       null         —          noSales
//
// Фикстура изображает сервер /api/stocks: фильтрует по mp и cat, сортирует по точным дням
// по возрастанию («нет продаж» — в конце), считает counts и total до limit и режет до limit.
//
// Что видит блок при limit = 5 (строки — только critical / soon):
//   все площадки        → L1, L2, L3, L4, L5 (5 строк)
//   mp=wb               → ответ L1, L4, L5, L7 → строки L1, L4, L5 (3), L7 — норма
//   mp=ozon             → ответ L2, L3, L6, L8 → строки L2, L3 (2)
//   cat=electronics     → L3 (1)
//   cat=shoes&cat=home  → L1, L4 (2)
//   cat=kids            → только L7 (норма) → «пусто»
//   cat=beauty          → только L8 (нет продаж) → «пусто»
import type { StocksResponse } from '../entities/warehouse'

export type StockItem = StocksResponse['items'][number]

type Row = [
  sku: string,
  name: string,
  mp: StockItem['marketplace'],
  scheme: StockItem['scheme'],
  warehouse: string,
  category: StockItem['category'],
  stock: number,
  perDay: number,
  status: StockItem['status'],
]

const ROWS: Row[] = [
  ['210000001', 'Кроссовки мужские беговые', 'wb', null, 'Коледино', 'shoes', 0, 2.5, 'critical'],
  ['1650293384', 'Куртка зимняя женская', 'ozon', 'FBO', 'Хоругвино', 'clothing', 20, 6.1, 'critical'],
  ['1702233456', 'Наушники беспроводные', 'ozon', 'FBS', 'Склад продавца, Москва', 'electronics', 69, 10, 'critical'],
  ['220000004', 'Сковорода антипригарная 28 см', 'wb', null, 'Электросталь', 'home', 70, 10, 'soon'],
  ['220000005', 'Коврик для йоги', 'wb', null, 'Подольск', 'sports', 145, 10, 'soon'],
  ['1688800112', 'Пуховик мужской', 'ozon', 'FBO', 'Хоругвино', 'clothing', 150, 10, 'ok'],
  ['230000007', 'Конструктор детский', 'wb', null, 'Казань', 'kids', 1000, 0.0714, 'ok'],
  ['1601010101', 'Крем для лица увлажняющий', 'ozon', 'FBS', 'Склад продавца, Москва', 'beauty', 5, 0, 'noSales'],
]

export const STOCK_ITEMS: readonly StockItem[] = ROWS.map(
  ([sku, name, marketplace, scheme, warehouse, category, stock, perDay, status]) => ({
    sku,
    name,
    offerId: `OFFER-${sku}`,
    marketplace,
    scheme,
    warehouse,
    category,
    stock,
    perDay,
    days: perDay > 0 ? stock / perDay : null,
    status,
  }),
)

export const L = {
  L1: STOCK_ITEMS[0] as StockItem,
  L2: STOCK_ITEMS[1] as StockItem,
  L3: STOCK_ITEMS[2] as StockItem,
  L4: STOCK_ITEMS[3] as StockItem,
  L5: STOCK_ITEMS[4] as StockItem,
  L6: STOCK_ITEMS[5] as StockItem,
  L7: STOCK_ITEMS[6] as StockItem,
  L8: STOCK_ITEMS[7] as StockItem,
} as const

/** Позиция с подменёнными полями (граничные случаи, безопасность). */
export const stockItem = (overrides: Partial<StockItem> = {}): StockItem => ({ ...L.L1, ...overrides })

const STATUSES = ['critical', 'soon', 'ok', 'noSales'] as const

/** Ответ /api/stocks, как его отдал бы сервер на эти параметры. */
export function stocksResponse(
  options: { mp?: string | null; cat?: readonly string[]; limit?: string | number | null; items?: readonly StockItem[] } = {},
): StocksResponse {
  const mp = options.mp ?? 'all'
  const cat = options.cat ?? []
  const filtered = [...(options.items ?? STOCK_ITEMS)]
    .filter((i) => mp === 'all' || i.marketplace === mp)
    .filter((i) => cat.length === 0 || cat.includes(i.category))
    .sort((a, b) => {
      if (a.days === null || b.days === null) return a.days === b.days ? 0 : a.days === null ? 1 : -1
      return a.days - b.days
    })
  const counts = Object.fromEntries(STATUSES.map((s) => [s, filtered.filter((i) => i.status === s).length])) as StocksResponse['counts']
  const limit = options.limit === undefined || options.limit === null ? filtered.length : Number(options.limit)
  return { asOf: '2026-11-04', total: filtered.length, counts, items: filtered.slice(0, limit) }
}

/** Ответ без позиций. */
export const emptyStocksResponse = (): StocksResponse => ({
  asOf: '2026-11-04',
  total: 0,
  counts: { critical: 0, soon: 0, ok: 0, noSales: 0 },
  items: [],
})

/** Ответ из заданных позиций в заданном порядке (сервер «как есть»). */
export const stocksResponseOf = (items: readonly StockItem[]): StocksResponse => ({
  asOf: '2026-11-04',
  total: items.length,
  counts: {
    critical: items.filter((i) => i.status === 'critical').length,
    soon: items.filter((i) => i.status === 'soon').length,
    ok: items.filter((i) => i.status === 'ok').length,
    noSales: items.filter((i) => i.status === 'noSales').length,
  },
  items: [...items],
})

export const STATUS_LABEL = { critical: 'Критично', soon: 'Скоро закончится' } as const

/**
 * Что должно быть в строке (пробелы обычные: norm сводит неразрывные к обычным).
 * meta — хвост строки под названием: «· {formatPieces(stock)} · {formatSpeed(perDay)}».
 */
export type ExpectedRow = {
  name: string
  mp: 'WB' | 'Ozon'
  scheme: 'FBO' | 'FBS' | null
  warehouse: string
  meta: string
  days: string
  status: (typeof STATUS_LABEL)[keyof typeof STATUS_LABEL]
}

export const EXPECTED_ROWS: Record<string, ExpectedRow> = {
  // 0 / 2,5 = 0 → «0 дн.»; формат скорости 2,5 → «2,5/день»
  [L.L1.sku]: { name: L.L1.name, mp: 'WB', scheme: null, warehouse: 'Коледино', meta: '· 0 шт · 2,5/день', days: '0 дн.', status: 'Критично' },
  // 20 / 6,1 ≈ 3,28 → «3 дн.» (пример из макета)
  [L.L2.sku]: { name: L.L2.name, mp: 'Ozon', scheme: 'FBO', warehouse: 'Хоругвино', meta: '· 20 шт · 6,1/день', days: '3 дн.', status: 'Критично' },
  // 69 / 10 = 6,9 → «6 дн.», критично
  [L.L3.sku]: { name: L.L3.name, mp: 'Ozon', scheme: 'FBS', warehouse: 'Склад продавца, Москва', meta: '· 69 шт · 10,0/день', days: '6 дн.', status: 'Критично' },
  // 70 / 10 = 7 → граница «скоро»
  [L.L4.sku]: { name: L.L4.name, mp: 'WB', scheme: null, warehouse: 'Электросталь', meta: '· 70 шт · 10,0/день', days: '7 дн.', status: 'Скоро закончится' },
  // 145 / 10 = 14,5 → «14 дн.» и «Скоро закончится» (решение 2026-11-07)
  [L.L5.sku]: { name: L.L5.name, mp: 'WB', scheme: null, warehouse: 'Подольск', meta: '· 145 шт · 10,0/день', days: '14 дн.', status: 'Скоро закончится' },
}

export const DEFAULT_ROWS = [L.L1.sku, L.L2.sku, L.L3.sku, L.L4.sku, L.L5.sku] as const
export const WB_ROWS = [L.L1.sku, L.L4.sku, L.L5.sku] as const
export const OZON_ROWS = [L.L2.sku, L.L3.sku] as const

export const NAME_BY_SKU: Record<string, string> = Object.fromEntries(STOCK_ITEMS.map((i) => [i.sku, i.name]))
export const SKU_BY_NAME: Record<string, string> = Object.fromEntries(STOCK_ITEMS.map((i) => [i.name, i.sku]))

/** Подзаголовки (AC-10). */
export const SUBTITLE = {
  five: '5 позиций с наименьшим запасом',
  four: '4 позиции с наименьшим запасом',
  three: '3 позиции с наименьшим запасом',
  two: '2 позиции с наименьшим запасом',
  one: '1 позиция с наименьшим запасом',
} as const

export const LOW = { name: 'Скоро закончится' } as const
export const LOADING_LABEL = 'Загружаем остатки'
export const EMPTY_TITLE = 'Ничего не заканчивается'
export const EMPTY_TEXT = 'У всех товаров запас больше 14 дней по выбранным фильтрам.'
export const ERROR_TITLE = 'Не удалось получить остатки'
export const ERROR_TEXT = 'Проверьте соединение и повторите.'
export const LINK_NAME = 'Все остатки'

const normText = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()

/** Артикул строки — по названию товара в ней (названия в фикстуре уникальны и не вложены друг в друга). */
export function rowSkuByName(li: Element): string {
  const text = normText(li.textContent)
  const found = STOCK_ITEMS.filter((i) => text.includes(i.name))
  if (found.length !== 1) return `?${text}`
  return (found[0] as StockItem).sku
}
