// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  formatInt,
  formatRub,
  formatRubShort,
  formatAxisMoney,
  formatPercent,
  formatDelta,
  changePercent,
  formatDate,
  formatAxisDate,
  formatTooltipDate,
  formatStockDays,
  stockStatus,
  formatDayMonth,
  formatCategoriesCount,
  formatPeriodShort,
} from './format'

/*
 * Правила взяты из DESIGN_SPEC.md, раздел 7 «Числа, даты, доступность»,
 * таблицы форматов в reference/Guidelines.dc.html и docs/domain.md
 * (изменение к прошлому периоду, дни и статус запаса).
 *
 * R-1  Целые числа: разделитель разрядов, без дробной части.
 * R-2  Деньги полностью: «1 234 567 ₽».
 * R-3  Деньги в KPI: «1,2 млн ₽» (≥ 1e6), «250 тыс. ₽» (≥ 1e4), меньше — полная сумма.
 * R-4  Деньги на оси Y: «0», «250 тыс.», «1,5 млн», ровные миллионы — «2 млн».
 * R-5  Проценты: «87,4 %», один знак после запятой.
 * R-6  Изменение: «+12,4 %» / «−5,5 %», знак всегда; округлённое до 0,0 — «0,0 %» без знака
 *      (spec 004 AC-19; было «+0,0 %»).
 * R-7  Изменение к прошлому периоду: (текущее − прошлое) / |прошлое| × 100; прошлое = 0 → null
 *      (spec 004 AC-8: модуль в знаменателе).
 * R-8  Дата: «04.11.2026».
 * R-9  Дата на оси: «4 нояб.».
 * R-10 Дата в тултипе: «ср, 28 окт. 2026».
 * R-11 Дни запаса: floor(остаток / скорость) + «дн.»; скорость 0 → «—».
 * R-12 Статус запаса: < 7 критично, 7–14 скоро, > 14 норма, скорость ≤ 0 — нет продаж.
 * R-13 Сквозное: все пробелы внутри результата неразрывные (U+00A0), минус — U+2212.
 */

/** Неразрывный пробел U+00A0. */
const NBSP = ' '
/** Типографский минус U+2212. */
const MINUS = '−'

/** Проверяет, что в строке нет обычных пробелов и дефис-минусов (R-13). */
function expectTypography(s: string): void {
  expect(s).not.toMatch(/ /)
  expect(s).not.toMatch(/-/)
  // Узкий неразрывный пробел U+202F (Intl иногда ставит его) тоже не допускается.
  expect(s).not.toMatch(/ /)
}

describe('formatInt', () => {
  it('R-1: разделяет разряды неразрывным пробелом', () => {
    expect(formatInt(1234567)).toBe(`1${NBSP}234${NBSP}567`)
    expect(formatInt(5476)).toBe(`5${NBSP}476`)
  })

  it('R-1: числа меньше тысячи — без разделителя', () => {
    expect(formatInt(999)).toBe('999')
    expect(formatInt(7)).toBe('7')
  })

  it('R-1: ноль — «0»', () => {
    expect(formatInt(0)).toBe('0')
  })

  it('R-1: дробная часть округляется до целого', () => {
    expect(formatInt(1234.4)).toBe(`1${NBSP}234`)
    expect(formatInt(1234.6)).toBe(`1${NBSP}235`)
    expect(formatInt(999.7)).toBe(`1${NBSP}000`)
  })

  it('R-1: значение, округлённое до нуля, не показывается как «−0»', () => {
    expect(formatInt(-0)).toBe('0')
    expect(formatInt(-0.4)).toBe('0')
  })

  it('R-1, R-13: отрицательное число — с минусом U+2212', () => {
    expect(formatInt(-1234)).toBe(`${MINUS}1${NBSP}234`)
  })

  it('R-1: очень большие числа форматируются целиком', () => {
    expect(formatInt(1234567890)).toBe(`1${NBSP}234${NBSP}567${NBSP}890`)
    expect(formatInt(Number.MAX_SAFE_INTEGER)).toBe(
      `9${NBSP}007${NBSP}199${NBSP}254${NBSP}740${NBSP}991`,
    )
  })

  it('R-13: в результате нет обычных пробелов и дефисов', () => {
    expectTypography(formatInt(1234567))
    expectTypography(formatInt(-1234567))
  })
})

