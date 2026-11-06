import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMatchMedia,
  EN_DASH,
  MARKETPLACE_LABELS,
  META_FIXTURE,
  MIDDOT,
  PRESET_LABELS,
  sortedParams,
} from './filtersTestFixtures'
import { createAppRouter } from './router'

/*
 * Spec 002 «Фильтры в URL» — телефон (< 640 px): кнопка «Фильтры (N)», сводка
 * в две строки и bottom sheet. «Сегодня» из фикстуры — 04.11.2026.
 */

const server = setupServer(
  http.get('/api/meta', () => HttpResponse.json(META_FIXTURE)),
  http.get('/api/*', () => HttpResponse.json({ message: 'Недоступно в тесте фильтров' }, { status: 503 })),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  // matchMedia('(max-width: 639px)') → true — мобильный вариант
  vi.stubGlobal('matchMedia', createMatchMedia(true))
})
afterEach(() => {
  server.resetHandlers()
  vi.unstubAllGlobals()
})
afterAll(() => server.close())

function renderApp(url: string) {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [url] }) })
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

/** «30 дней · 05.10–03.11» — разделитель « · », тире U+2013 без пробелов. */
const line1 = (label: string, from: string, to: string) => `${label} ${MIDDOT} ${from}${EN_DASH}${to}`
const line2 = (...parts: string[]) => parts.join(` ${MIDDOT} `)

const filtersButtonName = (n: number) => new RegExp(`^Фильтры\\s*\\(${n}\\)$`)
const findFiltersButton = () => screen.findByRole('button', { name: /^Фильтры\s*\(\d+\)$/ })

/** Ждём загрузки /api/meta: сводка с датами появилась, скелетонов нет. */
async function waitMetaLoaded(): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
    expect(screen.getByText(new RegExp(`\\d{2}\\.\\d{2}${EN_DASH}\\d{2}\\.\\d{2}`))).toBeInTheDocument()
  })
}

async function openSheet(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(await findFiltersButton())
  return screen.findByRole('dialog', { name: 'Фильтры' })
}

function expectOnlyPressed(group: HTMLElement, labels: readonly string[], pressed: string | null): void {
  for (const label of labels) {
    expect(within(group).getByRole('button', { name: label })).toHaveAttribute(
      'aria-pressed',
      label === pressed ? 'true' : 'false',
    )
  }
}

const sheetPeriod = (dialog: HTMLElement) => within(dialog).getByRole('group', { name: 'Период' })
const sheetMarketplace = (dialog: HTMLElement) => within(dialog).getByRole('group', { name: 'Маркетплейс' })
const sheetSwitch = (dialog: HTMLElement) =>
  within(dialog).getByRole('switch', { name: 'Сравнить с прошлым периодом' })
const categoryChip = (dialog: HTMLElement, name: string) => within(dialog).getByRole('button', { name })

