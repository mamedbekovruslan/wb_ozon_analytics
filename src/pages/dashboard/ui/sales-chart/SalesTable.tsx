import { formatDayMonthLong } from '../../../../shared/lib'
import { SALES_METRICS, type SalesDay, type SalesMetric, type SeriesVisibility } from '../../model/salesChart'

type SalesTableProps = {
  days: readonly SalesDay[]
  metric: SalesMetric
  visible: SeriesVisibility
}

/** Данные графика таблицей для скринридера (Guidelines, доступность): визуально скрыта. */
export function SalesTable({ days, metric, visible }: SalesTableProps) {
  const { label, format } = SALES_METRICS[metric]
  // sr-only — на обёртке: сама таблица не сжимается до 1 px и растянула бы страницу на телефоне
  return (
    <div className="sr-only">
      <table>
        <caption>Продажи по дням: {label}</caption>
        <thead>
          <tr>
            <th scope="col">Дата</th>
            {visible.wb && <th scope="col">WB</th>}
            {visible.ozon && <th scope="col">Ozon</th>}
            <th scope="col">Итого</th>
            {visible.previous && <th scope="col">Прошлый период</th>}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row">{formatDayMonthLong(day.date, true)}</th>
              {visible.wb && <td>{format(day.wb[metric])}</td>}
              {visible.ozon && <td>{format(day.ozon[metric])}</td>}
              <td>{format(day.total[metric])}</td>
              {visible.previous && <td>{format(day.previousTotal[metric])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
