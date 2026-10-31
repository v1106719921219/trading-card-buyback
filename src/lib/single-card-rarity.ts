export const SINGLE_CARD_RARITIES = ['MUR','BWR','UR','FUR','SAR','SR','HR','SSR','MA','AR','CSR','CHR','RRR','RR','TR','ACE','S','R','U','C','P'] as const
export const UNKNOWN_RARITY = 'UNKNOWN'
/** 商品名に明記されたレアリティだけを読む。型番やVSTAR内のAR等は推測しない。 */
export function singleCardRarity(name: string): string {
  const clean = name.normalize('NFKC').replace(/\[[^\]]*\]/g, ' ').replace(/PSA\s*\d+/gi, ' ').replace(/\([^)]*\)/g, ' ').trim()
  return clean.match(/(?:^|\s)(MUR|BWR|FUR|SAR|CSR|CHR|SSR|RRR|ACE|UR|SR|HR|MA|AR|RR|TR|S|R|U|C|P)(?=\s|$)/i)?.[1].toUpperCase() ?? UNKNOWN_RARITY
}
export function rarityRank(name: string): number {
  const rank = SINGLE_CARD_RARITIES.indexOf(singleCardRarity(name) as typeof SINGLE_CARD_RARITIES[number])
  return rank < 0 ? SINGLE_CARD_RARITIES.length : rank
}
