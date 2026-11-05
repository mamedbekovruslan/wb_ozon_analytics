// Детерминированный генератор случайных чисел (ADR-0004): одинаковый seed —
// одинаковые данные, без внешних зависимостей.

export type Random = {
  /** [0, 1) */
  next: () => number
  /** Целое в [min, max] */
  int: (min: number, max: number) => number
  /** true с вероятностью p */
  chance: (p: number) => boolean
  pick: <T>(items: readonly T[]) => T
}

/** mulberry32 — короткий и достаточно равномерный PRNG для синтетических данных. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => {
      const item = items[Math.floor(next() * items.length)]
      if (item === undefined) throw new Error('pick из пустого списка')
      return item
    },
  }
}

/** Смешивает seed со строкой (FNV-1a): у каждого дня и сущности свой поток чисел. */
export function deriveSeed(seed: number, key: string): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/** Выбор по весам: веса заранее превращены в накопленные суммы. */
export function weightedIndex(cumulative: readonly number[], r: number): number {
  const total = cumulative[cumulative.length - 1] ?? 0
  const target = r * total
  let lo = 0
  let hi = cumulative.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((cumulative[mid] ?? 0) > target) hi = mid
    else lo = mid + 1
  }
  return lo
}
