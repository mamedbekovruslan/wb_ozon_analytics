// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { TopProductsResponse } from '../../../entities/product'
import { sortTopItems } from './topProducts'

/*
 * Spec 006 «Топ товаров», AC-20 (и правило из раздела «Сортировка»).
 *
 * Сигнатура по spec:
 *   sortTopItems(items, sort, dir)
 *   items — массив items ответа /api/top-products (уже отсортирован сервером по метрике sort);
 *   sort  — 'revenue' | 'orders' | 'buyoutRate' | 'profit';
 *   dir   — 'desc' | 'asc'.
 * Правила:
 *   desc — всегда порядок ответа;
 *   asc  — порядок ответа наоборот; только при sort = 'buyoutRate' товары с buyoutRate: null
 *          остаются в конце в исходном порядке; при других метриках разворачиваются со всеми;
 *   исходный массив не меняется.
 * Значения метрик для порядка не используются: сервер уже отсортировал, клиент только
 * разворачивает — поэтому ниже есть проверка, что asc не пересортировывает по значениям.
 */

type TopItem = TopProductsResponse['items'][number]
type Sort = 'revenue' | 'orders' | 'buyoutRate' | 'profit'

const SORTS: readonly Sort[] = ['revenue', 'orders', 'buyoutRate', 'profit']
const NOT_BUYOUT: readonly Sort[] = ['revenue', 'orders', 'profit']

const item = (sku: string, overrides: Partial<TopItem> = {}): TopItem => ({
  sku,
  name: `Товар ${sku}`,
  offerId: `OFFER-${sku}`,
  marketplace: 'wb',
  category: 'shoes',
  revenue: 1_000,
  ordersCount: 10,
  buyoutRate: 50,
  profit: 100,
  ...overrides,
})

const skus = (items: readonly TopItem[]) => items.map((i) => i.sku)

/**
 * Замороженная копия: если реализация отсортирует или развернёт массив на месте, будет TypeError.
 * Тип — обычный массив, чтобы тест компилировался при любой из сигнатур (readonly или нет).
 */
const frozen = (items: TopItem[]): TopItem[] => Object.freeze(items.map((i) => Object.freeze({ ...i }))) as TopItem[]

// Ответ «по выручке»: 300 > 200 > 100
const BY_REVENUE = [
  item('A', { revenue: 300, buyoutRate: 90 }),
  item('B', { revenue: 200, buyoutRate: 80 }),
  item('C', { revenue: 100, buyoutRate: 70 }),
]

// Ответ «по заказам»: N без % выкупа (null) стоит в середине — сервер сортировал по заказам
const BY_ORDERS_WITH_NULL = [
  item('A', { ordersCount: 50 }),
  item('B', { ordersCount: 40 }),
  item('N', { ordersCount: 30, revenue: 0, buyoutRate: null }),
  item('C', { ordersCount: 20 }),
  item('D', { ordersCount: 10 }),
]

// Ответ «по % выкупа»: сервер ставит товары без значения в конец (spec 001)
const BY_BUYOUT_WITH_NULL = [
  item('A', { buyoutRate: 99 }),
  item('B', { buyoutRate: 60 }),
  item('C', { buyoutRate: 0 }),
  item('N1', { buyoutRate: null }),
  item('N2', { buyoutRate: null }),
]

describe('sortTopItems — по убыванию (desc)', () => {
  it.each(SORTS)('AC-20: desc, sort = %s — порядок ответа', (sort) => {
    expect(skus(sortTopItems(frozen(BY_REVENUE), sort, 'desc'))).toEqual(['A', 'B', 'C'])
  })

  it('AC-20: desc, sort = orders — порядок ответа и с null в середине', () => {
    expect(skus(sortTopItems(frozen(BY_ORDERS_WITH_NULL), 'orders', 'desc'))).toEqual(['A', 'B', 'N', 'C', 'D'])
  })

  it('AC-20: desc, sort = buyoutRate — порядок ответа, null в конце там и остаются', () => {
    expect(skus(sortTopItems(frozen(BY_BUYOUT_WITH_NULL), 'buyoutRate', 'desc'))).toEqual(['A', 'B', 'C', 'N1', 'N2'])
  })

  it('AC-20: desc — значения товаров не меняются', () => {
    const input = frozen(BY_REVENUE)
    expect(sortTopItems(input, 'revenue', 'desc')).toEqual([...input])
  })
})

describe('sortTopItems — по возрастанию (asc), метрики кроме % выкупа', () => {
  it.each(NOT_BUYOUT)('AC-20: asc, sort = %s — обратный порядок', (sort) => {
    expect(skus(sortTopItems(frozen(BY_REVENUE), sort, 'asc'))).toEqual(['C', 'B', 'A'])
  })

  it.each(NOT_BUYOUT)('AC-20: asc, sort = %s — товар с buyoutRate: null разворачивается вместе со всеми', (sort) => {
    expect(skus(sortTopItems(frozen(BY_ORDERS_WITH_NULL), sort, 'asc'))).toEqual(['D', 'C', 'N', 'B', 'A'])
  })

  it('AC-20: asc, sort = orders — null последним в ответе уходит в начало (простой разворот)', () => {
    const input = [item('A', { ordersCount: 9 }), item('B', { ordersCount: 5 }), item('N', { ordersCount: 1, buyoutRate: null })]
    expect(skus(sortTopItems(frozen(input), 'orders', 'asc'))).toEqual(['N', 'B', 'A'])
  })

  it('AC-20: asc — разворот порядка ответа, а не пересортировка по значениям', () => {
    // Ответ «по прибыли»: выручка вразнобой; по возрастанию — просто обратный порядок ответа
    const byProfit = [
      item('A', { profit: 900, revenue: 10 }),
      item('B', { profit: 500, revenue: 30 }),
      item('C', { profit: 100, revenue: 20 }),
    ]
    expect(skus(sortTopItems(frozen(byProfit), 'profit', 'asc'))).toEqual(['C', 'B', 'A'])
  })

  it('AC-20: asc — 10 строк: не теряются, не дублируются, ровно наоборот', () => {
    const ten = Array.from({ length: 10 }, (_, i) => item(`S${i}`, { buyoutRate: i === 4 ? null : 50 + i }))
    const result = skus(sortTopItems(frozen(ten), 'revenue', 'asc'))
    expect(result).toEqual(['S9', 'S8', 'S7', 'S6', 'S5', 'S4', 'S3', 'S2', 'S1', 'S0'])
  })
})

