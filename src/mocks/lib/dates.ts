// Календарные дни ГГГГ-ММ-ДД и московское время. Москва живёт в UTC+3
// без перехода на летнее время, поэтому сдвиг постоянный и Intl не нужен.

const DAY_MS = 86_400_000
const MSK_OFFSET_MS = 3 * 3_600_000

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Номер дня от 1970-01-01; для арифметики над датами без часовых поясов. */
export function dayNumber(date: string): number {
  const match = DATE_RE.exec(date)
  if (!match) throw new Error(`Не дата: ${date}`)
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS
}

export function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(dayNumber(date) + days)
}

/** Число дней от a до b (b − a). */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a)
}

/** Существующая календарная дата в формате ГГГГ-ММ-ДД (2026-02-30 — нет). */
export function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  return fromDayNumber(dayNumber(value)) === value
}

/** Тот же день N месяцев назад; 31-е число уходит на последний день месяца. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}

/** Момент времени (мс UTC) → ISO с +03:00; миллисекунды — только если они есть. */
export function toMskIso(ms: number): string {
  const shifted = new Date(ms + MSK_OFFSET_MS).toISOString()
  const millis = shifted.slice(19, 23)
  return `${shifted.slice(0, 19)}${millis === '.000' ? '' : millis}+03:00`
}

/**
 * Разбор момента времени из API. Ozon отдаёт микросекунды
 * (`23:59:51.653736Z`), а Date.parse по стандарту понимает только
 * миллисекунды — лишние знаки отбрасываем.
 */
export function parseMoment(value: string): number {
  const ms = Date.parse(value.replace(/(\.\d{3})\d+/, '$1'))
  if (Number.isNaN(ms)) throw new Error(`Не момент времени: ${value}`)
  return ms
}

/** День по Москве для момента времени из API. */
export function mskDateOf(value: string): string {
  return toMskIso(parseMoment(value)).slice(0, 10)
}

/** «Сегодня» по Москве для момента `now`. */
export function mskToday(now: Date): string {
  return toMskIso(now.getTime()).slice(0, 10)
}

/** Полночь дня по Москве в мс UTC. */
export function mskMidnight(date: string): number {
  return dayNumber(date) * DAY_MS - MSK_OFFSET_MS
}
