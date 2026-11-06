import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { generateRawData } from '../generator'
import { createHandlers } from '../handlers'
import { createApiCore, type ApiResult } from './core'

/*
 * Spec 003, ядро API: функция «путь + строка запроса → { status, body }».
 *
 * Среда jsdom (по умолчанию), а не node: для сравнения с текущими
 * MSW-обработчиками `createHandlers` (относительные пути `/api/...`) нужен
 * location.origin — в чистом Node MSW относительный путь с абсолютным
 * адресом запроса не сопоставляет. Само ядро от среды не зависит.
 *
 * «Сейчас» — 04.11.2026 22:30 UTC = 05.11.2026 01:30 по Москве,
 * «сегодня» — 05.11.2026 (как в handlers.test.ts).
 */

// Подмена агрегатора KPI: по флагу бросает ошибку со «стеком» и путём —
// так проверяется AC-3 (непредвиденная ошибка не утекает наружу)
const failure = vi.hoisted(() => ({ kpi: false }))
vi.mock('../aggregators/kpi', async (importOriginal) => {
  const original = await importOriginal<typeof import('../aggregators/kpi')>()
  return {
    ...original,
    kpi: (...args: Parameters<typeof original.kpi>) => {
      if (failure.kpi) throw new TypeError('boom: Cannot read properties of undefined at C:\\src\\mocks\\aggregators\\kpi.ts:42')
      return original.kpi(...args)
    },
  }
})

// Счётчик вызовов генератора: AC-7 (генерация один раз, warmUp идемпотентен)
vi.mock('../generator', async (importOriginal) => {
  const original = await importOriginal<typeof import('../generator')>()
  return { ...original, generateRawData: vi.fn(original.generateRawData) }
})
const generateSpy = vi.mocked(generateRawData)

const SEED = 42
const NOW = new Date('2026-11-04T22:30:00Z')
const TODAY = '2026-11-05'
const SLOW = 180_000
const PERIOD = 'from=2026-10-05&to=2026-11-03'

const INTERNAL_ERROR = 'Внутренняя ошибка фейкового API'

const server = setupServer(
  ...createHandlers({ seed: SEED, now: NOW }),
  // Последним — ловушка: сюда попадает только то, что не обработали createHandlers
  http.get('*', () => HttpResponse.json({ unhandled: true }, { status: 418 })),
)

let core: ReturnType<typeof createApiCore>
// Число вызовов генератора вокруг создания ядра и warmUp (для AC-7)
const calls = { beforeCreate: 0, afterFirstWarmUp: 0, afterSecondWarmUp: 0 }
// Аргументы генерации из warmUp: Vitest 5 (clearMocks: true) стирает историю
// вызовов перед каждым тестом, поэтому сохраняем их здесь
let warmUpArgs: Parameters<typeof generateRawData> | undefined

beforeAll(async () => {
  calls.beforeCreate = generateSpy.mock.calls.length
  core = createApiCore({ seed: SEED, now: NOW })
  core.warmUp()
  calls.afterFirstWarmUp = generateSpy.mock.calls.length
  warmUpArgs = generateSpy.mock.calls.at(-1)
  core.warmUp()
  calls.afterSecondWarmUp = generateSpy.mock.calls.length

  server.listen()
  // Первый запрос прогревает генератор createHandlers (может быть долгим)
  await viaMsw('/api/meta')
}, SLOW)
afterAll(() => server.close())

/** Ответ текущих MSW-обработчиков (эталон «как сейчас»). */
async function viaMsw(path: string): Promise<ApiResult> {
  const response = await fetch(new URL(path, location.origin))
  return { status: response.status, body: await response.json() }
}

/** Ответ ядра; тело — как после JSON-сериализации (так оно уходит клиенту). */
function viaCore(path: string): ApiResult {
  const url = new URL(path, 'http://localhost')
  const result = core.handle(url.pathname, url.search)
  return { status: result.status, body: JSON.parse(JSON.stringify(result.body)) as unknown }
}

