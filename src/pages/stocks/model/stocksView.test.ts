// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StocksResponse } from '../../../entities/warehouse'
import {
  CARDS_INITIAL,
  CARDS_STEP,
  countByStatus,
  filterByStatus,
  searchStocks,
  showMoreCount,
  stockBarPercent,
} from './stocksView'

/*
 * Spec 008 «Страница «Остатки»» — чистые функции страницы (pages/stocks/model/stocksView.ts).
 * Имена функций предложены QA (в spec не заданы):
 *   searchStocks(items, query)      — AC-8: подстрока без учёта регистра и пробелов по краям
 *                                     в названии, sku, offerId и складе; порядок сохраняется;
 *   filterByStatus(items, status)   — AC-6: status = null → все строки;
 *   countByStatus(items)            — AC-7: { critical, soon, ok, noSales };
 *   stockBarPercent(days)           — AC-14: min(100, days / 30 × 100); null («нет продаж») → 0;
 *   CARDS_INITIAL = 8, CARDS_STEP = 20, showMoreCount(total, shown) = min(20, total − shown) — AC-18.
 * Ожидаемые значения посчитаны вручную.
 */

type Item = StocksResponse['items'][number]

const item = (p: Partial<Item> & Pick<Item, 'sku' | 'name' | 'warehouse' | 'status'>): Item => ({
  offerId: `OF-${p.sku}`,
  marketplace: 'wb',
  scheme: null,
  category: 'shoes',
  stock: 10,
  perDay: 1,
  days: 10,
  ...p,
})

// Порядок — как в ответе API (дни по возрастанию)
const A = item({ sku: '210000001', offerId: 'KR-BEG-42', name: 'Кроссовки мужские беговые', warehouse: 'Коледино', status: 'critical', days: 0 })
const B = item({ sku: '1650293384', offerId: 'JACKET-W', name: 'Куртка зимняя женская', warehouse: 'Хоругвино', status: 'critical', days: 3.28, marketplace: 'ozon', scheme: 'FBO' })
const C = item({ sku: '220000004', offerId: 'PAN-28', name: 'Сковорода антипригарная 28 см', warehouse: 'Электросталь', status: 'soon', days: 7 })
const D = item({ sku: '1688800112', offerId: 'DOWN-M', name: 'Пуховик мужской', warehouse: 'Хоругвино', status: 'ok', days: 15, marketplace: 'ozon', scheme: 'FBO' })
const E = item({ sku: '1601010101', offerId: 'CREAM-1', name: 'Крем для лица (увлажняющий)', warehouse: 'Склад продавца, Москва', status: 'noSales', days: null, perDay: 0, marketplace: 'ozon', scheme: 'FBS' })
const ALL: readonly Item[] = [A, B, C, D, E]

const skus = (items: readonly Item[]) => items.map((i) => i.sku)

describe('searchStocks', () => {
  it('AC-8: пустой запрос — все строки в исходном порядке', () => {
    expect(skus(searchStocks(ALL, ''))).toEqual(skus(ALL))
  })

  it('AC-8: запрос из одних пробелов — как пустой', () => {
    expect(skus(searchStocks(ALL, '   '))).toEqual(skus(ALL))
  })

  it('AC-8: по складу — «Коледино»', () => {
    expect(skus(searchStocks(ALL, 'Коледино'))).toEqual([A.sku])
  })

  it('AC-8: без учёта регистра — «хоругвино» и «ХОРУГВИНО»; порядок как в ответе', () => {
    expect(skus(searchStocks(ALL, 'хоругвино'))).toEqual([B.sku, D.sku])
    expect(skus(searchStocks(ALL, 'ХОРУГВИНО'))).toEqual([B.sku, D.sku])
  })

  it('AC-8: пробелы по краям обрезаются — «  куртка  »', () => {
    expect(skus(searchStocks(ALL, '  куртка  '))).toEqual([B.sku])
  })

  it('AC-8: подстрока в середине названия — «зимняя»', () => {
    expect(skus(searchStocks(ALL, 'зимняя'))).toEqual([B.sku])
  })

  it('AC-8: по артикулу sku — целиком и частью', () => {
    expect(skus(searchStocks(ALL, '1650293384'))).toEqual([B.sku])
    expect(skus(searchStocks(ALL, '2200'))).toEqual([C.sku])
  })

  it('AC-8: по артикулу продавца offerId — без учёта регистра', () => {
    expect(skus(searchStocks(ALL, 'pan-28'))).toEqual([C.sku])
    expect(skus(searchStocks(ALL, 'KR-BEG'))).toEqual([A.sku])
  })

  it('AC-8: склад с запятой — «склад продавца, москва»', () => {
    expect(skus(searchStocks(ALL, 'склад продавца, москва'))).toEqual([E.sku])
  })

  it('AC-8: внутренние пробелы запроса не выбрасываются — «Кроссовкимужские» не находит «Кроссовки мужские»', () => {
    expect(searchStocks(ALL, 'Кроссовкимужские')).toEqual([])
  })

  it('AC-8: ничего не совпало — пустой массив', () => {
    expect(searchStocks(ALL, 'xyz-нет-такого')).toEqual([])
  })

  it('AC-8: поиск не ищет по площадке, схеме и категории — «ozon», «FBO», «shoes» ничего не находят', () => {
    expect(searchStocks(ALL, 'ozon')).toEqual([])
    expect(searchStocks(ALL, 'FBO')).toEqual([])
    expect(searchStocks(ALL, 'shoes')).toEqual([])
  })

  it('AC-8 / безопасность: спецсимволы RegExp — обычный текст, без исключений', () => {
    expect(() => searchStocks(ALL, '(')).not.toThrow()
    expect(() => searchStocks(ALL, '[')).not.toThrow()
    expect(() => searchStocks(ALL, '\\')).not.toThrow()
    // «.*» как регулярное выражение нашло бы всё; как подстрока — ничего
    expect(searchStocks(ALL, '.*')).toEqual([])
    // Скобка есть только в названии E
    expect(skus(searchStocks(ALL, '(увлажняющий)'))).toEqual([E.sku])
  })

  it('AC-8: пустой список — пустой результат', () => {
    expect(searchStocks([], 'коледино')).toEqual([])
  })

  it('AC-8: исходный массив не меняется', () => {
    const copy = [...ALL]
    searchStocks(ALL, 'хоругвино')
    expect(ALL).toEqual(copy)
  })
})

