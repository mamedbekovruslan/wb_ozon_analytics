import { MOBILE_QUERY, useMediaQuery } from '../../../../shared/lib'

const DESKTOP_QUERY = '(min-width: 1200px)'

export type SalesChartLayout = {
  /** Высота области столбцов без подписей оси X (DESIGN_SPEC § 2) */
  plotHeight: number
  /** Ширина колонки подписей оси Y */
  yAxisWidth: number
  /** Сколько подписей дней на оси X (Guidelines: 4–7) */
  xTickCount: number
}

const DESKTOP: SalesChartLayout = { plotHeight: 260, yAxisWidth: 52, xTickCount: 7 }
const TABLET: SalesChartLayout = { plotHeight: 220, yAxisWidth: 52, xTickCount: 6 }
const MOBILE: SalesChartLayout = { plotHeight: 180, yAxisWidth: 44, xTickCount: 4 }

/** Размеры графика по ширине экрана (Dashboard.dc.html, `L.chartH`, `L.yW`, `xIdx`). */
export function useSalesChartLayout(): SalesChartLayout {
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const mobile = useMediaQuery(MOBILE_QUERY)
  return desktop ? DESKTOP : mobile ? MOBILE : TABLET
}
