// Справочник складов Ozon нашего BFF (docs/domain/ozon-api.md, «Склады»).

/** warehouse_name в API → название в продукте (как в макетах). */
export const OZON_FBO_WAREHOUSES: Readonly<Record<string, { id: number; name: string }>> = {
  ХОРУГВИНО_РФЦ: { id: 1020000101, name: 'Хоругвино' },
  ПУШКИНО_1_РФЦ: { id: 1020000102, name: 'Пушкино' },
  ГРИВНО_РФЦ: { id: 1020000103, name: 'Гривно' },
  КАЗАНЬ_РФЦ: { id: 1020000104, name: 'Казань' },
  НОВОСИБИРСК_РФЦ: { id: 1020000105, name: 'Новосибирск' },
}

/** Склад продавца для FBS — настройка магазина, а не данные API. */
export const OZON_SELLER_WAREHOUSE = { id: 1020005003107121, name: 'Склад продавца, Москва' } as const

/** Наши названия складов FBO — для генератора. */
export const OZON_FBO_NAMES: readonly string[] = Object.values(OZON_FBO_WAREHOUSES).map((w) => w.name)

/** Обратный поиск для генератора: «Хоругвино» → ХОРУГВИНО_РФЦ и ID склада. */
export function fboWarehouseByName(name: string): { apiName: string; id: number } {
  const entry = Object.entries(OZON_FBO_WAREHOUSES).find(([, w]) => w.name === name)
  if (!entry) throw new Error(`склад ${name} нет в справочнике Ozon`)
  return { apiName: entry[0], id: entry[1].id }
}

export function fboWarehouseName(apiName: string): string {
  const warehouse = OZON_FBO_WAREHOUSES[apiName]
  if (!warehouse) throw new Error(`Незнакомый склад Ozon: ${apiName}`)
  return warehouse.name
}

export function sellerWarehouseName(warehouseId: number): string {
  if (warehouseId !== OZON_SELLER_WAREHOUSE.id) throw new Error(`Незнакомый склад продавца Ozon: ${warehouseId}`)
  return OZON_SELLER_WAREHOUSE.name
}
