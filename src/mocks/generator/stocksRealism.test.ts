// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { stocks } from '../aggregators'
import { ozonAdapter } from '../ozon'
import { wbAdapter } from '../wb'
import { generateRawData } from './index'

// Остатки должны выглядеть как у живого магазина: среди позиций, которые продаются и скоро
// закончатся, нулевой остаток («закончился») — редкость, а не правило. Скорость, дни и статус
// по-прежнему считает агрегатор из заказов: генератор задаёт только число штук на складе.

const TODAY = '2026-11-05'

describe('генератор: правдоподобные остатки', () => {
  const raw = generateRawData({ seed: 1, today: TODAY })
  const wb = wbAdapter(raw.wb, raw.catalog)
  const ozon = ozonAdapter(raw.ozon, raw.catalog)
  const response = stocks([...wb.stocks, ...ozon.stocks], [...wb.orders, ...ozon.orders], { today: TODAY, mp: 'all', cat: [] })
  const selling = response.items.filter((i) => i.perDay > 0)
  const low = selling.filter((i) => i.status === 'critical' || i.status === 'soon')
  const soldOut = low.filter((i) => i.stock === 0)

  // «Закончился» стоит первым (0 дней запаса), поэтому таких позиций должно быть всего
  // несколько — иначе «Скоро закончится» на дашборде целиком из «0 шт»
  it('нулевой остаток — не больше 3 % продающихся позиций «критично» / «скоро»', () => {
    expect(low.length).toBeGreaterThan(0)
    expect(soldOut.length / low.length).toBeLessThanOrEqual(0.03)
  })

  it('«Критично» с остатком от 1 шт есть', () => {
    expect(selling.some((i) => i.status === 'critical' && i.stock >= 1)).toBe(true)
  })

  it('в пяти самых срочных позициях («Скоро закончится») хотя бы три — с остатком от 1 шт', () => {
    const top5 = response.items.slice(0, 5)
    expect(top5.filter((i) => i.stock >= 1).length).toBeGreaterThanOrEqual(3)
  })
})
