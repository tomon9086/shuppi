import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import data from 'virtual:shuppi-data'
import type { CardData, Transaction } from './types'
import { addMonths, formatYen, getMonthRange } from './utils'
import './App.css'

const COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4',
]

// ---------- コンポーネント ----------

interface MerchantSummary {
  merchant: string
  total: number
}

function SpendingChart({
  data,
  topN = 20,
}: {
  data: MerchantSummary[]
  topN?: number
}) {
  const sorted = [...data].sort((a, b) => b.total - a.total).slice(0, topN)

  return (
    <ResponsiveContainer width="100%" height={Math.max(400, sorted.length * 36)}>
      <BarChart
        layout="vertical"
        data={sorted}
        margin={{ top: 8, right: 120, left: 8, bottom: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          type="category"
          dataKey="merchant"
          width={180}
          tick={{ fontSize: 11 }}
        />
        <Tooltip
          formatter={(value) => [formatYen(Number(value ?? 0)), '支出']}
          contentStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="total" radius={[0, 4, 4, 0]}>
          {sorted.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------- 全履歴統計表 ----------

interface MerchantStat {
  merchant: string
  total: number
  count: number
  max: number
  avg: number
}

function AllHistoryTable({ transactions }: { transactions: Transaction[] }) {
  const stats = useMemo<MerchantStat[]>(() => {
    const map = new Map<string, { total: number; count: number; max: number }>()
    for (const t of transactions) {
      const prev = map.get(t.merchant) ?? { total: 0, count: 0, max: 0 }
      map.set(t.merchant, {
        total: prev.total + t.amount,
        count: prev.count + 1,
        max: Math.max(prev.max, t.amount),
      })
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([merchant, { total, count, max }]) => ({
        merchant,
        total,
        count,
        max,
        avg: Math.round(total / count),
      }))
  }, [transactions])

  if (stats.length === 0) return null

  const grandTotal = stats.reduce((s, r) => s + r.total, 0)
  const grandCount = stats.reduce((s, r) => s + r.count, 0)
  const grandMax = stats.reduce((s, r) => Math.max(s, r.max), 0)
  const grandAvg = Math.round(grandTotal / grandCount)

  return (
    <div className="history-table-container">
      <table className="history-table">
        <thead>
          <tr>
            <th>支払先</th>
            <th className="num">合計</th>
            <th className="num">件数</th>
            <th className="num">平均</th>
            <th className="num">最大</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((row) => (
            <tr key={row.merchant}>
              <td>{row.merchant}</td>
              <td className="num">{formatYen(row.total)}</td>
              <td className="num">{row.count}</td>
              <td className="num">{formatYen(row.avg)}</td>
              <td className="num">{formatYen(row.max)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>合計</td>
            <td className="num">{formatYen(grandTotal)}</td>
            <td className="num">{grandCount}</td>
            <td className="num">{formatYen(grandAvg)}</td>
            <td className="num">{formatYen(grandMax)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ---------- メインApp ----------

export default function App() {
  const cards: CardData[] = data.cards

  const [selectedCardKey, setSelectedCardKey] = useState<string>(
    cards[0]?.cardId ?? '',
  )

  // 選択カードの全期間を取得
  const selectedCard = cards.find((c: CardData) => c.cardId === selectedCardKey)

  const allMonths = useMemo(() => {
    if (!selectedCard || selectedCard.transactions.length === 0) return []
    const { min, max } = getMonthRange(selectedCard.transactions)
    const months: string[] = []
    let cur = min
    while (cur <= max) {
      months.push(cur)
      cur = addMonths(cur, 1)
    }
    return months
  }, [selectedCard])

  const [startMonth, setStartMonth] = useState<string>('')
  const [endMonth, setEndMonth] = useState<string>('')

  // カード切替時に期間を保持（新カードの範囲にクランプ）
  const handleCardChange = (cardId: string) => {
    setSelectedCardKey(cardId)
  }

  const effectiveStart = useMemo(() => {
    if (!allMonths.length) return ''
    const min = allMonths[0]
    const max = allMonths[allMonths.length - 1]
    if (!startMonth || startMonth < min || startMonth > max) return min
    return startMonth
  }, [startMonth, allMonths])

  const effectiveEnd = useMemo(() => {
    if (!allMonths.length) return ''
    const min = allMonths[0]
    const max = allMonths[allMonths.length - 1]
    if (!endMonth || endMonth > max || endMonth < min) return max
    return endMonth
  }, [endMonth, allMonths])

  // 期間フィルタリング → 店舗別集計
  const merchantSummary = useMemo<MerchantSummary[]>(() => {
    if (!selectedCard) return []
    const filtered = selectedCard.transactions.filter((t: Transaction) => {
      const month = t.date.slice(0, 7)
      return month >= effectiveStart && month <= effectiveEnd
    })
    const map = new Map<string, number>()
    for (const t of filtered as Transaction[]) {
      map.set(t.merchant, (map.get(t.merchant) ?? 0) + t.amount)
    }
    return [...map.entries()].map(([merchant, total]) => ({ merchant, total }))
  }, [selectedCard, effectiveStart, effectiveEnd])

  const totalAmount = merchantSummary.reduce((s, m) => s + m.total, 0)

  return (
    <div className="app">
      <header className="app-header">
        <h1>shuppi</h1>
        <p className="generated-at">
          データ生成: {new Date(data.generatedAt).toLocaleString('ja-JP')}
        </p>
      </header>

      <div className="controls">
        {/* カード選択 */}
        <section className="control-group">
          <label className="control-label">クレジットカード</label>
          <div className="card-tabs">
            {cards.map((card) => (
              <button
                key={card.cardId}
                className={`card-tab ${card.cardId === selectedCardKey ? 'active' : ''}`}
                onClick={() => handleCardChange(card.cardId)}
              >
                {card.cardName}
              </button>
            ))}
          </div>
        </section>

        {/* 期間選択 */}
        <section className="control-group period-group">
          <label className="control-label">期間</label>
          <div className="period-row">
            <select
              value={effectiveStart}
              onChange={(e) => setStartMonth(e.target.value)}
              className="month-select"
            >
              {allMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <span className="period-sep">〜</span>
            <select
              value={effectiveEnd}
              onChange={(e) => setEndMonth(e.target.value)}
              className="month-select"
            >
              {allMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              className="reset-btn"
              onClick={() => {
                setStartMonth('')
                setEndMonth('')
              }}
            >
              全期間
            </button>
          </div>
        </section>
      </div>

      {/* サマリー */}
      <div className="summary-bar">
        <span className="summary-label">合計支出</span>
        <span className="summary-total">{formatYen(totalAmount)}</span>
        <span className="summary-count">{merchantSummary.length} 店舗</span>
      </div>

      {/* グラフ */}
      <div className="chart-container">
        {merchantSummary.length === 0 ? (
          <p className="empty">該当する明細がありません</p>
        ) : (
          <SpendingChart data={merchantSummary} />
        )}
      </div>

      {/* 全履歴統計表 */}
      <section className="section-block">
        <h2 className="section-title">全履歴 支払先別統計</h2>
        {selectedCard ? (
          <AllHistoryTable transactions={selectedCard.transactions} />
        ) : (
          <p className="empty">データがありません</p>
        )}
      </section>
    </div>
  )
}
