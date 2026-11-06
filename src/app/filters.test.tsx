import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMatchMedia,
  MARKETPLACE_LABELS,
  META_FIXTURE,
  PRESET_LABELS,
  rangeButtonName,
  sortedParams,
} from './filtersTestFixtures'
import { createAppRouter } from './router'

/*
 * Spec 002 «Фильтры в URL» — панель фильтров (≥ 640 px) через настоящий роутер.
 * «Сегодня» из фикстуры /api/meta — 04.11.2026: по умолчанию 05.10–03.11.2026,
 * прошлый период 05.09–04.10.2026 (spec, «Расчёт дат»; docs/domain.md).
 */

const server = setupServer(
  http.get('/api/meta', () => HttpResponse.json(META_FIXTURE)),
  // Данные блоков дашборда этим тестам не нужны — без генерации тяжёлого набора
  http.get('/api/*', () => HttpResponse.json({ message: 'Недоступно в тесте фильтров' }, { status: 503 })),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  // Ширина ≥ 640 px — панель
  vi.stubGlobal('matchMedia', createMatchMedia(false))
})
afterEach(() => {
  server.resetHandlers()
  vi.unstubAllGlobals()
})
afterAll(() => server.close())

function renderApp(url: string) {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [url] }) })
  // Свой клиент на каждый тест: кэш /api/meta не перетекает между тестами
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, user: userEvent.setup() }
}

type AppRouter = ReturnType<typeof createAppRouter>

const searchStr = (router: AppRouter) => router.state.location.searchStr

/** Панель фильтров после загрузки /api/meta. */
async function findLoadedPanel(): Promise<HTMLElement> {
  const panel = await screen.findByRole('search', { name: 'Фильтры' })
  await waitFor(() => {
    expect(panel.querySelector('[aria-busy="true"]')).toBeNull()
    expect(within(panel).getByRole('button', { name: /^Категории/ })).toBeEnabled()
  })
  return panel
}

const periodGroup = (panel: HTMLElement) => within(panel).getByRole('group', { name: 'Период' })
const marketplaceGroup = (panel: HTMLElement) => within(panel).getByRole('group', { name: 'Маркетплейс' })
const compareSwitch = (panel: HTMLElement) =>
  within(panel).getByRole('switch', { name: 'Сравнить с прошлым периодом' })
const categoriesButton = (panel: HTMLElement) => within(panel).getByRole('button', { name: /^Категории/ })

/** Ровно одна кнопка группы отмечена (или ни одна, если `pressed` = null). */
function expectOnlyPressed(group: HTMLElement, labels: readonly string[], pressed: string | null): void {
  for (const label of labels) {
    expect(within(group).getByRole('button', { name: label })).toHaveAttribute(
      'aria-pressed',
      label === pressed ? 'true' : 'false',
    )
  }
}

/** Состояние панели целиком. */
function expectPanelState(
  panel: HTMLElement,
  state: { preset: string | null; mp: string; compare: boolean; categories: RegExp },
): void {
  expectOnlyPressed(periodGroup(panel), PRESET_LABELS, state.preset)
  expectOnlyPressed(marketplaceGroup(panel), MARKETPLACE_LABELS, state.mp)
  expect(compareSwitch(panel)).toHaveAttribute('aria-checked', String(state.compare))
  expect(categoriesButton(panel)).toHaveTextContent(state.categories)
}

const DEFAULT_STATE = { preset: '30 дней', mp: 'Все', compare: true, categories: /Категории\s*все/ }

/** Видимый текст элемента с нормализованными пробелами. */
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

/** Даты вида 05.10 или 05.10.2026. */
const DATE_PATTERN = /\d{2}\.\d{2}/

