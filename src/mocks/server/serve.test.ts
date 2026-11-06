// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { generateRawData } from '../generator'
import { createApiCore } from './core'
import { serveApi } from './serve'

/*
 * Spec 003, сторона воркера: serveApi слушает порт сообщений (MessagePort)
 * и отвечает на запросы основного потока. В тесте воркер не нужен:
 * оба конца MessageChannel живут в одном потоке Node.
 *
 * Протокол (spec 003, «Данные и API»):
 *   → { type: 'init', seed, now }        now — число мс
 *   → { type: 'request', id, path, search }
 *   ← { type: 'response', id, status, body }
 */

// Счётчик вызовов генератора: AC-7 (генерация стартует по init, до запросов)
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

type ResponseMessage = { type: 'response'; id: number; status: number; body: unknown }

function isResponse(data: unknown): data is ResponseMessage {
  return typeof data === 'object' && data !== null && 'type' in data && data.type === 'response'
}

/** Канал «основной поток ↔ serveApi»: port — сторона основного потока. */
function connect() {
  const channel = new MessageChannel()
  const received: unknown[] = []
  channel.port1.addEventListener('message', (event: MessageEvent) => {
    received.push(event.data)
  })
  channel.port1.start()
  serveApi(channel.port2)
  // На случай, если serveApi слушает порт без start(): без него Node не доставляет сообщения
  channel.port2.start()

  const responses = () => received.filter(isResponse)

  return {
    port: channel.port1,
    received,
    responses,
    init: (seed = SEED, now = NOW) => channel.port1.postMessage({ type: 'init', seed, now: now.getTime() }),
    send: (id: number, path: string, search = '') => channel.port1.postMessage({ type: 'request', id, path, search }),
    /** Ждёт ответ с данным id (генерация может идти несколько секунд). */
    async responseFor(id: number): Promise<ResponseMessage> {
      await vi.waitFor(() => expect(responses().some((r) => r.id === id)).toBe(true), { timeout: SLOW, interval: 20 })
      const found = responses().find((r) => r.id === id)
      if (!found) throw new Error(`нет ответа на запрос ${id}`)
      return found
    },
    close() {
      channel.port1.close()
      channel.port2.close()
    },
  }
}

// Эталон — ядро в этом же потоке при тех же seed и «сейчас»
let reference: ReturnType<typeof createApiCore>

beforeAll(() => {
  reference = createApiCore({ seed: SEED, now: NOW })
  reference.warmUp()
}, SLOW)

