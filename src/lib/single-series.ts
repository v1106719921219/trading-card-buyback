import catalog from '@/data/single-series-catalog.json'
const namesByCode=catalog as Record<string,string>
const aliases=new Map<string,string>()
for(const [code,name] of Object.entries(namesByCode)){
 if(!code.startsWith('LEGACY-')&&!(code.length===1&&!['A','B','E','M'].includes(code)))continue
 const known=Object.keys(namesByCode).filter(c=>!c.startsWith('LEGACY-')&&c.length>1&&namesByCode[c]===name)
 if(known.length===1)aliases.set(code,known[0])
}
export const canonicalSingleSeriesCode=(code:string)=>aliases.get(code)||code
export const singleSeriesAliases=(code:string)=>[code,...[...aliases].filter(([,target])=>target===code).map(([alias])=>alias)]

const descriptions=[...new Set(Object.values(namesByCode))].sort((a,b)=>b.length-a.length).map(name=>{const codes=Object.keys(namesByCode).filter(c=>namesByCode[c]===name);return{name,code:codes.find(c=>c.startsWith('LEGACY-'))||codes[0]}})
export function singleSeriesCode(p: { set_number: string | null; name: string }): string {
  const raw=p.set_number?.trim()||''
  const coded=raw.match(/^([A-Za-z][A-Za-z0-9+_-]*)(?:\s|$)/)?.[1]
  if(coded)return canonicalSingleSeriesCode(coded.toUpperCase())
  const described=descriptions.find(s=>p.name.includes(s.name))
  if(described)return canonicalSingleSeriesCode(described.code)
  for(const match of p.name.matchAll(/\[([^\]]+)\]/g)){
    const code=match[1].match(/^([A-Za-z][A-Za-z0-9+_-]*)(?:\s|$)/)?.[1]
    if(code)return canonicalSingleSeriesCode(code.toUpperCase())
    const reverse=match[1].match(/^\d+[\s/]+([A-Za-z]+-[A-Za-z]+)$/)?.[1]
    if(reverse)return canonicalSingleSeriesCode(reverse.toUpperCase())
  }
  return 'OTHER'
}
export const MEGA_SERIES = [
  { code: 'M6A', name: '30th CELEBRATION' },
  { code: 'M6', name: 'ストームエメラルダ' },
  { code: 'M5', name: 'アビスアイ' },
  { code: 'M4', name: 'ニンジャスピナー' },
  { code: 'M3', name: 'ムニキスゼロ' },
  { code: 'M2A', name: 'MEGAドリームex' },
  { code: 'M2', name: 'インフェルノX' },
  { code: 'M1S', name: 'メガシンフォニア' },
  { code: 'M1L', name: 'メガブレイブ' },
]

export function singleSeriesName(code:string):string {
 return MEGA_SERIES.find(s=>s.code===code)?.name||(catalog as Record<string,string>)[code]||(code==='OTHER'?'シリーズ未設定':code)
}
export function singleSeriesOptions(codes:Iterable<string>){
 return [...new Set([...codes].map(canonicalSingleSeriesCode))].sort((a,b)=>{const ai=MEGA_SERIES.findIndex(s=>s.code===a),bi=MEGA_SERIES.findIndex(s=>s.code===b);return (ai<0?999:ai)-(bi<0?999:bi)||singleSeriesName(a).localeCompare(singleSeriesName(b),'ja',{numeric:true})}).map(code=>({code,name:singleSeriesName(code),label:code==='OTHER'?'シリーズ未設定':`${singleSeriesName(code)}（${code.startsWith('LEGACY-')?'型番未設定':code}）`}))
}
