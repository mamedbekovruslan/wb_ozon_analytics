// Первым: до создания любых zod-схем — без попыток `new Function` под CSP
import './zodJitless'
import { serveApi } from './serve'

// Точка входа Web Worker фейкового API (ADR-0016). Vite собирает его в
// отдельный файл с того же домена — CSP `worker-src 'self'` этого достаточно.
// В типах проекта нет библиотеки WebWorker, поэтому `self` описан как Window,
// но интерфейс сообщений (postMessage, событие message) у них общий.
serveApi(self)
