// Тестовые фикстуры spec 002 «Фильтры в URL». Только для *.test.tsx в app/.
//
// /api/meta с фиксированным «сегодня» 04.11.2026 — как в макете Chrome.dc.html:
// период по умолчанию 05.10–03.11.2026, прошлый — 05.09–04.10.2026.
export const META_FIXTURE = {
  today: '2026-11-04',
  updatedAt: '2026-11-04T07:40:00+03:00',
  historyFrom: '2024-11-04',
  marketplaces: [
    { id: 'wb', name: 'WB' },
    { id: 'ozon', name: 'Ozon' },
  ],
  categories: [
    { id: 'shoes', name: 'Обувь', productCount: 48 },
    { id: 'clothing', name: 'Одежда', productCount: 112 },
    { id: 'electronics', name: 'Электроника', productCount: 37 },
    { id: 'beauty', name: 'Красота', productCount: 29 },
    { id: 'home', name: 'Дом и кухня', productCount: 54 },
    { id: 'sports', name: 'Спорт', productCount: 31 },
    { id: 'kids', name: 'Детские товары', productCount: 22 },
    { id: 'accessories', name: 'Аксессуары', productCount: 26 },
  ],
} as const

export const PRESET_LABELS = ['7 дней', '30 дней', '90 дней', 'Квартал', 'Год'] as const

export const MARKETPLACE_LABELS = ['Все', 'WB', 'Ozon'] as const

/** Тире U+2013 и средняя точка U+00B7 — как в макете. */
export const EN_DASH = '–'
export const MIDDOT = '·'

/** Экранирует строку для RegExp. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Имя кнопки-диапазона «Произвольный период: 05.10.2026 – 03.11.2026».
 * Пробелы вокруг тире могут быть неразрывными — допускаем любой пробельный символ.
 */
export function rangeButtonName(from: string, to: string): RegExp {
  return new RegExp(`^Произвольный период:\\s${escapeRegExp(from)}\\s${EN_DASH}\\s${escapeRegExp(to)}$`)
}

/** Параметры строки URL, отсортированные по ключу (порядок повторов cat сохраняется). */
export function sortedParams(searchStr: string): [string, string][] {
  return [...new URLSearchParams(searchStr)].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

/**
 * Подмена window.matchMedia: в jsdom её нет. `mobile` — ответ на запрос
 * '(max-width: 639px)', остальные запросы (тема и т. п.) — false.
 */
export function createMatchMedia(mobile: boolean): (query: string) => MediaQueryList {
  return (query: string) =>
    ({
      matches: mobile && query.replace(/\s/g, '') === '(max-width:639px)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}
