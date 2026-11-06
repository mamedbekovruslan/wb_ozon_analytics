import {
  useId,
  useMemo,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { useElementWidth } from '../../../../shared/lib'
import {
  axisRange,
  niceAxis,
  SALES_METRICS,
  xTickIndexes,
  type ChartRow,
  type SalesMetric,
  type SeriesVisibility,
} from '../../model/salesChart'
import { AXIS_GAP, BAR_GAP, X_AXIS_HEIGHT } from './chartGeometry'
import styles from './SalesChart.module.css'
import type { SalesChartPlotProps } from './SalesChartPlot'
import { SalesTooltip } from './SalesTooltip'
import type { SalesChartLayout } from './useSalesChartLayout'

type SalesChartProps = {
  rows: ChartRow[]
  metric: SalesMetric
  visible: SeriesVisibility
  layout: SalesChartLayout
  ariaLabel: string
  /** Отрисовка Recharts из отдельного чанка (useChartPlot) */
  plot: ComponentType<SalesChartPlotProps>
}

/** Активный день: откуда пришёл (указатель или клавиатура) и где указатель — для тултипа. */
type Active = { index: number; pointerY: number | null; keyboard: boolean }

/**
 * Область графика: фокус, указатель, клавиатура и тултип. Активный день, подсветка колонки
 * и тултип — свои, а не Recharts: так мышь, касание и стрелки ведут себя одинаково, а область
 * с role="img" — единственная точка фокуса.
 */
export function SalesChart({ rows, metric, visible, layout, ariaLabel, plot: Plot }: SalesChartProps) {
  const tooltipId = useId()
  const [measureRef, width] = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<Active | null>(null)
  const def = SALES_METRICS[metric]

  const n = rows.length
  const height = layout.plotHeight + X_AXIS_HEIGHT
  const plotLeft = layout.yAxisWidth + AXIS_GAP
  // Колонки дней в Recharts — равные доли ширины области столбцов, без внешних отступов
  const band = n > 0 ? Math.max(0, width - plotLeft) / n : 0
  const activeIndex = active && active.index < n ? active.index : null
  const activeRow = activeIndex === null ? undefined : rows[activeIndex]

  const yTicks = useMemo(() => {
    const { min, max } = axisRange(rows, visible)
    return niceAxis(min, max, { integer: def.integer }).ticks
  }, [rows, visible, def.integer])
  const xTicks = useMemo(
    () => xTickIndexes(n, layout.xTickCount).flatMap((i) => (rows[i] ? [rows[i].date] : [])),
    [rows, n, layout.xTickCount],
  )

  const point = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left - plotLeft
    if (band <= 0 || x < 0) {
      setActive(null)
      return
    }
    const index = Math.min(n - 1, Math.floor(x / band))
    const pointerY = e.clientY - rect.top
    // Тот же объект — React пропускает перерисовку, если день и высота указателя не изменились
    // (движение внутри колонки по горизонтали)
    setActive((a) =>
      a && !a.keyboard && a.index === index && a.pointerY === pointerY ? a : { index, pointerY, keyboard: false },
    )
  }

  // Касание: тултип остаётся после того, как палец убран (pointerleave приходит сразу за касанием)
  const leave = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') setActive(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return
    let next: number | null
    if (e.key === 'ArrowRight') next = activeIndex === null ? 0 : Math.min(n - 1, activeIndex + 1)
    else if (e.key === 'ArrowLeft') next = activeIndex === null ? n - 1 : Math.max(0, activeIndex - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else if (e.key === 'Escape') next = null
    else return
    e.preventDefault()
    setActive(next === null ? null : { index: next, pointerY: null, keyboard: true })
  }

  return (
    <div className={styles.wrap}>
      <div
        ref={measureRef}
        role="img"
        aria-label={ariaLabel}
        // Со стрелками скринридер читает выбранный день из тултипа
        aria-describedby={active?.keyboard && activeRow ? tooltipId : undefined}
        tabIndex={0}
        className={styles.plot}
        // Активный день — CSS-переменными: подсветка и затемнение меняются без перерисовки Recharts
        data-active={activeIndex !== null || undefined}
        style={{ height, '--day': activeIndex ?? -1, '--band': `${band}px` } as CSSProperties}
        onPointerMove={point}
        onPointerDown={point}
        onPointerLeave={leave}
        onKeyDown={onKeyDown}
        onBlur={() => setActive((a) => (a?.keyboard ? null : a))}
      >
        {width > 0 && n > 0 && (
          <Plot
            rows={rows}
            visible={visible}
            width={width}
            plotHeight={layout.plotHeight}
            plotLeft={plotLeft}
            band={band}
            yTicks={yTicks}
            xTicks={xTicks}
            formatY={def.axis}
          />
        )}
      </div>
      {/* Тултип — вне role="img": содержимое изображения скринридер и поиск по ролям не видят */}
      {activeRow && activeIndex !== null && (
        <SalesTooltip
          id={tooltipId}
          row={activeRow}
          metric={metric}
          visible={visible}
          anchor={{
            center: plotLeft + band * (activeIndex + 0.5),
            // Тултип отступает от края столбца, а не от центра колонки
            halfBar: (band * (1 - BAR_GAP)) / 2,
            pointerY: active?.pointerY ?? null,
            top: 0,
          }}
          containerWidth={width}
        />
      )}
    </div>
  )
}