describe('Мобильная полоса фильтров (< 640 px)', () => {
  it('AC-20: вместо панели — кнопка «Фильтры (2)» и сводка по умолчанию', async () => {
    renderApp('/dashboard')
    const button = await findFiltersButton()
    await waitMetaLoaded()

    // По умолчанию: 1 за период + 1 за сравнение
    expect(button).toHaveAccessibleName(filtersButtonName(2))
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.getByText(line1('30 дней', '05.10', '03.11'))).toBeInTheDocument()
    expect(screen.getByText(line2('Все площадки', 'все категории', 'сравнение'))).toBeInTheDocument()

    // Панели нет
    expect(screen.queryByRole('group', { name: 'Период' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Маркетплейс' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Сбросить фильтры' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Категории/ })).toBeNull()
  })

  it.each([
    // N = 1 (период) + 0 (сравнение выкл.) + 1 (WB) + 1 (категории)
    ['?period=7&mp=wb&cat=shoes&cmp=0', 3, line1('7 дней', '28.10', '03.11'), line2('WB', '1 категория')],
    // N = 1 + 1 + 1 + 1
    [
      '?mp=ozon&cat=shoes&cat=clothing&cat=home',
      4,
      line1('30 дней', '05.10', '03.11'),
      line2('Ozon', '3 категории', 'сравнение'),
    ],
    // N = 1 + 0 + 0 + 1
    [
      '?cat=shoes&cat=clothing&cat=electronics&cat=beauty&cat=home&cmp=0',
      2,
      line1('30 дней', '05.10', '03.11'),
      line2('Все площадки', '5 категорий'),
    ],
    // Только сравнение выключено: N = 1
    ['?cmp=0', 1, line1('30 дней', '05.10', '03.11'), line2('Все площадки', 'все категории')],
    ['?period=q', 2, line1('Квартал', '01.10', '03.11'), line2('Все площадки', 'все категории', 'сравнение')],
    ['?period=y', 2, line1('Год', '01.01', '03.11'), line2('Все площадки', 'все категории', 'сравнение')],
    // Свой период — тоже «1 за период»
    [
      '?from=2026-10-05&to=2026-11-03',
      2,
      line1('Свой период', '05.10', '03.11'),
      line2('Все площадки', 'все категории', 'сравнение'),
    ],
    // Все 8 категорий
    [
      '?cat=shoes&cat=clothing&cat=electronics&cat=beauty&cat=home&cat=sports&cat=kids&cat=accessories',
      3,
      line1('30 дней', '05.10', '03.11'),
      line2('Все площадки', '8 категорий', 'сравнение'),
    ],
  ])('AC-20: /dashboard%s → «Фильтры (%i)», «%s», «%s»', async (query, n, first, second) => {
    renderApp(`/dashboard${query}`)
    const button = await findFiltersButton()
    await waitMetaLoaded()

    expect(button).toHaveAccessibleName(filtersButtonName(n))
    expect(screen.getByText(first)).toBeInTheDocument()
    expect(screen.getByText(second)).toBeInTheDocument()
  })
})

