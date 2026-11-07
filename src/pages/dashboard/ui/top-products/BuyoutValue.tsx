import { formatPercent } from '../../../../shared/lib'

/** % выкупа; без завершённых заказов значения нет — «—», скринридеру «нет данных» (spec 006). */
export function BuyoutValue({ value }: { value: number | null }) {
  if (value !== null) return formatPercent(value)
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">нет данных</span>
    </>
  )
}