/** Тело ошибки: ровно { message }, на русском, без стека, путей и эха ввода (security.md). */
function expectSafeError(body: unknown, echo: readonly string[] = []): string {
  expect(body).toEqual({ message: expect.any(String) })
  const { message } = body as { message: string }
  expect(message.length).toBeGreaterThan(0)
  expect(message).toMatch(/[А-Яа-яЁё]/)
  expect(message).not.toMatch(/\s+at\s+\S+|\.tsx?\b|node_modules|src[\\/]|mocks[\\/]|ZodError|TypeError|Error:|boom/)
  expect(message).not.toContain('<script>')
  for (const value of echo) expect(message).not.toContain(value)
  return message
}

// Все эндпоинты spec 001 (и spec 002 для /api/meta) с разными параметрами
const validRequests = [
  '/api/meta',
  `/api/kpi?${PERIOD}`,
  `/api/kpi?${PERIOD}&mp=wb&cat=shoes&cat=sports`,
  `/api/kpi?from=2026-11-01&to=${TODAY}`,
  `/api/sales-daily?${PERIOD}`,
  `/api/sales-daily?${PERIOD}&mp=ozon&cat=electronics`,
  `/api/top-products?${PERIOD}`,
  `/api/top-products?${PERIOD}&sort=profit&limit=5`,
  '/api/stocks',
  '/api/stocks?mp=ozon&cat=electronics&status=critical&limit=10',
  '/api/stocks?from=2026-10-01&to=2026-10-02',
  `/api/orders?${PERIOD}`,
  `/api/orders?${PERIOD}&mp=wb&cat=clothing&q=${encodeURIComponent('а')}&status=bought&sort=price&dir=asc&offset=10&limit=20`,
  `/api/orders?${PERIOD}&q=&status=&sort=&dir=&offset=&limit=&mp=&cat=`,
  `/api/orders?from=${TODAY}&to=${TODAY}&limit=200`,
]

// Неверные параметры: тексты 400 должны остаться прежними
const badRequests = [
  '/api/kpi?from=05.10.2026&to=2026-11-03',
  '/api/sales-daily?from=2026-10-5&to=2026-11-03',
  `/api/orders?from=${encodeURIComponent('<script>')}&to=2026-11-03`,
  '/api/kpi?from=2026-11-03&to=2026-10-05',
  '/api/kpi?from=2026-11-01&to=2026-11-06',
  `/api/kpi?${PERIOD}&mp=hack`,
  '/api/stocks?mp=hack',
  '/api/stocks?status=unknown',
  '/api/stocks?limit=-1',
  `/api/top-products?${PERIOD}&cat=weapons`,
  `/api/sales-daily?${PERIOD}&cat=shoes&cat=weapons`,
  `/api/top-products?${PERIOD}&sort=hack`,
  `/api/top-products?${PERIOD}&limit=51`,
  `/api/orders?${PERIOD}&limit=201`,
  `/api/orders?${PERIOD}&limit=1.5`,
  `/api/orders?${PERIOD}&offset=-1`,
  `/api/orders?${PERIOD}&q=${'я'.repeat(101)}`,
  `/api/orders?${PERIOD}&dir=up`,
  '/api/orders?from=2026-02-30&to=2026-03-05',
  '/api/kpi?from=&to=2026-11-03',
  '/api/sales-daily?from=2026-10-05&to=',
  '/api/top-products?to=2026-11-03',
  '/api/kpi',
  '/api/sales-daily?from=1900-01-01&to=2026-11-03',
]

