import { cx, type ChangeTone } from '../../lib'
import styles from './Sparkline.module.css'

type SparklineProps = {
  /** Точки по порядку; null пропускается, линия соединяет соседние */
  points: readonly (number | null)[]
  /**
   * Цвет линии и заливки = цвет оценки изменения (DESIGN_SPEC § 4).
   * neutral или null (оценки нет: сравнение выключено) — приглушённый --text-3.
   */
  tone: ChangeTone | null
  className?: string
}

// Координаты как в макете: viewBox 100 × 28, линия от y = 25 (минимум) до y = 3 (максимум)
const WIDTH = 100
const BOTTOM = 28
const BASE = 25
const RANGE = 22

/** Мини-график без осей. Только для зрячих: смысл передают значение и бейдж рядом. */
export function Sparkline({ points, tone, className }: SparklineProps) {
  const path = buildPath(points)
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${BOTTOM}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cx(styles.sparkline, styles[tone ?? 'neutral'], className)}
    >
      {path && (
        <>
          <path className={styles.area} d={path.area} />
          <path className={styles.line} d={path.line} fill="none" vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  )
}

function buildPath(points: readonly (number | null)[]): { line: string; area: string } | null {
  const last = points.length - 1
  const present = points.flatMap((value, i) => (value === null ? [] : [{ value, i }]))
  if (present.length < 2) return null

  const values = present.map((p) => p.value)
  const min = Math.min(...values)
  // Ровный ряд — горизонтальная линия по низу, без деления на ноль
  const span = Math.max(...values) - min || 1
  const coords = present.map(({ value, i }) => [
    ((i / last) * WIDTH).toFixed(1),
    (BASE - ((value - min) / span) * RANGE).toFixed(1),
  ])
  const line = coords.map(([x, y], k) => `${k === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')
  const firstX = coords[0]?.[0] ?? '0'
  const lastX = coords.at(-1)?.[0] ?? String(WIDTH)
  return { line, area: `${line} L${lastX} ${BOTTOM} L${firstX} ${BOTTOM} Z` }
}
