/**
 * Viteプラグイン: ビルド時にdata/以下のCSVを読み込み、
 * 正規化・類似店舗名統合を行い、JSONとして仮想モジュールに注入する
 */

import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import Fuse from 'fuse.js'

// ---------- 型定義 ----------
interface Transaction {
  date: string
  merchant: string
  amount: number
}

interface CardData {
  cardId: string
  cardName: string
  transactions: Transaction[]
}

interface ProcessedData {
  cards: CardData[]
  generatedAt: string
}

// ---------- 文字正規化 ----------

/**
 * 全角英数字・記号を半角に変換
 */
export function normalizeFullWidth(str: string): string {
  return str
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u3000/g, ' ')
    .replace(/．/g, '.')
    .replace(/・/g, '·')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/［/g, '[')
    .replace(/］/g, ']')
    .replace(/〔/g, '[')
    .replace(/〕/g, ']')
    .replace(/／/g, '/')
    .replace(/＊/g, '*')
    .replace(/★/g, '*')
    .replace(/\u30FC/g, '-') // 全角長音符 → ハイフン
    .replace(/\uFF70/g, '-') // 半角長音符 → ハイフン
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 店舗名を正規化（比較用）
 * - 大文字統一
 * - 記号除去
 * - スペース除去
 */
export function normalizeMerchantForCompare(name: string): string {
  return normalizeFullWidth(name)
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * 類似店舗名をクラスタリングして代表名を返すMapを生成
 * Fuseでファジー検索し、一定スコア以上のものを同一店舗とみなす
 */
export function clusterMerchants(names: string[]): Map<string, string> {
  const unique = [...new Set(names)]
  const canonical = new Map<string, string>() // 元名 → 代表名

  const THRESHOLD = 0.25 // Fuse score は低いほど類似（0=完全一致）

  // 代表名リスト（確定済み）
  const representatives: string[] = []

  for (const name of unique) {
    if (representatives.length === 0) {
      representatives.push(name)
      canonical.set(name, name)
      continue
    }

    // Fuseに渡すためにオブジェクト配列に変換
    const fuseData = representatives.map((r) => ({
      original: r,
      normalized: normalizeMerchantForCompare(r),
    }))
    const fuse2 = new Fuse(fuseData, {
      includeScore: true,
      threshold: THRESHOLD,
      keys: ['normalized'],
    })

    const results = fuse2.search({
      normalized: normalizeMerchantForCompare(name),
    })

    if (results.length > 0 && results[0].score !== undefined && results[0].score <= THRESHOLD) {
      // 既存代表名に統合
      canonical.set(name, results[0].item.original)
    } else {
      representatives.push(name)
      canonical.set(name, name)
    }
  }

  return canonical
}

// ---------- CSVパーサー ----------

/**
 * Shift_JIS バイト列を文字列に変換
 * Node 18+ の TextDecoder を使用
 */
function decodeSJIS(buffer: Buffer): string {
  const decoder = new TextDecoder('shift_jis')
  return decoder.decode(buffer)
}

/**
 * CSV の1行をフィールド配列に分割（ダブルクォート対応）
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuote = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuote = !inQuote
      }
    } else if (ch === ',' && !inQuote) {
      fields.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur)
  return fields
}

// ---------- Platinum Preferred フォーマット ----------
// 行フォーマット: 日付,店舗名,金額,支払回数合計,今回回数,今回金額,備考
// ヘッダー行: カード番号とカード名を含む
// 合計行: ",,,,,,73771\u30001771"
// 複数カードブロックが1ファイル内に存在する場合がある

export interface PlatinumBlock {
  cardId: string
  cardName: string
  lines: string[]
}

export function parsePlatinumBlocks(content: string): PlatinumBlock[] {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean)
  const blocks: PlatinumBlock[] = []
  let current: PlatinumBlock | null = null

  for (const line of lines) {
    // ヘッダー行の判定: カード番号パターン "xxxx-11**-****-****,カード名"
    const headerMatch = line.match(/[\d*]+-[\d*]+-[\d*]+-[\d*]+,(.+)/)
    if (headerMatch) {
      if (current) blocks.push(current)
      const parts = line.split(',')
      current = {
        cardId: parts[0].trim(),
        cardName: parts.slice(2).join(',').trim(), // 3列目以降がカード名
        lines: [],
      }
      continue
    }
    // 合計行はスキップ
    if (line.startsWith(',,,,,,') || line.startsWith(',,,,,')) continue

    if (current) current.lines.push(line)
  }
  if (current) blocks.push(current)
  return blocks
}

export function parsePlatinumTransactions(lines: string[]): Transaction[] {
  const txns: Transaction[] = []
  for (const line of lines) {
    const fields = line.split(',')
    if (fields.length < 6) continue
    const [dateStr, merchantRaw, , , , amountStr] = fields
    if (!dateStr.match(/^\d{4}\/\d{2}\/\d{2}$/)) continue
    const amount = parseInt(amountStr.replace(/[^\d]/g, ''), 10)
    if (isNaN(amount) || amount <= 0) continue
    txns.push({
      date: dateStr.replace(/\//g, '-'),
      merchant: merchantRaw.trim(),
      amount,
    })
  }
  return txns
}

// ---------- JCB フォーマット ----------
// CSVダブルクォート囲み、各行はフィールドリスト
// ヘッダー: ["ご利用者","カテゴリ","ご利用日","ご利用先など","ご利用金額(￥)",...] (6行目)
// データ: ["****...", "≪ショッピング...≫", " 2026/02/21", "店舗名", "9,647", ...]

export function parseJcbTransactions(content: string): CardData[] {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean)

  // ヘッダー行を探す
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i])
    if (fields.some((f) => f.includes('ご利用日') || f.includes('ご利用先'))) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) return []

  const cardMap = new Map<string, CardData>()

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i])
    if (fields.length < 5) continue

    const userField = fields[0].trim() // "****-...-1037 【ＯＳ】ＪＣＢカードＷＬ..."
    const dateStr = fields[2].trim() // " 2026/02/21"
    const merchantRaw = fields[3].trim()
    const amountStr = fields[4].trim().replace(/,/g, '')

    if (!dateStr.match(/\d{4}\/\d{2}\/\d{2}/)) continue
    const amount = parseInt(amountStr.replace(/[^\d]/g, ''), 10)
    if (isNaN(amount) || amount <= 0) continue

    // カードIDを抽出 (末尾4桁)
    const cardIdMatch = userField.match(/\*{4}-\*{4}-\*{4}-(\d{4})/)
    const cardId = cardIdMatch ? cardIdMatch[1] : 'unknown'

    // カード名を抽出
    const cardNameMatch = userField.match(/【[^】]+】(.+?)様/)
    const cardName = cardNameMatch
      ? normalizeFullWidth(cardNameMatch[1]).trim()
      : 'JCBカード'

    if (!cardMap.has(cardId)) {
      cardMap.set(cardId, { cardId, cardName, transactions: [] })
    }

    cardMap.get(cardId)!.transactions.push({
      date: dateStr.replace(/\//g, '-').trim(),
      merchant: merchantRaw,
      amount,
    })
  }

  return [...cardMap.values()]
}

// ---------- メイン処理 ----------

function processDataDir(dataDir: string): ProcessedData {
  const allCards = new Map<string, CardData>()

  // Platinum Preferred
  const platDir = path.join(dataDir, 'platinum-preffered')
  if (fs.existsSync(platDir)) {
    for (const file of fs.readdirSync(platDir).filter((f) => f.endsWith('.csv'))) {
      const buf = fs.readFileSync(path.join(platDir, file))
      const content = decodeSJIS(buf)
      const blocks = parsePlatinumBlocks(content)
      for (const block of blocks) {
        const key = `platinum-${block.cardId}`
        if (!allCards.has(key)) {
          allCards.set(key, {
            cardId: block.cardId,
            cardName: `三井住友カードプラチナプリファード (${block.cardId})`,
            transactions: [],
          })
        }
        const txns = parsePlatinumTransactions(block.lines)
        allCards.get(key)!.transactions.push(...txns)
      }
    }
  }

  // JCB-W
  const jcbDir = path.join(dataDir, 'jcb-w')
  if (fs.existsSync(jcbDir)) {
    for (const file of fs.readdirSync(jcbDir).filter((f) => f.endsWith('.csv'))) {
      const buf = fs.readFileSync(path.join(jcbDir, file))
      const content = decodeSJIS(buf)
      const cards = parseJcbTransactions(content)
      for (const card of cards) {
        const key = `jcb-${card.cardId}`
        if (!allCards.has(key)) {
          allCards.set(key, { ...card, transactions: [] })
        }
        allCards.get(key)!.transactions.push(...card.transactions)
      }
    }
  }

  // 各カードで店舗名を正規化・クラスタリング
  const result: CardData[] = []
  for (const card of allCards.values()) {
    const rawNames = card.transactions.map((t) => t.merchant)
    const clusterMap = clusterMerchants(rawNames)

    const normalized: Transaction[] = card.transactions.map((t) => ({
      ...t,
      merchant: normalizeFullWidth(clusterMap.get(t.merchant) ?? t.merchant),
    }))

    // 重複排除（同日・同店舗・同金額は1件に）
    const seen = new Set<string>()
    const deduped = normalized.filter((t) => {
      const key = `${t.date}|${t.merchant}|${t.amount}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // 日付昇順ソート
    deduped.sort((a, b) => a.date.localeCompare(b.date))

    result.push({ ...card, transactions: deduped })
  }

  return {
    cards: result,
    generatedAt: new Date().toISOString(),
  }
}

// ---------- Viteプラグイン ----------

const VIRTUAL_MODULE_ID = 'virtual:shuppi-data'
const RESOLVED_ID = '\0' + VIRTUAL_MODULE_ID

export function shuppiDataPlugin(): Plugin {
  let dataDir: string

  return {
    name: 'shuppi-data',
    configResolved(config) {
      dataDir = path.join(config.root, 'data')
    },
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_ID
    },
    load(id) {
      if (id !== RESOLVED_ID) return

      // データディレクトリ内のCSVをwatchに追加
      if (fs.existsSync(dataDir)) {
        const addWatchDir = (dir: string) => {
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (f.endsWith('.csv')) {
                this.addWatchFile(path.join(dir, f))
              }
            }
          }
        }
        addWatchDir(path.join(dataDir, 'platinum-preffered'))
        addWatchDir(path.join(dataDir, 'jcb-w'))
      }

      const data = processDataDir(dataDir)
      return `export default ${JSON.stringify(data)}`
    },
  }
}
