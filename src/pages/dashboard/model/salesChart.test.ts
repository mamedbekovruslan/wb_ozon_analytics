// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isEmptySales, niceAxis, xTickIndexes } from './salesChart'

/*
 * Spec 005 «График продаж по дням», раздел «Расчёты» (AC-9, AC-16).
 *
 * niceAxis(min, max) → { ticks }: шаг — наименьшее из 1, 2, 2,5, 5, 10 × 10ⁿ, не меньшее нужного;
 *   без минусов нужный = max / 4, деления 0…4·шаг; с минусами нужный = (max − min) / 4,
 *   деления от ⌊min / шаг⌋·шаг до ⌈max / шаг⌉·шаг, 0 всегда среди делений.
 * xTickIndexes(n, count): n ≤ count — все дни; иначе шаг = ⌈(n − 1) / (count − 1)⌉,
 *   индексы 0, шаг, 2·шаг… пока < n − 1, затем n − 1; предпоследний выбрасывается,
 *   если до последнего меньше половины шага.
 * isEmptySales(days): у всех дней total.revenue, total.ordersCount и total.profit равны 0.
 */

const range = (from: number, to: number, step = 1) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step)

describe('niceAxis — без отрицательных значений', () => {
  it('AC-9: max = 412 300 → шаг 200 000 (103 075 → 200 000), деления 0 … 800 000', () => {
    expect(niceAxis(0, 412_300).ticks).toEqual([0, 200_000, 400_000, 600_000, 800_000])
  })

  it('AC-9: max = 380 000 → шаг 100 000 (95 000 → 100 000), деления 0 … 400 000', () => {
    expect(niceAxis(0, 380_000).ticks).toEqual([0, 100_000, 200_000, 300_000, 400_000])
  })

  it('AC-9: нужный шаг ровно круглый (400 000 / 4 = 100 000) — он и берётся, «не меньшее нужного»', () => {
    expect(niceAxis(0, 400_000).ticks).toEqual([0, 100_000, 200_000, 300_000, 400_000])
  })

  it('AC-9: чуть больше круглого (400 001 / 4 = 100 000,25) — следующий шаг 200 000', () => {
    expect(niceAxis(0, 400_001).ticks).toEqual([0, 200_000, 400_000, 600_000, 800_000])
  })

  it('AC-9: множитель 2,5 — max = 1 000 000 → шаг 250 000', () => {
    expect(niceAxis(0, 1_000_000).ticks).toEqual([0, 250_000, 500_000, 750_000, 1_000_000])
  })

  it('AC-9: множитель 5 — max = 1 800 000 (450 000) → шаг 500 000', () => {
    expect(niceAxis(0, 1_800_000).ticks).toEqual([0, 500_000, 1_000_000, 1_500_000, 2_000_000])
  })

  it('AC-9: множитель 10 — max = 3 600 (900) → шаг 1 000', () => {
    expect(niceAxis(0, 3_600).ticks).toEqual([0, 1_000, 2_000, 3_000, 4_000])
  })

  it('AC-9: заказы (штуки) — max = 1 200 (300) → шаг 500', () => {
    expect(niceAxis(0, 1_200).ticks).toEqual([0, 500, 1_000, 1_500, 2_000])
  })

  it('AC-9: очень большие числа — max = 5·10⁹ (1,25·10⁹) → шаг 2·10⁹', () => {
    expect(niceAxis(0, 5e9).ticks).toEqual([0, 2e9, 4e9, 6e9, 8e9])
  })

  it('AC-9: всегда ровно 5 делений, первое 0, последнее не меньше max', () => {
    for (const max of [7, 99, 412_300, 999_999, 7_284_560, 123_456_789]) {
      const { ticks } = niceAxis(0, max)
      expect(ticks, `max = ${max}`).toHaveLength(5)
      expect(ticks[0]).toBe(0)
      expect(ticks[4]).toBeGreaterThanOrEqual(max)
      expect(ticks.every(Number.isFinite)).toBe(true)
    }
  })
})