describe('sortTopItems — по возрастанию (asc), sort = buyoutRate', () => {
  it('AC-20: остальные наоборот, товары с null — в конце в исходном порядке', () => {
    expect(skus(sortTopItems(frozen(BY_BUYOUT_WITH_NULL), 'buyoutRate', 'asc'))).toEqual(['C', 'B', 'A', 'N1', 'N2'])
  })

  it('AC-20: один null в конце ответа — остаётся последним', () => {
    const input = [item('A', { buyoutRate: 99 }), item('B', { buyoutRate: 60 }), item('N', { buyoutRate: null })]
    expect(skus(sortTopItems(frozen(input), 'buyoutRate', 'asc'))).toEqual(['B', 'A', 'N'])
  })

  it('AC-20: null в середине входа (на всякий случай) — всё равно в конце, в исходном порядке', () => {
    const input = [
      item('N1', { buyoutRate: null }),
      item('A', { buyoutRate: 10 }),
      item('N2', { buyoutRate: null }),
      item('B', { buyoutRate: 20 }),
    ]
    expect(skus(sortTopItems(frozen(input), 'buyoutRate', 'asc'))).toEqual(['B', 'A', 'N1', 'N2'])
  })

  it('AC-20: % выкупа 0 — это значение, а не «нет данных»: участвует в развороте', () => {
    const input = [item('A', { buyoutRate: 100 }), item('Z', { buyoutRate: 0 }), item('N', { buyoutRate: null })]
    expect(skus(sortTopItems(frozen(input), 'buyoutRate', 'asc'))).toEqual(['Z', 'A', 'N'])
  })

  it('AC-20: все без % выкупа — исходный порядок', () => {
    const allNull = [item('N1', { buyoutRate: null }), item('N2', { buyoutRate: null }), item('N3', { buyoutRate: null })]
    expect(skus(sortTopItems(frozen(allNull), 'buyoutRate', 'asc'))).toEqual(['N1', 'N2', 'N3'])
  })
})

describe('sortTopItems — граничные случаи и неизменность входа', () => {
  it.each(SORTS)('AC-20: исходный массив не меняется (sort = %s, asc и desc)', (sort) => {
    const input = [...BY_BUYOUT_WITH_NULL]
    const copy = structuredClone(input)

    const asc = sortTopItems(input, sort, 'asc')
    sortTopItems(input, sort, 'desc')

    expect(input).toEqual(copy)
    expect(asc).not.toBe(input)
  })

  it.each(SORTS)('AC-20: замороженный вход не ломает функцию (sort = %s)', (sort) => {
    expect(() => sortTopItems(frozen(BY_ORDERS_WITH_NULL), sort, 'asc')).not.toThrow()
    expect(() => sortTopItems(frozen(BY_ORDERS_WITH_NULL), sort, 'desc')).not.toThrow()
  })

  it('AC-20: asc → desc от того же ответа — снова порядок ответа', () => {
    const input = frozen(BY_BUYOUT_WITH_NULL)
    sortTopItems(input, 'buyoutRate', 'asc')
    expect(skus(sortTopItems(input, 'buyoutRate', 'desc'))).toEqual(['A', 'B', 'C', 'N1', 'N2'])
  })

  it.each(SORTS)('AC-20: пустой ответ — пустой массив в обоих направлениях (sort = %s)', (sort) => {
    expect(sortTopItems(frozen([]), sort, 'desc')).toEqual([])
    expect(sortTopItems(frozen([]), sort, 'asc')).toEqual([])
  })

  it('AC-20: один товар — он же, в обоих направлениях (и с null)', () => {
    expect(skus(sortTopItems(frozen([item('A')]), 'revenue', 'asc'))).toEqual(['A'])
    expect(skus(sortTopItems(frozen([item('N', { buyoutRate: null })]), 'buyoutRate', 'asc'))).toEqual(['N'])
    expect(skus(sortTopItems(frozen([item('N', { buyoutRate: null })]), 'orders', 'asc'))).toEqual(['N'])
    expect(skus(sortTopItems(frozen([item('A')]), 'profit', 'desc'))).toEqual(['A'])
  })

  it('AC-20: очень большие и отрицательные значения не влияют на разворот', () => {
    const input = [
      item('A', { revenue: 9_007_199_254_740_991, profit: 1e12 }),
      item('B', { revenue: 0, profit: -1e12 }),
    ]
    expect(skus(sortTopItems(frozen(input), 'revenue', 'asc'))).toEqual(['B', 'A'])
    expect(skus(sortTopItems(frozen(input), 'profit', 'asc'))).toEqual(['B', 'A'])
  })
})
