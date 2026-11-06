// Тестовые фикстуры spec 005 «График продаж по дням». Только для *.test.tsx в app/.
//
// Ответ /api/sales-daily строится по формуле от номера дня i (0 — первый день периода),
// поэтому суммы считаются вручную. Для периода по умолчанию 05.10–03.11.2026 (30 дней):
//
// Выручка: WB = 150 000 + 1 000·i → Σ = 30·150 000 + 1 000·(0+…+29) = 4 500 000 + 435 000 = 4 935 000;
//          Ozon = 78 000 (i = 29 — 87 560) → Σ = 29·78 000 + 87 560 = 2 349 560;
//          всего = 7 284 560; было = 216 000 (i = 29 — 216 925) → 29·216 000 + 216 925 = 6 480 925.
// Заказы:  WB = 110 → 3 300; Ozon = 72 (i = 29 — 88) → 2 176; всего 5 476;
//          было 169 (i = 29 — 165) → 29·169 + 165 = 5 066.
// Прибыль: WB = 40 000 (i = 1 — −10 000, i = 29 — 90 000) → 28·40 000 − 10 000 + 90 000 = 1 200 000;
//          Ozon = 17 000 (i = 1 — −3 000, i = 29 — 31 587) → 28·17 000 − 3 000 + 31 587 = 504 587;
//          всего 1 704 587; было 53 000 (i = 29 — 63 000) → 29·53 000 + 63 000 = 1 600 000.
// День i = 1 (06.10.2026) — убыток: −10 000 + (−3 000) = −13 000.
//
// 7 дней (i = 0…6): выручка WB = 7·150 000 + 21 000 = 1 071 000, Ozon = 7·78 000 = 546 000,
// всего 1 617 000, было 7·216 000 = 1 512 000.
import type { SalesDailyResponse } from '../entities/sale'

export type SalesDay = SalesDailyResponse['days'][number]
type DayValues = SalesDay['wb']

/** Типографский минус U+2212. */
export const MINUS = '−'

const DAY_MS = 86_400_000
const toTime = (day: string) => Date.parse(`${day}T00:00:00Z`)
const toDay = (time: number) => new Date(time).toISOString().slice(0, 10)
export const addDays = (day: string, n: number) => toDay(toTime(day) + n * DAY_MS)
const daysInclusive = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / DAY_MS) + 1

export const DEFAULT_FROM = '2026-10-05'
export const DEFAULT_TO = '2026-11-03'

const ZERO: DayValues = { revenue: 0, ordersCount: 0, profit: 0 }

const wbValues = (i: number): DayValues => ({
  revenue: 150_000 + 1_000 * i,
  ordersCount: 110,
  profit: i === 1 ? -10_000 : i === 29 ? 90_000 : 40_000,
})

const ozonValues = (i: number): DayValues => ({
  revenue: i === 29 ? 87_560 : 78_000,
  ordersCount: i === 29 ? 88 : 72,
  profit: i === 1 ? -3_000 : i === 29 ? 31_587 : 17_000,
})

const previousValues = (i: number): DayValues => ({
  revenue: i === 29 ? 216_925 : 216_000,
  ordersCount: i === 29 ? 165 : 169,
  profit: i === 29 ? 63_000 : 53_000,
})

const sum = (a: DayValues, b: DayValues): DayValues => ({
  revenue: a.revenue + b.revenue,
  ordersCount: a.ordersCount + b.ordersCount,
  profit: a.profit + b.profit,
})

/**
 * Валидный по salesDailyResponseSchema ответ: день на каждую дату [from; to],
 * прошлый период — той же длины непосредственно перед текущим. `mp` обнуляет
 * другую площадку (как настоящий API при фильтре), итог дня = WB + Ozon.
 * `map` позволяет подменить день (пустой период, отрицательные значения…).
 */
export function salesDailyResponse(
  options: {
    from?: string | null
    to?: string | null
    mp?: string | null
    map?: (day: SalesDay, i: number) => SalesDay
  } = {},
): SalesDailyResponse {
  const from = options.from ?? DEFAULT_FROM
  const to = options.to ?? DEFAULT_TO
  const n = daysInclusive(from, to)
  const previousFrom = addDays(from, -n)
  const days = Array.from({ length: n }, (_, i): SalesDay => {
    const wb = options.mp === 'ozon' ? ZERO : wbValues(i)
    const ozon = options.mp === 'wb' ? ZERO : ozonValues(i)
    const day: SalesDay = {
      date: addDays(from, i),
      wb,
      ozon,
      total: sum(wb, ozon),
      previousDate: addDays(previousFrom, i),
      previousTotal: previousValues(i),
    }
    return options.map ? options.map(day, i) : day
  })
  return { days }
}

/** Пустой период: у всех дней текущего периода нули; прошлый период — с продажами. */
export const emptyDay = (day: SalesDay): SalesDay => ({ ...day, wb: ZERO, ozon: ZERO, total: ZERO })

/** Что должно быть в подзаголовке и легенде (пробелы обычные: norm сводит неразрывные). */
export const EXPECTED = {
  Выручка: { total: '7 284 560 ₽', prev: '6 480 925 ₽', wb: '4 935 000 ₽', ozon: '2 349 560 ₽' },
  Заказы: { total: '5 476 шт', prev: '5 066 шт', wb: '3 300 шт', ozon: '2 176 шт' },
  Прибыль: { total: '1 704 587 ₽', prev: '1 600 000 ₽', wb: '1 200 000 ₽', ozon: '504 587 ₽' },
} as const

