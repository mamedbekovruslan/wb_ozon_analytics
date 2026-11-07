// Тестовые фикстуры spec 006 «Топ товаров». Только для *.test.tsx в app/.
//
// Двенадцать товаров с разными значениями каждой метрики: топ-10 по выручке, заказам,
// % выкупа и прибыли получается разным, и по составу строк видно, по какой метрике
// пришёл ответ. Фикстура изображает сервер: сортирует по запрошенной метрике по убыванию
// (товары без % выкупа — в конце, как в spec 001), фильтрует по площадке и режет до limit.
// Ожидаемые порядки ниже посчитаны вручную, а не этой функцией.
//
//  #   sku          площадка категория    выручка  заказы  % выкупа  прибыль
//  P1  184523671    wb       shoes        412 300  150     82,5      98 000
//  P2  1650293384   ozon     clothing     380 000   95     74,1     120 500
//  P3  173002914    wb       electronics  351 200  210     91,3      45 000
//  P4  1702233456   ozon     home         298 750  180     88,0      61 200
//  P5  190447215    wb       accessories  254 000  120     69,8      70 100
//  P6  1688800112   ozon     beauty       210 400  260     95,6      38 800
//  P7  166780021    wb       sports       187 000   88     60,2      52 300
//  P8  1601010101   ozon     kids               0  130     null      −1 200  (все заказы ещё в пути)
//  P9  199900011    wb       clothing     120 000  140     77,7      −5 000
//  P10 1612121212   ozon     accessories   98 000  300     55,0      15 000
//  P11 181818181    wb       home          65 000   40     99,0       9 000
//  P12 1633333333   ozon     clothing       1 000   10     10,0         100
import type { TopProductsResponse } from '../entities/product'

export type TopItem = TopProductsResponse['items'][number]
export type TopSortParam = 'revenue' | 'orders' | 'buyoutRate' | 'profit'

type Row = [sku: string, name: string, mp: TopItem['marketplace'], category: TopItem['category'], revenue: number, orders: number, buyoutRate: number | null, profit: number]

const ROWS: Row[] = [
  ['184523671', 'Кроссовки мужские беговые', 'wb', 'shoes', 412_300, 150, 82.5, 98_000],
  ['1650293384', 'Куртка зимняя женская', 'ozon', 'clothing', 380_000, 95, 74.1, 120_500],
  ['173002914', 'Наушники беспроводные', 'wb', 'electronics', 351_200, 210, 91.3, 45_000],
  ['1702233456', 'Сковорода антипригарная 28 см', 'ozon', 'home', 298_750, 180, 88, 61_200],
  ['190447215', 'Рюкзак городской', 'wb', 'accessories', 254_000, 120, 69.8, 70_100],
  ['1688800112', 'Крем для лица увлажняющий', 'ozon', 'beauty', 210_400, 260, 95.6, 38_800],
  ['166780021', 'Коврик для йоги', 'wb', 'sports', 187_000, 88, 60.2, 52_300],
  ['1601010101', 'Конструктор детский', 'ozon', 'kids', 0, 130, null, -1_200],
  ['199900011', 'Футболка хлопковая', 'wb', 'clothing', 120_000, 140, 77.7, -5_000],
  ['1612121212', 'Чехол для смартфона', 'ozon', 'accessories', 98_000, 300, 55, 15_000],
  ['181818181', 'Термос 1 л', 'wb', 'home', 65_000, 40, 99, 9_000],
  ['1633333333', 'Шапка вязаная', 'ozon', 'clothing', 1_000, 10, 10, 100],
]

export const PRODUCTS: readonly TopItem[] = ROWS.map(([sku, name, marketplace, category, revenue, ordersCount, buyoutRate, profit]) => ({
  sku,
  name,
  offerId: `OFFER-${sku}`,
  marketplace,
  category,
  revenue,
  ordersCount,
  buyoutRate,
  profit,
}))

export const SKU = {
  P1: '184523671',
  P2: '1650293384',
  P3: '173002914',
  P4: '1702233456',
  P5: '190447215',
  P6: '1688800112',
  P7: '166780021',
  P8: '1601010101',
  P9: '199900011',
  P10: '1612121212',
  P11: '181818181',
  P12: '1633333333',
} as const

