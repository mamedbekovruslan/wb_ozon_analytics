// MSW нужен и в dev, и в демо на Vercel: настоящего backend нет (ADR-0004).
// mocks/ подключается только отсюда и динамически — отдельным чанком.
export async function enableMocking() {
  const { worker } = await import('../mocks/browser')
  await worker.start({
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    // Шрифты, картинки и скрипты идут мимо MSW молча, а запрос к /api/ без
    // обработчика — почти наверняка опечатка в адресе, о ней предупреждаем
    onUnhandledFrame: ({ frame, defaults }) => {
      if (isApiRequest(frame.data)) defaults.warn()
    },
    quiet: import.meta.env.PROD,
  })
}

// Данные кадра MSW не типизированы (unknown): проверяем форму, а не приводим тип
function isApiRequest(data: unknown): boolean {
  if (typeof data !== 'object' || data === null || !('request' in data)) return false
  const { request } = data
  return request instanceof Request && new URL(request.url).pathname.startsWith('/api/')
}