describe('formatRub', () => {
  it('R-2: полная сумма с разрядами и знаком ₽ через неразрывный пробел', () => {
    expect(formatRub(1234567)).toBe(`1${NBSP}234${NBSP}567${NBSP}₽`)
    expect(formatRub(1742)).toBe(`1${NBSP}742${NBSP}₽`)
  })

  it('R-2: ноль — «0 ₽»', () => {
    expect(formatRub(0)).toBe(`0${NBSP}₽`)
  })

  it('R-2: копейки округляются до рубля', () => {
    expect(formatRub(1234.4)).toBe(`1${NBSP}234${NBSP}₽`)
    expect(formatRub(1234.6)).toBe(`1${NBSP}235${NBSP}₽`)
  })

  it('R-2, R-13: отрицательная сумма (убыток) — с минусом U+2212', () => {
    expect(formatRub(-1234)).toBe(`${MINUS}1${NBSP}234${NBSP}₽`)
  })

  it('R-2: очень большая сумма', () => {
    expect(formatRub(12345678901)).toBe(`12${NBSP}345${NBSP}678${NBSP}901${NBSP}₽`)
  })

  it('R-13: в результате нет обычных пробелов и дефисов', () => {
    expectTypography(formatRub(1234567))
    expectTypography(formatRub(-1234567))
  })
})

describe('formatRubShort', () => {
  it('R-3: меньше 10 000 — полная сумма', () => {
    expect(formatRubShort(9870)).toBe(`9${NBSP}870${NBSP}₽`)
    expect(formatRubShort(1742)).toBe(`1${NBSP}742${NBSP}₽`)
    expect(formatRubShort(0)).toBe(`0${NBSP}₽`)
  })

  it('R-3: граница 1e4 — 9 999 ещё полной суммой, 10 000 уже в тысячах', () => {
    expect(formatRubShort(9999)).toBe(`9${NBSP}999${NBSP}₽`)
    expect(formatRubShort(10000)).toBe(`10${NBSP}тыс.${NBSP}₽`)
  })

  it('R-3: тысячи округляются до целых', () => {
    expect(formatRubShort(250000)).toBe(`250${NBSP}тыс.${NBSP}₽`)
    expect(formatRubShort(250400)).toBe(`250${NBSP}тыс.${NBSP}₽`)
    expect(formatRubShort(250600)).toBe(`251${NBSP}тыс.${NBSP}₽`)
    expect(formatRubShort(999000)).toBe(`999${NBSP}тыс.${NBSP}₽`)
  })

  it('R-3: граница 1e6 — миллион с одним знаком после запятой', () => {
    expect(formatRubShort(1000000)).toBe(`1,0${NBSP}млн${NBSP}₽`)
  })

  it('R-3: миллионы округляются до одного знака', () => {
    expect(formatRubShort(1240000)).toBe(`1,2${NBSP}млн${NBSP}₽`)
    expect(formatRubShort(1260000)).toBe(`1,3${NBSP}млн${NBSP}₽`)
    // Значения из макета дашборда: выручка и прибыль.
    expect(formatRubShort(7284560)).toBe(`7,3${NBSP}млн${NBSP}₽`)
    expect(formatRubShort(1704587)).toBe(`1,7${NBSP}млн${NBSP}₽`)
  })

  it('R-3, R-13: отрицательная прибыль сокращается по модулю и получает минус U+2212', () => {
    expect(formatRubShort(-2500000)).toBe(`${MINUS}2,5${NBSP}млн${NBSP}₽`)
    expect(formatRubShort(-250000)).toBe(`${MINUS}250${NBSP}тыс.${NBSP}₽`)
    expect(formatRubShort(-9870)).toBe(`${MINUS}9${NBSP}870${NBSP}₽`)
  })

  it('R-13: в результате нет обычных пробелов и дефисов', () => {
    expectTypography(formatRubShort(9870))
    expectTypography(formatRubShort(250000))
    expectTypography(formatRubShort(1200000))
  })

  // Spec 004 AC-20: не «1000 тыс. ₽», а «1,0 млн ₽»
  it('AC-20: 999 500 в тысячах округляется до 1 000 — выводится как «1,0 млн ₽»', () => {
    expect(formatRubShort(999_500)).toBe(`1,0${NBSP}млн${NBSP}₽`)
    expect(formatRubShort(999_999)).toBe(`1,0${NBSP}млн${NBSP}₽`)
  })

  it('AC-20: −999 500 — «−1,0 млн ₽» с минусом U+2212', () => {
    expect(formatRubShort(-999_500)).toBe(`${MINUS}1,0${NBSP}млн${NBSP}₽`)
    expect(formatRubShort(-999_999)).toBe(`${MINUS}1,0${NBSP}млн${NBSP}₽`)
  })

  it('AC-20: 999 499 — ещё «999 тыс. ₽»', () => {
    expect(formatRubShort(999_499)).toBe(`999${NBSP}тыс.${NBSP}₽`)
    expect(formatRubShort(-999_499)).toBe(`${MINUS}999${NBSP}тыс.${NBSP}₽`)
  })

  it('AC-20: «1000 тыс.» не выводится ни для какой суммы у границы', () => {
    for (const n of [999_500, 999_501, 999_900, 999_999.4, -999_500, -999_999]) {
      expect(formatRubShort(n)).not.toMatch(/1\s?000\s?тыс\./)
    }
  })

  it('AC-20, R-13: без обычных пробелов и дефисов', () => {
    expectTypography(formatRubShort(999_500))
    expectTypography(formatRubShort(-999_500))
  })
})

