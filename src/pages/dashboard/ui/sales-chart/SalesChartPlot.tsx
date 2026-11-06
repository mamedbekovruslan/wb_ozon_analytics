import {
  Bar,
  CartesianGrid,
  ComposedChart,
  DefaultZIndexes,
  Line,
  Rectangle,
  ReferenceLine,
  XAxis,
  YAxis,
  ZIndexLayer,
  type BarShapeProps,
} from 'recharts'
import { cx, formatAxisDate, parseDay } from '../../../../shared/lib'
import type { ChartRow, SeriesVisibility } from '../../model/salesChart'
import { AXIS_GAP, BAR_GAP, X_AXIS_HEIGHT } from './chartGeometry'
import styles from './SalesChart.module.css'

// Центр подписи оси X — на 16 px ниже столбцов (зазор 8 + половина строки 16)
const X_TICK_MARGIN = 12
// Зазор между WB и Ozon в стопке (AC-6)
const STACK_GAP = 1

export type SalesChartPlotProps = {
  rows: ChartRow[]
  visible: SeriesVisibility
  width: number
  plotHeight: number
  plotLeft: number
  band: number
  yTicks: number[]
  xTicks: string[]
  formatY: (n: number) => string
  activeIndex: number | null
}

const formatTick = (date: string) => formatAxisDate(parseDay(date))

/**
 * Отрисовка Recharts: столбцы WB + Ozon стопкой, пунктир прошлого периода, оси, сетка и подсветка дня.
 * Лежит в отдельном файле, чтобы Recharts грузился отдельным чанком после KPI и фильтров.
 */
export function SalesChartPlot({
  rows,
  visible,
  width,
  plotHeight,
  plotLeft,
  band,
  yTicks,
  xTicks,
  formatY,
  activeIndex,
}: SalesChartPlotProps) {
  // Recharts вызывает shape как функцию отрисовки, а не как компонент
  const renderBar =
    (series: 'wb' | 'ozon') =>
    (props: BarShapeProps) => {
      const row = rows[props.index]
      const raw = props.height ?? 0
      let y = raw < 0 ? (props.y ?? 0) + raw : (props.y ?? 0)
      let h = Math.abs(raw)
      // Ozon лежит на WB: зазор — со стороны нуля, если под ним есть столбец WB того же знака
      if (series === 'ozon' && row && visible.wb && row.wb !== 0 && Math.sign(row.wb) === Math.sign(row.ozon)) {
        h = Math.max(0, h - STACK_GAP)
        if (row.ozon < 0) y += STACK_GAP
      }
      return (
        <Rectangle
          x={props.x}
          y={y}
          width={props.width}
          height={h}
          className={cx(
            series === 'wb' ? styles.wb : styles.ozon,
            activeIndex !== null && activeIndex !== props.index && styles.dimmed,
          )}
        />
      )
    }

  return (
    <ComposedChart
      width={width}
      height={plotHeight + X_AXIS_HEIGHT}
      data={rows}
      // Сверху без отступа: верхняя подпись оси Y выступает над областью, как в макете
      margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
      stackOffset="sign"
      barCategoryGap={`${BAR_GAP * 100}%`}
      // Фокус и стрелки — на обёртке с role="img" (SalesChart), второй точки фокуса не нужно
      accessibilityLayer={false}
    >
      <CartesianGrid vertical={false} />
      <XAxis
        dataKey="date"
        ticks={xTicks}
        interval={0}
        tickFormatter={formatTick}
        tickLine={false}
        axisLine={false}
        tickSize={0}
        tickMargin={X_TICK_MARGIN}
        height={X_AXIS_HEIGHT}
      />
      <YAxis
        ticks={yTicks}
        domain={[yTicks[0] ?? 0, yTicks.at(-1) ?? 0]}
        interval={0}
        tickFormatter={formatY}
        tickLine={false}
        axisLine={false}
        tickSize={0}
        tickMargin={AXIS_GAP}
        width={plotLeft}
        allowDataOverflow
      />
      {activeIndex !== null && (
        // Под столбцами, над сеткой — как курсор Recharts
        <ZIndexLayer zIndex={DefaultZIndexes.cursorRectangle}>
          <rect x={plotLeft + band * activeIndex} y={0} width={band} height={plotHeight} className={styles.highlight} />
        </ZIndexLayer>
      )}
      <ReferenceLine y={0} />
      {visible.wb && <Bar dataKey="wb" stackId="mp" isAnimationActive={false} shape={renderBar('wb')} />}
      {visible.ozon && <Bar dataKey="ozon" stackId="mp" isAnimationActive={false} shape={renderBar('ozon')} />}
      {visible.previous && (
        <Line
          dataKey="previous"
          type="linear"
          dot={false}
          activeDot={false}
          isAnimationActive={false}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}
    </ComposedChart>
  )
}
