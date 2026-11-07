// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { formatDecimal1, formatSpeed } from './index'

/*
 * Spec 008 «Страница «Остатки»», AC-12: колонка «Продажи в день» — formatDecimal1(perDay) → «6,1».
 * Правило из spec («Где что лежит»): одна цифра после запятой, как formatSpeed, но без «/день».
 */

const NBSP = ' '

describe('formatDecimal1', () => {
  it('AC-12: пример из макета — 6,1', () => {
    expect(formatDecimal1(6.1)).toBe('6,1')
  })

  it('AC-12: целые — с «,0»', () => {
    expect(formatDecimal1(10)).toBe('10,0')
    expect(formatDecimal1(1)).toBe('1,0')
  })

  it('AC-12: ноль — «0,0»', () => {
    expect(formatDecimal1(0)).toBe('0,0')
  })

  it('AC-12: округление до одной цифры — 2,54 → 2,5; 2,56 → 2,6; 0,0714 → 0,1; 0,04 → 0,0', () => {
    expect(formatDecimal1(2.54)).toBe('2,5')
    expect(formatDecimal1(2.56)).toBe('2,6')
    expect(formatDecimal1(0.0714)).toBe('0,1')
    expect(formatDecimal1(0.04)).toBe('0,0')
  })

  it('AC-12: перенос разряда — 99,96 → «100,0», а не «99,10»', () => {
    expect(formatDecimal1(99.96)).toBe('100,0')
  })

  it('AC-12: скорость из окна 14 дней — 85 / 14 ≈ 6,07 → «6,1»', () => {
    expect(formatDecimal1(85 / 14)).toBe('6,1')
  })

  it('AC-12: десятичный разделитель — запятая, без «/день»', () => {
    const s = formatDecimal1(6.1)
    expect(s).not.toContain('.')
    expect(s).not.toContain('/день')
  })

  it('AC-12: большие значения — без экспоненты и без обычных пробелов', () => {
    const s = formatDecimal1(1500)
    expect(s.endsWith('500,0')).toBe(true)
    expect(s).not.toMatch(/e/i)
    expect(s).not.toMatch(/ /)
    expect(formatDecimal1(1_234_567.89)).not.toMatch(/e| /i)
    expect(formatDecimal1(1_234_567.89).endsWith('567,9')).toBe(true)
  })

  it('AC-12: разряды, если есть, — неразрывным пробелом', () => {
    const s = formatDecimal1(1500)
    expect(['1500,0', `1${NBSP}500,0`]).toContain(s)
  })

  it('AC-12: совпадает с formatSpeed без хвоста «/день»', () => {
    for (const n of [0, 0.04, 0.06, 0.0714, 1, 2.5, 6.1, 10, 12, 99.96, 1500]) {
      expect(`${formatDecimal1(n)}/день`, String(n)).toBe(formatSpeed(n))
    }
  })
})
