import { changePercent, formatDelta } from './format'

/** Оценка изменения к прошлому периоду: по ней красится бейдж и sparkline (DESIGN_SPEC § 4). */
export type ChangeTone = 'good' | 'bad' | 'neutral'

export type Change = {
  /** Изменение в процентах */
  percent: number
  direction: 'up' | 'down' | 'flat'
  tone: ChangeTone
}

/**
 * Изменение текущего значения к прошлому. null — посчитать нельзя (нет значения или прошлое = 0).
 * `inverted` — рост плохо (возвраты): стрелка и знак те же, меняется только оценка.
 */
export function evaluateChange(current: number | null, previous: number | null, inverted = false): Change | null {
  if (current === null || previous === null) return null
  const percent = changePercent(current, previous)
  if (percent === null || !Number.isFinite(percent)) return null
  // «Без изменений» — то, что после округления до 0,1 показывается как «0,0 %»
  if (formatDelta(percent) === formatDelta(0)) return { percent, direction: 'flat', tone: 'neutral' }
  const up = percent > 0
  return { percent, direction: up ? 'up' : 'down', tone: up !== inverted ? 'good' : 'bad' }
}
