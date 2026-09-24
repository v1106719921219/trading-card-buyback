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
  /** 型番が一致せず、あえてカートに入れなかった行（手動で選んでもらう） */
  rejected?: string[]
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
        required: ['no', 'quantity', 'line'],
        properties: {
          no: { type: 'integer', description: '商品リストの番号' },
          quantity: { type: 'integer', description: '数量' },
          line: { type: 'integer', description: 'テキストの何行目の商品か（1始まり）' },
        },
      },
    },
  },
} as const

/** 途中で切れた JSON からでも、完全な {..} を拾えるだけ拾う */
function salvageItems(text: string): { no: number; quantity: number; line?: number }[] {
  const out: { no: number; quantity: number; line?: number }[] = []
  const re = /\{[^{}]*?\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const no = /"no"\s*:\s*(\d+)/.exec(m[0])
    const qty = /"quantity"\s*:\s*(\d+)/.exec(m[0])
    if (!no || !qty) continue
    const line = /"line"\s*:\s*(\d+)/.exec(m[0])
    out.push({ no: Number(no[1]), quantity: Number(qty[1]), line: line ? Number(line[1]) : undefined })
  }
  return out
}

// 型番の取り違え対策。
// 商品リストには「イーブイ プロモ [SV-P 031]」と「[SV-P 032]」のように
// カード名が同じで型番だけ違う商品が並ぶため、AIが隣の型番を選ぶことがある。
// 価格が数千円変わるので、型番が食い違うものはカートに入れず手動選択に回す。
function extractCodes(s: string): Set<string> {
  const codes = new Set<string>()
  const norm = (t: string) =>
    t
      .replace(/[Ａ-Ｚａ-ｚ０-９／－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
  // [SV-P 155] [S8b 245/184] [001/SV-P] (118/103) などの括弧内
  const bracket = /[[［(（]([^\][）)]{1,40})[\]］)）]/g
  let m: RegExpExecArray | null
  while ((m = bracket.exec(s)) !== null) {
    const inner = norm(m[1])
    // 数字を含まない括弧（「(ヒトデマン柄)」「(ノーマル ver.)」等）は型番ではない
    if (!/\d/.test(inner)) continue
    // 「(3箱)」「(2枚)」のような数量表現も型番ではない
    if (/^\d+\s*(枚|箱|個|点|パック|セット|SET|BOX)?$/.test(inner) && !/\//.test(inner)) continue
    codes.add(inner)
  }
  // 「245/184」「118/103」単体でも拾う（括弧の有無に依存しないため）
  const slash = /(\d{1,4}\s*\/\s*\d{1,4})/g
  while ((m = slash.exec(norm(s))) !== null) {
    codes.add(m[1].replace(/\s+/g, ''))
  }
  return codes
}

/** 入力行と商品名の型番が食い違っていれば false（どちらかに型番が無ければ判定しない） */
function codesAgree(inputLine: string, productName: string): boolean {
  const a = extractCodes(inputLine)
  const b = extractCodes(productName)
  if (a.size === 0 || b.size === 0) return true
  // 「[S8b 245/184]」と「245/184」のように書式が違っても拾えるよう、
  // 括弧の中身そのものと数字部分の両方を候補に入れて突き合わせる
  for (const x of a) if (b.has(x)) return true
  return false
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

  // 型番照合のため、モデルに渡すテキストにも行番号を振る
  const rawLines = text.split('\n').map((l) => l.trim())
  const inputLines = rawLines.filter((l) => l.length > 0).length
  const numberedText = rawLines.map((l, i) => `${i + 1}: ${l}`).join('\n')

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

## テキスト（先頭の数字は行番号）
${numberedText}

## 商品リスト
${productList}

## ルール
- テキスト中の商品名は略称や部分一致の場合があります。最も近い商品を選んでください。
- 数量が明記されていない場合は1とします。
- 「○箱」「○個」「○枚」「○点」「×○」などは数量です。
- マッチする商品がない場合はスキップしてください。
- 「シュリなし」「シュリ無し」は「シュリンク無し」の略称です。商品名にこれが含まれる場合、シュリンク無しのサブカテゴリに該当する商品とマッチングしてください。
- 型番（例: [SV-P 031]、[S8b 245/184]、(118/103)）が書かれている場合は、型番が完全に一致する商品だけを選んでください。カード名が同じでも型番が1文字でも違えば別の商品です。一致する商品が商品リストに無ければ、その行は返さないでください。
- 型番が一致する商品が無いときに、似ているだけの別の型番の商品を返してはいけません。返さない方が正しい動作です。
- それぞれの商品が「テキストの何行目か」を line に入れてください。
- 商品リストの「番号」と数量と行番号だけを返してください。テキストに無い商品は返さないでください。`,
        },
      ],
    })

    const content = response.content.find((b) => b.type === 'text')
    const raw = content && content.type === 'text' ? content.text : ''
    const truncated = response.stop_reason === 'max_tokens'

    let parsed: { no: number; quantity: number; line?: number }[] = []
    try {
      const json = JSON.parse(raw) as { items?: { no: number; quantity: number; line?: number }[] }
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
    const rejected: string[] = []
    for (const item of parsed) {
      const idx = item.no - 1
      if (!Number.isInteger(idx) || idx < 0 || idx >= products.length) continue
      const qty = Math.floor(Number(item.quantity))
      if (!Number.isFinite(qty) || qty <= 0) continue

      // 型番の取り違えはここで落とす。誤った金額でカートに入るより、
      // 手動で選んでもらう方が安全なため。
      const lineNo = Number(item.line)
      const sourceLine =
        Number.isInteger(lineNo) && lineNo >= 1 && lineNo <= rawLines.length
          ? rawLines[lineNo - 1]
          : ''
      if (sourceLine && !codesAgree(sourceLine, products[idx].name)) {
        // 行番号の取り違えの可能性がある。テキストの他の行に型番が一致するものが
        // あればそちらの行として扱い、無ければ手動選択に回す。
        const altLine = rawLines.find(
          (l) => l && l !== sourceLine && extractCodes(l).size > 0 && codesAgree(l, products[idx].name)
        )
        if (!altLine) {
          rejected.push(sourceLine)
          continue
        }
      }

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
      return {
        items: [],
        truncated,
        inputLines,
        rejected,
        error:
          rejected.length > 0
            ? '型番が一致する商品が見つかりませんでした。下の商品一覧から選んでください。'
            : '商品を認識できませんでした。商品名を確認してください。',
      }
    }

    return { items, truncated, inputLines, rejected }
  } catch (e) {
    console.error('AI parse error:', e)
    return { items: [], error: '解析中にエラーが発生しました' }
  }
}