describe('formatPeriodShort', () => {
  /** Тире U+2013 — как в макете Dashboard.dc.html (блок «Нет данных за период»). */
  const EN_DASH = '–'

  it('AC-21: один год — год только в конце: 2026-10-05…2026-11-03 → «05.10–03.11.2026»', () => {
    expect(formatPeriodShort('2026-10-05', '2026-11-03')).toBe(`05.10${EN_DASH}03.11.2026`)
  })

  it('AC-21: разные годы — год у обеих дат: 2025-12-28…2026-01-03 → «28.12.2025–03.01.2026»', () => {
    expect(formatPeriodShort('2025-12-28', '2026-01-03')).toBe(`28.12.2025${EN_DASH}03.01.2026`)
  })

  it('AC-21: начало и конец года одного года — год один раз', () => {
    expect(formatPeriodShort('2026-01-01', '2026-12-31')).toBe(`01.01${EN_DASH}31.12.2026`)
  })

  it('AC-21: один день — по тому же правилу', () => {
    expect(formatPeriodShort('2026-11-03', '2026-11-03')).toBe(`03.11${EN_DASH}03.11.2026`)
  })

  it('AC-21: 29 февраля високосного года', () => {
    expect(formatPeriodShort('2024-02-29', '2024-03-05')).toBe(`29.02${EN_DASH}05.03.2024`)
  })

  it('AC-21: дата берётся из строки как есть — без сдвига часового пояса на границе года', () => {
    // При разборе через new Date('2026-01-01') (UTC) западнее Гринвича получилось бы 31.12.2025
    expect(formatPeriodShort('2026-01-01', '2026-01-01')).toBe(`01.01${EN_DASH}01.01.2026`)
    expect(formatPeriodShort('2025-12-31', '2026-01-01')).toBe(`31.12.2025${EN_DASH}01.01.2026`)
  })

  it('AC-21: тире U+2013 без пробелов вокруг, без дефисов', () => {
    const s = formatPeriodShort('2026-10-05', '2026-11-03')
    expect(s).not.toMatch(/\s/)
    expect(s).not.toContain('-')
  })
})

