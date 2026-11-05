import { delay, http, HttpResponse, type JsonBodyType } from 'msw'
import { z } from 'zod'
import { kpi, ordersPage, salesDaily, stocks, topProducts } from './aggregators'
import { CATEGORIES, CATEGORY_IDS, MARKETPLACES, type CategoryId, type Order, type StockRow } from './domain'
import { generateRawData, historyFromOf } from './generator'
import { isValidDate, mskToday, toMskIso } from './lib/dates'
import { ozonAdapter } from './ozon'
import { wbAdapter } from './wb'

// Фейковый BFF (ADR-0004, ADR-0010): эндпоинты /api/... по контракту spec 001.
// Отдаёт только агрегаты и страницы таблиц — никогда все сырые записи.

/** Seed проекта: одинаковые данные в dev, демо и тестах. */
export const PROJECT_SEED = 20_261_104

type Dataset = { today: string; historyFrom: string; orders: Order[]; stockRows: StockRow[] }

// --- Проверка параметров (T4): мусор → 400 с понятным текстом, без эха ввода ---

class BadRequest extends Error {}

const dateParam = (name: string) =>
  z.string({ error: `Не указан параметр ${name}` }).refine(isValidDate, { error: `Параметр ${name}: нужна дата в формате ГГГГ-ММ-ДД` })

const mpParam = z.enum(['all', 'wb', 'ozon'], { error: 'Неизвестная площадка: допустимо all, wb или ozon' }).default('all')

const catParam = z.array(z.enum(CATEGORY_IDS as [CategoryId, ...CategoryId[]], { error: 'Неизвестная категория' }))

const intParam = (name: string, max: number) =>
  z.coerce
    .number({ error: `Параметр ${name}: нужно целое число` })
    .int({ error: `Параметр ${name}: нужно целое число` })
    .min(0, { error: `Параметр ${name} не может быть отрицательным` })
    .max(max, { error: `Параметр ${name}: не больше ${max}` })

/** Первое сообщение zod — уже на русском и без технических деталей. */
function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input)
  if (!result.success) throw new BadRequest(result.error.issues[0]?.message ?? 'Неверные параметры запроса')
  return result.data
}

/** Пустое значение (`?limit=`) — то же, что отсутствие параметра. */
const optional = (params: URLSearchParams, name: string) => params.get(name) || undefined

/** Категории повторяются (`?cat=shoes&cat=sports`); пустое `cat=` не считается категорией. */
const categories = (params: URLSearchParams) => params.getAll('cat').filter(Boolean)

function readFilters(params: URLSearchParams, d: Pick<Dataset, 'today' | 'historyFrom'>) {
  const parsed = parseOrThrow(
    z.object({ from: dateParam('from'), to: dateParam('to'), mp: mpParam, cat: catParam }),
    { from: optional(params, 'from'), to: optional(params, 'to'), mp: optional(params, 'mp'), cat: categories(params) },
  )
  if (parsed.from > parsed.to) throw new BadRequest('Начало периода позже его конца')
  if (parsed.to > d.today) throw new BadRequest('Конец периода позже сегодняшнего дня')
  // Период не шире истории: иначе ряд по дням разрастается до сотен тысяч точек
  if (parsed.from < d.historyFrom) throw new BadRequest('За это время данных нет: история начинается 24 месяца назад')
  return parsed
}

// --- Обработчики ---

export function createHandlers({ seed, now }: { seed: number; now: Date }) {
  const today = mskToday(now)
  let dataset: Dataset | null = null

  // Генерация — при первом запросе, дальше данные в памяти (ADR-0004)
  const data = (): Dataset => {
    if (!dataset) {
      const raw = generateRawData({ seed, today, now })
      const wb = wbAdapter(raw.wb, raw.catalog)
      const ozon = ozonAdapter(raw.ozon, raw.catalog)
      dataset = { today, historyFrom: historyFromOf(today), orders: [...wb.orders, ...ozon.orders], stockRows: [...wb.stocks, ...ozon.stocks] }
    }
    return dataset
  }

  const route = (path: string, handle: (params: URLSearchParams, d: Dataset) => JsonBodyType) =>
    http.get(path, async ({ request }) => {
      // Небольшая задержка: в браузере видны состояния загрузки, в Node почти мгновенно
      await delay()
      try {
        return HttpResponse.json(handle(new URL(request.url).searchParams, data()))
      } catch (error) {
        if (error instanceof BadRequest) return HttpResponse.json({ message: error.message }, { status: 400 })
        // Непредвиденная ошибка — без стека и внутренних путей (security.md);
        // подробности — только в консоли разработчика
        console.error(error)
        return HttpResponse.json({ message: 'Внутренняя ошибка фейкового API' }, { status: 500 })
      }
    })

  return [
    route('/api/meta', (_params, d) => ({
      today: d.today,
      updatedAt: toMskIso(now.getTime()),
      historyFrom: d.historyFrom,
      marketplaces: MARKETPLACES.map(({ id, name }) => ({ id, name })),
      categories: CATEGORIES.map(({ id, name }) => ({ id, name })),
    })),

    route('/api/kpi', (params, d) => kpi(d.orders, readFilters(params, d))),

    route('/api/sales-daily', (params, d) => salesDaily(d.orders, readFilters(params, d))),

    route('/api/top-products', (params, d) => {
      const filters = readFilters(params, d)
      const options = parseOrThrow(
        z.object({
          sort: z.enum(['revenue', 'orders', 'buyoutRate', 'profit'], { error: 'Неизвестная сортировка' }).default('revenue'),
          limit: intParam('limit', 50).default(10),
        }),
        { sort: optional(params, 'sort'), limit: optional(params, 'limit') },
      )
      return topProducts(d.orders, filters, options)
    }),

    // Остатки — на «сегодня»: период к ним не относится, from/to игнорируются
    route('/api/stocks', (params, d) => {
      const options = parseOrThrow(
        z.object({
          mp: mpParam,
          cat: catParam,
          status: z.enum(['critical', 'soon', 'ok', 'noSales'], { error: 'Неизвестный статус запаса' }).optional(),
          limit: intParam('limit', 10_000).optional(),
        }),
        { mp: optional(params, 'mp'), cat: categories(params), status: optional(params, 'status'), limit: optional(params, 'limit') },
      )
      return stocks(d.stockRows, d.orders, { today: d.today, ...options })
    }),

    route('/api/orders', (params, d) => {
      const filters = readFilters(params, d)
      const options = parseOrThrow(
        z.object({
          q: z.string().max(100, { error: 'Слишком длинный поисковый запрос' }).optional(),
          status: z.enum(['inTransit', 'bought', 'cancelled', 'returned'], { error: 'Неизвестный статус заказа' }).optional(),
          sort: z.enum(['date', 'price'], { error: 'Неизвестная сортировка' }).default('date'),
          dir: z.enum(['asc', 'desc'], { error: 'Неизвестное направление сортировки' }).default('desc'),
          offset: intParam('offset', Number.MAX_SAFE_INTEGER).default(0),
          // Не больше 200 строк за раз: клиент не получает все записи
          limit: intParam('limit', 200).default(50),
        }),
        {
          q: optional(params, 'q'),
          status: optional(params, 'status'),
          sort: optional(params, 'sort'),
          dir: optional(params, 'dir'),
          offset: optional(params, 'offset'),
          limit: optional(params, 'limit'),
        },
      )
      return ordersPage(d.orders, { ...filters, ...options })
    }),
  ]
}

export const handlers = createHandlers({ seed: PROJECT_SEED, now: new Date() })