describe('niceAxis — с отрицательными значениями (прибыль)', () => {
  it('AC-9: min = −30 000, max = 170 000 → шаг 50 000, деления −50 000 … 200 000', () => {
    expect(niceAxis(-30_000, 170_000).ticks).toEqual([-50_000, 0, 50_000, 100_000, 150_000, 200_000])
  })

  it('AC-9: min = −1 000, max = 9 000 → шаг 2 500 (10 000 / 4), деления −2 500 … 10 000', () => {
    expect(niceAxis(-1_000, 9_000).ticks).toEqual([-2_500, 0, 2_500, 5_000, 7_500, 10_000])
  })

  it('AC-9: только минусы (max = 0) — min = −100 000 → шаг 25 000, деления −100 000 … 0', () => {
    expect(niceAxis(-100_000, 0).ticks).toEqual([-100_000, -75_000, -50_000, -25_000, 0])
  })

  it('AC-9: min делится на шаг нацело — нижнее деление ровно min', () => {
    // (150 000 − (−50 000)) / 4 = 50 000 → шаг 50 000; ⌊−50 000 / 50 000⌋ = −1
    expect(niceAxis(-50_000, 150_000).ticks).toEqual([-50_000, 0, 50_000, 100_000, 150_000])
  })

  it('AC-9: 0 всегда среди делений, деления равномерны и покрывают [min; max]', () => {
    // −7 777…123 456: 131 233 / 4 ≈ 32 808 → шаг 50 000, деления −50 000 … 150 000;
    // −2 000 000…500 000: 625 000 → шаг 1 000 000, деления −2 млн … 1 млн
    for (const [min, max] of [
      [-30_000, 170_000],
      [-7_777, 123_456],
      [-2_000_000, 500_000],
      [-123, 0],
    ] as const) {
      const { ticks } = niceAxis(min, max)
      expect(ticks, `[${min}; ${max}]`).toContain(0)
      expect(ticks[0]).toBeLessThanOrEqual(min)
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max)
      const step = (ticks[1] as number) - (ticks[0] as number)
      for (let i = 1; i < ticks.length; i++) {
        expect((ticks[i] as number) - (ticks[i - 1] as number)).toBeCloseTo(step, 6)
      }
    }
    expect(niceAxis(-7_777, 123_456).ticks).toEqual([-50_000, 0, 50_000, 100_000, 150_000])
    expect(niceAxis(-2_000_000, 500_000).ticks).toEqual([-2_000_000, -1_000_000, 0, 1_000_000])
  })
})

describe('niceAxis — целый шаг для штук ({ integer: true }, «Заказы»)', () => {
  it('AC-25: max = 10 (2,5) — ступень 2,5 пропускается → шаг 5, деления 0, 5, 10, 15, 20', () => {
    expect(niceAxis(0, 10, { integer: true }).ticks).toEqual([0, 5, 10, 15, 20])
  })

  it('AC-25: max = 3 (0,75) — шаг не меньше 1, деления 0, 1, 2, 3, 4', () => {
    expect(niceAxis(0, 3, { integer: true }).ticks).toEqual([0, 1, 2, 3, 4])
  })

  it('AC-25: без опции max = 10 — шаг 2,5, как у дизайнера', () => {
    expect(niceAxis(0, 10).ticks).toEqual([0, 2.5, 5, 7.5, 10])
  })

  it('AC-25: max = 1 (0,25) — шаг 1, деления 0 … 4', () => {
    expect(niceAxis(0, 1, { integer: true }).ticks).toEqual([0, 1, 2, 3, 4])
  })

  it('AC-25: max = 7 (1,75) — шаг 2, как и без опции', () => {
    expect(niceAxis(0, 7, { integer: true }).ticks).toEqual([0, 2, 4, 6, 8])
  })

  it('AC-25: ступень 2,5 пропускается и в старших разрядах — max = 1 000 (250) → шаг 500', () => {
    // Без опции было бы 250; 250 — целое, но правило «2 → 5» действует для всех степеней
    expect(niceAxis(0, 1_000, { integer: true }).ticks).toEqual([0, 500, 1_000, 1_500, 2_000])
    expect(niceAxis(0, 1_000).ticks).toEqual([0, 250, 500, 750, 1_000])
  })

  it('AC-25: остальные ступени — как без опции (1 200 → 500; 5 476 → 2 000)', () => {
    expect(niceAxis(0, 1_200, { integer: true }).ticks).toEqual([0, 500, 1_000, 1_500, 2_000])
    expect(niceAxis(0, 5_476, { integer: true }).ticks).toEqual([0, 2_000, 4_000, 6_000, 8_000])
  })

  it('AC-25: все деления целые при любом max', () => {
    for (const max of [1, 2, 3, 4, 5, 6, 9, 10, 11, 17, 25, 40, 99, 101, 250, 999, 1_001, 123_457]) {
      const { ticks } = niceAxis(0, max, { integer: true })
      expect(ticks, `max = ${max}`).toHaveLength(5)
      expect(ticks.every(Number.isInteger), `max = ${max}: ${ticks.join(', ')}`).toBe(true)
      expect(ticks[4]).toBeGreaterThanOrEqual(max)
    }
  })
})