describe('formatAxisMoney', () => {
  it('R-4: ноль — «0» без единиц', () => {
    expect(formatAxisMoney(0)).toBe('0')
  })

  it('R-4: тысячи — «250 тыс.»', () => {
    expect(formatAxisMoney(250000)).toBe(`250${NBSP}тыс.`)
    expect(formatAxisMoney(750000)).toBe(`750${NBSP}тыс.`)
    expect(formatAxisMoney(10000)).toBe(`10${NBSP}тыс.`)
  })

  it('R-4: дробные миллионы — с одним знаком после запятой', () => {
    expect(formatAxisMoney(1500000)).toBe(`1,5${NBSP}млн`)
    expect(formatAxisMoney(2500000)).toBe(`2,5${NBSP}млн`)
  })

  it('R-4: ровные миллионы — без «,0», граница 1e6', () => {
    expect(formatAxisMoney(1000000)).toBe(`1${NBSP}млн`)
    expect(formatAxisMoney(2000000)).toBe(`2${NBSP}млн`)
    expect(formatAxisMoney(10000000)).toBe(`10${NBSP}млн`)
  })

  it('R-4: в подписи оси нет знака ₽', () => {
    expect(formatAxisMoney(250000)).not.toContain('₽')
    expect(formatAxisMoney(1500000)).not.toContain('₽')
  })

  it('R-13: в результате нет обычных пробелов и дефисов', () => {
    expectTypography(formatAxisMoney(250000))
    expectTypography(formatAxisMoney(1500000))
  })
})

describe('formatPercent', () => {
  it('R-5: один знак после запятой и « %» через неразрывный пробел', () => {
    expect(formatPercent(87.4)).toBe(`87,4${NBSP}%`)
    expect(formatPercent(78.3)).toBe(`78,3${NBSP}%`)
  })

  it('R-5: округление до одного знака', () => {
    expect(formatPercent(87.44)).toBe(`87,4${NBSP}%`)
    expect(formatPercent(87.46)).toBe(`87,5${NBSP}%`)
    expect(formatPercent(100 / 3)).toBe(`33,3${NBSP}%`)
  })

  it('R-5, R-13: отрицательная маржа — с минусом U+2212', () => {
    expect(formatPercent(-12.3)).toBe(`${MINUS}12,3${NBSP}%`)
  })

  it('R-13: в результате нет обычных пробелов и дефисов', () => {
    expectTypography(formatPercent(87.4))
    expectTypography(formatPercent(-12.3))
  })
})

