// Тестовые фикстуры spec 004 «KPI-карточки». Только для *.test.tsx в app/.
//
// Числа подобраны так, чтобы изменения считались вручную по docs/domain.md и spec 004
// («Изменение» = (текущее − прошлое) / |прошлое| × 100, округление до 0,1) и не попадали
// на границу округления (…,x5).
import type { KpiResponse, Metrics } from '../entities/sale'

/** 14 точек sparkline. */
export const SPARK_LENGTH = 14

/** Восемь карточек в порядке spec 004, таблица «Карточки». */
export const CARD_LABELS = [
  'Выручка',
  'Заказы',
  'Выкупы',
  '% выкупа',
  'Возвраты',
  'Средний чек',
  'Прибыль',
  'Маржа',
] as const

export type CardLabel = (typeof CARD_LABELS)[number]

/** Скрытые тексты бейджа (AC-11). */
export const SR = {
  upGood: 'рост к прошлому периоду, хорошо',
  upBad: 'рост к прошлому периоду, плохо',
  downGood: 'снижение к прошлому периоду, хорошо',
  downBad: 'снижение к прошлому периоду, плохо',
  flat: 'без изменений к прошлому периоду',
} as const

/** Типографский минус U+2212 — так formatDelta и formatRubShort пишут знак «−». */
export const MINUS = '−'

/*
 * Текущий период. Прибыль = выручка − комиссия − логистика − себестоимость:
 * 7 284 560 − 1 820 000 − 420 000 − 3 339 973 = 1 704 587.
 */
export const CURRENT: Metrics = {
  ordersCount: 5476,
  ordersSum: 9_538_000,
  buyoutsCount: 4182,
  revenue: 7_284_560,
  buyoutRate: 78.3,
  returnsCount: 312,
  returnsSum: 540_000,
  avgCheck: 1742,
  commission: 1_820_000,
  logistics: 420_000,
  costPrice: 3_339_973,
  profit: 1_704_587,
  margin: 23.4,
}

/* Прошлый период. 6 480 925 − 1 620 000 − 400 000 − 2 860 925 = 1 600 000. */
export const PREVIOUS: Metrics = {
  ordersCount: 5000,
  ordersSum: 8_700_000,
  buyoutsCount: 4200,
  revenue: 6_480_925,
  buyoutRate: 75,
  returnsCount: 264,
  returnsSum: 450_000,
  avgCheck: 1700,
  commission: 1_620_000,
  logistics: 400_000,
  costPrice: 2_860_925,
  profit: 1_600_000,
  margin: 24.8,
}

/**
 * Что должно быть на карточках для CURRENT / PREVIOUS (пробелы — обычные: Testing Library
 * сводит неразрывные к обычным). Изменения посчитаны вручную:
 * - Выручка: (7 284 560 − 6 480 925) / 6 480 925 = 803 635 / 6 480 925 ≈ 12,400 % → +12,4 %;
 * - Заказы: 476 / 5 000 = 9,52 % → +9,5 %;
 * - Выкупы: −18 / 4 200 ≈ −0,43 % → −0,4 % (рост — хорошо, значит снижение — плохо);
 * - % выкупа: 3,3 / 75 = 4,4 % → +4,4 %;
 * - Возвраты: 48 / 264 ≈ 18,18 % → +18,2 % (инверсия: рост — плохо);
 * - Средний чек: 42 / 1 700 ≈ 2,47 % → +2,5 %;
 * - Прибыль: 104 587 / 1 600 000 ≈ 6,54 % → +6,5 %;
 * - Маржа: −1,4 / 24,8 ≈ −5,65 % → −5,6 %.
 */
export const EXPECTED_CARDS: Record<CardLabel, { value: string; prev: string; delta: string; sr: string }> = {
  Выручка: { value: '7,3 млн ₽', prev: 'было 6,5 млн ₽', delta: '+12,4 %', sr: SR.upGood },
  Заказы: { value: '5 476', prev: 'было 5 000', delta: '+9,5 %', sr: SR.upGood },
  Выкупы: { value: '4 182', prev: 'было 4 200', delta: `${MINUS}0,4 %`, sr: SR.downBad },
  '% выкупа': { value: '78,3 %', prev: 'было 75,0 %', delta: '+4,4 %', sr: SR.upGood },
  Возвраты: { value: '312', prev: 'было 264', delta: '+18,2 %', sr: SR.upBad },
  'Средний чек': { value: '1 742 ₽', prev: 'было 1 700 ₽', delta: '+2,5 %', sr: SR.upGood },
  Прибыль: { value: '1,7 млн ₽', prev: 'было 1,6 млн ₽', delta: '+6,5 %', sr: SR.upGood },
  Маржа: { value: '23,4 %', prev: 'было 24,8 %', delta: `${MINUS}5,6 %`, sr: SR.downBad },
}

