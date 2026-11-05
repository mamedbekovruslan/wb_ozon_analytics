import { addDays, daysBetween } from '../lib/dates'

export type Period = { from: string; to: string }

/** Прошлый период — той же длины, непосредственно перед текущим (docs/domain.md). */
export function previousPeriod({ from, to }: Period): Period {
  const length = daysBetween(from, to) + 1
  return { from: addDays(from, -length), to: addDays(from, -1) }
}

export const periodLength = ({ from, to }: Period) => daysBetween(from, to) + 1

/** Дни периода подряд, включая границы. */
export function eachDay({ from, to }: Period): string[] {
  const days: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  return days
}