describe('serveApi', () => {
  describe('AC-4, AC-7: параллельные запросы сразу после init', () => {
    // id нарочно не по порядку; одинаковый эндпоинт с разными параметрами —
    // чтобы перепутанные ответы было видно
    const requests: [id: number, path: string, search: string][] = [
      [7, '/api/meta', ''],
      [3, '/api/kpi', `?${PERIOD}`],
      [42, '/api/kpi', `?${PERIOD}&mp=wb`],
      [1, '/api/kpi', '?from=2026-11-01&to=2026-11-03&mp=ozon&cat=shoes'],
      [100, '/api/stocks', '?status=critical'],
      [5, '/api/orders', `?${PERIOD}&limit=20`],
      [0, '/api/sales-daily', `?${PERIOD}`],
      [9, '/api/top-products', `?${PERIOD}&sort=profit&limit=5`],
      [11, '/api/kpi', '?from=2026-11-03&to=2026-10-05'],
      [12, '/api/unknown', ''],
    ]
    let link: ReturnType<typeof connect>
    const answers = new Map<number, ResponseMessage>()

    beforeAll(async () => {
      link = connect()
      link.init()
      // Запросы уходят в том же такте, что и init, — то есть «во время генерации»
      for (const [id, path, search] of requests) link.send(id, path, search)
      for (const [id] of requests) answers.set(id, await link.responseFor(id))
    }, SLOW)
    afterAll(() => link.close())

    it('AC-7: запросы, пришедшие во время генерации, дожидаются её и получают обычный ответ', () => {
      for (const [id, path] of requests) {
        const expected = path === '/api/unknown' ? 404 : id === 11 ? 400 : 200
        expect({ id, status: answers.get(id)?.status }).toEqual({ id, status: expected })
      }
    })

    it('AC-4: на каждый запрос — ровно один ответ с тем же id', async () => {
      // Даём шанс прийти лишним (повторным) ответам
      await new Promise((resolve) => setTimeout(resolve, 50))
      const ids = link.responses().map((r) => r.id)

      expect([...ids].sort((a, b) => a - b)).toEqual(requests.map(([id]) => id).sort((a, b) => a - b))
    })

    it('AC-4: ответы не перепутаны — тело каждого совпадает с ответом ядра на его запрос', () => {
      for (const [id, path, search] of requests) {
        const { status, body } = reference.handle(path, search)
        expect(answers.get(id)).toEqual({ type: 'response', id, status, body })
      }
    })

    it('AC-4: ответы на одинаковый эндпоинт с разными параметрами различаются', () => {
      const bodies = [3, 42, 1].map((id) => answers.get(id)?.body)

      expect(bodies[0]).not.toEqual(bodies[1])
      expect(bodies[0]).not.toEqual(bodies[2])
      expect(bodies[1]).not.toEqual(bodies[2])
    })

    it('AC-4: повторяющиеся параллельные запросы с новыми id после генерации тоже получают свои ответы', async () => {
      link.send(1001, '/api/kpi', `?${PERIOD}`)
      link.send(1002, '/api/kpi', `?${PERIOD}&mp=wb`)
      link.send(1003, '/api/kpi', `?${PERIOD}`)

      const [a, b, c] = await Promise.all([link.responseFor(1001), link.responseFor(1002), link.responseFor(1003)])

      expect(a.body).toEqual(answers.get(3)?.body)
      expect(b.body).toEqual(answers.get(42)?.body)
      expect(c.body).toEqual(answers.get(3)?.body)
    })
  })

  describe('AC-7, AC-6: генерация по init и «сейчас» из основного потока', () => {
    let link: ReturnType<typeof connect>
    let callsBeforeInit = 0

    beforeAll(() => {
      link = connect()
    })
    afterAll(() => link.close())

    it(
      'AC-7: генерация начинается сразу после init, ещё до первого запроса',
      async () => {
        callsBeforeInit = generateSpy.mock.calls.length
        link.init()

        // Ни одного запроса не отправлено — генерация всё равно должна пройти
        await vi.waitFor(() => expect(generateSpy.mock.calls.length).toBe(callsBeforeInit + 1), {
          timeout: SLOW,
          interval: 20,
        })
        expect(generateSpy).toHaveBeenLastCalledWith(expect.objectContaining({ seed: SEED, today: TODAY }))
      },
      SLOW,
    )

    it(
      'AC-7: первые запросы после прогрева не запускают генерацию заново',
      async () => {
        const before = generateSpy.mock.calls.length
        link.send(1, '/api/meta')
        link.send(2, '/api/kpi', `?${PERIOD}`)

        expect((await link.responseFor(1)).status).toBe(200)
        expect((await link.responseFor(2)).status).toBe(200)
        expect(generateSpy.mock.calls.length).toBe(before)
      },
      SLOW,
    )

    it(
      'AC-6: today и updatedAt в /api/meta — из now, переданного в init, и совпадают с ядром в Node',
      async () => {
        link.send(3, '/api/meta')
        const { status, body } = await link.responseFor(3)
        const meta = body as { today: string; updatedAt: string }

        expect(status).toBe(200)
        expect(meta.today).toBe(TODAY)
        expect(Date.parse(meta.updatedAt)).toBe(NOW.getTime())
        expect(body).toEqual(reference.handle('/api/meta', '').body)
      },
      SLOW,
    )
  })
})