describe('formatDelta', () => {
  it('R-6: рост — со знаком «+»', () => {
    expect(formatDelta(12.4)).toBe(`+12,4${NBSP}%`)
  })

  it('R-6, R-13: снижение — с минусом U+2212, а не дефисом', () => {
    expect(formatDelta(-5.5)).toBe(`${MINUS}5,5${NBSP}%`)
  })

  // Spec 004 AC-19 (согласовано пользователем 2026-11-06): вместо прежнего «+0,0 %»
  it('AC-19: ноль — «0,0 %» без знака', () => {
    expect(formatDelta(0)).toBe(`0,0${NBSP}%`)
  })

  it('AC-19: −0 — «0,0 %» без знака', () => {
    expect(formatDelta(-0)).toBe(`0,0${NBSP}%`)
  })

  it('AC-19: значения, округлённые до 0,0, — «0,0 %» без знака', () => {
    expect(formatDelta(-0.04)).toBe(`0,0${NBSP}%`)
    expect(formatDelta(0.04)).toBe(`0,0${NBSP}%`)
    expect(formatDelta(0.001)).toBe(`0,0${NBSP}%`)
    expect(formatDelta(-0.001)).toBe(`0,0${NBSP}%`)
  })

  it('AC-19: ни «+0,0 %», ни «−0,0 %», ни «-0,0 %»', () => {
    for (const n of [0, -0, 0.04, -0.04, 0.0499, -0.0499]) {
      const s = formatDelta(n)
      expect(s).not.toMatch(/^[+−-]/)
    }
  })

  it('AC-19: наименьшее ненулевое после округления — со знаком', () => {
    expect(formatDelta(0.06)).toBe(`+0,1${NBSP}%`)
    expect(formatDelta(-0.06)).toBe(`${MINUS}0,1${NBSP}%`)
  })

  it('AC-19: остальные случаи — как раньше (примеры из spec)', () => {
    expect(formatDelta(12.4)).toBe(`+12,4${NBSP}%`)
    expect(formatDelta(-5.5)).toBe(`${MINUS}5,5${NBSP}%`)
    expect(formatDelta(150)).toBe(`+150,0${NBSP}%`)
  })

  it('AC-19, R-13: «0,0 %» — без обычных пробелов и дефисов', () => {
    expectTypography(formatDelta(0))
    expectTypography(formatDelta(-0.04))
  })

  it('R-6: всегда один знак после запятой, в том числе для целых', () => {
    expect(formatDelta(10)).toBe(`+10,0${NBSP}%`)
    expect(formatDelta(-100)).toBe(`${MINUS}100,0${NBSP}%`)
  })

  it('R-6: округление до одного знака', () => {
    expect(formatDelta(12.44)).toBe(`+12,4${NBSP}%`)
    expect(formatDelta(12.46)).toBe(`+12,5${NBSP}%`)
    expect(formatDelta(-5.46)).toBe(`${MINUS}5,5${NBSP}%`)
  })

  it('R-13: в результате нет обычных пробелов и дефисов', () => {
    expectTypography(formatDelta(12.4))
    expectTypography(formatDelta(-5.5))
  })
})

describe('changePercent', () => {
  it('R-7: рост к прошлому периоду', () => {
    expect(changePercent(110, 100)).toBeCloseTo(10, 10)
    expect(changePercent(150, 120)).toBeCloseTo(25, 10)
  })

  it('R-7: снижение к прошлому периоду', () => {
    expect(changePercent(90, 100)).toBeCloseTo(-10, 10)
    expect(changePercent(1, 3)).toBeCloseTo(-66.6667, 3)
  })

  it('R-7: без изменений — 0', () => {
    expect(changePercent(100, 100)).toBe(0)
  })

  it('R-7: текущее = 0 при ненулевом прошлом — −100', () => {
    expect(changePercent(0, 100)).toBeCloseTo(-100, 10)
  })

  it('R-7: прошлое = 0 (деление на ноль) — null', () => {
    expect(changePercent(100, 0)).toBeNull()
    expect(changePercent(0, 0)).toBeNull()
  })

  it('R-7: результат не бывает NaN или Infinity', () => {
    const r = changePercent(5, 0)
    expect(r).toBeNull()
  })

  it('R-7: очень большие значения', () => {
    expect(changePercent(2e12, 1e12)).toBeCloseTo(100, 10)
    expect(changePercent(1e6, 1)).toBeCloseTo(99999900, 2)
  })

  // Spec 004 AC-8: знаменатель — модуль прошлого значения
  it('AC-8: прибыль −100 000 → 50 000 — +150 (рост из минуса — рост)', () => {
    expect(changePercent(50_000, -100_000)).toBeCloseTo(150, 10)
  })

  it('AC-8: убыток уменьшился (−100 000 → −50 000) — +50', () => {
    expect(changePercent(-50_000, -100_000)).toBeCloseTo(50, 10)
  })

  it('AC-8: убыток вырос (−100 000 → −150 000) — −50', () => {
    expect(changePercent(-150_000, -100_000)).toBeCloseTo(-50, 10)
  })

  it('AC-8: из минуса в ноль (−100 → 0) — +100', () => {
    expect(changePercent(0, -100)).toBeCloseTo(100, 10)
  })

  it('AC-8: из плюса в минус (100 → −50) — −150', () => {
    expect(changePercent(-50, 100)).toBeCloseTo(-150, 10)
  })

  it('AC-8: при положительном прошлом — как раньше (примеры spec 004 AC-7)', () => {
    // (7 284 560 − 6 480 925) / 6 480 925 × 100 ≈ 12,4
    expect(changePercent(7_284_560, 6_480_925)).toBeCloseTo(12.4, 3)
    // (23,4 − 24,8) / 24,8 × 100 ≈ −5,645
    expect(changePercent(23.4, 24.8)).toBeCloseTo(-5.645, 3)
    // (312 − 264) / 264 × 100 ≈ 18,18
    expect(changePercent(312, 264)).toBeCloseTo(18.182, 3)
  })

  it('AC-8: прошлое = 0 — null и при отрицательном текущем; −0 — тоже ноль', () => {
    expect(changePercent(-100, 0)).toBeNull()
    expect(changePercent(100, -0)).toBeNull()
  })

  it('AC-8: очень большие отрицательные значения', () => {
    expect(changePercent(1e12, -1e12)).toBeCloseTo(200, 10)
  })
})

