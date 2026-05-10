import { describe, expect, it } from 'vitest'
import {
  clusterMerchants,
  normalizeMerchantForCompare,
  normalizeFullWidth,
  parseCsvLine,
  parseJcbTransactions,
  parsePlatinumBlocks,
  parsePlatinumTransactions,
} from './vite-plugin-shuppi-data'

describe('normalizeFullWidth', () => {
  it('全角英字を半角に変換する', () => {
    expect(normalizeFullWidth('ＡＢＣ')).toBe('ABC')
    expect(normalizeFullWidth('ａｂｃ')).toBe('abc')
  })

  it('全角数字を半角に変換する', () => {
    expect(normalizeFullWidth('０１２３')).toBe('0123')
  })

  it('全角スペースを半角スペースに変換する', () => {
    expect(normalizeFullWidth('Ａ\u3000Ｂ')).toBe('A B')
  })

  it('全角括弧を半角に変換する', () => {
    expect(normalizeFullWidth('（テスト）')).toBe('(テスト)')
  })

  it('全角スラッシュを半角に変換する', () => {
    expect(normalizeFullWidth('２０２５／０３／１５')).toBe('2025/03/15')
  })

  it('全角長音符をハイフンに変換する', () => {
    expect(normalizeFullWidth('コーヒー')).toBe('コ-ヒ-')
  })

  it('前後の空白をトリムする', () => {
    expect(normalizeFullWidth('  ABC  ')).toBe('ABC')
  })

  it('連続スペースを1つにまとめる', () => {
    expect(normalizeFullWidth('A  B   C')).toBe('A B C')
  })

  it('すでに半角の文字はそのまま返す', () => {
    expect(normalizeFullWidth('Amazon')).toBe('Amazon')
  })
})

describe('normalizeMerchantForCompare', () => {
  it('全角を半角に変換して大文字に統一する', () => {
    expect(normalizeMerchantForCompare('ａｍａｚｏｎ')).toBe('AMAZON')
  })

  it('記号を除去する', () => {
    expect(normalizeMerchantForCompare('Amazon.co.jp')).toBe('AMAZONCOJP')
  })

  it('スペースを除去する', () => {
    expect(normalizeMerchantForCompare('7 ELEVEN')).toBe('7ELEVEN')
  })

  it('日本語文字はそのまま残す（ただし長音符はハイフン変換後に除去される）', () => {
    // ー(U+30FC) は normalizeFullWidth で '-' に変換され、その後記号除去される
    expect(normalizeMerchantForCompare('スターバックス')).toBe('スタバックス')
  })
})

describe('parseCsvLine', () => {
  it('カンマ区切りの単純な行を分割する', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('ダブルクォートで囲まれたフィールドを処理する', () => {
    expect(parseCsvLine('"hello world",b')).toEqual(['hello world', 'b'])
  })

  it('クォート内のカンマをフィールド区切りとして扱わない', () => {
    expect(parseCsvLine('"a,b",c')).toEqual(['a,b', 'c'])
  })

  it('ダブルクォートのエスケープ（""）を処理する', () => {
    expect(parseCsvLine('"a""b"')).toEqual(['a"b'])
  })

  it('空のフィールドを処理する', () => {
    expect(parseCsvLine('a,,c')).toEqual(['a', '', 'c'])
  })

  it('単一フィールドを処理する', () => {
    expect(parseCsvLine('abc')).toEqual(['abc'])
  })

  it('空文字列を処理する', () => {
    expect(parseCsvLine('')).toEqual([''])
  })
})

describe('parsePlatinumBlocks', () => {
  it('ヘッダー行からカードIDとカード名を抽出する', () => {
    const content = '1234-5678-9012-3456,カード名,プラチナプリファード\n2025/03/15,Amazon,,,, 1000'
    const blocks = parsePlatinumBlocks(content)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].cardId).toBe('1234-5678-9012-3456')
    expect(blocks[0].cardName).toBe('プラチナプリファード')
  })

  it('トランザクション行をlinesに格納する', () => {
    const content = '1234-5678-9012-3456,名前,カード名\n2025/03/15,Amazon,,,,1000\n2025/03/16,Starbucks,,,,500'
    const blocks = parsePlatinumBlocks(content)
    expect(blocks[0].lines).toHaveLength(2)
    expect(blocks[0].lines[0]).toBe('2025/03/15,Amazon,,,,1000')
  })

  it('合計行をスキップする', () => {
    const content = '1234-5678-9012-3456,名前,カード名\n2025/03/15,Amazon,,,,1000\n,,,,,,73771\u30001771'
    const blocks = parsePlatinumBlocks(content)
    expect(blocks[0].lines).toHaveLength(1)
  })

  it('複数のカードブロックを処理する', () => {
    const content = [
      '1111-2222-3333-4444,名前,カードA',
      '2025/03/15,Amazon,,,,1000',
      '5555-6666-7777-8888,名前,カードB',
      '2025/03/16,Starbucks,,,,500',
    ].join('\n')
    const blocks = parsePlatinumBlocks(content)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].cardId).toBe('1111-2222-3333-4444')
    expect(blocks[1].cardId).toBe('5555-6666-7777-8888')
  })

  it('空のコンテンツは空の配列を返す', () => {
    expect(parsePlatinumBlocks('')).toEqual([])
  })
})

