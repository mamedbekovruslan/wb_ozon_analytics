import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SchemeBadge } from '../index'

/*
 * Spec 008 «Страница «Остатки»», AC-16: SchemeBadge получает size="md" — высота 20,
 * остальное как sm (spec 007, AC-6); без size — прежние 18.
 * Вычисленная высота — в e2e/stocks.spec.ts. Здесь — текст, то, что md отличается от
 * размера по умолчанию, и что FBO / FBS в md выглядят одинаково.
 */

type Scheme = 'FBO' | 'FBS'

function renderBadge(scheme: Scheme, size?: 'md'): HTMLElement {
  const { container } = render(size ? <SchemeBadge scheme={scheme} size={size} /> : <SchemeBadge scheme={scheme} />)
  expect(container.children).toHaveLength(1)
  return container.firstElementChild as HTMLElement
}

const look = (el: HTMLElement) => `${el.className} | ${el.getAttribute('style') ?? ''}`

describe('SchemeBadge size="md"', () => {
  it.each(['FBO', 'FBS'] as const)('AC-16: size="md", scheme="%s" — текст «%s», без иконок', (scheme) => {
    const badge = renderBadge(scheme, 'md')
    expect((badge.textContent ?? '').trim()).toBe(scheme)
    expect(badge.querySelector('svg, img')).toBeNull()
  })

  it('AC-16: size="md" — оформление отличается от размера по умолчанию', () => {
    for (const scheme of ['FBO', 'FBS'] as const) {
      expect(look(renderBadge(scheme, 'md')), scheme).not.toBe(look(renderBadge(scheme)))
    }
  })

  it('AC-16: в размере md у FBO и FBS одинаковое оформление', () => {
    expect(look(renderBadge('FBO', 'md'))).toBe(look(renderBadge('FBS', 'md')))
  })

  it('AC-16: без size — прежний вид (как при size={undefined})', () => {
    for (const scheme of ['FBO', 'FBS'] as const) {
      const { container } = render(<SchemeBadge scheme={scheme} size={undefined} />)
      expect(look(container.firstElementChild as HTMLElement)).toBe(look(renderBadge(scheme)))
    }
  })

  it('AC-16, AC-27: если вид задан inline-стилем — только токены, без «магических» цветов', () => {
    for (const scheme of ['FBO', 'FBS'] as const) {
      const style = renderBadge(scheme, 'md').getAttribute('style') ?? ''
      expect(style, scheme).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i)
    }
  })

  it('AC-16 / T3: бейдж md — обычный текст, без ссылок, кнопок и фокуса', () => {
    for (const scheme of ['FBO', 'FBS'] as const) {
      const badge = renderBadge(scheme, 'md')
      expect(badge.querySelector('a, button, [tabindex]')).toBeNull()
      expect(badge).not.toHaveAttribute('tabindex')
      expect(badge).not.toHaveAttribute('aria-hidden', 'true')
    }
  })
})
