import crypto from 'crypto'

/**
 * 査定結果PDFを実URLで配信するための署名付きトークン。
 * LINEアプリ内ブラウザではblob URLの新規ウィンドウを開けないため、
 * 「本人であること」をURL自体に載せて外部ブラウザで開けるようにする。
 *
 * DBを増やさずに済むよう、サーバー専用のキーでHMAC署名する方式にしている。
 */
const TTL_MS = 30 * 60 * 1000 // 30分

type Payload = {
  /** 注文番号 */
  o: string
  /** LINEユーザーID（本人以外のPDFを開けないようにする） */
  u: string
  /** 出所DB（東京/千葉） */
  db?: string
  /** 有効期限（epoch ms） */
  exp: number
}

function secret() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('署名キーが設定されていません')
  return crypto.createHash('sha256').update(`inspection-pdf:${key}`).digest()
}

function b64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sign(body: string) {
  return b64url(crypto.createHmac('sha256', secret()).update(body).digest())
}

export function createInspectionPdfToken(input: Omit<Payload, 'exp'>): string {
  const payload: Payload = { ...input, exp: Date.now() + TTL_MS }
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  return `${body}.${sign(body)}`
}

export function verifyInspectionPdfToken(token: string): Payload | null {
  const [body, sig] = (token ?? '').split('.')
  if (!body || !sig) return null
  const expected = sign(body)
  // 署名の比較はタイミング攻撃を避けるため定数時間で行う
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()) as Payload
    if (!payload.o || !payload.u || !payload.exp) return null
    if (Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
