import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import previousSeeds from '@/data/buyback-comparison-seed.json'
import catalog from '@/data/cardrush-catalog.json'
const seeds = [...previousSeeds, ...catalog]
import { z } from 'zod'

const quote = z.object({ price: z.number().int().min(0).max(100000000).nullable(), url: z.string().max(2000).refine(v => !v || /^https:\/\//.test(v)), checkedAt: z.string().max(60).nullable(), note: z.string().max(500) })
const record = z.object({ productId: z.string().uuid().nullable(), quotes: z.object({rush:quote,dora:quote,yuyu:quote,hare:quote,A:quote,B:quote}) })
const request = z.discriminatedUnion('action', [
 z.object({action:z.literal('reference'),key:z.string().regex(/^(candidate-\d+|product-[0-9a-f-]{36})$/),value:record}),
 z.object({action:z.literal('price'),key:z.string(),productId:z.string().uuid(),expected:z.number().int().nonnegative(),price:z.number().int().min(0).max(100000000)}),
])
async function context() {
 const db = await createClient(); const {data:{user}}=await db.auth.getUser()
 if (!user) return null
 const {data:profile}=await db.from('profiles').select('role,tenant_id').eq('id',user.id).single()
 if (!profile?.tenant_id || !['admin','manager','staff'].includes(profile.role)) return null
 return {db,profile}
}
export async function GET(req:NextRequest) {
 const c=await context(); if(!c)return NextResponse.json({error:'ログインが必要です'},{status:401})
 const prefix=`comparison_v1:${c.profile.tenant_id}:`
 const [subResult,settingResult]=await Promise.all([
  c.db.from('subcategories').select('id,name'),
  (async()=>{const rows:{key:string;value:string}[]=[];for(let offset=0;;offset+=500){
   const {data,error}=await c.db.from('app_settings').select('key,value').eq('tenant_id',c.profile.tenant_id).or(`key.like.${prefix}%,key.like.single_ab_source_%`).order('key').range(offset,offset+499)
   if(error)throw Error('参考価格を取得できませんでした');rows.push(...(data||[]));if((data||[]).length<500)return rows
  }})().then(data=>({data,error:null})).catch(()=>({data:[],error:true}))
 ])
 if(subResult.error||settingResult.error)return NextResponse.json({error:'比較情報を取得できませんでした'},{status:503})
 const ids=(subResult.data||[]).filter(s=>/シングル/.test(s.name)).map(s=>s.id)
 const products=[]
 if(ids.length)for(let offset=0;;offset+=500){
  const {data,error}=await c.db.from('products').select('id,name,model_number,set_number,price,subcategory_id,image_url').eq('tenant_id',c.profile.tenant_id).in('subcategory_id',ids).order('id').range(offset,offset+499)
  if(error)return NextResponse.json({error:'商品を取得できませんでした'},{status:503});products.push(...(data||[]));if((data||[]).length<500)break
 }
 const saved:Record<string,z.infer<typeof record>>={}
 for(const row of settingResult.data){if(row.key.startsWith(prefix))try{saved[row.key.slice(prefix.length)]=record.parse(JSON.parse(row.value))}catch{}}
 const productIds=new Set(products.map(p=>p.id))
 for(const row of settingResult.data){if(!row.key.startsWith('single_ab_source_'))continue
  const id=row.key.slice('single_ab_source_'.length),key=`product-${id}`;if(saved[key]||!productIds.has(id))continue
  try{const src=JSON.parse(row.value);if(src.quote?.currency!=='JPY')continue
   saved[key]=record.parse({productId:id,quotes:Object.fromEntries(['rush','dora','yuyu','hare','A','B'].map(s=>[s,{price:s==='A'||s==='B'?src.quote[s]?.price??null:null,url:s==='A'||s==='B'?src.url||'':'',checkedAt:s==='A'||s==='B'?src.quote.checked_at||null:null,note:'保存済み調査'}]))})
  }catch{}
 }
 const empty=()=>Object.fromEntries(['rush','dora','yuyu','hare','A','B'].map(s=>[s,{price:null,url:'',checkedAt:null,note:''}])) as z.infer<typeof record>['quotes']
 type Row={key:string;name:string;productId:string|null;image_url?:string|null;quotes:z.infer<typeof record>['quotes'];sale_price?:number|null;sale_url?:string|null;sale_checked_at?:string|null;preferred?:boolean;normal_single?:boolean;catalog?:boolean}
 const rows:Row[]=[...products.map(p=>({key:`product-${p.id}`,name:p.name,productId:p.id,image_url:p.image_url,quotes:empty()})),...(c.profile.tenant_id==='aaaaaaaa-0000-0000-0000-000000000001'?seeds:[])].map(r=>({...r,...saved[r.key]}))
 const q=req.nextUrl.searchParams,search=(q.get('q')||'').normalize('NFKC').toLowerCase(),scope=q.get('scope')||'preferred',kind=q.get('kind')||'all',basis=q.get('basis')||'sale',pokemon=q.get('pokemon')||''
 const min=q.get('min')?Number(q.get('min')):null,max=q.get('max')?Number(q.get('max')):null
 const filtered=rows.filter(r=>{
  if(scope==='preferred'&&(!r.catalog||!r.preferred||!r.normal_single))return false
  if(scope==='catalog'&&!r.catalog)return false
  if(scope==='registered'&&!r.productId)return false
  if(kind==='linked'&&!r.productId||kind==='candidate'&&r.productId)return false
  if(search&&!r.name.normalize('NFKC').toLowerCase().includes(search))return false
  if(pokemon&&!r.name.includes(pokemon))return false
  const price=basis==='sale'?r.sale_price:r.quotes.rush.price
  if(min!==null&&(price==null||price<min)||max!==null&&(price==null||price>max))return false
  return true
 })
 const pageCount=Math.max(1,Math.ceil(filtered.length/50)),page=Math.min(pageCount,Math.max(1,Number(q.get('page'))||1))
 return NextResponse.json({products,rows:filtered.slice((page-1)*50,page*50),total:filtered.length,page,pageCount,catalogCount:catalog.length,canEdit:c.profile.role==='admin'},{headers:{'Cache-Control':'private, no-store'}})
}
export async function POST(req:NextRequest) {
 const c=await context();if(!c)return NextResponse.json({error:'ログインが必要です'},{status:401})
 if(c.profile.role!=='admin')return NextResponse.json({error:'管理者のみ保存できます'},{status:403})
 const origin=req.headers.get('origin');if(origin&&origin!==req.nextUrl.origin)return NextResponse.json({error:'不正な送信元'},{status:403})
 let body;try{body=request.parse(await req.json())}catch{return NextResponse.json({error:'入力形式が正しくありません'},{status:400})}
 const key=`comparison_v1:${c.profile.tenant_id}:${body.key}`
 if(body.action==='reference'){
  const isProduct=body.key.startsWith('product-')
  if(isProduct&&body.value.productId!==body.key.slice(8))return NextResponse.json({error:'商品の紐付けが一致しません'},{status:400})
  if(!isProduct&&(c.profile.tenant_id!=='aaaaaaaa-0000-0000-0000-000000000001'||!seeds.some(s=>s.key===body.key)))return NextResponse.json({error:'候補が見つかりません'},{status:404})
  if(body.value.productId){const {data}=await c.db.from('products').select('id').eq('id',body.value.productId).eq('tenant_id',c.profile.tenant_id).single();if(!data)return NextResponse.json({error:'商品が見つかりません'},{status:404})}
  const {data:existing,error:readError}=await c.db.from('app_settings').select('key').eq('key',key).eq('tenant_id',c.profile.tenant_id).maybeSingle()
  if(readError)return NextResponse.json({error:'保存済み参考価格を確認できませんでした'},{status:503})
  const value=JSON.stringify(body.value)
  const {error}=existing
   ?await c.db.from('app_settings').update({value}).eq('key',key).eq('tenant_id',c.profile.tenant_id)
   :await c.db.from('app_settings').insert({key,tenant_id:c.profile.tenant_id,value,description:'他社価格比較・手動確認値'})
  if(error)return NextResponse.json({error:`参考価格を保存できませんでした (${error.code}: ${error.message})`},{status:500})
  return NextResponse.json({success:true})
 }
 const {data:setting,error:settingError}=await c.db.from('app_settings').select('value').eq('key',key).eq('tenant_id',c.profile.tenant_id).maybeSingle()
 if(settingError)return NextResponse.json({error:'紐付けを確認できませんでした'},{status:503})
 let linked=body.key===`product-${body.productId}`
 if(!linked&&setting){try{linked=record.parse(JSON.parse(setting.value)).productId===body.productId}catch{}}
 if(!linked)return NextResponse.json({error:'先に対象商品との紐付けを保存してください'},{status:400})
 const {data:product}=await c.db.from('products').select('id,subcategory_id').eq('id',body.productId).eq('tenant_id',c.profile.tenant_id).single()
 if(!product)return NextResponse.json({error:'商品が見つかりません'},{status:404})
 const {data:sub}=await c.db.from('subcategories').select('name').eq('id',product.subcategory_id).single()
 if(!sub||!/シングル/.test(sub.name))return NextResponse.json({error:'通常シングル商品のみ設定できます'},{status:400})
 const {data,error}=await c.db.from('products').update({price:body.price,...(body.price===0?{show_in_price_list:false}:{})}).eq('id',body.productId).eq('tenant_id',c.profile.tenant_id).eq('price',body.expected).select('id,price')
 if(error)return NextResponse.json({error:'買取価格を保存できませんでした'},{status:500})
 if(data?.length!==1)return NextResponse.json({error:'価格が他で変更されています。再読み込みしてください'},{status:409})
 return NextResponse.json({success:true,price:body.price})
}
