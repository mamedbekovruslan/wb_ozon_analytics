import { setupWorker } from 'msw/browser'
import { PROJECT_SEED } from './seed'
import { createWorkerHandlers } from './server/client'

// Генерация и агрегаты — в Web Worker, чтобы не блокировать вкладку (ADR-0016).
// Воркер стартует сразу и начинает генерацию до первого запроса.
const apiWorker = new Worker(new URL('./server/api.worker.ts', import.meta.url), { type: 'module', name: 'fake-api' })

export const worker = setupWorker(...createWorkerHandlers(apiWorker, { seed: PROJECT_SEED, now: new Date() }))
