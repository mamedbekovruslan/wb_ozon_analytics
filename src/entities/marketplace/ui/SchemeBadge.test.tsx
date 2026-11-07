import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SchemeBadge } from '../index'

/*
 * Spec 007 «Скоро закончится», AC-6: бейдж схемы работы Ozon из public API entities/marketplace.
 *   <SchemeBadge scheme="FBO" /> → «FBO», <SchemeBadge scheme="FBS" /> → «FBS».
 * Вид один для обеих схем: высота 18, padding 0 5px, 11/600, радиус 4, рамка 1 px --border-strong,
 * текст --text-2, без фона — вычисленные стили проверяются в e2e/low-stock.spec.ts.
 * То, что у WB (scheme = null) бейджа нет, — в интеграционных тестах строки (src/app/lowStock.test.tsx).
 */

type Scheme = 'FBO' | 'FBS'

function renderBadge(scheme: Scheme): HTMLElement {
  const { container } = render(<SchemeBadge scheme={scheme} />)
  expect(container.children).toHaveLength(1)
  return container.firstElementChild as HTMLElement
}

const look = (el: HTMLElement) => `${el.className} | ${el.getAttribute('style') ?? ''}`

describe('SchemeBadge', () => {
  it.each(['FBO', 'FBS'] as const)('AC-6: scheme="%s" — текст «%s»', (scheme) => {
    expect((renderBadge(scheme).textContent ?? '').trim()).toBe(scheme)
  })

  it('AC-6: у FBO и FBS одинаковое оформление — различается только текст', () => {
    const fbo = renderBadge('FBO')
    const fbs = renderBadge('FBS')
    expect(look(fbo).trim()).not.toBe('|')
    expect(look(fbo)).toBe(look(fbs))
  })

  it('AC-6: без иконок — только текст', () => {
    for (const scheme of ['FBO', 'FBS'] as const) expect(renderBadge(scheme).querySelector('svg, img')).toBeNull()
  })

  it('AC-6, AC-18: если вид задан inline-стилем — рамка --border-strong, текст --text-2, без своего фона', () => {
    for (const scheme of ['FBO', 'FBS'] as const) {
      const style = renderBadge(scheme).getAttribute('style') ?? ''
      if (/border/i.test(style)) expect(style, scheme).toContain('--border-strong')
      if (/(^|;)\s*color/i.test(style)) expect(style, scheme).toContain('--text-2')
      expect(style, scheme).not.toMatch(/background(-color)?\s*:\s*(?!transparent|none)/i)
      expect(style, scheme).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i)
    }
  })

  it('AC-6 / T3: бейдж — обычный текст, без ссылок, кнопок и фокуса', () => {
    for (const scheme of ['FBO', 'FBS'] as const) {
      const badge = renderBadge(scheme)
      expect(badge.querySelector('a, button, [tabindex]')).toBeNull()
      expect(badge).not.toHaveAttribute('tabindex')
      expect(badge).not.toHaveAttribute('aria-hidden', 'true')
    }
  })
})
