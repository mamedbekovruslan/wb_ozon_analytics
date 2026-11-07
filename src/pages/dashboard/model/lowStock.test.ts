// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StocksResponse } from '../../../entities/warehouse'
import { lowStockSubtitle, pickLowStockItems } from './lowStock'

/*
 * Spec 007 «Скоро закончится», AC-3 и AC-10.
 *
 * Контракт (имена выбраны для этой фичи):
 *   pickLowStockItems(items) — строки блока: позиции ответа /api/stocks со статусом
 *     'critical' или 'soon', в порядке ответа, не больше 5; 'ok' и 'noSales' отбрасываются;
 *     вход не меняется.
 *   lowStockSubtitle(count?) — подзаголовок под h2:
 *     1…5 строк — число и склонение по факту («1 позиция…», «3 позиции…», «5 позиций…»);
 *     без аргумента или 0 (загрузка / пусто / ошибка) — текст макета «5 позиций…».
 * Пробел между числом и словом может быть неразрывным — сравниваем без учёта вида пробела.
 */

type StockItem = StocksResponse['items'][number]
type Status = StockItem['status']

const item = (sku: string, status: Status, overrides: Partial<StockItem> = {}): StockItem => ({
  sku,
  name: `Товар ${sku}`,
  offerId: `OFFER-${sku}`,
  marketplace: 'wb',
  scheme: null,
  warehouse: 'Коледино',
  category: 'shoes',
  stock: 10,
  perDay: 1,
  days: status === 'noSales' ? null : 10,
  status,
  ...overrides,
})

const skus = (items: readonly StockItem[]) => items.map((i) => i.sku)

/** Замороженная копия: если реализация меняет массив на месте, будет TypeError. */
const frozen = (items: StockItem[]): StockItem[] => Object.freeze(items.map((i) => Object.freeze({ ...i }))) as StockItem[]

const plain = (s: string) => s.replace(/\s+/g, ' ')

describe('pickLowStockItems', () => {
  it('AC-3: оставляет critical и soon в порядке ответа', () => {
    const input = [item('A', 'critical'), item('B', 'critical'), item('C', 'soon'), item('D', 'ok'), item('E', 'noSales')]
    expect(skus(pickLowStockItems(frozen(input)))).toEqual(['A', 'B', 'C'])
  })

  it('AC-3: ok и noSales отбрасываются, где бы ни стояли', () => {
    const input = [item('O1', 'ok'), item('A', 'critical'), item('N1', 'noSales'), item('B', 'soon'), item('O2', 'ok')]
    expect(skus(pickLowStockItems(frozen(input)))).toEqual(['A', 'B'])
  })

  it('AC-3: порядок ответа не пересортировывается — ни по статусу, ни по дням', () => {
    const input = [item('S', 'soon', { days: 14 }), item('C', 'critical', { days: 1 }), item('S2', 'soon', { days: 7 })]
    expect(skus(pickLowStockItems(frozen(input)))).toEqual(['S', 'C', 'S2'])
  })

  it('AC-3: не больше 5 строк — берутся первые пять подходящих', () => {
    const input = Array.from({ length: 8 }, (_, i) => item(`P${i}`, i % 2 === 0 ? 'critical' : 'soon'))
    expect(skus(pickLowStockItems(frozen(input)))).toEqual(['P0', 'P1', 'P2', 'P3', 'P4'])
  })

  it('AC-3: ровно 5 подходящих — все 5', () => {
    const input = Array.from({ length: 5 }, (_, i) => item(`P${i}`, 'critical'))
    expect(pickLowStockItems(frozen(input))).toHaveLength(5)
  })

  it('AC-3: лимит 5 считается после отбора: ok в начале не «съедают» места', () => {
    const input = [
      item('O1', 'ok'),
      item('O2', 'ok'),
      item('A', 'critical'),
      item('B', 'critical'),
      item('C', 'soon'),
      item('D', 'soon'),
      item('E', 'soon'),
      item('F', 'soon'),
    ]
    expect(skus(pickLowStockItems(frozen(input)))).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('AC-3, AC-13: пустой ответ — пустой список', () => {
    expect(pickLowStockItems(frozen([]))).toEqual([])
  })

  it('AC-3, AC-13: только ok и noSales — пустой список', () => {
    expect(pickLowStockItems(frozen([item('O', 'ok'), item('N', 'noSales')]))).toEqual([])
  })

  it('AC-3: позиции возвращаются без изменений полей', () => {
    const a = item('A', 'critical', { stock: 0, perDay: 2.5, days: 0, marketplace: 'ozon', scheme: 'FBO' })
    expect(pickLowStockItems(frozen([a]))).toEqual([a])
  })

  it('AC-3: исходный массив не меняется', () => {
    const input = [item('O', 'ok'), item('A', 'critical'), item('B', 'soon')]
    const copy = structuredClone(input)

    const result = pickLowStockItems(input)

    expect(input).toEqual(copy)
    expect(result).not.toBe(input)
  })

  it('AC-3: замороженный вход не ломает функцию', () => {
    expect(() => pickLowStockItems(frozen([item('A', 'critical'), item('O', 'ok')]))).not.toThrow()
  })
})

describe('lowStockSubtitle', () => {
  it('AC-10: 5 строк — «5 позиций с наименьшим запасом» (как в макете)', () => {
    expect(plain(lowStockSubtitle(5))).toBe('5 позиций с наименьшим запасом')
  })

  it.each([
    [1, '1 позиция с наименьшим запасом'],
    [2, '2 позиции с наименьшим запасом'],
    [3, '3 позиции с наименьшим запасом'],
    [4, '4 позиции с наименьшим запасом'],
    [5, '5 позиций с наименьшим запасом'],
  ])('AC-10: %i — «%s»', (count, expected) => {
    expect(plain(lowStockSubtitle(count))).toBe(expected)
  })

  it('AC-10: без числа (загрузка / ошибка) — текст макета «5 позиций…»', () => {
    expect(plain(lowStockSubtitle())).toBe('5 позиций с наименьшим запасом')
  })

  it('AC-10, AC-13: 0 строк (состояние «пусто») — тоже текст макета, а не «0 позиций»', () => {
    expect(plain(lowStockSubtitle(0))).toBe('5 позиций с наименьшим запасом')
  })

  it('AC-10: в подзаголовке нет обычного дефиса и двойных пробелов', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const s = lowStockSubtitle(n)
      expect(s).not.toMatch(/ {2}/)
      expect(s).not.toContain('-')
      expect(s.trim()).toBe(s)
    }
  })
})