describe('parsePlatinumTransactions', () => {
  it('有効なトランザクション行をパースする', () => {
    const lines = ['2025/03/15,Amazon,,,,1000']
    const txns = parsePlatinumTransactions(lines)
    expect(txns).toHaveLength(1)
    expect(txns[0]).toEqual({
      date: '2025-03-15',
      merchant: 'Amazon',
      amount: 1000,
    })
  })

  it('日付のスラッシュをハイフンに変換する', () => {
    const lines = ['2025/12/31,店舗,,,,999']
    const txns = parsePlatinumTransactions(lines)
    expect(txns[0].date).toBe('2025-12-31')
  })

  it('金額が0または負の行をスキップする', () => {
    const lines = ['2025/03/15,Amazon,,,,0']
    const txns = parsePlatinumTransactions(lines)
    expect(txns).toHaveLength(0)
  })

  it('日付フォーマットが不正な行をスキップする', () => {
    const lines = ['20250315,Amazon,,,,1000']
    const txns = parsePlatinumTransactions(lines)
    expect(txns).toHaveLength(0)
  })

  it('フィールド数が不足している行をスキップする', () => {
    const lines = ['2025/03/15,Amazon']
    const txns = parsePlatinumTransactions(lines)
    expect(txns).toHaveLength(0)
  })

  it('金額の数字以外の文字を除去してパースする', () => {
    // Platinumフォーマットはカンマ区切りのため、金額フィールドにカンマは含まれない
    const lines = ['2025/03/15,Amazon,,,, 1234']
    const txns = parsePlatinumTransactions(lines)
    expect(txns[0].amount).toBe(1234)
  })
})

describe('parseJcbTransactions', () => {
  const makeContent = (dataLines: string[]) => {
    const header = '"ご利用者","カテゴリ","ご利用日","ご利用先など","ご利用金額(￥)"'
    return [header, ...dataLines].join('\n')
  }

  it('JCBフォーマットのトランザクションをパースする', () => {
    const line = '"****-****-****-1037 【ＯＳ】ＪＣＢカードＷ様","≪ショッピング≫"," 2026/02/21","Amazon","9647"'
    const content = makeContent([line])
    const cards = parseJcbTransactions(content)
    expect(cards).toHaveLength(1)
    expect(cards[0].cardId).toBe('1037')
    expect(cards[0].transactions).toHaveLength(1)
    expect(cards[0].transactions[0]).toMatchObject({
      date: '2026-02-21',
      merchant: 'Amazon',
      amount: 9647,
    })
  })

  it('カンマ区切りの金額を正しくパースする', () => {
    const line = '"****-****-****-1037 【ＯＳ】ＪＣＢカードＷ様","≪ショッピング≫"," 2026/02/21","店舗","1,234"'
    const content = makeContent([line])
    const cards = parseJcbTransactions(content)
    expect(cards[0].transactions[0].amount).toBe(1234)
  })

  it('同一カードのトランザクションが1カードにまとめられる', () => {
    const lines = [
      '"****-****-****-1037 【ＯＳ】ＪＣＢカードＷ様","≪ショッピング≫"," 2026/02/21","Amazon","1000"',
      '"****-****-****-1037 【ＯＳ】ＪＣＢカードＷ様","≪ショッピング≫"," 2026/02/22","楽天","2000"',
    ]
    const content = makeContent(lines)
    const cards = parseJcbTransactions(content)
    expect(cards).toHaveLength(1)
    expect(cards[0].transactions).toHaveLength(2)
  })

  it('異なるカードIDのトランザクションは別カードになる', () => {
    const lines = [
      '"****-****-****-1037 【ＯＳ】ＪＣＢカードＷ様","≪ショッピング≫"," 2026/02/21","Amazon","1000"',
      '"****-****-****-2048 【ＯＳ】ＪＣＢカードＷ様","≪ショッピング≫"," 2026/02/22","楽天","2000"',
    ]
    const content = makeContent(lines)
    const cards = parseJcbTransactions(content)
    expect(cards).toHaveLength(2)
  })

  it('金額が0または負の行をスキップする', () => {
    const line = '"****-****-****-1037 【ＯＳ】ＪＣＢカードＷ様","≪ショッピング≫"," 2026/02/21","Amazon","0"'
    const content = makeContent([line])
    const cards = parseJcbTransactions(content)
    expect(cards).toHaveLength(0)
  })

  it('ヘッダー行が見つからない場合は空の配列を返す', () => {
    const cards = parseJcbTransactions('invalid content\nno header here')
    expect(cards).toEqual([])
  })
})

describe('clusterMerchants', () => {
  it('完全に一致する名前を同一店舗にマッピングする', () => {
    const result = clusterMerchants(['Amazon', 'Amazon'])
    expect(result.get('Amazon')).toBe('Amazon')
  })

  it('類似した店舗名を同一店舗にまとめる', () => {
    const result = clusterMerchants(['AMAZON.CO.JP', 'AMAZON.CO.JP '])
    const val1 = result.get('AMAZON.CO.JP')
    const val2 = result.get('AMAZON.CO.JP ')
    expect(val1).toBe(val2)
  })

  it('全く異なる店舗名は別々に扱う', () => {
    const result = clusterMerchants(['Amazon', 'Starbucks'])
    expect(result.get('Amazon')).toBe('Amazon')
    expect(result.get('Starbucks')).toBe('Starbucks')
  })

  it('空の配列に対して空のMapを返す', () => {
    const result = clusterMerchants([])
    expect(result.size).toBe(0)
  })

  it('単一の店舗名を自身にマッピングする', () => {
    const result = clusterMerchants(['Amazon'])
    expect(result.get('Amazon')).toBe('Amazon')
  })
})
