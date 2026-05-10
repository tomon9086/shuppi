import { describe, expect, it } from 'vitest'
import type { Transaction } from './types'
import { addMonths, formatYen, getMonthRange } from './utils'

describe('formatYen', () => {
  it('正の整数を円表記にフォーマットする', () => {
    expect(formatYen(1000)).toBe('¥1,000')
  })

  it('1万円以上をカンマ区切りでフォーマットする', () => {
    expect(formatYen(10000)).toBe('¥10,000')
    expect(formatYen(1234567)).toBe('¥1,234,567')
  })

  it('0円をフォーマットする', () => {
    expect(formatYen(0)).toBe('¥0')
  })

  it('1桁の金額をフォーマットする', () => {
    expect(formatYen(5)).toBe('¥5')
  })
})

describe('getMonthRange', () => {
  const tx = (date: string): Transaction => ({ date, merchant: 'test', amount: 100 })

  it('単一トランザクションの場合、min と max が同じになる', () => {
    const result = getMonthRange([tx('2025-03-15')])
    expect(result).toEqual({ min: '2025-03', max: '2025-03' })
  })

  it('複数月にまたがるトランザクションの最小・最大月を返す', () => {
    const txns = [tx('2025-03-15'), tx('2025-06-01'), tx('2025-01-20')]
    const result = getMonthRange(txns)
    expect(result).toEqual({ min: '2025-01', max: '2025-06' })
  })

  it('年をまたぐトランザクションを正しく処理する', () => {
    const txns = [tx('2024-11-30'), tx('2025-02-14'), tx('2026-01-01')]
    const result = getMonthRange(txns)
    expect(result).toEqual({ min: '2024-11', max: '2026-01' })
  })

  it('同月のトランザクションが複数ある場合', () => {
    const txns = [tx('2025-05-01'), tx('2025-05-15'), tx('2025-05-31')]
    const result = getMonthRange(txns)
    expect(result).toEqual({ min: '2025-05', max: '2025-05' })
  })

  it('空の配列の場合、空文字列を返す', () => {
    const result = getMonthRange([])
    expect(result).toEqual({ min: '', max: '' })
  })
})

describe('addMonths', () => {
  it('月を正の値で加算する', () => {
    expect(addMonths('2025-03', 1)).toBe('2025-04')
    expect(addMonths('2025-03', 3)).toBe('2025-06')
  })

  it('年末を越えて加算する', () => {
    expect(addMonths('2025-11', 2)).toBe('2026-01')
    expect(addMonths('2025-12', 1)).toBe('2026-01')
  })

  it('0を加算すると同じ月になる', () => {
    expect(addMonths('2025-06', 0)).toBe('2025-06')
  })

  it('月を負の値で減算する', () => {
    expect(addMonths('2025-03', -1)).toBe('2025-02')
    expect(addMonths('2025-01', -1)).toBe('2024-12')
  })

  it('月を2桁でゼロパディングする', () => {
    expect(addMonths('2025-09', 1)).toBe('2025-10')
    expect(addMonths('2025-08', 2)).toBe('2025-10')
  })
})
