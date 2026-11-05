// Единая доменная модель фейкового BFF (ADR-0010): к ней адаптеры приводят
// сырые данные WB и Ozon, по ней агрегаторы считают метрики (docs/domain.md).

export const CATEGORIES = [
  { id: 'shoes', name: 'Обувь' },
  { id: 'clothing', name: 'Одежда' },
  { id: 'electronics', name: 'Электроника' },
  { id: 'beauty', name: 'Красота' },
  { id: 'home', name: 'Дом и кухня' },
  { id: 'sports', name: 'Спорт' },
  { id: 'kids', name: 'Детские товары' },
  { id: 'accessories', name: 'Аксессуары' },
] as const

export type CategoryId = (typeof CATEGORIES)[number]['id']

export const CATEGORY_IDS: readonly CategoryId[] = CATEGORIES.map((c) => c.id)

export const MARKETPLACES = [
  { id: 'wb', name: 'WB' },
  { id: 'ozon', name: 'Ozon' },
] as const

export type Marketplace = (typeof MARKETPLACES)[number]['id']

export type Scheme = 'FBO' | 'FBS'

/** Итог заказа: у каждого заказа ровно один (docs/domain.md). */
export type Outcome = 'inTransit' | 'bought' | 'cancelled' | 'returned'

export type LogisticsCharge = { date: string; amount: number }

export type Order = {
  id: string
  marketplace: Marketplace
  scheme: Scheme | null
  sku: string
  offerId: string
  name: string
  category: CategoryId
  warehouse: string
  /** Момент заказа, ISO 8601 с +03:00 */
  orderedAt: string
  /** День заказа по Москве, ГГГГ-ММ-ДД */
  orderDate: string
  price: number
  outcome: Outcome
  /** День выкупа; есть и у возвращённых */
  boughtOn: string | null
  cancelledOn: string | null
  returnedOn: string | null
  /** Удержана при выкупе; 0, если выкупа не было */
  commission: number
  /** Возвращена продавцу при возврате; иначе 0 */
  commissionRefund: number
  /** Себестоимость единицы из справочника продавца */
  costPrice: number
  /** Каждое списание за доставку — своим днём */
  logistics: LogisticsCharge[]
}

export type StockRow = {
  sku: string
  offerId: string
  name: string
  category: CategoryId
  marketplace: Marketplace
  scheme: Scheme | null
  warehouse: string
  stock: number
}

/** Справочник продавца: данные, которых нет в API площадок. */
export type CatalogItem = {
  sku: string
  offerId: string
  name: string
  category: CategoryId
  marketplace: Marketplace
  costPrice: number
}

export type Filters = {
  from: string
  to: string
  mp: 'all' | Marketplace
  cat: CategoryId[]
}

/** Поиск товара справочника; отсутствие — ошибка данных, а не тихий пропуск. */
export function catalogLookup(catalog: readonly CatalogItem[]): (sku: string) => CatalogItem {
  const bySku = new Map(catalog.map((item) => [item.sku, item]))
  return (sku) => {
    const item = bySku.get(sku)
    if (!item) throw new Error(`Товар ${sku} не найден в справочнике продавца`)
    return item
  }
}