describe('filterByStatus', () => {
  it('AC-6: null — все строки', () => {
    expect(skus(filterByStatus(ALL, null))).toEqual(skus(ALL))
  })

  it.each([
    ['critical', [A.sku, B.sku]],
    ['soon', [C.sku]],
    ['ok', [D.sku]],
    ['noSales', [E.sku]],
  ] as const)('AC-6: «%s» — только строки этого статуса, порядок сохраняется', (status, expected) => {
    expect(skus(filterByStatus(ALL, status))).toEqual(expected)
  })

  it('AC-6: статуса нет в списке — пустой результат', () => {
    expect(filterByStatus([A, B], 'ok')).toEqual([])
  })
})

describe('countByStatus', () => {
  it('AC-7: считает все четыре статуса', () => {
    expect(countByStatus(ALL)).toEqual({ critical: 2, soon: 1, ok: 1, noSales: 1 })
  })

  it('AC-7: пустой список — четыре нуля', () => {
    expect(countByStatus([])).toEqual({ critical: 0, soon: 0, ok: 0, noSales: 0 })
  })

  it('AC-7: числа плиток — по строкам после поиска, без учёта выбранного статуса', () => {
    // Поиск «хоругвино» → B (критично), D (норма)
    expect(countByStatus(searchStocks(ALL, 'хоругвино'))).toEqual({ critical: 1, soon: 0, ok: 1, noSales: 0 })
  })

  it('AC-7: большой список — сумма равна числу строк', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => ({ ...A, sku: String(i), status: (['critical', 'soon', 'ok', 'noSales'] as const)[i % 4] }))
    const counts = countByStatus(many)
    expect(counts).toEqual({ critical: 2500, soon: 2500, ok: 2500, noSales: 2500 })
  })
})

describe('stockBarPercent', () => {
  it('AC-14: дни / 30 × 100', () => {
    // 3 / 30 = 10 %; 15 / 30 = 50 %; 7 / 30 ≈ 23,33 %
    expect(stockBarPercent(3)).toBeCloseTo(10, 6)
    expect(stockBarPercent(15)).toBeCloseTo(50, 6)
    expect(stockBarPercent(7)).toBeCloseTo(23.333, 2)
  })

  it('AC-14: дробные дни берутся точно — 20 / 6,1 ≈ 3,279 дня → ≈ 10,93 %', () => {
    expect(stockBarPercent(20 / 6.1)).toBeCloseTo(10.929, 2)
  })

  it('AC-14: ноль дней — пустая полоса', () => {
    expect(stockBarPercent(0)).toBe(0)
  })

  it('AC-14: 30 дней и больше — 100 %, не больше', () => {
    expect(stockBarPercent(30)).toBe(100)
    expect(stockBarPercent(45)).toBe(100)
    expect(stockBarPercent(14_005.6)).toBe(100)
    expect(stockBarPercent(1e12)).toBe(100)
  })

  it('AC-14: «нет продаж» (days = null) — пустая полоса', () => {
    expect(stockBarPercent(null)).toBe(0)
  })
})

describe('Показать ещё', () => {
  it('AC-18: сначала 8 карточек, шаг 20', () => {
    expect(CARDS_INITIAL).toBe(8)
    expect(CARDS_STEP).toBe(20)
  })

  it.each([
    [100, 8, 20],
    [28, 8, 20],
    [30, 28, 2],
    [9, 8, 1],
    [8, 8, 0],
    [5, 8, 0],
    [0, 8, 0],
    [1000, 988, 12],
  ])('AC-18: всего %i, показано %i → «Показать ещё %i»', (total, shown, expected) => {
    expect(showMoreCount(total, shown)).toBe(expected)
  })
})
