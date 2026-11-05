// Склады WB, которые изображает генератор (docs/domain/wb-api.md, «Расхождения»):
// по названиям, как в макетах и как WB отдавал до 15.08.2026.
export const WB_WAREHOUSES = [
  { name: 'Коледино', id: 507, region: 'Центральный' },
  { name: 'Электросталь', id: 120762, region: 'Центральный' },
  { name: 'Подольск', id: 117501, region: 'Центральный' },
  { name: 'Казань', id: 117986, region: 'Приволжский' },
  { name: 'Краснодар', id: 130744, region: 'Южный' },
  { name: 'Екатеринбург', id: 1733, region: 'Уральский' },
  { name: 'Тула', id: 206348, region: 'Центральный' },
  { name: 'Новосибирск', id: 686, region: 'Сибирский' },
] as const

export function wbWarehouse(name: string): (typeof WB_WAREHOUSES)[number] {
  const warehouse = WB_WAREHOUSES.find((w) => w.name === name)
  if (!warehouse) throw new Error(`Незнакомый склад WB: ${name}`)
  return warehouse
}
