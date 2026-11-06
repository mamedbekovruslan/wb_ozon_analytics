import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/*
 * Spec 003 «Генерация данных в фоне» — проверки в собранной версии.
 * AC-11 покрывают существующие сценарии e2e/smoke.spec.ts и e2e/filters.spec.ts.
 */

// Первая генерация данных может занять несколько секунд
const META_TIMEOUT = 15_000
// Порог из AC-10
const LONG_TASK_MS = 500

type LongTask = { name: string; startTime: number; duration: number }
type Violation = { directive: string; blocked: string }

function isMeta(url: string): boolean {
  return new URL(url).pathname === '/api/meta'
}

/** CSP продакшена из vercel.json (dev и preview заголовков не отдают). */
function productionCsp(): string {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
    headers: { headers: { key: string; value: string }[] }[]
  }
  const header = config.headers.flatMap((rule) => rule.headers).find((h) => h.key === 'Content-Security-Policy')
  if (!header) throw new Error('в vercel.json нет Content-Security-Policy')
  return header.value
}

/** Директива CSP по имени, например worker-src → "'self'". */
function directive(csp: string, name: string): string | undefined {
  return csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `))
    ?.slice(name.length + 1)
    .trim()
}

/** Собирает URL всех выделенных воркеров страницы (Service Worker MSW сюда не попадает). */
function collectWorkers(page: Page): string[] {
  const urls: string[] = []
  page.on('worker', (worker) => urls.push(worker.url()))
  return urls
}

test.describe('Spec 003: фейковый API в Web Worker', () => {
  test('AC-10: от загрузки до ответа /api/meta в основном потоке нет задач длиннее 500 мс', async ({ page }) => {
    // Наблюдатель ставится до любых скриптов страницы; buffered — чтобы не пропустить ранние задачи
    await page.addInitScript(() => {
      const store: {
        supported: boolean
        entries: { name: string; startTime: number; duration: number }[]
        observer: PerformanceObserver | null
      } = {
        supported: PerformanceObserver.supportedEntryTypes.includes('longtask'),
        entries: [],
        observer: null,
      }
      if (store.supported) {
        store.observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            store.entries.push({ name: entry.name, startTime: entry.startTime, duration: entry.duration })
          }
        })
        store.observer.observe({ type: 'longtask', buffered: true })
      }
      Object.defineProperty(window, '__longTasks', { value: store })
    })
    const metaResponse = page.waitForResponse((response) => isMeta(response.url()), { timeout: META_TIMEOUT })

    await page.goto('/dashboard')
    expect((await metaResponse).status()).toBe(200)

    const { supported, tasks } = await page.evaluate(() => {
      const store = (window as unknown as {
        __longTasks: {
          supported: boolean
          entries: { name: string; startTime: number; duration: number }[]
          observer: PerformanceObserver | null
        }
      }).__longTasks
      // Забираем записи, которые наблюдатель ещё не успел передать в колбэк
      for (const entry of store.observer?.takeRecords() ?? []) {
        store.entries.push({ name: entry.name, startTime: entry.startTime, duration: entry.duration })
      }
      return { supported: store.supported, tasks: store.entries }
    })

    // Без поддержки longtask проверка была бы пустой
    expect(supported).toBe(true)
    const tooLong: LongTask[] = tasks.filter((task) => task.duration > LONG_TASK_MS)
    expect(tooLong, `длинные задачи: ${JSON.stringify(tooLong)}`).toEqual([])
  })

  test('AC-12: воркер фейкового API — отдельный JS-файл сборки с того же origin, не blob: и не data:', async ({
    page,
    request,
    baseURL,
  }) => {
    const workers = collectWorkers(page)
    const metaResponse = page.waitForResponse((response) => isMeta(response.url()), { timeout: META_TIMEOUT })

    await page.goto('/dashboard')
    expect((await metaResponse).status()).toBe(200)
    await expect.poll(() => workers.length, { timeout: META_TIMEOUT }).toBeGreaterThan(0)

    const origin = new URL(baseURL ?? 'http://localhost').origin
    for (const url of workers) {
      const parsed = new URL(url)
      expect(parsed.protocol, url).toMatch(/^https?:$/)
      expect(parsed.origin, url).toBe(origin)
      expect(parsed.pathname, url).toMatch(/\.js$/)

      // Файл реально лежит в сборке и отдаётся как скрипт
      const file = await request.get(url)
      expect(file.status(), url).toBe(200)
      expect(file.headers()['content-type'], url).toMatch(/javascript/)
    }
  })

  test('AC-12: CSP в vercel.json не ослаблен — worker-src и script-src только \'self\', без blob:', () => {
    const csp = productionCsp()

    expect(directive(csp, 'worker-src')).toBe("'self'")
    expect(directive(csp, 'script-src')).toBe("'self'")
    expect(directive(csp, 'default-src')).toBe("'self'")
    expect(csp).not.toMatch(/blob:|'unsafe-inline'|'unsafe-eval'|\*/)
  })

  test('AC-12: с CSP продакшена из vercel.json воркер запускается и /api/meta отвечает 200 без нарушений CSP', async ({
    page,
  }) => {
    const csp = productionCsp()
    // Нарушения CSP, относящиеся к скриптам и воркерам
    await page.addInitScript(() => {
      const violations: { directive: string; blocked: string }[] = []
      document.addEventListener('securitypolicyviolation', (event) => {
        violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI })
      })
      Object.defineProperty(window, '__cspViolations', { value: violations })
    })
    // Заголовок CSP добавляется к HTML-документу так, как его отдаёт Vercel
    await page.route(
      (url) => url.pathname === '/dashboard',
      async (route) => {
        const response = await route.fetch()
        await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } })
      },
    )
    const workers = collectWorkers(page)
    const metaResponse = page.waitForResponse((response) => isMeta(response.url()), { timeout: META_TIMEOUT })

    await page.goto('/dashboard')

    // Если воркер заблокирован CSP, клиент отдаст 500 «Фейковый API недоступен» (AC-8)
    expect((await metaResponse).status()).toBe(200)
    await expect.poll(() => workers.length, { timeout: META_TIMEOUT }).toBeGreaterThan(0)
    const violations = await page.evaluate(
      () => (window as unknown as { __cspViolations: { directive: string; blocked: string }[] }).__cspViolations,
    )
    const scriptViolations: Violation[] = violations.filter((v) =>
      /^(worker-src|script-src|script-src-elem|child-src|default-src)$/.test(v.directive),
    )
    expect(scriptViolations).toEqual([])
  })
})