export const NAME_BY_SKU: Record<string, string> = Object.fromEntries(PRODUCTS.map((p) => [p.sku, p.name]))

/** Товар с подменёнными полями (для граничных случаев). */
export const topItem = (overrides: Partial<TopItem> = {}): TopItem => ({ ...(PRODUCTS[0] as TopItem), ...overrides })

const FIELD = { revenue: 'revenue', orders: 'ordersCount', buyoutRate: 'buyoutRate', profit: 'profit' } as const

/** Ответ /api/top-products, как его отдал бы сервер на эти параметры. */
export function topProductsResponse(
  options: { sort?: string | null; limit?: string | number | null; mp?: string | null; items?: readonly TopItem[] } = {},
): TopProductsResponse {
  const sort = (options.sort && options.sort in FIELD ? options.sort : 'revenue') as TopSortParam
  const limit = Number(options.limit ?? 10) || 10
  const field = FIELD[sort]
  const mp = options.mp ?? 'all'
  const items = [...(options.items ?? PRODUCTS)]
    .filter((p) => mp === 'all' || p.marketplace === mp)
    .sort((a, b) => {
      const av = a[field]
      const bv = b[field]
      if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1
      return bv - av
    })
  return { items: items.slice(0, limit) }
}

/** Топ-10 по каждой метрике, по убыванию — посчитано вручную по таблице выше. */
export const EXPECTED_ORDER: Record<TopSortParam, readonly string[]> = {
  // 412 300 > 380 000 > 351 200 > 298 750 > 254 000 > 210 400 > 187 000 > 120 000 > 98 000 > 65 000 (P12 и P8 не вошли)
  revenue: [SKU.P1, SKU.P2, SKU.P3, SKU.P4, SKU.P5, SKU.P6, SKU.P7, SKU.P9, SKU.P10, SKU.P11],
  // 300 > 260 > 210 > 180 > 150 > 140 > 130 > 120 > 95 > 88 (P11 и P12 не вошли)
  orders: [SKU.P10, SKU.P6, SKU.P3, SKU.P4, SKU.P1, SKU.P9, SKU.P8, SKU.P5, SKU.P2, SKU.P7],
  // 99 > 95,6 > 91,3 > 88 > 82,5 > 77,7 > 74,1 > 69,8 > 60,2 > 55 (P12 и P8 без значения не вошли)
  buyoutRate: [SKU.P11, SKU.P6, SKU.P3, SKU.P4, SKU.P1, SKU.P9, SKU.P2, SKU.P5, SKU.P7, SKU.P10],
  // 120 500 > 98 000 > 70 100 > 61 200 > 52 300 > 45 000 > 38 800 > 15 000 > 9 000 > 100 (P8 и P9 в минусе не вошли)
  profit: [SKU.P2, SKU.P1, SKU.P5, SKU.P4, SKU.P7, SKU.P3, SKU.P6, SKU.P10, SKU.P11, SKU.P12],
}

/** По выручке по возрастанию: те же 10 строк в обратном порядке (без null). */
export const REVENUE_ASC = [...EXPECTED_ORDER.revenue].reverse()

/**
 * По заказам по возрастанию: простой разворот топа по заказам — P8 (% выкупа null)
 * разворачивается вместе со всеми (правило «null в конце» — только для сортировки по % выкупа).
 */
export const ORDERS_ASC = [SKU.P7, SKU.P2, SKU.P5, SKU.P8, SKU.P9, SKU.P1, SKU.P4, SKU.P3, SKU.P6, SKU.P10]

