import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkerHandlers, type WorkerLike } from './client'
import { serveApi } from './serve'

/*
 * Spec 003, сторона основного потока: обработчики MSW, которые пересылают
 * запросы /api/... воркеру и отдают его ответ.
 *
 * Среда jsdom (по умолчанию), как у handlers.test.ts: MSW сопоставляет
 * относительные пути обработчиков с location.origin.
 *
 * Воркер в тестах — подделка (FakeWorker) или настоящий serveApi на другом
 * конце MessageChannel (PortWorker).
 */

const SEED = 42
const NOW = new Date('2026-11-04T22:30:00Z')
const TODAY = '2026-11-05'
const SLOW = 180_000
const PERIOD = 'from=2026-10-05&to=2026-11-03'

const WORKER_DOWN = 'Фейковый API недоступен, обновите страницу'

type RequestMessage = { type: 'request'; id: number; path: string; search: string }

function isRequest(data: unknown): data is RequestMessage {
  return typeof data === 'object' && data !== null && 'type' in data && data.type === 'request'
}

/** Поддельный воркер: запоминает сообщения, отвечает по команде теста. */
class FakeWorker extends EventTarget implements WorkerLike {
  readonly sent: unknown[] = []

  postMessage(message: unknown): void {
    this.sent.push(message)
  }

  requests(): RequestMessage[] {
    return this.sent.filter(isRequest)
  }

  /** Сообщение «от воркера» — асинхронно, как у настоящего. */
  emit(data: unknown): void {
    setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data })), 0)
  }

  reply(request: RequestMessage, status: number, body: unknown): void {
    this.emit({ type: 'response', id: request.id, status, body })
  }

  fail(): void {
    this.dispatchEvent(new ErrorEvent('error', { message: 'Uncaught TypeError: boom at worker.ts:1:1' }))
  }

  /** Ждёт, пока до воркера дойдут n запросов. */
  async waitRequests(n: number): Promise<RequestMessage[]> {
    await vi.waitFor(() => expect(this.requests().length).toBeGreaterThanOrEqual(n))
    return this.requests()
  }
}

/** Настоящий serveApi за MessageChannel, завёрнутый в интерфейс воркера. */
class PortWorker extends EventTarget implements WorkerLike {
  private readonly channel = new MessageChannel()

  constructor() {
    super()
    this.channel.port1.addEventListener('message', (event: MessageEvent) => {
      this.dispatchEvent(new MessageEvent('message', { data: event.data }))
    })
    this.channel.port1.start()
    serveApi(this.channel.port2)
    this.channel.port2.start()
  }

  postMessage(message: unknown): void {
    this.channel.port1.postMessage(message)
  }

  close(): void {
    this.channel.port1.close()
    this.channel.port2.close()
  }
}

const server = setupServer()

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

async function get(path: string): Promise<{ status: number; body: unknown; contentType: string | null }> {
  const response = await fetch(new URL(path, location.origin))
  return { status: response.status, body: await response.json(), contentType: response.headers.get('content-type') }
}

/** Новый поддельный воркер с подключёнными обработчиками. */
function fakeSetup() {
  const worker = new FakeWorker()
  server.resetHandlers(...createWorkerHandlers(worker, { seed: SEED, now: NOW }))
  return worker
}