describe('formatDate', () => {
  it('R-8: формат дд.мм.гггг с ведущими нулями', () => {
    expect(formatDate(new Date(2026, 10, 4))).toBe('04.11.2026')
    expect(formatDate(new Date(2026, 0, 1))).toBe('01.01.2026')
  })

  it('R-8: двузначные день и месяц', () => {
    expect(formatDate(new Date(2026, 9, 28))).toBe('28.10.2026')
  })

  it('R-8: учитывается локальная дата, а не UTC (конец и начало суток)', () => {
    expect(formatDate(new Date(2026, 11, 31, 23, 59, 59))).toBe('31.12.2026')
    expect(formatDate(new Date(2026, 0, 1, 0, 0, 0))).toBe('01.01.2026')
  })

  it('R-8: нет хвоста « г.» и пробелов', () => {
    const s = formatDate(new Date(2026, 10, 4))
    expect(s).not.toContain('г.')
    expect(s).not.toMatch(/\s/)
  })
})

describe('formatAxisDate', () => {
  it('R-9: день без ведущего нуля и сокращённый месяц в родительном падеже', () => {
    expect(formatAxisDate(new Date(2026, 10, 4))).toBe(`4${NBSP}нояб.`)
    expect(formatAxisDate(new Date(2026, 9, 28))).toBe(`28${NBSP}окт.`)
  })

  it('R-9: сокращения всех двенадцати месяцев', () => {
    const months = [
      'янв.',
      'февр.',
      'мар.',
      'апр.',
      'мая',
      'июн.',
      'июл.',
      'авг.',
      'сент.',
      'окт.',
      'нояб.',
      'дек.',
    ]
    months.forEach((m, i) => {
      expect(formatAxisDate(new Date(2026, i, 15))).toBe(`15${NBSP}${m}`)
    })
  })

  it('R-9: учитывается локальная дата (поздний вечер)', () => {
    expect(formatAxisDate(new Date(2026, 10, 4, 23, 59))).toBe(`4${NBSP}нояб.`)
  })

  it('R-9, R-13: без года и без обычных пробелов', () => {
    const s = formatAxisDate(new Date(2026, 10, 4))
    expect(s).not.toContain('2026')
    expectTypography(s)
  })
})

