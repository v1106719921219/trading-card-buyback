'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getMfTransactions, isMfConnected, type MFTransaction } from '@/lib/mf'

export interface ReconciliationOrder {
  id: string
  orderNumber: string
  customerName: string
  bankAccountHolder: string | null
  amount: number
  paidDate: string // 振込済にした日 (YYYY-MM-DD)
  status: string
}

export interface MatchResult {
  order: ReconciliationOrder
  mfTransaction: MFTransaction | null
  matchType: 'matched' | 'name_mismatch' | 'unmatched'
  nameMatchedButUsed?: boolean
}

export interface DuplicateSuspect {
  order: ReconciliationOrder
  mfTransaction: MFTransaction // 紐付け済みとは別の、同名義・同額のMF出金
}

export interface ReconciliationResult {
  matches: MatchResult[]
  duplicateSuspects: DuplicateSuspect[] // 二重振込疑い
  unmatchedMfTransactions: MFTransaction[] // 注文と紐付かなかったMF出金（振込系のみ）
  summary: {
    total: number
    matched: number
    nameMismatch: number
    unmatched: number
    duplicateSuspects: number
  }
}

// 小書きカナ→大文字カナ（銀行明細では「リョウタ」が「リヨウタ」になるため）
const SMALL_KANA_MAP: Record<string, string> = {
  ァ: 'ア', ィ: 'イ', ゥ: 'ウ', ェ: 'エ', ォ: 'オ',
  ャ: 'ヤ', ュ: 'ユ', ョ: 'ヨ', ッ: 'ツ', ヮ: 'ワ',
  ヵ: 'カ', ヶ: 'ケ',
}

// カタカナに酷似した漢字→カタカナ（顧客が「ウメタ二(漢数字)ヨウヘイ」のように誤入力するため）
const KANJI_LOOKALIKE_MAP: Record<string, string> = {
  二: 'ニ', 力: 'カ', 工: 'エ', 口: 'ロ', 卜: 'ト', 夕: 'タ', 千: 'チ', 八: 'ハ',
}

/** 銀行名義照合用にカナ正規化（半角カナ→全角・ひらがな→カタカナ・小書き→大文字・カナ英数字以外除去） */
function normalizeName(s: string | null | undefined): string {
  if (!s) return ''
  let t = s.normalize('NFKC') // 半角カナ→全角カナ、濁点合成、全角英数→半角
  // ひらがな→カタカナ
  t = t.replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
  // 小書きカナ→大文字カナ
  t = t.replace(/[ァィゥェォャュョッヮヵヶ]/g, (ch) => SMALL_KANA_MAP[ch] ?? ch)
  // カタカナ酷似漢字→カタカナ（誤入力対策）
  t = t.replace(/[二力工口卜夕千八]/g, (ch) => KANJI_LOOKALIKE_MAP[ch] ?? ch)
  // カタカナ・英数字のみ残す（長音符・中点・スペース・株式会社等の漢字は除去）
  t = t.replace(/[^\u30A1-\u30F6A-Za-z0-9]/g, '')
  return t.toUpperCase()
}

function namesMatch(orderName: string, mfText: string): boolean {
  if (!orderName || !mfText) return false
  return mfText.includes(orderName) || orderName.includes(mfText)
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('ログインが必要です')
}

export async function getMfConnectionStatus(): Promise<boolean> {
  await requireAdmin()
  return isMfConnected()
}

/**
 * 指定した注文（振込確認ページに表示中の振込済注文）とMF銀行明細を突合する。
 * 期間は対象注文の振込日から自動決定（最古の振込日〜今日+3日バッファ）。
 */
