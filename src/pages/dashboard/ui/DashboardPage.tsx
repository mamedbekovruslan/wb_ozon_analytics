import { FilterBar } from '../../../widgets/filter-bar'
import { DashboardHeader } from './DashboardHeader'
import styles from './DashboardPage.module.css'
import { KpiPanel } from './kpi/KpiPanel'
import { LowStockPanel } from './low-stock/LowStockPanel'
import { SalesChartPanel } from './sales-chart/SalesChartPanel'
import { TopProductsPanel } from './top-products/TopProductsPanel'

// Панель фильтров стоит здесь, пока нет шапки (spec 002). Блоки дашборда — внутри страницы,
// пока они нужны только ей (ADR-0003, «сначала страница»). На ≥ 1200 график и «Скоро
// закончится» — в одной строке (DESIGN_SPEC § 2, spec 007); топ — всегда на всю ширину.
export function DashboardPage() {
  return (
    <>
      <FilterBar />
      <main className={styles.page}>
        <DashboardHeader />
        <KpiPanel />
        <div className={styles.chartRow}>
          <SalesChartPanel />
          <LowStockPanel />
        </div>
        <TopProductsPanel />
      </main>
    </>
  )
}
