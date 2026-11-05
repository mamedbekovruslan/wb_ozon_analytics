/** Округление до копеек: суммы с копейками не должны копить ошибку float. */
export function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100
  // −0 из Math.round(-0.001) в ответе API выглядел бы странно
  return rounded === 0 ? 0 : rounded
}

/** Сумма из строки API ("376.99"); мусор — ошибка данных. */
export function parseAmount(value: string): number {
  const n = Number(value)
  if (value.trim() === '' || !Number.isFinite(n)) throw new Error(`Не сумма: ${value}`)
  return n
}