describe('Фильтры в URL — значения по умолчанию', () => {
  it('AC-1: /dashboard без параметров — «30 дней», «Все», все категории, сравнение включено', async () => {
    const { router } = renderApp('/dashboard')
    const panel = await findLoadedPanel()

    expectPanelState(panel, DEFAULT_STATE)
    expect(within(panel).getByRole('button', { name: rangeButtonName('05.10.2026', '03.11.2026') })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/dashboard')
    expect(searchStr(router)).toBe('')
  })

  it.each([
    ['?period=7', '7 дней', '28.10.2026'],
    ['', '30 дней', '05.10.2026'],
    ['?period=90', '90 дней', '06.08.2026'],
    ['?period=q', 'Квартал', '01.10.2026'],
    ['?period=y', 'Год', '01.01.2026'],
  ])('AC-2: /dashboard%s — отмечен «%s», диапазон %s – 03.11.2026', async (query, label, from) => {
    renderApp(`/dashboard${query}`)
    const panel = await findLoadedPanel()

    expectOnlyPressed(periodGroup(panel), PRESET_LABELS, label)
    expect(within(panel).getByRole('button', { name: rangeButtonName(from, '03.11.2026') })).toBeInTheDocument()
  })

  it('AC-5: рядом с переключателем — прошлый период 05.09.2026 – 04.10.2026', async () => {
    renderApp('/dashboard')
    const panel = await findLoadedPanel()

    expect(within(panel).getByText('05.09.2026 – 04.10.2026')).toBeInTheDocument()
  })
})

describe('Фильтры в URL — свой период и мусор', () => {
  it('AC-6: валидные from и to — свой период, ни один пресет не отмечен', async () => {
    renderApp('/dashboard?period=7&from=2026-10-01&to=2026-10-10')
    const panel = await findLoadedPanel()

    expectOnlyPressed(periodGroup(panel), PRESET_LABELS, null)
    expect(within(panel).getByRole('button', { name: rangeButtonName('01.10.2026', '10.10.2026') })).toBeInTheDocument()
    // 10 дней → 10 дней непосредственно перед 01.10
    expect(within(panel).getByText('21.09.2026 – 30.09.2026')).toBeInTheDocument()
  })

  it('AC-6: при валидном своём периоде period удаляется из URL заменой записи истории', async () => {
    const { router } = renderApp('/dashboard?period=7&from=2026-10-01&to=2026-10-10&mp=wb')
    await findLoadedPanel()

    await waitFor(() =>
      expect(sortedParams(searchStr(router))).toEqual([
        ['from', '2026-10-01'],
        ['mp', 'wb'],
        ['to', '2026-10-10'],
      ]),
    )
    expect(router.history.length).toBe(1)
  })

  it('AC-7: невалидный свой период + валидный period=7 → «7 дней», 28.10.2026 – 03.11.2026', async () => {
    renderApp('/dashboard?period=7&from=2026-10-10&to=2026-10-01')
    const panel = await findLoadedPanel()

    expectOnlyPressed(periodGroup(panel), PRESET_LABELS, '7 дней')
    expect(within(panel).getByRole('button', { name: rangeButtonName('28.10.2026', '03.11.2026') })).toBeInTheDocument()
  })

  it('AC-7: невалидный свой период + мусор в period → «30 дней»', async () => {
    renderApp(`/dashboard?period=${encodeURIComponent('<script>')}&from=2026-02-30&to=2026-03-05`)
    const panel = await findLoadedPanel()

    expectOnlyPressed(periodGroup(panel), PRESET_LABELS, '30 дней')
    expect(within(panel).getByRole('button', { name: rangeButtonName('05.10.2026', '03.11.2026') })).toBeInTheDocument()
  })

  it.each([
    ['from позже to', '?from=2026-10-10&to=2026-10-01&mp=wb', [['mp', 'wb']]],
    ['to позже сегодня', '?from=2026-11-01&to=2026-11-05&mp=wb', [['mp', 'wb']]],
    ['from раньше historyFrom', '?from=2024-11-03&to=2024-11-10&mp=wb', [['mp', 'wb']]],
    [
      'from позже to, рядом валидный period',
      '?period=7&from=2026-10-10&to=2026-10-01&mp=wb',
      [
        ['mp', 'wb'],
        ['period', '7'],
      ],
    ],
  ])(
    'AC-10: даты правильного формата, но невалидные по смыслу (%s), удаляются из URL после /api/meta без новой записи',
    async (_title, query, expected) => {
      const { router } = renderApp(`/dashboard${query}`)
      await findLoadedPanel()

      await waitFor(() => expect(sortedParams(searchStr(router))).toEqual(expected))
      expect(router.history.length).toBe(1)
    },
  )

  it.each([
    ['несуществующая дата', '?from=2026-02-30&to=2026-03-05'],
    ['from позже to', '?from=2026-10-10&to=2026-10-01'],
    ['to позже сегодня', '?from=2026-11-01&to=2026-11-05'],
    ['from раньше historyFrom', '?from=2024-11-03&to=2024-11-10'],
    ['только from', '?from=2026-10-01'],
    ['только to', '?to=2026-10-10'],
  ])('AC-7: %s (%s) → «30 дней», 05.10.2026 – 03.11.2026', async (_title, query) => {
    renderApp(`/dashboard${query}`)
    const panel = await findLoadedPanel()

    expectOnlyPressed(periodGroup(panel), PRESET_LABELS, '30 дней')
    expect(within(panel).getByRole('button', { name: rangeButtonName('05.10.2026', '03.11.2026') })).toBeInTheDocument()
  })

  it('AC-8: ?mp=hack&cat=shoes → все площадки + «Обувь»', async () => {
    renderApp('/dashboard?mp=hack&cat=shoes')
    const panel = await findLoadedPanel()

    expectOnlyPressed(marketplaceGroup(panel), MARKETPLACE_LABELS, 'Все')
    expect(categoriesButton(panel)).toHaveTextContent(/Категории\s*Обувь\s*1/)
  })

  it('AC-8 / T4: мусор во всех параметрах не ломает страницу — значения по умолчанию, разметка не внедряется', async () => {
    const script = encodeURIComponent('<script>alert(1)</script>')
    const img = encodeURIComponent('<img src=x onerror=alert(1)>')
    renderApp(`/dashboard?period=${script}&mp=${img}&cat=unknown&cmp=yes&from=${script}&to=2026-10-10`)
    const panel = await findLoadedPanel()

    expectPanelState(panel, DEFAULT_STATE)
    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(screen.queryByText(/alert\(1\)/)).toBeNull()
  })

  it('AC-9: ?cat=sports&cat=shoes&cat=shoes&cat=x → «Обувь, Спорт», 2 категории, URL в порядке справочника', async () => {
    const { router } = renderApp('/dashboard?cat=sports&cat=shoes&cat=shoes&cat=x')
    const panel = await findLoadedPanel()

    expect(categoriesButton(panel)).toHaveTextContent(/Категории\s*Обувь, Спорт\s*2/)
    await waitFor(() => expect(searchStr(router)).toBe('?cat=shoes&cat=sports'))
  })

  it('AC-10: URL приводится к чистому виду без новой записи истории', async () => {
    const { router } = renderApp('/dashboard?period=30&mp=hack&cmp=1&cat=shoes&cat=shoes&cat=x&foo=bar')
    await findLoadedPanel()

    await waitFor(() => expect(searchStr(router)).toBe('?cat=shoes'))
    expect(router.state.location.pathname).toBe('/dashboard')
    expect(router.history.length).toBe(1)
  })

  it('AC-10: только значения по умолчанию → пустая строка параметров, запись истории одна', async () => {
    const { router } = renderApp('/dashboard?period=30&mp=all')
    await findLoadedPanel()

    await waitFor(() => expect(searchStr(router)).toBe(''))
    expect(router.history.length).toBe(1)
  })

  it('AC-10: JSON-формат значений (mp=%22wb%22) — мусор, удаляется', async () => {
    const { router } = renderApp('/dashboard?mp=%22wb%22')
    const panel = await findLoadedPanel()

    await waitFor(() => expect(searchStr(router)).toBe(''))
    expectOnlyPressed(marketplaceGroup(panel), MARKETPLACE_LABELS, 'Все')
  })
})

describe('Фильтры в URL — адрес и история', () => {
  it('AC-11: /?mp=wb → /dashboard?mp=wb', async () => {
    const { router } = renderApp('/?mp=wb')
    const panel = await findLoadedPanel()

    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
    expect(searchStr(router)).toBe('?mp=wb')
    expectOnlyPressed(marketplaceGroup(panel), MARKETPLACE_LABELS, 'WB')
  })

  it('AC-11: / с несколькими параметрами — все сохраняются', async () => {
    const { router } = renderApp('/?period=7&cat=shoes&cat=sports&cmp=0')
    await findLoadedPanel()

    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
    expect(sortedParams(searchStr(router))).toEqual([
      ['cat', 'shoes'],
      ['cat', 'sports'],
      ['cmp', '0'],
      ['period', '7'],
    ])
  })

  it('AC-12: пресет, площадка и сравнение пишутся в URL новыми записями истории, «Назад» возвращает прошлое состояние', async () => {
    const { router, user } = renderApp('/dashboard')
    const panel = await findLoadedPanel()
    expect(router.history.length).toBe(1)

    await user.click(within(periodGroup(panel)).getByRole('button', { name: '7 дней' }))
    await waitFor(() => expect(searchStr(router)).toBe('?period=7'))
    expect(router.history.length).toBe(2)

    await user.click(within(marketplaceGroup(panel)).getByRole('button', { name: 'WB' }))
    await waitFor(() => expect(sortedParams(searchStr(router))).toEqual([['mp', 'wb'], ['period', '7']]))
    expect(router.history.length).toBe(3)

    await user.click(compareSwitch(panel))
    await waitFor(() =>
      expect(sortedParams(searchStr(router))).toEqual([
        ['cmp', '0'],
        ['mp', 'wb'],
        ['period', '7'],
      ]),
    )
    expect(router.history.length).toBe(4)
    expectPanelState(panel, { preset: '7 дней', mp: 'WB', compare: false, categories: /Категории\s*все/ })

    act(() => router.history.back())
    await waitFor(() => expect(sortedParams(searchStr(router))).toEqual([['mp', 'wb'], ['period', '7']]))
    await waitFor(() =>
      expectPanelState(panel, { preset: '7 дней', mp: 'WB', compare: true, categories: /Категории\s*все/ }),
    )

    act(() => router.history.back())
    await waitFor(() => expect(searchStr(router)).toBe('?period=7'))
    await waitFor(() =>
      expectPanelState(panel, { preset: '7 дней', mp: 'Все', compare: true, categories: /Категории\s*все/ }),
    )

    act(() => router.history.back())
    await waitFor(() => expect(searchStr(router)).toBe(''))
    await waitFor(() => expectPanelState(panel, DEFAULT_STATE))
  })

  it('AC-12: «Применить» в категориях пишет URL новой записью, «Назад» возвращает прежние категории', async () => {
    const { router, user } = renderApp('/dashboard')
    const panel = await findLoadedPanel()

    await user.click(categoriesButton(panel))
    const categoryList = await screen.findByRole('group', { name: 'Категории' })
    await user.click(within(categoryList).getByRole('checkbox', { name: /^Обувь/ }))
    await user.click(screen.getByRole('button', { name: 'Применить' }))

    await waitFor(() => expect(searchStr(router)).toBe('?cat=shoes'))
    expect(router.history.length).toBe(2)
    await waitFor(() => expect(categoriesButton(panel)).toHaveTextContent(/Категории\s*Обувь\s*1/))

    act(() => router.history.back())
    await waitFor(() => expect(searchStr(router)).toBe(''))
    await waitFor(() => expect(categoriesButton(panel)).toHaveTextContent(/Категории\s*все/))
  })

  it('AC-13: «30 дней», «Все» и включение сравнения убирают свои параметры из URL', async () => {
    const { router, user } = renderApp('/dashboard?period=7&mp=wb&cmp=0')
    const panel = await findLoadedPanel()

    await user.click(within(periodGroup(panel)).getByRole('button', { name: '30 дней' }))
    await waitFor(() => expect(sortedParams(searchStr(router))).toEqual([['cmp', '0'], ['mp', 'wb']]))

    await user.click(within(marketplaceGroup(panel)).getByRole('button', { name: 'Все' }))
    await waitFor(() => expect(searchStr(router)).toBe('?cmp=0'))

    await user.click(compareSwitch(panel))
    await waitFor(() => expect(searchStr(router)).toBe(''))
    expectPanelState(panel, DEFAULT_STATE)
  })

  it('AC-13: снятие всех категорий через «Применить» убирает cat из URL', async () => {
    const { router, user } = renderApp('/dashboard?cat=shoes')
    const panel = await findLoadedPanel()

    await user.click(categoriesButton(panel))
    const categoryList = await screen.findByRole('group', { name: 'Категории' })
    await user.click(within(categoryList).getByRole('checkbox', { name: /^Обувь/ }))
    await user.click(screen.getByRole('button', { name: 'Применить' }))

    await waitFor(() => expect(searchStr(router)).toBe(''))
  })

  it('AC-13: значения в URL — обычный текст, без JSON-кавычек', async () => {
    const { router, user } = renderApp('/dashboard')
    const panel = await findLoadedPanel()

    await user.click(within(marketplaceGroup(panel)).getByRole('button', { name: 'Ozon' }))
    await waitFor(() => expect(searchStr(router)).toBe('?mp=ozon'))
    expect(router.state.location.href).not.toContain('%22')
  })

  it('AC-14: открытие той же ссылки (новый роутер, новый кэш) восстанавливает все фильтры', async () => {
    const url = '/dashboard?period=q&mp=ozon&cat=home&cat=shoes&cmp=0'

    for (let tab = 0; tab < 2; tab++) {
      const { router } = renderApp(url)
      const panel = await findLoadedPanel()

      expectPanelState(panel, {
        preset: 'Квартал',
        mp: 'Ozon',
        compare: false,
        categories: /Категории\s*Обувь, Дом и кухня\s*2/,
      })
      expect(within(panel).getByRole('button', { name: rangeButtonName('01.10.2026', '03.11.2026') })).toBeInTheDocument()
      // Те же параметры, cat — в порядке справочника
      expect(sortedParams(searchStr(router))).toEqual([
        ['cat', 'shoes'],
        ['cat', 'home'],
        ['cmp', '0'],
        ['mp', 'ozon'],
        ['period', 'q'],
      ])
      // Закрываем «вкладку» перед следующей
      cleanup()
    }
  })

  it('AC-14: свой период восстанавливается из ссылки', async () => {
    renderApp('/dashboard?from=2026-10-01&to=2026-10-10&mp=wb')
    const panel = await findLoadedPanel()

    expectOnlyPressed(periodGroup(panel), PRESET_LABELS, null)
    expectOnlyPressed(marketplaceGroup(panel), MARKETPLACE_LABELS, 'WB')
    expect(within(panel).getByRole('button', { name: rangeButtonName('01.10.2026', '10.10.2026') })).toBeInTheDocument()
  })

  it('AC-15: «Сбросить фильтры» удаляет все параметры фильтров из URL', async () => {
    const { router, user } = renderApp('/dashboard?period=7&mp=ozon&cat=shoes&cat=kids&cmp=0')
    const panel = await findLoadedPanel()

    await user.click(within(panel).getByRole('button', { name: 'Сбросить фильтры' }))

    await waitFor(() => expect(searchStr(router)).toBe(''))
    expect(router.state.location.pathname).toBe('/dashboard')
    await waitFor(() => expectPanelState(panel, DEFAULT_STATE))
  })

  it('AC-15: «Сбросить фильтры» убирает и свой период', async () => {
    const { router, user } = renderApp('/dashboard?from=2026-10-01&to=2026-10-10')
    const panel = await findLoadedPanel()

    await user.click(within(panel).getByRole('button', { name: 'Сбросить фильтры' }))

    await waitFor(() => expect(searchStr(router)).toBe(''))
    await waitFor(() => expectOnlyPressed(periodGroup(panel), PRESET_LABELS, '30 дней'))
    expect(within(panel).getByRole('button', { name: rangeButtonName('05.10.2026', '03.11.2026') })).toBeInTheDocument()
  })
})

describe('Панель фильтров (≥ 640 px)', () => {
  it('AC-17: состав панели — период, диапазон, сравнение, маркетплейс, категории, сброс', async () => {
    renderApp('/dashboard')
    const panel = await findLoadedPanel()

    // Пресеты — ровно 5, в порядке макета
    const presets = within(periodGroup(panel)).getAllByRole('button')
    expect(presets.map((b) => text(b))).toEqual([...PRESET_LABELS])
    for (const button of presets) expect(button).toHaveAttribute('aria-pressed')

    const range = within(panel).getByRole('button', { name: rangeButtonName('05.10.2026', '03.11.2026') })
    expect(range).toHaveTextContent('05.10.2026 – 03.11.2026')

    const sw = compareSwitch(panel)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(within(panel).getByText('Сравнить с прошлым')).toBeInTheDocument()
    expect(within(panel).getByText('05.09.2026 – 04.10.2026')).toBeInTheDocument()

    const marketplaces = within(marketplaceGroup(panel)).getAllByRole('button')
    expect(marketplaces.map((b) => text(b))).toEqual([...MARKETPLACE_LABELS])
    for (const button of marketplaces) expect(button).toHaveAttribute('aria-pressed')

    expect(categoriesButton(panel)).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Сбросить фильтры' })).toBeInTheDocument()

    // Мобильной кнопки на широком экране нет
    expect(screen.queryByRole('button', { name: /^Фильтры\s*\(/ })).toBeNull()
  })

  it('AC-17: переключатель сравнения меняет aria-checked', async () => {
    const { user } = renderApp('/dashboard')
    const panel = await findLoadedPanel()

    await user.click(compareSwitch(panel))
    await waitFor(() => expect(compareSwitch(panel)).toHaveAttribute('aria-checked', 'false'))
  })

  it.each([
    // Ничего не выбрано — «все» и счётчик «0», как в макете
    ['', /Категории\s*все\s*0\s*$/],
    ['?cat=shoes', /Категории\s*Обувь\s*1\s*$/],
    ['?cat=clothing&cat=shoes', /Категории\s*Обувь, Одежда\s*2\s*$/],
    ['?cat=shoes&cat=clothing&cat=accessories', /Категории\s*Обувь, Одежда\s\+1\s*3\s*$/],
    ['?cat=shoes&cat=clothing&cat=electronics&cat=beauty&cat=home', /Категории\s*Обувь, Одежда\s\+3\s*5\s*$/],
  ])('AC-18: /dashboard%s → сводка и счётчик на кнопке «Категории»', async (query, expected) => {
    renderApp(`/dashboard${query}`)
    const panel = await findLoadedPanel()

    expect(categoriesButton(panel)).toHaveTextContent(expected)
  })

  it('AC-18: aria-haspopup="true", aria-expanded переключается при открытии', async () => {
    const { user } = renderApp('/dashboard')
    const panel = await findLoadedPanel()
    const button = categoriesButton(panel)

    expect(button).toHaveAttribute('aria-haspopup', 'true')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('group', { name: 'Категории' })).toBeNull()

    await user.click(button)

    expect(await screen.findByRole('group', { name: 'Категории' })).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('AC-18: сводка и счётчик на кнопке — по URL, отметки черновика их не меняют до «Применить»', async () => {
    const { user } = renderApp('/dashboard?cat=shoes')
    const panel = await findLoadedPanel()

    await user.click(categoriesButton(panel))
    const categoryList = await screen.findByRole('group', { name: 'Категории' })
    await user.click(within(categoryList).getByRole('checkbox', { name: /^Одежда/ }))
    await user.click(within(categoryList).getByRole('checkbox', { name: /^Спорт/ }))

    expect(categoriesButton(panel)).toHaveTextContent(/Категории\s*Обувь\s*1\s*$/)

    await user.click(within(categoryList).getByRole('button', { name: 'Применить' }))

    await waitFor(() => expect(categoriesButton(panel)).toHaveTextContent(/Категории\s*Обувь, Одежда\s\+1\s*3\s*$/))
  })

  it('AC-18: «Очистить» в черновике не меняет сводку на кнопке', async () => {
    const { user } = renderApp('/dashboard?cat=shoes&cat=clothing')
    const panel = await findLoadedPanel()

    await user.click(categoriesButton(panel))
    const categoryList = await screen.findByRole('group', { name: 'Категории' })
    await user.click(within(categoryList).getByRole('button', { name: 'Очистить' }))

    expect(categoriesButton(panel)).toHaveTextContent(/Категории\s*Обувь, Одежда\s*2\s*$/)
  })

  it('AC-19: «Применить» закрывает список, aria-expanded="false"', async () => {
    const { router, user } = renderApp('/dashboard')
    const panel = await findLoadedPanel()

    await user.click(categoriesButton(panel))
    const categoryList = await screen.findByRole('group', { name: 'Категории' })
    await user.click(within(categoryList).getByRole('checkbox', { name: /^Красота/ }))
    await user.click(within(categoryList).getByRole('button', { name: 'Применить' }))

    await waitFor(() => expect(screen.queryByRole('group', { name: 'Категории' })).toBeNull())
    expect(categoriesButton(panel)).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(searchStr(router)).toBe('?cat=beauty'))
  })

  it('AC-19: список — 8 чекбоксов с названием и числом товаров из /api/meta, в порядке справочника', async () => {
    const { user } = renderApp('/dashboard?cat=sports')
    const panel = await findLoadedPanel()

    await user.click(categoriesButton(panel))
    const categoryList = await screen.findByRole('group', { name: 'Категории' })
    const boxes = within(categoryList).getAllByRole('checkbox')

    expect(boxes).toHaveLength(8)
    META_FIXTURE.categories.forEach((category, i) => {
      expect(boxes[i]).toHaveAccessibleName(new RegExp(`^${category.name}\\s*${category.productCount}$`))
      // Отметки черновика начинаются с категорий из URL
      if (category.id === 'sports') expect(boxes[i]).toBeChecked()
      else expect(boxes[i]).not.toBeChecked()
    })
    expect(within(categoryList).getByRole('button', { name: 'Очистить' })).toBeInTheDocument()
    expect(within(categoryList).getByRole('button', { name: 'Применить' })).toBeInTheDocument()
  })

  it('AC-19: отметки — черновик, URL меняется только по «Применить»', async () => {
    const { router, user } = renderApp('/dashboard')
    const panel = await findLoadedPanel()

    await user.click(categoriesButton(panel))
    const categoryList = await screen.findByRole('group', { name: 'Категории' })
    await user.click(within(categoryList).getByRole('checkbox', { name: /^Спорт/ }))
    await user.click(within(categoryList).getByRole('checkbox', { name: /^Обувь/ }))

    expect(within(categoryList).getByRole('checkbox', { name: /^Спорт/ })).toBeChecked()
    expect(searchStr(router)).toBe('')
    expect(router.history.length).toBe(1)

    await user.click(within(categoryList).getByRole('button', { name: 'Применить' }))

    await waitFor(() => expect(searchStr(router)).toBe('?cat=shoes&cat=sports'))
  })

  it('AC-19: «Очистить» снимает все отметки черновика, URL не меняется до «Применить»', async () => {
    const { router, user } = renderApp('/dashboard?cat=shoes&cat=home')
    const panel = await findLoadedPanel()

    await user.click(categoriesButton(panel))
    const categoryList = await screen.findByRole('group', { name: 'Категории' })
    await user.click(within(categoryList).getByRole('checkbox', { name: /^Спорт/ }))
    await user.click(within(categoryList).getByRole('button', { name: 'Очистить' }))

    for (const box of within(categoryList).getAllByRole('checkbox')) expect(box).not.toBeChecked()
    expect(searchStr(router)).toBe('?cat=shoes&cat=home')

    await user.click(within(categoryList).getByRole('button', { name: 'Применить' }))
    await waitFor(() => expect(searchStr(router)).toBe(''))
  })

  it('AC-19: Esc закрывает список без применения, фокус возвращается на «Категории»', async () => {
    const { router, user } = renderApp('/dashboard?cat=shoes')
    const panel = await findLoadedPanel()

    await user.click(categoriesButton(panel))
    const categoryList = await screen.findByRole('group', { name: 'Категории' })
    await user.click(within(categoryList).getByRole('checkbox', { name: /^Спорт/ }))
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('group', { name: 'Категории' })).toBeNull())
    expect(searchStr(router)).toBe('?cat=shoes')
    expect(router.history.length).toBe(1)
    expect(categoriesButton(panel)).toHaveFocus()
    expect(categoriesButton(panel)).toHaveAttribute('aria-expanded', 'false')

    // Черновик отброшен: при новом открытии — отметки из URL
    await user.click(categoriesButton(panel))
    const reopened = await screen.findByRole('group', { name: 'Категории' })
    expect(within(reopened).getByRole('checkbox', { name: /^Спорт/ })).not.toBeChecked()
    expect(within(reopened).getByRole('checkbox', { name: /^Обувь/ })).toBeChecked()
  })

  it('AC-19: клик вне списка закрывает его без применения, фокус возвращается на «Категории»', async () => {
    const { router, user } = renderApp('/dashboard')
    const panel = await findLoadedPanel()

    await user.click(categoriesButton(panel))
    const categoryList = await screen.findByRole('group', { name: 'Категории' })
    await user.click(within(categoryList).getByRole('checkbox', { name: /^Обувь/ }))
    await user.click(document.body)

    await waitFor(() => expect(screen.queryByRole('group', { name: 'Категории' })).toBeNull())
    expect(searchStr(router)).toBe('')
    expect(categoriesButton(panel)).toHaveFocus()
    expect(categoriesButton(panel)).toHaveTextContent(/Категории\s*все/)
  })
})

