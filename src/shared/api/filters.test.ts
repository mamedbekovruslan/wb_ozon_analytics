// @vitest-environment node
import { describe, expect, it } from 'vitest'
// Импорт через public API слайса: пока реализации нет, падают отдельные тесты,
// а не весь файл целиком
import {
  parseFiltersSearch,
  parseSearchQuery,
  resolveFilters,
  stringifySearchQuery,
  toApiParams,
  type FiltersSearch,
} from './index'

/*
 * Модель фильтров в URL (spec 002, «Модель фильтров», «Расчёт дат»).
 * Ожидаемые даты посчитаны вручную по правилам spec:
 *   конец пресета = today − 1 день; 7/30/90 — начало = конец − (N − 1);
 *   q — первый день квартала конца; y — 1 января года конца;
 *   начало не раньше historyFrom;
 *   прошлый период — той же длины непосредственно перед текущим (docs/domain.md).
 */

const META = { today: '2026-11-04', historyFrom: '2024-11-04' }

const ALL_CATEGORIES = ['shoes', 'clothing', 'electronics', 'beauty', 'home', 'sports', 'kids', 'accessories'] as const

/** Полный путь: строка URL → сырые параметры → чистые фильтры → разрешённый период. */
function resolveUrl(query: string, meta: { today: string; historyFrom: string } = META) {
  return resolveFilters(parseFiltersSearch(parseSearchQuery(query)), meta)
}

/** Чистые фильтры из строки URL. */
function cleanUrl(query: string): FiltersSearch {
  return parseFiltersSearch(parseSearchQuery(query))
}