type Sparklines = KpiResponse['sparklines']
type SparkKey = keyof Sparklines

/** Растущий ряд из 14 точек. */
export const rising = (base: number, step = 1): (number | null)[] =>
  Array.from({ length: SPARK_LENGTH }, (_, i) => base + i * step)

const SPARK_KEYS: SparkKey[] = [
  'ordersCount',
  'ordersSum',
  'buyoutsCount',
  'revenue',
  'buyoutRate',
  'returnsCount',
  'returnsSum',
  'avgCheck',
  'commission',
  'logistics',
  'costPrice',
  'profit',
  'margin',
]

function defaultSparklines(): Sparklines {
  const entries = SPARK_KEYS.map((key, i) => [key, rising(10 * (i + 1))] as const)
  return Object.fromEntries(entries) as Sparklines
}

/** Валидный по kpiResponseSchema ответ /api/kpi; переданные поля перекрывают значения по умолчанию. */
export function kpiResponse(
  overrides: {
    current?: Partial<Metrics>
    previous?: Partial<Metrics>
    sparklines?: Partial<Sparklines>
    period?: { from: string; to: string }
    previousPeriod?: { from: string; to: string }
  } = {},
): KpiResponse {
  return {
    period: overrides.period ?? { from: '2026-10-05', to: '2026-11-03' },
    previousPeriod: overrides.previousPeriod ?? { from: '2026-09-05', to: '2026-10-04' },
    current: { ...CURRENT, ...overrides.current },
    previous: { ...PREVIOUS, ...overrides.previous },
    sparklines: { ...defaultSparklines(), ...overrides.sparklines },
  }
}

/**
 * Подмена window.matchMedia под ширину окна: понимает `(min-width: Npx)`, `(max-width: Npx)`
 * и их сочетание через `and`. Остальные запросы (тема, reduced motion) — false.
 * Нужна, чтобы реализация могла спрашивать про любую границу сетки (640, 1200) и получать
 * ответ, как в браузере такой ширины.
 */
export function createMatchMediaForWidth(width: number): (query: string) => MediaQueryList {
  const matches = (query: string): boolean => {
    const parts = query.split(/\s+and\s+/i)
    return parts.every((part) => {
      const m = /^\(\s*(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/i.exec(part.trim())
      if (!m) return false
      const limit = Number(m[2])
      return m[1]?.toLowerCase() === 'min' ? width >= limit : width <= limit
    })
  }
  return (query: string) =>
    ({
      matches: matches(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}

// --- Поиск в DOM по поведению, а не по классам ---

/** Текст с нормализованными пробелами (в том числе неразрывными). */
export const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()

/**
 * Элементы, у которых весь текст (вместе с потомками) равен `s`. Панель фильтров
 * (role="search") исключается: там свои даты периода.
 */
export function elementsWithExactText(s: string, root: ParentNode = document.body): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('*')].filter(
    (el) => norm(el.textContent) === s && !el.closest('[role="search"]'),
  )
}

/** Числа в атрибуте d пути или points ломаной. */
function coordinateCount(el: Element): number {
  const raw = el.tagName.toLowerCase() === 'polyline' ? el.getAttribute('points') : el.getAttribute('d')
  return (raw ?? '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.length ?? 0
}

/** Путь без заливки, заданной атрибутом или inline-стилем (CSS-модули jsdom не видит). */
const hasNoFill = (el: Element) =>
  el.getAttribute('fill') === 'none' || /(^|;)\s*fill\s*:\s*none/i.test(el.getAttribute('style') ?? '')

/**
 * Линия sparkline — ломаная или путь без заливки (`fill="none"`, как в макете);
 * если так отличить нельзя — незамкнутый путь (заливка замыкается командой Z).
 */
export function sparklineLines(svg: Element): Element[] {
  const polylines = [...svg.querySelectorAll('polyline')]
  const paths = [...svg.querySelectorAll('path')]
  const unfilled = paths.filter(hasNoFill)
  const linePaths = unfilled.length > 0 ? unfilled : paths.filter((el) => !/z/i.test(el.getAttribute('d') ?? ''))
  return [...polylines, ...linePaths]
}

/** Заливка sparkline — всё остальное: полигон или путь, который не линия. */
export function sparklineAreas(svg: Element): Element[] {
  const lines = new Set(sparklineLines(svg))
  return [...svg.querySelectorAll('path, polygon')].filter((el) => !lines.has(el))
}

/** Число вершин линии: пары координат x,y (команды M/L или points). */
export function vertexCount(line: Element): number {
  return coordinateCount(line) / 2
}
