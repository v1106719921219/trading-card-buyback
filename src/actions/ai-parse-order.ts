'use server'

import Anthropic from '@anthropic-ai/sdk'

interface ProductInfo {
  id: string
  name: string
  price: number
}

interface ParsedItem {
  product_id: string
  product_name: string
  unit_price: number
  quantity: number
}

interface ParseResult {
  items: ParsedItem[]
  error?: string
  /** 出力上限で途中までしか読めなかった場合に true（読めた分は items に入る） */
  truncated?: boolean
  /** 入力の行数（数量行として数えられそうな行） */
  inputLines?: number
}

// 出力は「商品リストの連番 + 数量」だけを返させる。
// UUID（36文字＝約30トークン/件）をそのまま返させると数十行の申込で
// max_tokens に達して JSON が途切れ、お客様に「解析に失敗しました」と出ていた。
// 連番なら 1 件あたり十数トークンで済むため、同じ上限で桁違いの行数を扱える。
const MAX_TOKENS = 8192

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['no', 'quantity'],
        properties: {
          no: { type: 'integer', description: '商品リストの番号' },
          quantity: { type: 'integer', description: '数量' },
        },
      },
    },
  },
} as const

/** 途中で切れた JSON からでも、完全な {..} を拾えるだけ拾う */
function salvageItems(text: string): { no: number; quantity: number }[] {
  const out: { no: number; quantity: number }[] = []
  const re = /\{[^{}]*?"no"\s*:\s*(\d+)[^{}]*?"quantity"\s*:\s*(\d+)[^{}]*?\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push({ no: Number(m[1]), quantity: Number(m[2]) })
  }
  if (out.length > 0) return out
  // "quantity" が先に来る形にも備える
  const re2 = /\{[^{}]*?"quantity"\s*:\s*(\d+)[^{}]*?"no"\s*:\s*(\d+)[^{}]*?\}/g
  while ((m = re2.exec(text)) !== null) {
    out.push({ no: Number(m[2]), quantity: Number(m[1]) })
  }
  return out
}

export async function parseOrderText(
  text: string,
  products: ProductInfo[]
): Promise<ParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { items: [], error: 'AI機能が設定されていません' }
  }

  if (!text.trim()) {
    return { items: [], error: 'テキストを入力してください' }
  }

  const inputLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0).length

  // 連番はこの配列の添字+1。モデルにはこの番号だけを返させる
  const productList = products
    .map((p, i) => `${i + 1}) ${p.name} | ${p.price}円`)
    .join('\n')

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: MAX_TOKENS,
      output_config: { format: { type: 'json_schema', schema: RESULT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: `以下のテキストから注文商品と数量を読み取り、商品リストとマッチングしてください。

## テキスト
${text}

## 商品リスト
${productList}

## ルール
- テキスト中の商品名は略称や部分一致の場合があります。最も近い商品を選んでください。
- 数量が明記されていない場合は1とします。
- 「○箱」「○個」「○枚」「○点」「×○」などは数量です。
- マッチする商品がない場合はスキップしてください。
- 「シュリなし」「シュリ無し」は「シュリンク無し」の略称です。商品名にこれが含まれる場合、シュリンク無しのサブカテゴリに該当する商品とマッチングしてください。
- カード名が同じでも型番（例: [SV-P 031] と [SV-P 032]）が違えば別の商品です。型番が書かれている場合は必ず一致するものを選んでください。
- 商品リストの「番号」と数量だけを返してください。テキストに無い商品は返さないでください。`,
        },
      ],
    })

    const content = response.content.find((b) => b.type === 'text')
    const raw = content && content.type === 'text' ? content.text : ''
    const truncated = response.stop_reason === 'max_tokens'

    let parsed: { no: number; quantity: number }[] = []
    try {
      const json = JSON.parse(raw) as { items?: { no: number; quantity: number }[] }
      parsed = json.items ?? []
    } catch {
      // 出力が途切れた等でJSONとして読めない場合は、拾えるものだけ拾う
      parsed = salvageItems(raw)
    }

    if (parsed.length === 0) {
      return {
        items: [],
        truncated,
        inputLines,
        error: truncated
          ? '商品が多すぎて読み取れませんでした。半分ずつに分けて貼り付けてください。'
          : '商品を認識できませんでした。商品名を確認してください。',
      }
    }

    const merged = new Map<number, number>()
    for (const item of parsed) {
      const idx = item.no - 1
      if (!Number.isInteger(idx) || idx < 0 || idx >= products.length) continue
      const qty = Math.floor(Number(item.quantity))
      if (!Number.isFinite(qty) || qty <= 0) continue
      merged.set(idx, (merged.get(idx) ?? 0) + qty)
    }

    const items: ParsedItem[] = [...merged.entries()].map(([idx, quantity]) => {
      const product = products[idx]
      return {
        product_id: product.id,
        product_name: product.name,
        unit_price: product.price,
        quantity,
      }
    })

    if (items.length === 0) {
      return { items: [], truncated, inputLines, error: '商品を認識できませんでした。商品名を確認してください。' }
    }

    return { items, truncated, inputLines }
  } catch (e) {
    console.error('AI parse error:', e)
    return { items: [], error: '解析中にエラーが発生しました' }
  }
}