describe('createApiCore', () => {
  describe('AC-1: ответ ядра совпадает с ответом MSW-обработчиков при тех же seed и «сейчас»', () => {
    it.each(validRequests)('AC-1: GET %s — тот же статус 200 и то же тело', async (path) => {
      const expected = await viaMsw(path)
      const actual = viaCore(path)

      expect(expected.status).toBe(200)
      expect(actual).toEqual(expected)
    })

    it('AC-1: /api/meta через ядро — «сегодня» 05.11.2026 по Москве и время обновления = now', () => {
      const { status, body } = viaCore('/api/meta')
      const meta = body as { today: string; updatedAt: string }

      expect(status).toBe(200)
      expect(meta.today).toBe(TODAY)
      expect(Date.parse(meta.updatedAt)).toBe(NOW.getTime())
    })

    it('AC-1: пустая строка запроса обрабатывается как запрос без параметров', async () => {
      expect(core.handle('/api/meta', '')).toEqual({ status: 200, body: expect.anything() })
      expect(viaCore('/api/stocks')).toEqual(await viaMsw('/api/stocks'))
    })

    it('AC-1: повторный одинаковый запрос даёт тот же ответ (данные в памяти, детерминизм)', () => {
      expect(viaCore(`/api/kpi?${PERIOD}`)).toEqual(viaCore(`/api/kpi?${PERIOD}`))
    })

    it('AC-1: ядро с другим seed даёт другие данные (seed действительно используется)', () => {
      const other = createApiCore({ seed: SEED + 1, now: NOW })
      const a = viaCore(`/api/kpi?${PERIOD}`)
      const b = other.handle('/api/kpi', `?${PERIOD}`)

      expect(b.status).toBe(200)
      expect(JSON.parse(JSON.stringify(b.body))).not.toEqual(a.body)
    }, SLOW)
  })

  describe('AC-2: неверные параметры → 400 с тем же текстом; неизвестный путь → 404', () => {
    it.each(badRequests)('AC-2: GET %s — 400 и тот же { message }, что у MSW-обработчиков', async (path) => {
      const expected = await viaMsw(path)
      const actual = viaCore(path)

      expect(expected.status).toBe(400)
      expect(actual).toEqual(expected)
      expectSafeError(actual.body)
    })

    it.each(['/api/unknown', '/api/health', '/api/kpi/extra'])(
      'AC-2: неизвестный путь %s → 404 с { message } на русском',
      (path) => {
        const { status, body } = viaCore(`${path}?${PERIOD}`)

        expect(status).toBe(404)
        expectSafeError(body)
      },
    )

    it('AC-2: 404 не отражает введённый путь как есть (T3/T4)', () => {
      const evil = '/api/<script>alert(1)</script>'
      const { status, body } = core.handle(evil, '?x=<script>')

      expect(status).toBe(404)
      expectSafeError(body, ['alert(1)', '<script>'])
    })
  })

  describe('AC-3: непредвиденная ошибка → 500 без стека и путей', () => {
    it('AC-3: исключение в агрегаторе → 500 { message: «Внутренняя ошибка фейкового API» }, как у MSW-обработчиков', async () => {
      // Подробности допустимы только в консоли разработчика — глушим её в тесте
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      failure.kpi = true
      try {
        const actual = viaCore(`/api/kpi?${PERIOD}`)
        const expected = await viaMsw(`/api/kpi?${PERIOD}`)

        expect(actual).toEqual({ status: 500, body: { message: INTERNAL_ERROR } })
        expect(actual).toEqual(expected)
        expect(JSON.stringify(actual.body)).not.toMatch(/boom|kpi\.ts|TypeError|\s+at\s+/)
      } finally {
        failure.kpi = false
        consoleError.mockRestore()
      }
    })

    it('AC-3: ядро не бросает исключение наружу и после ошибки продолжает отвечать', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      failure.kpi = true
      try {
        expect(() => core.handle('/api/kpi', `?${PERIOD}`)).not.toThrow()
      } finally {
        failure.kpi = false
        consoleError.mockRestore()
      }

      expect(viaCore(`/api/kpi?${PERIOD}`).status).toBe(200)
    })
  })

  describe('AC-7: генерация заранее через warmUp', () => {
    it('AC-7: создание ядра и первый warmUp вызывают генерацию ровно один раз', () => {
      expect(calls.afterFirstWarmUp - calls.beforeCreate).toBe(1)
      expect(warmUpArgs).toEqual([expect.objectContaining({ seed: SEED, today: TODAY })])
    })

    it('AC-7: повторный warmUp ничего не делает', () => {
      expect(calls.afterSecondWarmUp).toBe(calls.afterFirstWarmUp)
    })

    it('AC-7: запросы после warmUp не запускают генерацию заново', () => {
      const before = generateSpy.mock.calls.length

      viaCore('/api/meta')
      viaCore(`/api/kpi?${PERIOD}`)
      viaCore('/api/stocks')
      core.warmUp()

      expect(generateSpy.mock.calls.length).toBe(before)
    })
  })

  describe('AC-9: в Node createHandlers работает в том же потоке, без воркера', () => {
    it('AC-9: createHandlers отвечает через setupServer, хотя Web Worker в среде тестов не используется', async () => {
      const { status, body } = await viaMsw('/api/meta')

      expect(status).toBe(200)
      expect((body as { today: string }).today).toBe(TODAY)
    })
  })
})