describe('Панель фильтров — загрузка и ошибка /api/meta', () => {
  it('AC-22: пока /api/meta грузится — скелетоны вместо дат и сводки, «Категории» недоступна', async () => {
    server.use(
      http.get('/api/meta', async () => {
        await delay('infinite')
        return HttpResponse.json(META_FIXTURE)
      }),
    )
    renderApp('/dashboard')
    const panel = await screen.findByRole('search', { name: 'Фильтры' })

    expect(panel.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(panel.textContent ?? '').not.toMatch(DATE_PATTERN)
    for (const el of panel.querySelectorAll('[aria-label]')) {
      expect(el.getAttribute('aria-label') ?? '').not.toMatch(DATE_PATTERN)
    }
    expect(categoriesButton(panel)).toBeDisabled()
  })

  it('AC-22: пока /api/meta грузится — пресеты, площадка и сравнение уже работают', async () => {
    server.use(
      http.get('/api/meta', async () => {
        await delay('infinite')
        return HttpResponse.json(META_FIXTURE)
      }),
    )
    const { router, user } = renderApp('/dashboard')
    const panel = await screen.findByRole('search', { name: 'Фильтры' })

    await user.click(within(periodGroup(panel)).getByRole('button', { name: '7 дней' }))
    await waitFor(() => expect(searchStr(router)).toBe('?period=7'))
    expect(within(periodGroup(panel)).getByRole('button', { name: '7 дней' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(marketplaceGroup(panel)).getByRole('button', { name: 'WB' }))
    await waitFor(() => expect(sortedParams(searchStr(router))).toEqual([['mp', 'wb'], ['period', '7']]))

    await user.click(compareSwitch(panel))
    await waitFor(() => expect(compareSwitch(panel)).toHaveAttribute('aria-checked', 'false'))
    expect(new URLSearchParams(searchStr(router)).get('cmp')).toBe('0')
  })

  it('AC-22: после загрузки /api/meta элемента aria-busy="true" нет, даты показаны', async () => {
    renderApp('/dashboard')
    const panel = await screen.findByRole('search', { name: 'Фильтры' })

    await waitFor(() => expect(panel.querySelector('[aria-busy="true"]')).toBeNull())
    expect(within(panel).getByRole('button', { name: rangeButtonName('05.10.2026', '03.11.2026') })).toBeInTheDocument()
  })

  it('AC-22: при ошибке /api/meta скелетоны убираются, даты и категории не показываются, «Категории» disabled, остальное работает', async () => {
    let requested = false
    server.use(
      http.get('/api/meta', () => {
        requested = true
        return new HttpResponse(null, { status: 500 })
      }),
    )
    const { router, user } = renderApp('/dashboard')
    const panel = await screen.findByRole('search', { name: 'Фильтры' })
    await waitFor(() => expect(requested).toBe(true))

    // Ошибка обработана — скелетонов (aria-busy) больше нет
    await waitFor(() => expect(panel.querySelector('[aria-busy="true"]')).toBeNull())

    expect(panel.textContent ?? '').not.toMatch(DATE_PATTERN)
    for (const el of panel.querySelectorAll('[aria-label]')) {
      expect(el.getAttribute('aria-label') ?? '').not.toMatch(DATE_PATTERN)
    }
    const button = categoriesButton(panel)
    expect(button).toBeDisabled()
    await user.click(button)
    expect(screen.queryByRole('group', { name: 'Категории' })).toBeNull()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)

    await user.click(within(periodGroup(panel)).getByRole('button', { name: '90 дней' }))
    await waitFor(() => expect(searchStr(router)).toBe('?period=90'))
    await user.click(within(marketplaceGroup(panel)).getByRole('button', { name: 'Ozon' }))
    await waitFor(() => expect(new URLSearchParams(searchStr(router)).get('mp')).toBe('ozon'))
  })

  it('AC-22 / T5: ответ /api/meta не по контракту — как ошибка, страница не падает', async () => {
    server.use(http.get('/api/meta', () => HttpResponse.json({ today: 'вчера', categories: 'много' })))
    const { router, user } = renderApp('/dashboard')
    const panel = await screen.findByRole('search', { name: 'Фильтры' })
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))

    expect(panel.textContent ?? '').not.toMatch(/вчера|много/)
    await user.click(within(periodGroup(panel)).getByRole('button', { name: '7 дней' }))
    await waitFor(() => expect(searchStr(router)).toBe('?period=7'))
  })
})

describe('Кнопка-диапазон до фичи «Календарь»', () => {
  it('AC-23: видна, aria-disabled="true", клик ничего не делает', async () => {
    const { router, user } = renderApp('/dashboard?period=7')
    const panel = await findLoadedPanel()
    const range = within(panel).getByRole('button', { name: rangeButtonName('28.10.2026', '03.11.2026') })

    expect(range).toBeVisible()
    expect(range).toHaveAttribute('aria-disabled', 'true')

    await user.click(range)

    expect(searchStr(router)).toBe('?period=7')
    expect(router.history.length).toBe(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Категории' })).toBeNull()
    expectOnlyPressed(periodGroup(panel), PRESET_LABELS, '7 дней')
  })
})
