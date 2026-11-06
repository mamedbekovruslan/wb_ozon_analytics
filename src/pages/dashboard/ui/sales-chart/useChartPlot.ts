import { useEffect, useState, type ComponentType } from 'react'
import type { SalesChartPlotProps } from './SalesChartPlot'

type Plot = ComponentType<SalesChartPlotProps>
type PlotState = { plot: Plot | null; failed: boolean; retry: () => void }

// Recharts — самая тяжёлая часть дашборда: грузим его отдельным чанком, чтобы KPI и фильтры
// показывались, не дожидаясь графика (решение пользователя 2026-11-06). Один запрос на приложение.
let loaded: Plot | null = null
let pending: Promise<Plot> | null = null

function load(): Promise<Plot> {
  pending ??= import('./SalesChartPlot').then(
    (m) => (loaded = m.SalesChartPlot),
    (error: unknown) => {
      // Чанк не загрузился (сеть, новый деплой) — следующая попытка начнётся заново
      pending = null
      throw error
    },
  )
  return pending
}

/** Компонент отрисовки графика, когда его чанк загружен; до этого блок показывает скелетон. */
export function useChartPlot(): PlotState {
  const [plot, setPlot] = useState<Plot | null>(() => loaded)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (plot) return
    let alive = true
    load().then(
      (p) => alive && setPlot(() => p),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [plot, attempt])

  const retry = () => {
    setFailed(false)
    setAttempt((n) => n + 1)
  }
  return { plot, failed, retry }
}
