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

export async function parseOrderText(
  text: string,
  products: ProductInfo[]
): Promise<{ items: ParsedItem[]; error?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { items: [], error: 'AI機能が設定されていません' }
  }

  if (!text.trim()) {
    return { items: [], error: 'テキストを入力してください' }
  }

  const productList = products
    .map((p) => `ID:${p.id} | ${p.name} | ${p.price}円`)
    .join('\n')

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
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

## 出力形式
JSON配列のみを出力してください。説明は不要です。
[{"id":"商品ID","quantity":数量}]

マッチする商品がない場合は空配列 [] を返してください。`,
        },
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      return { items: [], error: '解析に失敗しました' }
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return { items: [], error: '商品を認識できませんでした' }
    }

    const parsed: { id: string; quantity: number }[] = JSON.parse(jsonMatch[0])
    const productMap = new Map(products.map((p) => [p.id, p]))

    const items: ParsedItem[] = parsed
      .filter((item) => productMap.has(item.id) && item.quantity > 0)
      .map((item) => {
        const product = productMap.get(item.id)!
        return {
          product_id: product.id,
          product_name: product.name,
          unit_price: product.price,
          quantity: item.quantity,
        }
      })

    return { items }
  } catch (e) {
    console.error('AI parse error:', e)
    return { items: [], error: '解析中にエラーが発生しました' }
  }
}