describe('Bottom sheet фильтров', () => {
  it('AC-21: диалог «Фильтры» с aria-modal, секциями и кнопками; фокус внутри', async () => {
    const { user } = renderApp('/dashboard')
    await waitMetaLoaded()
    const dialog = await openSheet(user)

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    expect(within(dialog).getByRole('button', { name: 'Закрыть фильтры' })).toBeInTheDocument()
    expectOnlyPressed(sheetPeriod(dialog), PRESET_LABELS, '30 дней')
    expect(within(sheetPeriod(dialog)).getByRole('button', { name: 'Свой период' })).toBeInTheDocument()
    expect(sheetSwitch(dialog)).toHaveAttribute('aria-checked', 'true')
    expectOnlyPressed(sheetMarketplace(dialog), MARKETPLACE_LABELS, 'Все')
    expect(within(dialog).getByText(`Категории ${MIDDOT} выбрано 0`)).toBeInTheDocument()
    for (const category of META_FIXTURE.categories) {
      expect(categoryChip(dialog, category.name)).toHaveAttribute('aria-pressed', 'false')
    }
    expect(within(dialog).getByRole('button', { name: 'Сбросить' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Показать результаты' })).toBeInTheDocument()
  })

  it('AC-21: состояние листа при открытии — из URL', async () => {
    const { user } = renderApp('/dashboard?period=90&mp=wb&cat=sports&cat=kids&cmp=0')
    await waitMetaLoaded()
    const dialog = await openSheet(user)

    expectOnlyPressed(sheetPeriod(dialog), PRESET_LABELS, '90 дней')
    expectOnlyPressed(sheetMarketplace(dialog), MARKETPLACE_LABELS, 'WB')
    expect(sheetSwitch(dialog)).toHaveAttribute('aria-checked', 'false')
    expect(within(dialog).getByText(`Категории ${MIDDOT} выбрано 2`)).toBeInTheDocument()
    expect(categoryChip(dialog, 'Спорт')).toHaveAttribute('aria-pressed', 'true')
    expect(categoryChip(dialog, 'Детские товары')).toHaveAttribute('aria-pressed', 'true')
    expect(categoryChip(dialog, 'Обувь')).toHaveAttribute('aria-pressed', 'false')
  })

  it('AC-21: всё в черновике — URL меняется только по «Показать результаты», фокус возвращается на «Фильтры (N)»', async () => {
    const { router, user } = renderApp('/dashboard')
    await waitMetaLoaded()
    const dialog = await openSheet(user)

    await user.click(within(sheetPeriod(dialog)).getByRole('button', { name: '7 дней' }))
    await user.click(within(sheetMarketplace(dialog)).getByRole('button', { name: 'Ozon' }))
    await user.click(sheetSwitch(dialog))
    await user.click(categoryChip(dialog, 'Спорт'))
    await user.click(categoryChip(dialog, 'Обувь'))

    // Черновик виден в листе, но URL прежний
    expectOnlyPressed(sheetPeriod(dialog), PRESET_LABELS, '7 дней')
    expectOnlyPressed(sheetMarketplace(dialog), MARKETPLACE_LABELS, 'Ozon')
    expect(sheetSwitch(dialog)).toHaveAttribute('aria-checked', 'false')
    expect(categoryChip(dialog, 'Обувь')).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByText(`Категории ${MIDDOT} выбрано 2`)).toBeInTheDocument()
    expect(searchStr(router)).toBe('')
    expect(router.history.length).toBe(1)

    await user.click(within(dialog).getByRole('button', { name: 'Показать результаты' }))

    await waitFor(() =>
      expect(sortedParams(searchStr(router))).toEqual([
        ['cat', 'shoes'],
        ['cat', 'sports'],
        ['cmp', '0'],
        ['mp', 'ozon'],
        ['period', '7'],
      ]),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Пять изменений в черновике — одна запись истории
    expect(router.history.length).toBe(2)
    const button = await findFiltersButton()
    // N = 1 (период) + 0 (сравнение выкл.) + 1 (Ozon) + 1 (категории)
    expect(button).toHaveAccessibleName(filtersButtonName(3))
    expect(button).toHaveFocus()
    expect(screen.getByText(line1('7 дней', '28.10', '03.11'))).toBeInTheDocument()
    expect(screen.getByText(line2('Ozon', '2 категории'))).toBeInTheDocument()
  })

  it('AC-21: «Показать результаты» — ровно одна запись истории, «Назад» возвращает прежние фильтры целиком', async () => {
    const { router, user } = renderApp('/dashboard?mp=wb')
    await waitMetaLoaded()
    const dialog = await openSheet(user)

    await user.click(within(sheetPeriod(dialog)).getByRole('button', { name: '90 дней' }))
    await user.click(within(sheetMarketplace(dialog)).getByRole('button', { name: 'Ozon' }))
    await user.click(sheetSwitch(dialog))
    await user.click(within(dialog).getByRole('button', { name: 'Показать результаты' }))

    await waitFor(() =>
      expect(sortedParams(searchStr(router))).toEqual([
        ['cmp', '0'],
        ['mp', 'ozon'],
        ['period', '90'],
      ]),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(router.history.length).toBe(2)

    // Один шаг «Назад» — сразу к исходному набору
    act(() => router.history.back())
    await waitFor(() => expect(searchStr(router)).toBe('?mp=wb'))
  })

  it('AC-21: «Показать результаты» без изменений в черновике закрывает лист', async () => {
    const { router, user } = renderApp('/dashboard?mp=wb')
    await waitMetaLoaded()
    const dialog = await openSheet(user)

    await user.click(within(dialog).getByRole('button', { name: 'Показать результаты' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(searchStr(router)).toBe('?mp=wb')
  })

  it('AC-21: «Сбросить» сбрасывает черновик к значениям по умолчанию, URL — только по «Показать результаты»', async () => {
    const { router, user } = renderApp('/dashboard?period=7&mp=wb&cat=shoes&cmp=0')
    await waitMetaLoaded()
    const dialog = await openSheet(user)

    await user.click(within(dialog).getByRole('button', { name: 'Сбросить' }))

    expectOnlyPressed(sheetPeriod(dialog), PRESET_LABELS, '30 дней')
    expectOnlyPressed(sheetMarketplace(dialog), MARKETPLACE_LABELS, 'Все')
    expect(sheetSwitch(dialog)).toHaveAttribute('aria-checked', 'true')
    expect(categoryChip(dialog, 'Обувь')).toHaveAttribute('aria-pressed', 'false')
    expect(within(dialog).getByText(`Категории ${MIDDOT} выбрано 0`)).toBeInTheDocument()
    expect(sortedParams(searchStr(router))).toEqual([
      ['cat', 'shoes'],
      ['cmp', '0'],
      ['mp', 'wb'],
      ['period', '7'],
    ])

    await user.click(within(dialog).getByRole('button', { name: 'Показать результаты' }))

    await waitFor(() => expect(searchStr(router)).toBe(''))
  })

  it.each([
    ['крестик «Закрыть фильтры»', 'close'],
    ['Esc', 'escape'],
  ] as const)('AC-21: %s закрывает лист без применения, фокус — на «Фильтры (N)»', async (_title, how) => {
    const { router, user } = renderApp('/dashboard')
    await waitMetaLoaded()
    const dialog = await openSheet(user)

    await user.click(within(sheetPeriod(dialog)).getByRole('button', { name: '7 дней' }))
    await user.click(categoryChip(dialog, 'Обувь'))
    if (how === 'close') await user.click(within(dialog).getByRole('button', { name: 'Закрыть фильтры' }))
    else await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(searchStr(router)).toBe('')
    expect(router.history.length).toBe(1)
    expect(await findFiltersButton()).toHaveFocus()
    expect(screen.getByText(line1('30 дней', '05.10', '03.11'))).toBeInTheDocument()

    // Черновик отброшен: при новом открытии — состояние из URL
    const reopened = await openSheet(user)
    expectOnlyPressed(sheetPeriod(reopened), PRESET_LABELS, '30 дней')
    expect(categoryChip(reopened, 'Обувь')).toHaveAttribute('aria-pressed', 'false')
  })

  it('AC-23: чип «Свой период» виден, aria-disabled="true", клик ничего не делает', async () => {
    const { router, user } = renderApp('/dashboard?period=7')
    await waitMetaLoaded()
    const dialog = await openSheet(user)
    const custom = within(sheetPeriod(dialog)).getByRole('button', { name: 'Свой период' })

    expect(custom).toBeVisible()
    expect(custom).toHaveAttribute('aria-disabled', 'true')

    await user.click(custom)

    expectOnlyPressed(sheetPeriod(dialog), PRESET_LABELS, '7 дней')
    expect(custom).not.toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('dialog', { name: 'Фильтры' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Показать результаты' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(searchStr(router)).toBe('?period=7')
  })
})

describe('Мобильная полоса — загрузка /api/meta', () => {
  it('AC-22: пока /api/meta грузится — скелетон вместо дат в сводке, кнопка «Фильтры» работает', async () => {
    server.use(
      http.get('/api/meta', async () => {
        await delay('infinite')
        return HttpResponse.json(META_FIXTURE)
      }),
    )
    const { router, user } = renderApp('/dashboard')
    await findFiltersButton()

    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByText(new RegExp(`\\d{2}\\.\\d{2}${EN_DASH}\\d{2}\\.\\d{2}`))).toBeNull()

    // Период, площадка и сравнение доступны и без /api/meta
    const dialog = await openSheet(user)
    await user.click(within(sheetPeriod(dialog)).getByRole('button', { name: '7 дней' }))
    await user.click(within(sheetMarketplace(dialog)).getByRole('button', { name: 'WB' }))
    await user.click(within(dialog).getByRole('button', { name: 'Показать результаты' }))

    await waitFor(() => expect(sortedParams(searchStr(router))).toEqual([['mp', 'wb'], ['period', '7']]))
  })

  it('AC-22: при ошибке /api/meta скелетонов нет, дат в сводке нет, фильтры работают', async () => {
    let requested = false
    server.use(
      http.get('/api/meta', () => {
        requested = true
        return new HttpResponse(null, { status: 500 })
      }),
    )
    const { router, user } = renderApp('/dashboard')
    await findFiltersButton()
    await waitFor(() => expect(requested).toBe(true))

    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull())
    expect(screen.queryByText(new RegExp(`\\d{2}\\.\\d{2}${EN_DASH}\\d{2}\\.\\d{2}`))).toBeNull()

    const dialog = await openSheet(user)
    await user.click(within(sheetPeriod(dialog)).getByRole('button', { name: 'Год' }))
    await user.click(within(dialog).getByRole('button', { name: 'Показать результаты' }))

    await waitFor(() => expect(searchStr(router)).toBe('?period=y'))
  })
})