export type MetricLabel = keyof typeof EXPECTED
export const METRIC_LABELS: readonly MetricLabel[] = ['Выручка', 'Заказы', 'Прибыль']

/** 7 дней (28.10–03.11.2026 или 28.12.2025–03.01.2026), выручка. */
export const EXPECTED_7_DAYS = { total: '1 617 000 ₽', prev: '1 512 000 ₽', wb: '1 071 000 ₽', ozon: '546 000 ₽' } as const

/** Значения строк sr-only таблицы: [WB, Ozon, Итого, Прошлый период]. */
export const EXPECTED_ROWS = {
  Выручка: {
    first: ['150 000 ₽', '78 000 ₽', '228 000 ₽', '216 000 ₽'],
    last: ['179 000 ₽', '87 560 ₽', '266 560 ₽', '216 925 ₽'],
  },
  Заказы: {
    first: ['110 шт', '72 шт', '182 шт', '169 шт'],
    last: ['110 шт', '88 шт', '198 шт', '165 шт'],
  },
  Прибыль: {
    first: ['40 000 ₽', '17 000 ₽', '57 000 ₽', '53 000 ₽'],
    second: [`${MINUS}10 000 ₽`, `${MINUS}3 000 ₽`, `${MINUS}13 000 ₽`, '53 000 ₽'],
    last: ['90 000 ₽', '31 587 ₽', '121 587 ₽', '63 000 ₽'],
  },
} as const

/** Высоты столбцов скелетона из макета, % (AC-17). */
export const SKELETON_HEIGHTS = [
  42, 55, 48, 62, 58, 70, 52, 45, 60, 66, 72, 58, 50, 63, 68, 75, 61, 54, 66, 70, 78, 64, 57, 69, 74, 80, 67, 60, 72, 76,
] as const

/**
 * В jsdom нет ResizeObserver, а ResponsiveContainer из Recharts его создаёт.
 * Заглушка ничего не сообщает: размер контейнера остаётся нулевым, и тесты
 * не зависят от того, нарисовал ли Recharts SVG (визуальное — в e2e).
 * Подключается через vi.stubGlobal('ResizeObserver', ResizeObserverStub).
 */
export class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** Текст с нормализованными пробелами (в том числе неразрывными). */
const normText = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()

/**
 * Пункты легенды: элементы с цветной меткой aria-hidden и текстом «WB …», «Ozon …»
 * или «Прошлый период» — вне sr-only таблицы, тултипа и области role="img".
 * Возвращаются самые вложенные совпадения в порядке документа.
 */
export function legendItems(root: HTMLElement): string[] {
  const candidates = [...root.querySelectorAll<HTMLElement>('*')].filter(
    (el) =>
      !el.closest('table') &&
      !el.closest('[role="tooltip"]') &&
      !el.closest('[role="img"]') &&
      el.getAttribute('aria-hidden') !== 'true' &&
      el.querySelector('[aria-hidden="true"]') !== null &&
      /^(WB|Ozon) \S|^Прошлый период$/.test(normText(el.textContent)),
  )
  return candidates
    .filter((el) => !candidates.some((other) => other !== el && el.contains(other)))
    .map((el) => normText(el.textContent))
}

/** Пункт легенды по точному тексту (для проверки aria-hidden метки). */
export function legendItem(root: HTMLElement, text: string): HTMLElement {
  const candidates = [...root.querySelectorAll<HTMLElement>('*')].filter(
    (el) => !el.closest('table') && !el.closest('[role="img"]') && normText(el.textContent) === text,
  )
  const withMark = candidates.filter((el) => el.querySelector('[aria-hidden="true"]') !== null)
  const innermost = withMark.find((el) => !withMark.some((other) => other !== el && el.contains(other)))
  if (!innermost) throw new Error(`Нет пункта легенды «${text}» с меткой aria-hidden`)
  return innermost
}

/** Строки тела таблицы: вне thead и с ячейками данных (дата может быть th scope="row"). */
export function bodyRows(table: HTMLElement): HTMLTableRowElement[] {
  return [...table.querySelectorAll<HTMLTableRowElement>('tr')].filter(
    (row) => row.closest('thead') === null && row.querySelector('td') !== null,
  )
}

/** Тексты ячеек строки: [дата, …значения]. */
export const rowCells = (row: HTMLTableRowElement): string[] =>
  [...row.querySelectorAll('th, td')].map((cell) => normText(cell.textContent))

/**
 * Высоты столбцов скелетона из inline-стиля: `height: 42%` или CSS-переменная `--…: 42%`
 * (макет задаёт высоту каждому столбцу отдельно).
 */
export function skeletonBarHeights(container: HTMLElement): number[] {
  const heights: number[] = []
  for (const el of container.querySelectorAll<HTMLElement>('[style]')) {
    const m = /(?:^|;)\s*(?:height|--[\w-]+)\s*:\s*([\d.]+)%/.exec(el.getAttribute('style') ?? '')
    if (m) heights.push(Number(m[1]))
  }
  return heights
}