describe('createWorkerHandlers', () => {
  describe('AC-6: «сейчас» задаёт основной поток', () => {
    it('AC-6: при создании воркеру отправляется init с seed и now числом мс', () => {
      const worker = new FakeWorker()
      createWorkerHandlers(worker, { seed: SEED, now: NOW })

      expect(worker.sent[0]).toEqual({ type: 'init', seed: SEED, now: NOW.getTime() })
      expect(worker.requests()).toEqual([])
    })
  })

  describe('AC-5: обработчики отдают ровно тот статус и JSON, что вернул воркер', () => {
    it('AC-5: запрос пересылается воркеру как { type: request, id, path, search }', async () => {
      const worker = fakeSetup()
      const pending = get(`/api/kpi?${PERIOD}&mp=wb&cat=shoes&cat=sports`)

      const [request] = await worker.waitRequests(1)
      if (!request) throw new Error('запрос не дошёл до воркера')
      expect(request).toEqual({ type: 'request', id: expect.any(Number), path: '/api/kpi', search: expect.any(String) })
      const params = new URLSearchParams(request.search)
      expect(params.get('from')).toBe('2026-10-05')
      expect(params.get('to')).toBe('2026-11-03')
      expect(params.get('mp')).toBe('wb')
      expect(params.getAll('cat')).toEqual(['shoes', 'sports'])

      worker.reply(request, 200, { ok: true })
      await pending
    })

    it('AC-5: запрос без параметров пересылается с пустым search', async () => {
      const worker = fakeSetup()
      const pending = get('/api/meta')

      const [request] = await worker.waitRequests(1)
      if (!request) throw new Error('запрос не дошёл до воркера')
      expect(request.path).toBe('/api/meta')
      expect(request.search).toBe('')

      worker.reply(request, 200, {})
      await pending
    })

    it.each([
      [200, { today: TODAY, items: [{ sku: 'A-1', revenue: 1_000_000.5 }], nothing: null }],
      [200, []],
      [400, { message: 'Начало периода позже его конца' }],
      [404, { message: 'Такого адреса нет' }],
      [500, { message: 'Внутренняя ошибка фейкового API' }],
    ])('AC-5: воркер ответил %i — fetch получает тот же статус и то же JSON-тело', async (status, body) => {
      const worker = fakeSetup()
      const pending = get('/api/anything?x=1')

      const [request] = await worker.waitRequests(1)
      if (!request) throw new Error('запрос не дошёл до воркера')
      worker.reply(request, status, body)
      const response = await pending

      expect(response.status).toBe(status)
      expect(response.body).toEqual(body)
      expect(response.contentType).toMatch(/application\/json/)
    })

    it('AC-5: очень большие числа и кириллица в теле доходят без искажений', async () => {
      const worker = fakeSetup()
      const body = { revenue: Number.MAX_SAFE_INTEGER, profit: -987_654_321.99, name: 'Кроссовки «Бег» №1' }
      const pending = get(`/api/top-products?${PERIOD}`)

      const [request] = await worker.waitRequests(1)
      if (!request) throw new Error('запрос не дошёл до воркера')
      worker.reply(request, 200, body)

      expect((await pending).body).toEqual(body)
    })

    it('AC-5 / AC-4: параллельные запросы получают свои ответы, даже если воркер ответил в обратном порядке', async () => {
      const worker = fakeSetup()
      const first = get(`/api/kpi?${PERIOD}`)
      const second = get('/api/stocks')
      const third = get('/api/meta')

      const requests = await worker.waitRequests(3)
      const ids = requests.map((r) => r.id)
      expect(new Set(ids).size).toBe(3)

      for (const request of [...requests].reverse()) {
        worker.reply(request, 200, { echoPath: request.path, id: request.id })
      }

      expect((await first).body).toMatchObject({ echoPath: '/api/kpi' })
      expect((await second).body).toMatchObject({ echoPath: '/api/stocks' })
      expect((await third).body).toMatchObject({ echoPath: '/api/meta' })
    })

    it('AC-5: сообщения неверной формы и ответы на чужие id не роняют клиент и не подменяют ответ', async () => {
      const worker = fakeSetup()
      // Исключение в обработчике события jsdom сообщает событием error на window
      const uncaught: unknown[] = []
      const onError = (event: ErrorEvent) => uncaught.push(event.error ?? event.message)
      window.addEventListener('error', onError)
      try {
        const pending = get('/api/meta')
        const [request] = await worker.waitRequests(1)
        if (!request) throw new Error('запрос не дошёл до воркера')

        for (const garbage of [
          null,
          undefined,
          'response',
          42,
          [],
          {},
          { type: 'response' },
          { type: 'response', id: '1', status: 200, body: {} },
          { type: 'response', id: null, status: 200, body: {} },
          { type: 'response', id: request.id + 100_000, status: 200, body: { wrong: true } },
          { type: 'unknown', id: request.id, status: 200, body: { wrong: true } },
          { type: 'response', id: { toString: null }, status: 200 },
        ]) {
          worker.emit(garbage)
        }
        worker.reply(request, 200, { right: true })

        expect(await pending).toMatchObject({ status: 200, body: { right: true } })
        expect(uncaught).toEqual([])
      } finally {
        window.removeEventListener('error', onError)
      }
    })
  })

  describe('AC-8: падение воркера → 500 с понятным текстом, запросы не висят', () => {
    it(
      'AC-8: ожидающие запросы получают 500 { message: «Фейковый API недоступен, обновите страницу» }',
      async () => {
        const worker = fakeSetup()
        const first = get(`/api/kpi?${PERIOD}`)
        const second = get('/api/meta')
        await worker.waitRequests(2)

        worker.fail()

        for (const response of [await first, await second]) {
          expect(response.status).toBe(500)
          expect(response.body).toEqual({ message: WORKER_DOWN })
        }
      },
      5_000,
    )

    it(
      'AC-8: после падения все последующие запросы сразу получают 500 с тем же текстом',
      async () => {
        const worker = fakeSetup()
        worker.fail()

        const first = await get('/api/meta')
        const second = await get(`/api/orders?${PERIOD}`)

        expect(first).toMatchObject({ status: 500, body: { message: WORKER_DOWN } })
        expect(second).toMatchObject({ status: 500, body: { message: WORKER_DOWN } })
      },
      5_000,
    )

    it(
      'AC-8: ошибка загрузки воркера до первого запроса (событие error) — запрос не висит, а получает 500',
      async () => {
        const worker = new FakeWorker()
        const handlers = createWorkerHandlers(worker, { seed: SEED, now: NOW })
        worker.fail()
        server.resetHandlers(...handlers)

        expect(await get('/api/meta')).toMatchObject({ status: 500, body: { message: WORKER_DOWN } })
      },
      5_000,
    )

    it(
      'AC-8: поздний ответ упавшего воркера не меняет уже отданную ошибку и не роняет клиент',
      async () => {
        const worker = fakeSetup()
        const pending = get('/api/meta')
        const [request] = await worker.waitRequests(1)
        if (!request) throw new Error('запрос не дошёл до воркера')

        worker.fail()
        worker.reply(request, 200, { late: true })

        expect(await pending).toMatchObject({ status: 500, body: { message: WORKER_DOWN } })
      },
      5_000,
    )

    it('AC-8: текст ошибки — без стека, путей и сообщения исходного исключения (security.md)', async () => {
      const worker = fakeSetup()
      worker.fail()

      const { body } = await get('/api/meta')

      expect(JSON.stringify(body)).not.toMatch(/boom|worker\.ts|TypeError|\s+at\s+/)
    })
  })

  describe('AC-5, AC-6, AC-7: связка с настоящим serveApi через MessageChannel', () => {
    let worker: PortWorker

    beforeAll(() => {
      worker = new PortWorker()
    })
    beforeEach(() => {
      server.resetHandlers(...handlersFor(worker))
    })
    afterAll(() => worker.close())

    // Обработчики создаются один раз: повторный init не нужен и не проверяется
    let created: ReturnType<typeof createWorkerHandlers> | null = null
    function handlersFor(target: PortWorker) {
      created ??= createWorkerHandlers(target, { seed: SEED, now: NOW })
      return created
    }

    it(
      'AC-6, AC-7: первый запрос ждёт генерацию и получает /api/meta с today по now из основного потока',
      async () => {
        const { status, body } = await get('/api/meta')
        const meta = body as { today: string; updatedAt: string }

        expect(status).toBe(200)
        expect(meta.today).toBe(TODAY)
        expect(Date.parse(meta.updatedAt)).toBe(NOW.getTime())
      },
      SLOW,
    )

    it('AC-5: неверные параметры → 400 с текстом ядра', async () => {
      const { status, body } = await get('/api/kpi?from=2026-11-03&to=2026-10-05')

      expect(status).toBe(400)
      expect(body).toEqual({ message: 'Начало периода позже его конца' })
    })

    it('AC-5: неизвестный путь /api/... → 404 с { message }', async () => {
      const { status, body } = await get('/api/unknown')

      expect(status).toBe(404)
      expect(body).toEqual({ message: expect.any(String) })
    })

    it('AC-5: параллельные запросы к разным эндпоинтам получают свои ответы', async () => {
      const [kpi, stocks, orders] = await Promise.all([
        get(`/api/kpi?${PERIOD}`),
        get('/api/stocks?limit=3'),
        get(`/api/orders?${PERIOD}&limit=7`),
      ])

      expect(kpi.status).toBe(200)
      expect(kpi.body).toMatchObject({ period: { from: '2026-10-05', to: '2026-11-03' } })
      expect(stocks.status).toBe(200)
      expect(stocks.body).toMatchObject({ asOf: TODAY })
      expect((stocks.body as { items: unknown[] }).items).toHaveLength(3)
      expect(orders.status).toBe(200)
      expect((orders.body as { items: unknown[] }).items).toHaveLength(7)
    })
  })
})
