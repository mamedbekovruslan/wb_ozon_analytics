/** Календарный день `ГГГГ-ММ-ДД` из API и URL → локальная дата для форматтеров. */
export function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, date)
}
