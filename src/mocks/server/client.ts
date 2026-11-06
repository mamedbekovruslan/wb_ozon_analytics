import { delay, http, HttpResponse, type JsonBodyType } from 'msw'
// Только тип: при сборке импорт исчезает, ядро и генератор не попадают в чанк вкладки
import type { ApiResult } from './core'
import { responseMessage, type InitMessage, type RequestMessage } from './protocol'

// Сторона основного потока (ADR-0016): MSW-обработчики только пересылают
// запрос воркеру и отдают его ответ — генерация и агрегаты не занимают
// поток интерфейса.

export type WorkerLike = EventTarget & { postMessage(message: unknown): void }

const WORKER_DOWN: ApiResult ={ status: 500, body: { message: 'Фейковый API недоступен, обновите страницу' } }

export function createWorkerHandlers(worker: WorkerLike, { seed, now }: { seed: number; now: Date }) {
  const pending = new Map<number, (answer: ApiResult) => void>()
  let nextId = 0
  let failed = false

  worker.addEventListener('message', (event) => {
    // Проверяем форму события, а не instanceof: MessageEvent бывает из разных сред (jsdom, Node)
    if (!('data' in event)) return
    const parsed = responseMessage.safeParse(event.data)
    if (!parsed.success) return
    const resolve = pending.get(parsed.data.id)
    if (!resolve) return
    pending.delete(parsed.data.id)
    resolve({ status: parsed.data.status, body: parsed.data.body })
  })

  // Воркер не загрузился или упал: ожидающие и будущие запросы не должны висеть
  // (AC-8). Подробности ошибки — только в консоли, не в ответе (security.md)
  const fail = (event: Event) => {
    console.error('Воркер фейкового API упал', event)
    failed = true
    for (const resolve of pending.values()) resolve(WORKER_DOWN)
    pending.clear()
  }
  worker.addEventListener('error', fail)
  // Ответ не удалось прочитать: неизвестно, какой запрос он закрывал, — канал
  // считаем сломанным, иначе этот запрос висел бы вечно
  worker.addEventListener('messageerror', fail)

  worker.postMessage({ type: 'init', seed, now: now.getTime() } satisfies InitMessage)

  const ask = (path: string, search: string) =>
    new Promise<ApiResult>((resolve) => {
      if (failed) return resolve(WORKER_DOWN)
      const id = nextId++
      pending.set(id, resolve)
      worker.postMessage({ type: 'request', id, path, search } satisfies RequestMessage)
    })

  return [
    http.get('/api/*', async ({ request }) => {
      // Небольшая задержка, как в handlers.ts: видны состояния загрузки
      await delay()
      const url = new URL(request.url)
      const { status, body } = await ask(url.pathname, url.search)
      // Тело пришло из воркера через structured clone JSON-совместимых данных ядра
      return HttpResponse.json(body as JsonBodyType, { status })
    }),
  ]
}
