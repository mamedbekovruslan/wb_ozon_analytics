import { categoryIdSchema, type CategoryId } from './contract'

// Фильтры в URL (spec 002, ADR-0007, ADR-0015). Здесь только чистые функции:
// разбор URL, расчёт периода, параметры запросов к /api/... Роутер — в app, UI — в widgets/filter-bar.

export type PeriodPreset = '7' | '30' | '90' | 'q' | 'y'
export type MarketplaceFilter = 'all' | 'wb' | 'ozon'

export const DEFAULT_PRESET: PeriodPreset = '30'
export const PERIOD_PRESETS: readonly PeriodPreset[] = ['7', '30', '90', 'q', 'y']

/** Чистый вид параметров URL: значений по умолчанию здесь нет — они не пишутся в адрес. */
export type FiltersSearch = {
  period?: Exclude<PeriodPreset, '30'>
  from?: string
  to?: string
  mp?: 'wb' | 'ozon'
  cat?: CategoryId[]
  cmp?: '0'
}

export type ResolvedFilters = {
  /** null — свой период */
  preset: PeriodPreset | null
  from: string
  to: string
  prevFrom: string
  prevTo: string
  mp: MarketplaceFilter
  cat: CategoryId[]
  compare: boolean
}

/** Границы данных из /api/meta */
export type DataBounds = { today: string; historyFrom: string }

const CATEGORY_ORDER: readonly CategoryId[] = categoryIdSchema.options

// --- Календарные дни ГГГГ-ММ-ДД. Считаем в UTC, чтобы часовой пояс и переход на летнее время не сдвигали дату ---

const DAY_MS = 86_400_000

function isValidDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  // Date.parse принимает 2026-02-30 и переносит на март — сверяем обратно
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value
}

const toTime = (day: string) => Date.parse(`${day}T00:00:00Z`)
const toDay = (time: number) => new Date(time).toISOString().slice(0, 10)
const addDays = (day: string, n: number) => toDay(toTime(day) + n * DAY_MS)
const daysBetween = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / DAY_MS)

// --- Разбор параметров URL (T4: любой мусор → значение по умолчанию, без исключений) ---

/** Значение параметра, только если это собственное поле объекта: `__proto__` и прочее из прототипа не читаем. */
function own(raw: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(raw, key) ? raw[key] : undefined
}

const asString = (value: unknown) => (typeof value === 'string' ? value : undefined)

function parseCategories(value: unknown): CategoryId[] {
  const list = Array.isArray(value) ? value : [value]
  const picked = new Set(list.filter((item): item is string => typeof item === 'string'))
  // Порядок справочника: одна и та же выборка всегда даёт один и тот же URL
  return CATEGORY_ORDER.filter((id) => picked.has(id))
}

/**
 * Сырые параметры → чистые фильтры. Проверяется только формат: годятся ли даты
 * по смыслу, станет ясно после /api/meta (см. `normalizeFiltersSearch`).
 */
export function parseFiltersSearch(raw: Record<string, unknown>): FiltersSearch {
  const search: FiltersSearch = {}

  const period = asString(own(raw, 'period'))
  if (period === '7' || period === '90' || period === 'q' || period === 'y') search.period = period

  const from = asString(own(raw, 'from'))
  const to = asString(own(raw, 'to'))
  if (from !== undefined && to !== undefined && isValidDay(from) && isValidDay(to)) {
    search.from = from
    search.to = to
  }

  const mp = asString(own(raw, 'mp'))
  if (mp === 'wb' || mp === 'ozon') search.mp = mp

  const cat = parseCategories(own(raw, 'cat'))
  if (cat.length > 0) search.cat = cat

  if (asString(own(raw, 'cmp')) === '0') search.cmp = '0'

  return search
}

function isValidCustom(search: FiltersSearch, bounds: DataBounds): search is FiltersSearch & { from: string; to: string } {
  const { from, to } = search
  return from !== undefined && to !== undefined && from <= to && from >= bounds.historyFrom && to <= bounds.today
}

/**
 * Приводит фильтры к виду, который пишется в URL, когда известны границы данных:
 * валидный свой период вытесняет пресет, невалидный — удаляется (AC-6, AC-7, AC-10).
 */
export function normalizeFiltersSearch(search: FiltersSearch, bounds: DataBounds): FiltersSearch {
  const { period, from, to, ...rest } = search
  if (isValidCustom(search, bounds)) return { ...rest, from, to }
  return period ? { period, ...rest } : rest
}

// --- Расчёт периода ---

function presetRange(preset: PeriodPreset, bounds: DataBounds): { from: string; to: string } {
  // Данные за сегодня неполные — пресеты заканчиваются вчера, как в макете
  const to = addDays(bounds.today, -1)
  const [year, month] = to.split('-').map(Number) as [number, number]
  let from: string
  if (preset === 'q') from = `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')}-01`
  else if (preset === 'y') from = `${year}-01-01`
  else from = addDays(to, -(Number(preset) - 1))
  return { from: from < bounds.historyFrom ? bounds.historyFrom : from, to }
}

export function resolveFilters(search: FiltersSearch, bounds: DataBounds): ResolvedFilters {
  const custom = isValidCustom(search, bounds)
  const preset: PeriodPreset | null = custom ? null : (search.period ?? DEFAULT_PRESET)
  const { from, to } = custom ? { from: search.from, to: search.to } : presetRange(preset ?? DEFAULT_PRESET, bounds)

  // Прошлый период — той же длины, непосредственно перед текущим (docs/domain.md)
  const length = daysBetween(from, to) + 1
  const prevTo = addDays(from, -1)

  return {
    preset,
    from,
    to,
    prevFrom: addDays(prevTo, -(length - 1)),
    prevTo,
    mp: search.mp ?? 'all',
    cat: search.cat ?? [],
    compare: search.cmp !== '0',
  }
}

/** Параметры запроса к /api/... по контракту spec 001 */
export function toApiParams(filters: Pick<ResolvedFilters, 'from' | 'to' | 'mp' | 'cat'>): URLSearchParams {
  const params = new URLSearchParams({ from: filters.from, to: filters.to, mp: filters.mp })
  for (const id of filters.cat) params.append('cat', id)
  return params
}

// --- Сериализация URL для роутера: обычный текст и повторяющийся `cat`, а не JSON ---

export function parseSearchQuery(query: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of new URLSearchParams(query)) {
    // defineProperty, а не присваивание: ключ `__proto__` из URL не должен подменить прототип
    const previous = Object.hasOwn(result, key) ? result[key] : undefined
    if (Array.isArray(previous)) {
      previous.push(value)
      continue
    }
    const next = previous === undefined ? value : [previous, value]
    Object.defineProperty(result, key, { value: next, enumerable: true, writable: true, configurable: true })
  }
  return result
}

export function stringifySearchQuery(search: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined || item === null) continue
      params.append(key, String(item))
    }
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}
