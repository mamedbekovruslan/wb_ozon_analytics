import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { cx, evaluateChange, formatAxisDate, formatTooltipDate, parseDay } from '../../../../shared/lib'
import { DeltaBadge } from '../../../../shared/ui'
import { SALES_METRICS, type ChartRow, type SalesMetric, type SeriesVisibility } from '../../model/salesChart'
import styles from './SalesTooltip.module.css'

// Отступ от указателя (Dashboard.dc.html: 14 px от колонки) и от верха графика
const OFFSET = 14
const EDGE = 4
// Правее этой доли ширины тултип открывается влево (макет: left > 55 %)
const FLIP_AT = 0.55

type Anchor = {
  /** Центр колонки дня, px от левого края графика */
  center: number
  /** Половина ширины столбца: тултип не заходит на сам столбец */
  halfBar: number
  /** Где указатель по вертикали; null — день выбран с клавиатуры */
  pointerY: number | null
  /** Верх области столбцов */
  top: number
}

type SalesTooltipProps = {
  id: string
  row: ChartRow
  metric: SalesMetric
  visible: SeriesVisibility
  anchor: Anchor
  containerWidth: number
}

/**
 * Положение: 4 px от верха столбцов, справа от колонки, правее 55 % — слева (Dashboard.dc.html).
 * Не помещается ни с одной стороны (телефон, середина графика) — над пальцем в пределах ширины
 * графика, чтобы не закрыть палец и не дать горизонтальную прокрутку; с клавиатуры пальца нет —
 * тогда поверх столбцов (решение пользователя 2026-11-06).
 */
function place(anchor: Anchor, size: { width: number; height: number }, containerWidth: number): CSSProperties {
  // На широких столбцах (7 дней) 14 px от центра колонки заходили бы на сам столбец
  const gap = Math.max(OFFSET, anchor.halfBar + EDGE)
  const right = anchor.center + gap
  const left = anchor.center - gap - size.width
  const top = anchor.top + EDGE
  const fitsRight = right + size.width <= containerWidth
  const fitsLeft = left >= 0
  if (fitsRight && (anchor.center <= containerWidth * FLIP_AT || !fitsLeft)) return { left: right, top }
  if (fitsLeft) return { left, top }
  const x = Math.min(Math.max(0, anchor.center - size.width / 2), Math.max(0, containerWidth - size.width))
  return { left: x, top: anchor.pointerY === null ? top : anchor.pointerY - size.height - OFFSET }
}

/** Тултип дня: дата, WB, Ozon, итог, прошлый период и изменение к нему. */
export function SalesTooltip({ id, row, metric, visible, anchor, containerWidth }: SalesTooltipProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const { format } = SALES_METRICS[metric]
  const change = visible.previous ? evaluateChange(row.total, row.previous) : null

  // Размер зависит от текста — меряем после отрисовки и ставим на место до показа
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const next = { width: el.offsetWidth, height: el.offsetHeight }
    setSize((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next))
  }, [row, metric, visible.wb, visible.ozon, visible.previous])

  const style: CSSProperties = size ? place(anchor, size, containerWidth) : { left: 0, top: EDGE, visibility: 'hidden' }

  return (
    <div ref={ref} id={id} role="tooltip" className={styles.tooltip} style={style}>
      <span className={styles.date}>{formatTooltipDate(parseDay(row.date))}</span>
      {visible.wb && (
        <span className={styles.row}>
          <span className={styles.label}>
            <span aria-hidden="true" className={cx(styles.mark, styles.wb)} />
            WB
          </span>
          <span className={cx(styles.value, 'num')}>{format(row.wb)}</span>
        </span>
      )}
      {visible.ozon && (
        <span className={styles.row}>
          <span className={styles.label}>
            <span aria-hidden="true" className={cx(styles.mark, styles.ozon)} />
            Ozon
          </span>
          <span className={cx(styles.value, 'num')}>{format(row.ozon)}</span>
        </span>
      )}
      <span className={cx(styles.row, styles.total)}>
        <span>Итого</span>
        <span className="num">{format(row.total)}</span>
      </span>
      {visible.previous && (
        <span className={cx(styles.row, styles.previous)}>
          <span>Прошлый период, {formatAxisDate(parseDay(row.previousDate))}</span>
          <span className="num">{format(row.previous)}</span>
        </span>
      )}
      {change && (
        <span className={styles.badge}>
          <DeltaBadge change={change} />
        </span>
      )}
    </div>
  )
}