describe('formatTooltipDate', () => {
  /** Приводит все виды пробелов к обычному — для проверки содержания отдельно от типографики. */
  const plain = (s: string): string => s.replace(/[  ]/g, ' ')

  it('R-10: день недели, число, месяц и год — «ср, 28 окт. 2026»', () => {
    expect(plain(formatTooltipDate(new Date(2026, 9, 28)))).toBe('ср, 28 окт. 2026')
  })

  it('R-10: без хвоста « г.»', () => {
    expect(formatTooltipDate(new Date(2026, 9, 28))).not.toContain('г.')
  })

  it('R-10: сокращения дней недели пн…вс (неделя 2–8 ноября 2026)', () => {
    const expected = [
      'пн, 2 нояб. 2026',
      'вт, 3 нояб. 2026',
      'ср, 4 нояб. 2026',
      'чт, 5 нояб. 2026',
      'пт, 6 нояб. 2026',
      'сб, 7 нояб. 2026',
      'вс, 8 нояб. 2026',
    ]
    expected.forEach((text, i) => {
      expect(plain(formatTooltipDate(new Date(2026, 10, 2 + i)))).toBe(text)
    })
  })

  it('R-10: между числом и месяцем — неразрывный пробел', () => {
    expect(formatTooltipDate(new Date(2026, 9, 28))).toContain(`28${NBSP}окт.`)
  })

  // Решение пользователя 2026-11-04: эталон — макет, неразрывный пробел только между числом и месяцем
  it('R-10: неразрывный пробел только между числом и месяцем, как в макете', () => {
    expect(formatTooltipDate(new Date(2026, 9, 28))).toBe(`ср, 28${NBSP}окт. 2026`)
  })

  it('R-10: учитывается локальная дата (поздний вечер)', () => {
    expect(plain(formatTooltipDate(new Date(2026, 9, 28, 23, 59)))).toBe('ср, 28 окт. 2026')
  })
})

describe('formatStockDays', () => {
  it('R-11: остаток / скорость с округлением вниз и «дн.»', () => {
    // 20 / 6,1 ≈ 3,28 → 3
    expect(formatStockDays(20, 6.1)).toBe(`3${NBSP}дн.`)
    // 118 / 11,8 = 10
    expect(formatStockDays(118, 11.8)).toBe(`10${NBSP}дн.`)
  })

  it('R-11: округление именно вниз, а не к ближайшему', () => {
    // 69 / 10 = 6,9 → 6, а не 7
    expect(formatStockDays(69, 10)).toBe(`6${NBSP}дн.`)
    // 149 / 10 = 14,9 → 14
    expect(formatStockDays(149, 10)).toBe(`14${NBSP}дн.`)
  })

  it('R-11: нулевой остаток при продажах — «0 дн.»', () => {
    expect(formatStockDays(0, 5)).toBe(`0${NBSP}дн.`)
  })

  it('R-11: скорость продаж 0 — «—»', () => {
    expect(formatStockDays(10, 0)).toBe('—')
    expect(formatStockDays(0, 0)).toBe('—')
  })

  it('R-11: отрицательная скорость (некорректные данные) — «—», как при нулевой', () => {
    expect(formatStockDays(10, -1)).toBe('—')
  })

  it('R-11: дробная маленькая скорость', () => {
    // 1 / 0,5 = 2
    expect(formatStockDays(1, 0.5)).toBe(`2${NBSP}дн.`)
  })

  it('R-13: в результате нет обычных пробелов', () => {
    expectTypography(formatStockDays(20, 6.1))
  })
})

