import { NextResponse } from 'next/server'

// Destructive migration/cleanup operations must not be exposed as public web APIs.
export async function POST() {
  return NextResponse.json({ error: 'この一括メンテナンスAPIは廃止されました' }, { status: 410 })
}
