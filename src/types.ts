export interface Transaction {
  date: string // YYYY-MM-DD
  merchant: string // 正規化済み店舗名
  amount: number
}

export interface CardData {
  cardId: string // カード番号末尾など
  cardName: string // カード名称
  transactions: Transaction[]
}

export interface ProcessedData {
  cards: CardData[]
  generatedAt: string
}