describe('stockStatus', () => {
  it('R-12: меньше 7 дней — critical', () => {
    expect(stockStatus(6, 1)).toBe('critical')
    expect(stockStatus(20, 6.1)).toBe('critical') // ≈ 3,3 дня
    expect(stockStatus(69, 10)).toBe('critical') // 6,9 дня
  })

  it('R-12: нулевой остаток при продажах — critical', () => {
    expect(stockStatus(0, 1)).toBe('critical')
  })

  it('R-12: граница 7 дней — уже soon', () => {
    expect(stockStatus(7, 1)).toBe('soon')
    expect(stockStatus(70, 10)).toBe('soon')
  })

  it('R-12: от 7 до 14 дней — soon', () => {
    expect(stockStatus(10, 1)).toBe('soon')
    expect(stockStatus(96, 7.9)).toBe('soon') // ≈ 12,2 дня
  })

  it('R-12: граница 14 дней — ещё soon', () => {
    expect(stockStatus(14, 1)).toBe('soon')
    expect(stockStatus(140, 10)).toBe('soon')
  })

  it('R-12: больше 14 дней — ok', () => {
    expect(stockStatus(15, 1)).toBe('ok')
    expect(stockStatus(150, 10)).toBe('ok')
  })

  it('R-12: скорость 0 — noSales, независимо от остатка', () => {
    expect(stockStatus(10, 0)).toBe('noSales')
    expect(stockStatus(0, 0)).toBe('noSales')
  })

  it('R-12: отрицательная скорость — noSales', () => {
    expect(stockStatus(10, -1)).toBe('noSales')
  })

  it('R-12: очень большой остаток и очень маленькая скорость — ok', () => {
    expect(stockStatus(1e9, 1)).toBe('ok')
    expect(stockStatus(1, 0.001)).toBe('ok') // 1000 дней
  })
})

/*
 * Spec 002 «Фильтры в URL»: сводка мобильной полосы фильтров (AC-20).
 * Строка 1 — «30 дней · 05.10–03.11» (день.месяц), строка 2 — «… · 3 категории · …».
 */

describe('formatDayMonth', () => {
  it('AC-20: формат дд.мм с ведущими нулями', () => {
    expect(formatDayMonth(new Date(2026, 9, 5))).toBe('05.10')
    expect(formatDayMonth(new Date(2026, 10, 3))).toBe('03.11')
    expect(formatDayMonth(new Date(2026, 0, 1))).toBe('01.01')
    expect(formatDayMonth(new Date(2026, 11, 31))).toBe('31.12')
  })

  it('AC-20: без года и без пробелов', () => {
    const s = formatDayMonth(new Date(2026, 9, 5))
    expect(s).not.toContain('2026')
    expect(s).not.toMatch(/\s/)
  })

  it('AC-20: учитывается локальная дата, а не UTC (конец и начало суток)', () => {
    expect(formatDayMonth(new Date(2026, 11, 31, 23, 59, 59))).toBe('31.12')
    expect(formatDayMonth(new Date(2026, 0, 1, 0, 0, 0))).toBe('01.01')
  })

  it('AC-20: 29 февраля високосного года', () => {
    expect(formatDayMonth(new Date(2024, 1, 29))).toBe('29.02')
  })
})

describe('formatCategoriesCount', () => {
  it.each([
    [1, 'категория'],
    [21, 'категория'],
    [101, 'категория'],
    [2, 'категории'],
    [3, 'категории'],
    [4, 'категории'],
    [22, 'категории'],
    [24, 'категории'],
    [0, 'категорий'],
    [5, 'категорий'],
    [8, 'категорий'],
    [11, 'категорий'],
    [12, 'категорий'],
    [14, 'категорий'],
    [25, 'категорий'],
    [111, 'категорий'],
    [112, 'категорий'],
  ])('AC-20: %i → «%s» после числа через неразрывный пробел', (n, word) => {
    expect(formatCategoriesCount(n)).toBe(`${n}${NBSP}${word}`)
  })

  it('AC-20: примеры из spec — «1 категория», «3 категории», «5 категорий»', () => {
    expect(formatCategoriesCount(1)).toBe(`1${NBSP}категория`)
    expect(formatCategoriesCount(3)).toBe(`3${NBSP}категории`)
    expect(formatCategoriesCount(5)).toBe(`5${NBSP}категорий`)
  })

  it('AC-20: большое число — склонение по последним цифрам', () => {
    expect(formatCategoriesCount(1001).endsWith(`${NBSP}категория`)).toBe(true)
    expect(formatCategoriesCount(1011).endsWith(`${NBSP}категорий`)).toBe(true)
  })

  it('R-13: в результате нет обычных пробелов', () => {
    expect(formatCategoriesCount(3)).not.toMatch(/ /)
  })
})
