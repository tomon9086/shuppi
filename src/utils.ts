import type { CardData } from './types'

export function formatYen(amount: number): string {
  return `¥${amount.toLocaleString('ja-JP')}`
}

export function getMonthRange(transactions: CardData['transactions']): {
  min: string
  max: string
} {
  const months = transactions.map((t) => t.date.slice(0, 7))
  return {
    min: months.reduce((a, b) => (a < b ? a : b), months[0] ?? ''),
    max: months.reduce((a, b) => (a > b ? a : b), months[0] ?? ''),
  }
}

// ISO月文字列 "YYYY-MM" の加算
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
