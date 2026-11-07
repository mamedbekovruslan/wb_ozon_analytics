import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarketplaceBadge } from '../index'

/*
 * Spec 006 «Топ товаров», AC-19: бейдж площадки из public API entities/marketplace.
 * CSS-модули jsdom не применяет, поэтому здесь — текст и то, что оформление WB и Ozon
 * различается (класс или inline-стиль). Сами цвета (--wb-soft / --wb-text,
 * --ozon-soft / --ozon-text) сверяются с токенами в e2e/top-products.spec.ts.
 */

/** Корневой элемент бейджа — единственный ребёнок контейнера. */
function renderBadge(marketplace: 'wb' | 'ozon'): HTMLElement {
  const { container } = render(<MarketplaceBadge marketplace={marketplace} />)
  expect(container.children).toHaveLength(1)
  return container.firstElementChild as HTMLElement
}

/** Всё, чем можно задать цвет без вычисленных стилей: классы и inline-стиль. */
const look = (el: HTMLElement) => `${el.className} | ${el.getAttribute('style') ?? ''}`

describe('MarketplaceBadge', () => {
  it('AC-19: marketplace="wb" — текст «WB»', () => {
    const badge = renderBadge('wb')
    expect((badge.textContent ?? '').trim()).toBe('WB')
  })

  it('AC-19: marketplace="ozon" — текст «Ozon»', () => {
    const badge = renderBadge('ozon')
    expect((badge.textContent ?? '').trim()).toBe('Ozon')
  })

  it('AC-19: у WB и Ozon разное оформление (цвета задаются классом или стилем)', () => {
    const wb = look(renderBadge('wb'))
    const ozon = look(renderBadge('ozon'))
    expect(wb.trim()).not.toBe('|')
    expect(wb).not.toBe(ozon)
  })

  it('AC-19: если цвета заданы inline-стилем — только через токены площадки', () => {
    for (const [mp, soft, text] of [
      ['wb', '--wb-soft', '--wb-text'],
      ['ozon', '--ozon-soft', '--ozon-text'],
    ] as const) {
      const style = renderBadge(mp).getAttribute('style') ?? ''
      if (!/color|background/i.test(style)) continue
      expect(style, mp).toContain(soft)
      expect(style, mp).toContain(text)
    }
  })

  it('AC-19 / T3: бейдж — обычный текст, без ссылок, кнопок и фокуса', () => {
    for (const mp of ['wb', 'ozon'] as const) {
      const badge = renderBadge(mp)
      expect(badge.querySelector('a, button, [tabindex]')).toBeNull()
      expect(badge).not.toHaveAttribute('tabindex')
    }
  })
})

/*
 * Spec 007 «Скоро закончится», AC-5: проп size: 'md' | 'sm'.
 * sm — для строки остатков (18, padding 0 5px, 11/600, радиус 4), без size — прежний вид
 * (20, 12/600). Вычисленные размеры — в e2e/low-stock.spec.ts и e2e/top-products.spec.ts.
 */

type Size = 'md' | 'sm'

function renderSized(marketplace: 'wb' | 'ozon', size?: Size): HTMLElement {
  const { container } = render(
    size === undefined ? <MarketplaceBadge marketplace={marketplace} /> : <MarketplaceBadge marketplace={marketplace} size={size} />,
  )
  expect(container.children).toHaveLength(1)
  return container.firstElementChild as HTMLElement
}

describe('MarketplaceBadge, size', () => {
  it.each(['wb', 'ozon'] as const)('AC-5: size="sm" — тот же текст (%s)', (mp) => {
    expect((renderSized(mp, 'sm').textContent ?? '').trim()).toBe(mp === 'wb' ? 'WB' : 'Ozon')
  })

  it.each(['wb', 'ozon'] as const)('AC-5: size="sm" выглядит иначе, чем без size (%s)', (mp) => {
    expect(look(renderSized(mp, 'sm'))).not.toBe(look(renderSized(mp)))
  })

  it.each(['wb', 'ozon'] as const)('AC-5: без size — как size="md", прежний вид (%s)', (mp) => {
    expect(look(renderSized(mp, 'md'))).toBe(look(renderSized(mp)))
  })

  it('AC-5: в размере sm у WB и Ozon по-прежнему разные цвета', () => {
    expect(look(renderSized('wb', 'sm'))).not.toBe(look(renderSized('ozon', 'sm')))
  })

  it('AC-5: если цвета sm заданы inline-стилем — только через токены площадки', () => {
    for (const [mp, soft, text] of [
      ['wb', '--wb-soft', '--wb-text'],
      ['ozon', '--ozon-soft', '--ozon-text'],
    ] as const) {
      const style = renderSized(mp, 'sm').getAttribute('style') ?? ''
      if (!/color|background/i.test(style)) continue
      expect(style, mp).toContain(soft)
      expect(style, mp).toContain(text)
    }
  })

  it('AC-5 / T3: sm — без ссылок, кнопок и фокуса', () => {
    for (const mp of ['wb', 'ozon'] as const) {
      const badge = renderSized(mp, 'sm')
      expect(badge.querySelector('a, button, [tabindex]')).toBeNull()
      expect(badge).not.toHaveAttribute('tabindex')
    }
  })
})