export async function reconcileMfForOrders(
  orderIds: string[]
): Promise<ReconciliationResult | { error: string }> {
  try {
    await requireAdmin()
    if (orderIds.length === 0) return { error: '照合対象の注文がありません' }
    const supabase = createAdminClient()

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, bank_account_holder, total_amount, inspected_total_amount, inspection_discount, status, updated_at')
      .in('id', orderIds)

    if (ordersError) return { error: `注文の取得に失敗しました: ${ordersError.message}` }

    // 2. 振込日（振込済に変更した日時）をステータス履歴から取得
    const paidDateMap = new Map<string, string>()
    if (orderIds.length > 0) {
      const { data: history } = await supabase
        .from('order_status_history')
        .select('order_id, created_at')
        .eq('new_status', '振込済')
        .in('order_id', orderIds)
        .order('created_at', { ascending: true })
      for (const h of history ?? []) {
        paidDateMap.set(h.order_id, h.created_at) // 最後の振込済遷移で上書き
      }
    }

    // 3. 照合対象の注文（振込日はステータス履歴から、なければupdated_at）
    const targetOrders: ReconciliationOrder[] = (orders ?? [])
      .map((o) => {
        const paidAt = paidDateMap.get(o.id) ?? o.updated_at
        return {
          id: o.id,
          orderNumber: o.order_number,
          customerName: o.customer_name,
          bankAccountHolder: o.bank_account_holder,
          amount: (o.inspected_total_amount ?? o.total_amount) - (o.inspection_discount ?? 0),
          paidDate: String(paidAt).slice(0, 10),
          status: o.status,
        }
      })
      .sort((a, b) => a.paidDate.localeCompare(b.paidDate))

    // 4. MFの銀行自動連携取引を取得し、期間内の出金に絞る
    //    期間 = 最古の振込日 〜 最新の振込日+3日（翌営業日着金バッファ）
    const startDate = targetOrders[0]?.paidDate ?? ''
    const bufferedEnd = new Date(targetOrders[targetOrders.length - 1]?.paidDate ?? new Date())
    bufferedEnd.setDate(bufferedEnd.getDate() + 3)
    const bufferedEndStr = bufferedEnd.toISOString().slice(0, 10)

    const mfWithdrawals = await getMfTransactions(startDate, bufferedEndStr)

    // 5. 突合（金額一致→名義一致の順でグリーディマッチ、1取引=1注文）
    const usedTxnIds = new Set<string>()
    const matches: MatchResult[] = []

    // 5-1. 金額＋名義の完全一致を優先
    for (const order of targetOrders) {
      const holderNorm = normalizeName(order.bankAccountHolder)
      const candidate = mfWithdrawals.find((tx) => {
        if (usedTxnIds.has(tx.id) || tx.amount !== order.amount) return false
        const mfText = normalizeName(`${tx.description} ${tx.memo}`)
        return namesMatch(holderNorm, mfText)
      })
      if (candidate) {
        usedTxnIds.add(candidate.id)
        matches.push({ order, mfTransaction: candidate, matchType: 'matched' })
      }
    }

    // 5-2. 残りは金額のみ一致（名義不一致の疑い）
    const matchedOrderIds = new Set(matches.map((m) => m.order.id))
    for (const order of targetOrders) {
      if (matchedOrderIds.has(order.id)) continue
      const candidate = mfWithdrawals.find(
        (tx) => !usedTxnIds.has(tx.id) && tx.amount === order.amount
      )
      if (candidate) {
        usedTxnIds.add(candidate.id)
        matches.push({ order, mfTransaction: candidate, matchType: 'name_mismatch' })
      } else {
        matches.push({ order, mfTransaction: null, matchType: 'unmatched' })
      }
    }

    // 表示順を振込日順に戻す
    matches.sort((a, b) => a.order.paidDate.localeCompare(b.order.paidDate))

    // 6. 二重振込疑いの検出:
    //    紐付け済みの注文と同じ名義＋同じ金額のMF出金が「他にも」残っていれば疑いあり
    const duplicateSuspects: DuplicateSuspect[] = []
    const duplicateTxnIds = new Set<string>()
    for (const m of matches) {
      if (!m.mfTransaction) continue
      const holderNorm = normalizeName(m.order.bankAccountHolder)
      if (!holderNorm) continue
      for (const tx of mfWithdrawals) {
        if (usedTxnIds.has(tx.id) || duplicateTxnIds.has(tx.id)) continue
        if (tx.amount !== m.order.amount) continue
        const mfText = normalizeName(`${tx.description} ${tx.memo}`)
        if (namesMatch(holderNorm, mfText)) {
          duplicateTxnIds.add(tx.id)
          duplicateSuspects.push({ order: m.order, mfTransaction: tx })
        }
      }
    }

    // 7. 注文と紐付かなかったMF出金のうち、振込らしきもの（摘要に「振込」を含む、手数料は除外）
    const unmatchedMfTransactions = mfWithdrawals.filter(
      (tx) =>
        !usedTxnIds.has(tx.id) &&
        !duplicateTxnIds.has(tx.id) &&
        (tx.description.includes('振込') || tx.memo.includes('振込')) &&
        !tx.description.includes('手数料') &&
        !tx.memo.includes('手数料')
    )

    return {
      matches,
      duplicateSuspects,
      unmatchedMfTransactions,
      summary: {
        total: matches.length,
        matched: matches.filter((m) => m.matchType === 'matched').length,
        nameMismatch: matches.filter((m) => m.matchType === 'name_mismatch').length,
        unmatched: matches.filter((m) => m.matchType === 'unmatched').length,
        duplicateSuspects: duplicateSuspects.length,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '照合処理に失敗しました' }
  }
}