describe('xTickIndexes', () => {
  it('AC-9: (30, 7) → 0, 5, 10, 15, 20, 25, 29', () => {
    expect(xTickIndexes(30, 7)).toEqual([0, 5, 10, 15, 20, 25, 29])
  })

  it('AC-9: (30, 6) → 0, 6, 12, 18, 24, 29', () => {
    expect(xTickIndexes(30, 6)).toEqual([0, 6, 12, 18, 24, 29])
  })

  it('AC-9: (30, 4) → 0, 10, 20, 29', () => {
    expect(xTickIndexes(30, 4)).toEqual([0, 10, 20, 29])
  })

  it('AC-9: (8, 4) → 0, 3, 7 — предпоследний 6 выброшен (до последнего 1 < 1,5)', () => {
    expect(xTickIndexes(8, 4)).toEqual([0, 3, 7])
  })

  it('AC-9: (7, 7) → все дни 0 … 6', () => {
    expect(xTickIndexes(7, 7)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('AC-9: n меньше count — все дни; один день — [0]; пустой период — []', () => {
    expect(xTickIndexes(3, 7)).toEqual([0, 1, 2])
    expect(xTickIndexes(1, 4)).toEqual([0])
    expect(xTickIndexes(0, 4)).toEqual([])
  })

  it('AC-9: до последнего ровно половина шага — предпоследний остаётся ((8, 7): шаг 2, 6 → 7)', () => {
    expect(xTickIndexes(8, 7)).toEqual([0, 2, 4, 6, 7])
  })

  it('AC-9: (14, 7) — шаг 3, 12 → 13 меньше половины шага, 12 выброшен', () => {
    expect(xTickIndexes(14, 7)).toEqual([0, 3, 6, 9, 13])
  })

  it('AC-9: «Квартал» и «90 дней»: (31, 7), (90, 7), (90, 4)', () => {
    expect(xTickIndexes(31, 7)).toEqual([0, 5, 10, 15, 20, 25, 30])
    expect(xTickIndexes(90, 7)).toEqual([0, 15, 30, 45, 60, 75, 89])
    expect(xTickIndexes(90, 4)).toEqual([0, 30, 60, 89])
  })

  it('AC-9: «Год» (365, 7) — шаг 61, последний 364', () => {
    expect(xTickIndexes(365, 7)).toEqual([0, 61, 122, 183, 244, 305, 364])
  })

  it('AC-10: первая и последняя подписи — всегда; индексы возрастают; подписей не больше count', () => {
    for (const n of range(2, 120)) {
      for (const count of [4, 6, 7]) {
        const indexes = xTickIndexes(n, count)
        expect(indexes[0], `(${n}, ${count})`).toBe(0)
        expect(indexes[indexes.length - 1], `(${n}, ${count})`).toBe(n - 1)
        expect(indexes.length, `(${n}, ${count})`).toBeLessThanOrEqual(count)
        for (let i = 1; i < indexes.length; i++) {
          expect(indexes[i] as number).toBeGreaterThan(indexes[i - 1] as number)
        }
      }
    }
  })
})

describe('isEmptySales', () => {
  const values = (revenue: number, ordersCount: number, profit: number) => ({ revenue, ordersCount, profit })
  const zero = values(0, 0, 0)
  const day = (total: ReturnType<typeof values>, previousTotal = values(100, 1, 10)) => ({
    date: '2026-10-05',
    wb: total,
    ozon: zero,
    total,
    previousDate: '2026-09-05',
    previousTotal,
  })

  it('AC-16: все дни текущего периода с нулями — пусто', () => {
    expect(isEmptySales([day(zero), day(zero), day(zero)])).toBe(true)
  })

  it('AC-16: прошлый период с продажами не влияет — всё равно пусто', () => {
    expect(isEmptySales([day(zero, values(1_000_000, 500, 200_000))])).toBe(true)
  })

  it('AC-16: хотя бы один день с выручкой — не пусто', () => {
    expect(isEmptySales([day(zero), day(values(1, 0, 0)), day(zero)])).toBe(false)
  })

  it('AC-16: выручка 0, но есть заказы (все отменены) — не пусто', () => {
    expect(isEmptySales([day(zero), day(values(0, 3, 0))])).toBe(false)
  })

  it('AC-16: только отрицательная прибыль (расходы без выручки) — не пусто', () => {
    expect(isEmptySales([day(values(0, 0, -500))])).toBe(false)
  })

  it('AC-16: отрицательная выручка (возвраты больше продаж) — не пусто', () => {
    expect(isEmptySales([day(values(-1_200, 0, -1_500))])).toBe(false)
  })

  it('AC-16: нет ни одного дня — пусто', () => {
    expect(isEmptySales([])).toBe(true)
  })
})