/** Ожидаемые значения ячеек: [площадка, выручка, заказы, % выкупа | null, прибыль, категория]. */
export const EXPECTED_VALUES: Record<string, { mp: string; revenue: string; orders: string; buyout: string | null; profit: string; category: string }> = {
  [SKU.P1]: { mp: 'WB', revenue: '412 300 ₽', orders: '150', buyout: '82,5 %', profit: '98 000 ₽', category: 'Обувь' },
  [SKU.P2]: { mp: 'Ozon', revenue: '380 000 ₽', orders: '95', buyout: '74,1 %', profit: '120 500 ₽', category: 'Одежда' },
  [SKU.P3]: { mp: 'WB', revenue: '351 200 ₽', orders: '210', buyout: '91,3 %', profit: '45 000 ₽', category: 'Электроника' },
  [SKU.P4]: { mp: 'Ozon', revenue: '298 750 ₽', orders: '180', buyout: '88,0 %', profit: '61 200 ₽', category: 'Дом и кухня' },
  [SKU.P5]: { mp: 'WB', revenue: '254 000 ₽', orders: '120', buyout: '69,8 %', profit: '70 100 ₽', category: 'Аксессуары' },
  [SKU.P6]: { mp: 'Ozon', revenue: '210 400 ₽', orders: '260', buyout: '95,6 %', profit: '38 800 ₽', category: 'Красота' },
  [SKU.P7]: { mp: 'WB', revenue: '187 000 ₽', orders: '88', buyout: '60,2 %', profit: '52 300 ₽', category: 'Спорт' },
  [SKU.P8]: { mp: 'Ozon', revenue: '0 ₽', orders: '130', buyout: null, profit: '−1 200 ₽', category: 'Детские товары' },
  [SKU.P9]: { mp: 'WB', revenue: '120 000 ₽', orders: '140', buyout: '77,7 %', profit: '−5 000 ₽', category: 'Одежда' },
  [SKU.P10]: { mp: 'Ozon', revenue: '98 000 ₽', orders: '300', buyout: '55,0 %', profit: '15 000 ₽', category: 'Аксессуары' },
  [SKU.P11]: { mp: 'WB', revenue: '65 000 ₽', orders: '40', buyout: '99,0 %', profit: '9 000 ₽', category: 'Дом и кухня' },
  [SKU.P12]: { mp: 'Ozon', revenue: '1 000 ₽', orders: '10', buyout: '10,0 %', profit: '100 ₽', category: 'Одежда' },
}

/** Подзаголовки по таблице «Сортировка» spec 006. */
export const SUBTITLE: Record<TopSortParam, string> = {
  revenue: 'по выручке за период',
  orders: 'по заказам за период',
  buyoutRate: 'по % выкупа за период',
  profit: 'по прибыли за период',
}

/** Подзаголовок при направлении «по возрастанию» (как в макете). */
export const SUBTITLE_ASC: Record<TopSortParam, string> = {
  revenue: 'по выручке, по возрастанию за период',
  orders: 'по заказам, по возрастанию за период',
  buyoutRate: 'по % выкупа, по возрастанию за период',
  profit: 'по прибыли, по возрастанию за период',
}

/** Подпись колонки таблицы → параметр sort API. */
export const COLUMN_SORT = {
  Выручка: 'revenue',
  Заказы: 'orders',
  '% выкупа': 'buyoutRate',
  Прибыль: 'profit',
} as const satisfies Record<string, TopSortParam>

export type SortColumn = keyof typeof COLUMN_SORT
export const SORT_COLUMNS = Object.keys(COLUMN_SORT) as SortColumn[]

/** Подпись мобильной кнопки сортировки. */
export const MOBILE_LABEL: Record<TopSortParam, string> = {
  revenue: 'По выручке',
  profit: 'По прибыли',
  orders: 'По заказам',
  buyoutRate: 'По % выкупа',
}

/** Порядок перебора мобильной кнопкой: revenue → profit → orders → buyoutRate → revenue. */
export const MOBILE_CYCLE: readonly TopSortParam[] = ['revenue', 'profit', 'orders', 'buyoutRate']

const normText = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()

/** Артикул строки или карточки — из подписи «Арт. {sku} …». */
export function rowSku(el: Element): string {
  const m = /Арт\.\s*(\d+)/.exec(normText(el.textContent))
  if (!m) throw new Error(`В строке нет «Арт. …»: ${normText(el.textContent)}`)
  return m[1] as string
}