/** Проверяет, что результат разбора содержит только разрешённые ключи и значения (T4). */
function expectWellFormed(search: FiltersSearch): void {
  const allowedKeys = ['period', 'from', 'to', 'mp', 'cat', 'cmp']
  for (const key of Object.keys(search)) expect(allowedKeys).toContain(key)
  if (search.period !== undefined) expect(['7', '90', 'q', 'y']).toContain(search.period)
  if (search.mp !== undefined) expect(['wb', 'ozon']).toContain(search.mp)
  if (search.cmp !== undefined) expect(search.cmp).toBe('0')
  if (search.from !== undefined || search.to !== undefined) {
    expect(search.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(search.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  }
  if (search.cat !== undefined) {
    expect(search.cat.length).toBeGreaterThan(0)
    for (const id of search.cat) expect(ALL_CATEGORIES).toContain(id)
  }
}

describe('resolveFilters — значения по умолчанию', () => {
  it('AC-1: без параметров — «30 дней», все площадки, все категории, сравнение включено', () => {
    expect(resolveFilters({}, META)).toEqual({
      preset: '30',
      from: '2026-10-05',
      to: '2026-11-03',
      prevFrom: '2026-09-05',
      prevTo: '2026-10-04',
      mp: 'all',
      cat: [],
      compare: true,
    })
  })

  it('AC-1: пустая строка URL даёт те же фильтры, что и пустой объект', () => {
    expect(resolveUrl('')).toEqual(resolveFilters({}, META))
  })

  it('AC-1: cmp=0 выключает сравнение, остальное по умолчанию', () => {
    const r = resolveFilters({ cmp: '0' }, META)

    expect(r.compare).toBe(false)
    expect(r.preset).toBe('30')
    expect(r.mp).toBe('all')
  })

  it('AC-1: площадка и категории из URL переносятся как есть', () => {
    const r = resolveFilters({ mp: 'ozon', cat: ['shoes', 'sports'] }, META)

    expect(r.mp).toBe('ozon')
    expect(r.cat).toEqual(['shoes', 'sports'])
  })
})

describe('resolveFilters — пресеты периода', () => {
  it.each([
    ['7', '2026-10-28', '2026-11-03'],
    ['90', '2026-08-06', '2026-11-03'],
    ['q', '2026-10-01', '2026-11-03'],
    ['y', '2026-01-01', '2026-11-03'],
  ] as const)('AC-2: today = 2026-11-04, пресет %s → %s – %s', (period, from, to) => {
    const r = resolveFilters({ period }, META)

    expect(r.preset).toBe(period)
    expect(r.from).toBe(from)
    expect(r.to).toBe(to)
  })

  it('AC-2: пресет 30 (по умолчанию) → 05.10–03.11.2026', () => {
    const r = resolveFilters({}, META)

    expect([r.from, r.to]).toEqual(['2026-10-05', '2026-11-03'])
  })

  it('AC-2: период заканчивается вчера — данные за сегодня неполные', () => {
    for (const period of ['7', '90', 'q', 'y'] as const) {
      expect(resolveFilters({ period }, META).to).toBe('2026-11-03')
    }
  })

  it('AC-3: today = 2026-01-01 — квартал и год берутся по вчерашнему дню (прошлый год)', () => {
    const meta = { today: '2026-01-01', historyFrom: '2024-01-01' }

    const q = resolveFilters({ period: 'q' }, meta)
    expect([q.from, q.to]).toEqual(['2025-10-01', '2025-12-31'])

    const y = resolveFilters({ period: 'y' }, meta)
    expect([y.from, y.to]).toEqual(['2025-01-01', '2025-12-31'])
  })

  it('AC-3: 7 и 30 дней через границу года', () => {
    const meta = { today: '2026-01-05', historyFrom: '2024-01-05' }

    const d7 = resolveFilters({ period: '7' }, meta)
    expect([d7.from, d7.to]).toEqual(['2025-12-29', '2026-01-04'])

    // 06.12–31.12 — 26 дней, 01.01–04.01 — 4 дня
    const d30 = resolveFilters({}, meta)
    expect([d30.from, d30.to]).toEqual(['2025-12-06', '2026-01-04'])
  })

  it('AC-3: today = первый день квартала — квартал берётся предыдущий', () => {
    const april = resolveFilters({ period: 'q' }, { today: '2026-04-01', historyFrom: '2024-04-01' })
    expect([april.from, april.to]).toEqual(['2026-01-01', '2026-03-31'])

    const october = resolveFilters({ period: 'q' }, { today: '2026-10-01', historyFrom: '2024-10-01' })
    expect([october.from, october.to]).toEqual(['2026-07-01', '2026-09-30'])
  })

  it('AC-3: високосный год — 7 дней по 29.02.2024', () => {
    const r = resolveFilters({ period: '7' }, { today: '2024-03-01', historyFrom: '2022-03-01' })

    expect([r.from, r.to]).toEqual(['2024-02-23', '2024-02-29'])
  })

  it('AC-4: «Год» при historyFrom позже 1 января — начало = historyFrom', () => {
    const r = resolveFilters({ period: 'y' }, { today: '2026-11-04', historyFrom: '2026-03-15' })

    expect(r.preset).toBe('y')
    expect([r.from, r.to]).toEqual(['2026-03-15', '2026-11-03'])
  })

  it('AC-4: «90 дней» при короткой истории — начало = historyFrom, пресет остаётся выбранным', () => {
    const r = resolveFilters({ period: '90' }, { today: '2026-11-04', historyFrom: '2026-09-01' })

    expect(r.preset).toBe('90')
    expect([r.from, r.to]).toEqual(['2026-09-01', '2026-11-03'])
  })

  it('AC-4: прошлый период считается от обрезанного периода (234 дня перед 15.03.2026)', () => {
    // 15.03–03.11.2026: 17 + 30 + 31 + 30 + 31 + 31 + 30 + 31 + 3 = 234 дня
    const r = resolveFilters({ period: 'y' }, { today: '2026-11-04', historyFrom: '2026-03-15' })

    expect([r.prevFrom, r.prevTo]).toEqual(['2025-07-24', '2026-03-14'])
  })

  it('AC-4: historyFrom ровно в начале пресета — начало не меняется', () => {
    const r = resolveFilters({}, { today: '2026-11-04', historyFrom: '2026-10-05' })

    expect([r.from, r.to]).toEqual(['2026-10-05', '2026-11-03'])
  })
})

describe('resolveFilters — прошлый период', () => {
  it('AC-5: для 05.10–03.11.2026 (30 дней) — 05.09–04.10.2026', () => {
    const r = resolveFilters({}, META)

    expect([r.prevFrom, r.prevTo]).toEqual(['2026-09-05', '2026-10-04'])
  })

  it.each([
    // 7 дней: 28.10–03.11 → 21.10–27.10
    ['7', '2026-10-21', '2026-10-27'],
    // 90 дней: 06.08–03.11 → 08.05–05.08 (24 + 30 + 31 + 5 = 90)
    ['90', '2026-05-08', '2026-08-05'],
    // Квартал: 01.10–03.11 = 34 дня → 28.08–30.09
    ['q', '2026-08-28', '2026-09-30'],
    // Год: 01.01–03.11.2026 = 307 дней → 28.02–31.12.2025 (день 59…365 невисокосного года)
    ['y', '2025-02-28', '2025-12-31'],
  ] as const)('AC-5: пресет %s — прошлый период той же длины: %s – %s', (period, prevFrom, prevTo) => {
    const r = resolveFilters({ period }, META)

    expect([r.prevFrom, r.prevTo]).toEqual([prevFrom, prevTo])
  })

  it('AC-5: период из одного дня — прошлый период тоже один день, накануне', () => {
    const r = resolveFilters({ from: '2026-11-04', to: '2026-11-04' }, META)

    expect([r.prevFrom, r.prevTo]).toEqual(['2026-11-03', '2026-11-03'])
  })
})

describe('resolveFilters — свой период', () => {
  it('AC-6: валидные from и to → свой период, period игнорируется', () => {
    const r = resolveFilters({ period: '7', from: '2026-10-01', to: '2026-10-10' }, META)

    expect(r.preset).toBeNull()
    expect([r.from, r.to]).toEqual(['2026-10-01', '2026-10-10'])
    // 10 дней → 10 дней перед 01.10
    expect([r.prevFrom, r.prevTo]).toEqual(['2026-09-21', '2026-09-30'])
  })

  it('AC-6: границы включительно — from = historyFrom и to = сегодня валидны', () => {
    const r = resolveFilters({ from: '2024-11-04', to: '2026-11-04' }, META)

    expect(r.preset).toBeNull()
    expect([r.from, r.to]).toEqual(['2024-11-04', '2026-11-04'])
  })

  it('AC-6: свой период через строку URL', () => {
    const r = resolveUrl('?period=90&from=2026-10-01&to=2026-10-10')

    expect(r.preset).toBeNull()
    expect([r.from, r.to]).toEqual(['2026-10-01', '2026-10-10'])
  })

  it.each([
    ['несуществующая дата 2026-02-30', '?from=2026-02-30&to=2026-03-05'],
    ['29 февраля невисокосного года', '?from=2025-02-29&to=2025-03-05'],
    ['31 апреля', '?from=2026-04-31&to=2026-05-05'],
    ['13-й месяц', '?from=2026-13-01&to=2026-10-05'],
    ['нулевой месяц', '?from=2026-00-10&to=2026-10-05'],
    ['from позже to', '?from=2026-10-10&to=2026-10-01'],
    ['to позже сегодня', '?from=2026-11-01&to=2026-11-05'],
    ['from раньше historyFrom', '?from=2024-11-03&to=2024-11-10'],
    ['задана только from', '?from=2026-10-01'],
    ['задана только to', '?to=2026-10-10'],
    ['формат ДД.ММ.ГГГГ', '?from=01.10.2026&to=10.10.2026'],
    ['без ведущих нулей', '?from=2026-10-1&to=2026-10-10'],
    ['пустые значения', '?from=&to='],
    ['очень далёкое будущее', '?from=9999-12-30&to=9999-12-31'],
    ['очень далёкое прошлое', '?from=0001-01-01&to=2026-10-10'],
  ])('AC-7: %s → пресет по умолчанию «30 дней»', (_title, query) => {
    const r = resolveUrl(query)

    expect(r.preset).toBe('30')
    expect([r.from, r.to]).toEqual(['2026-10-05', '2026-11-03'])
    expect([r.prevFrom, r.prevTo]).toEqual(['2026-09-05', '2026-10-04'])
  })

  it.each([
    ['from позже to', '?period=7&from=2026-10-10&to=2026-10-01'],
    ['несуществующая дата', '?period=7&from=2026-02-30&to=2026-03-05'],
    ['to позже сегодня', '?period=7&from=2026-11-01&to=2026-11-05'],
    ['from раньше historyFrom', '?period=7&from=2024-11-03&to=2024-11-10'],
    ['только from', '?period=7&from=2026-10-01'],
  ])('AC-7: %s + валидный period=7 → пресет «7 дней» (28.10–03.11)', (_title, query) => {
    const r = resolveUrl(query)

    expect(r.preset).toBe('7')
    expect([r.from, r.to]).toEqual(['2026-10-28', '2026-11-03'])
    expect([r.prevFrom, r.prevTo]).toEqual(['2026-10-21', '2026-10-27'])
  })

  it('AC-7: невалидный свой период + валидный period=q (через resolveFilters напрямую) → «Квартал»', () => {
    const r = resolveFilters({ period: 'q', from: '2026-10-10', to: '2026-10-01' }, META)

    expect(r.preset).toBe('q')
    expect([r.from, r.to]).toEqual(['2026-10-01', '2026-11-03'])
  })

  it.each([
    ['мусор в period', `?period=${encodeURIComponent('<script>')}&from=2026-10-10&to=2026-10-01`],
    ['period=14', '?period=14&from=2026-02-30&to=2026-03-05'],
    ['period=30 (по умолчанию)', '?period=30&from=2026-11-01&to=2026-11-05'],
  ])('AC-7: невалидный свой период + %s → «30 дней»', (_title, query) => {
    const r = resolveUrl(query)

    expect(r.preset).toBe('30')
    expect([r.from, r.to]).toEqual(['2026-10-05', '2026-11-03'])
  })

  it('AC-7: невалидный свой период не сбрасывает площадку, категории и сравнение', () => {
    const r = resolveUrl('?from=2026-10-10&to=2026-10-01&mp=wb&cat=shoes&cmp=0')

    expect(r.preset).toBe('30')
    expect(r.mp).toBe('wb')
    expect(r.cat).toEqual(['shoes'])
    expect(r.compare).toBe(false)
  })
})

describe('parseFiltersSearch — разбор и очистка параметров URL', () => {
  it('AC-1: пустой объект → пустой объект', () => {
    expect(parseFiltersSearch({})).toEqual({})
  })

  it('AC-1, AC-13: значения по умолчанию отбрасываются (period=30, mp=all, cmp не 0)', () => {
    expect(parseFiltersSearch({ period: '30' })).toEqual({})
    expect(parseFiltersSearch({ mp: 'all' })).toEqual({})
    expect(parseFiltersSearch({ cmp: '1' })).toEqual({})
    expect(parseFiltersSearch({ period: '30', mp: 'all', cmp: '1' })).toEqual({})
  })

  it('AC-14: полный валидный набор сохраняется без изменений', () => {
    const search = { period: '7', mp: 'wb', cat: ['shoes', 'sports'], cmp: '0' }

    expect(parseFiltersSearch(search)).toEqual(search)
  })

  it.each(['7', '90', 'q', 'y'])('AC-2: пресет %s сохраняется', (period) => {
    expect(parseFiltersSearch({ period })).toEqual({ period })
  })

  it('AC-6: валидная пара from/to сохраняется', () => {
    expect(parseFiltersSearch({ from: '2026-10-01', to: '2026-10-10' })).toEqual({
      from: '2026-10-01',
      to: '2026-10-10',
    })
  })

  it('AC-7: только одна из дат → обе отбрасываются', () => {
    expect(parseFiltersSearch({ from: '2026-10-01' })).toEqual({})
    expect(parseFiltersSearch({ to: '2026-10-10' })).toEqual({})
  })

  it('AC-7: несуществующая дата отбрасывается вместе с парой', () => {
    expect(parseFiltersSearch({ from: '2026-02-30', to: '2026-03-05' })).toEqual({})
    expect(parseFiltersSearch({ from: '2026-03-01', to: '2026-02-30' })).toEqual({})
  })

  it('AC-7: 29 февраля високосного года — существующая дата', () => {
    expect(parseFiltersSearch({ from: '2024-02-29', to: '2024-03-05' })).toEqual({
      from: '2024-02-29',
      to: '2024-03-05',
    })
  })

  it('AC-8: ?mp=hack&cat=shoes → площадка отброшена, «Обувь» сохранена', () => {
    expect(cleanUrl('?mp=hack&cat=shoes')).toEqual({ cat: ['shoes'] })
  })

  it.each([
    ['?mp=hack', 'mp'],
    ['?mp=WB', 'mp'],
    [`?period=${encodeURIComponent('<script>')}`, 'period'],
    ['?period=14', 'period'],
    ['?period=99999999999999999999', 'period'],
    ['?cat=unknown', 'cat'],
    ['?cmp=yes', 'cmp'],
    ['?cmp=false', 'cmp'],
    [`?from=${encodeURIComponent('<script>')}&to=2026-10-10`, 'from'],
  ])('AC-8: мусор %s → параметр %s отброшен', (query, key) => {
    const result = cleanUrl(query)

    expect(result).not.toHaveProperty(key)
    expectWellFormed(result)
  })

  it('AC-8: мусор во всех параметрах сразу, рядом с валидными — валидные сохраняются', () => {
    const result = cleanUrl(
      `?period=${encodeURIComponent('<script>')}&mp=wb&cat=unknown&cat=sports&cmp=yes&from=x&to=2026-10-10`,
    )

    expect(result).toEqual({ mp: 'wb', cat: ['sports'] })
  })

  it('AC-8: JSON-кавычки — не формат URL: ?mp=%22wb%22 отбрасывается', () => {
    expect(cleanUrl('?mp=%22wb%22')).toEqual({})
  })

  it('AC-9: неизвестные и повторяющиеся категории отбрасываются, порядок — как в справочнике', () => {
    expect(cleanUrl('?cat=sports&cat=shoes&cat=shoes&cat=x')).toEqual({ cat: ['shoes', 'sports'] })
  })

  it('AC-9: cat принимает и строку, и массив', () => {
    expect(parseFiltersSearch({ cat: 'shoes' })).toEqual({ cat: ['shoes'] })
    expect(parseFiltersSearch({ cat: ['home', 'beauty'] })).toEqual({ cat: ['beauty', 'home'] })
  })

  it('AC-9: все 8 категорий вперемешку → порядок справочника', () => {
    const shuffled = ['accessories', 'home', 'shoes', 'kids', 'beauty', 'sports', 'electronics', 'clothing']

    expect(parseFiltersSearch({ cat: shuffled })).toEqual({ cat: [...ALL_CATEGORIES] })
  })

  it('AC-9: только неизвестные или пустой список → cat не попадает в результат', () => {
    expect(parseFiltersSearch({ cat: ['x', 'y'] })).toEqual({})
    expect(parseFiltersSearch({ cat: [] })).toEqual({})
    expect(parseFiltersSearch({ cat: '' })).toEqual({})
  })

  it('AC-9: очень длинный список повторов сворачивается в одну категорию', () => {
    expect(parseFiltersSearch({ cat: Array.from({ length: 10_000 }, () => 'shoes') })).toEqual({ cat: ['shoes'] })
  })

  it('AC-10: неизвестные параметры удаляются', () => {
    expect(parseFiltersSearch({ foo: 'bar', utm_source: 'mail', mp: 'ozon' })).toEqual({ mp: 'ozon' })
  })

  it.each<[string, Record<string, unknown>]>([
    ['числа вместо строк', { period: 7, cmp: 0, mp: 1 }],
    ['null и undefined', { period: null, mp: undefined, cat: null, from: null, to: undefined }],
    ['объекты и массивы', { period: { a: 1 }, mp: ['wb', 'ozon'], cat: { 0: 'shoes' }, from: ['2026-10-01'] }],
    ['булевы значения', { cmp: false, period: true }],
    ['вложенный массив категорий', { cat: [['shoes'], 42, null, 'sports'] }],
    ['очень длинная строка', { period: '7'.repeat(100_000), mp: 'w'.repeat(100_000) }],
  ])('T4: %s — не бросает исключений, результат только из разрешённых значений', (_title, raw) => {
    let result: FiltersSearch = {}
    expect(() => {
      result = parseFiltersSearch(raw)
    }).not.toThrow()
    expectWellFormed(result)
  })

  it('T4: попытка подмены прототипа через URL не влияет на объекты', () => {
    const raw = parseSearchQuery('?__proto__=polluted&constructor=x&prototype=y&mp=wb')
    const result = parseFiltersSearch(raw)

    expect(result).toEqual({ mp: 'wb' })
    expect(Object.prototype).not.toHaveProperty('polluted')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('parseSearchQuery / stringifySearchQuery — формат URL', () => {
  it('AC-14: одиночное значение — строка, повтор — массив', () => {
    expect(parseSearchQuery('?mp=wb&cat=shoes&cat=sports')).toEqual({ mp: 'wb', cat: ['shoes', 'sports'] })
  })

  it('AC-14: значения — обычный текст: period=7 — строка «7», а не число', () => {
    expect(parseSearchQuery('?period=7&cmp=0')).toEqual({ period: '7', cmp: '0' })
  })

  it('AC-8: значение в JSON-кавычках не расшифровывается как JSON', () => {
    expect(parseSearchQuery('?mp=%22wb%22')).toEqual({ mp: '"wb"' })
  })

  it('AC-8: процент-кодирование расшифровывается в обычный текст', () => {
    expect(parseSearchQuery(`?period=${encodeURIComponent('<script>')}`)).toEqual({ period: '<script>' })
  })

  it('AC-1: пустая строка → пустой объект', () => {
    expect(parseSearchQuery('')).toEqual({})
  })

  it('T4: битое процент-кодирование не роняет разбор', () => {
    expect(() => parseSearchQuery('?mp=%E0%A4%A&cat=%')).not.toThrow()
  })

  it('AC-13: пустой объект → пустая строка (значения по умолчанию в URL не пишутся)', () => {
    expect(stringifySearchQuery({})).toBe('')
  })

  it('AC-13: undefined пропускается', () => {
    expect(stringifySearchQuery({ period: '7', mp: undefined })).toBe('?period=7')
    expect(stringifySearchQuery({ mp: undefined })).toBe('')
  })

  it('AC-12: массив пишется повторяющимся ключом, ключи — в порядке объекта', () => {
    expect(stringifySearchQuery({ mp: 'wb', cat: ['shoes', 'sports'] })).toBe('?mp=wb&cat=shoes&cat=sports')
    expect(stringifySearchQuery({ period: '7', mp: 'wb', cat: ['shoes', 'sports'], cmp: '0' })).toBe(
      '?period=7&mp=wb&cat=shoes&cat=sports&cmp=0',
    )
  })

  it('AC-12: значения — обычный текст, без JSON-кавычек (%22)', () => {
    const query = stringifySearchQuery({ mp: 'wb', from: '2026-10-05', to: '2026-11-03' })

    expect(query).toBe('?mp=wb&from=2026-10-05&to=2026-11-03')
    expect(query).not.toContain('%22')
    expect(query).not.toContain('"')
  })

  it('AC-14: туда-обратно без потерь', () => {
    const search = { period: 'q', mp: 'ozon', cat: ['shoes', 'kids'], cmp: '0' }

    expect(parseSearchQuery(stringifySearchQuery(search))).toEqual(search)
  })

  it('T4: спецсимволы в значении кодируются и не ломают соседние параметры', () => {
    const query = stringifySearchQuery({ q: 'a&mp=hack#x', mp: 'wb' })

    expect(parseSearchQuery(query)).toEqual({ q: 'a&mp=hack#x', mp: 'wb' })
  })
})

describe('toApiParams — параметры запроса к /api/...', () => {
  it('AC-16: все площадки, без категорий → from, to, mp=all; cat нет', () => {
    const params = toApiParams({ from: '2026-10-05', to: '2026-11-03', mp: 'all', cat: [] })

    expect(params.get('from')).toBe('2026-10-05')
    expect(params.get('to')).toBe('2026-11-03')
    expect(params.get('mp')).toBe('all')
    expect(params.has('cat')).toBe(false)
    expect([...params.keys()].sort()).toEqual(['from', 'mp', 'to'])
  })

  it('AC-16: площадка и несколько категорий — cat повторяется', () => {
    const params = toApiParams({ from: '2026-10-28', to: '2026-11-03', mp: 'wb', cat: ['shoes', 'sports'] })

    expect(params.get('mp')).toBe('wb')
    expect(params.getAll('cat')).toEqual(['shoes', 'sports'])
    expect(params.toString()).not.toContain('%22')
  })

  it('AC-16: ozon и одна категория', () => {
    const params = toApiParams({ from: '2026-10-01', to: '2026-11-03', mp: 'ozon', cat: ['electronics'] })

    expect(params.get('mp')).toBe('ozon')
    expect(params.getAll('cat')).toEqual(['electronics'])
  })

  it('AC-16: прямо из разрешённых фильтров URL', () => {
    const params = toApiParams(resolveUrl('?period=7&mp=wb&cat=sports&cat=shoes&cmp=0'))

    expect(params.get('from')).toBe('2026-10-28')
    expect(params.get('to')).toBe('2026-11-03')
    expect(params.get('mp')).toBe('wb')
    expect(params.getAll('cat')).toEqual(['shoes', 'sports'])
    // Сравнение — настройка отображения, в запрос не уходит
    expect(params.has('cmp')).toBe(false)
    expect(params.has('period')).toBe(false)
  })
})
