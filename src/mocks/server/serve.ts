import { createApiCore } from './core'
import { initMessage, requestMessage, type RequestMessage, type ResponseMessage } from './protocol'

// Сторона воркера (ADR-0016): принимает init и запросы, отвечает результатом
// ядра. Порт — глобальный объект воркера в браузере или MessagePort в тестах.

export type PortLike = {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  start?(): void
}

export function serveApi(port: PortLike): void {
  let core: ReturnType<typeof createApiCore> | null = null
  // Запросы до init ждут его: без seed и «сейчас» отвечать нечем
  const waiting: RequestMessage[] = []

  const answer = ({ id, path, search }: RequestMessage) => {
    if (!core) return
    const { status, body } = core.handle(path, search)
    port.postMessage({ type: 'response', id, status, body } satisfies ResponseMessage)
  }

  port.addEventListener('message', ({ data }) => {
    const request = requestMessage.safeParse(data)
    if (request.success) {
      if (core) answer(request.data)
      else waiting.push(request.data)
      return
    }

    const init = initMessage.safeParse(data)
    // Повторный init игнорируется: данные уже построены от первого «сейчас»
    if (!init.success || core) return
    core = createApiCore({ seed: init.data.seed, now: new Date(init.data.now) })
    // Генерация сразу, до первого запроса: сообщения, пришедшие за это время,
    // встают в очередь потока и будут обработаны после неё (AC-7)
    core.warmUp()
    for (const pending of waiting.splice(0)) answer(pending)
  })
  port.start?.()
}
