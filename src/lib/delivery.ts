import { PREFECTURES, DELIVERY_DAYS, DELIVERY_DAYS_DEFAULT, prefectureToOfficeKey, type Prefecture } from './constants'

/**
 * 住所文字列から都道府県を抽出する
 */
export function extractPrefectureFromAddress(address: string): Prefecture | null {
  for (const pref of PREFECTURES) {
    if (address.startsWith(pref)) {
      return pref
    }
  }
  return null
}

/**
 * 発送元都道府県と発送先事務所の都道府県から配送日数を返す
 */
export function getDeliveryDays(fromPrefecture: string, toOfficePrefecture: string): number {
  const officeKey = prefectureToOfficeKey(toOfficePrefecture)
  const prefEntry = DELIVERY_DAYS[fromPrefecture]
  if (prefEntry && prefEntry[officeKey] !== undefined) {
    return prefEntry[officeKey]
  }
  return DELIVERY_DAYS_DEFAULT
}

/**
 * 発送日 + 配送日数 = 到着予定日を計算する
 */
export function calculateArrivalDate(shippedDate: Date, deliveryDays: number): Date {
  const arrival = new Date(shippedDate)
  arrival.setDate(arrival.getDate() + deliveryDays)
  return arrival
}

/**
 * JST の YYYY-MM-DD 文字列を返す
 */
export function formatDateJST(date: Date): string {
  const jst = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const y = jst.getFullYear()
  const m = String(jst.getMonth() + 1).padStart(2, '0')
  const d = String(jst.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 現在の JST 日付を YYYY-MM-DD で返す
 */
export function getTodayJST(): string {
  return formatDateJST(new Date())
}
