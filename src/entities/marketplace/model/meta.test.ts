// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { metaResponseSchema } from '../index'

/*
 * Spec 002, AC-24: у каждой категории в /api/meta есть productCount —
 * число SKU каталога в ней, целое ≥ 0.
 */

const CATEGORIES = [
  { id: 'shoes', name: 'Обувь', productCount: 48 },
  { id: 'clothing', name: 'Одежда', productCount: 112 },
  { id: 'electronics', name: 'Электроника', productCount: 37 },
  { id: 'beauty', name: 'Красота', productCount: 29 },
  { id: 'home', name: 'Дом и кухня', productCount: 54 },
  { id: 'sports', name: 'Спорт', productCount: 31 },
  { id: 'kids', name: 'Детские товары', productCount: 22 },
  { id: 'accessories', name: 'Аксессуары', productCount: 26 },
]

function meta(categories: unknown) {
  return {
    today: '2026-11-04',
    updatedAt: '2026-11-04T07:40:00+03:00',
    historyFrom: '2024-11-04',
    marketplaces: [
      { id: 'wb', name: 'WB' },
      { id: 'ozon', name: 'Ozon' },
    ],
    categories,
  }
}

describe('metaResponseSchema', () => {
  it('AC-24: productCount сохраняется в разобранном ответе', () => {
    const result = metaResponseSchema.safeParse(meta(CATEGORIES))

    expect(result.success).toBe(true)
    expect(result.data?.categories).toEqual(CATEGORIES)
  })

  it('AC-24: ноль товаров в категории — допустимо', () => {
    const result = metaResponseSchema.safeParse(meta([{ id: 'shoes', name: 'Обувь', productCount: 0 }]))

    expect(result.success).toBe(true)
  })

  it.each<[string, unknown]>([
    ['без productCount', { id: 'shoes', name: 'Обувь' }],
    ['отрицательное', { id: 'shoes', name: 'Обувь', productCount: -1 }],
    ['дробное', { id: 'shoes', name: 'Обувь', productCount: 1.5 }],
    ['строка', { id: 'shoes', name: 'Обувь', productCount: '48' }],
    ['null', { id: 'shoes', name: 'Обувь', productCount: null }],
    ['NaN', { id: 'shoes', name: 'Обувь', productCount: Number.NaN }],
    ['бесконечность', { id: 'shoes', name: 'Обувь', productCount: Number.POSITIVE_INFINITY }],
  ])('AC-24 / T5: productCount %s → ответ не по контракту', (_title, category) => {
    expect(metaResponseSchema.safeParse(meta([category])).success).toBe(false)
  })
})
