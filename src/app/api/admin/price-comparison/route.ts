import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import seeds from '@/data/buyback-comparison-seed.json'
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
export async function GET() {
 const c=await context(); if(!c)return NextResponse.json({error:'ログインが必要です'},{status:401})
 const products=[]; let total:number|null=null
 for(let offset=0;;offset+=500){
  const {data,error,count}=await c.db.from('products').select('id,name,model_number,set_number,price,subcategory_id',{count:'exact'}).eq('tenant_id',c.profile.tenant_id).order('id').range(offset,offset+499)
  if(error || (total!==null&&count!==total))return NextResponse.json({error:'商品取得に失敗しました。再読み込みしてください'},{status:503})
  total=count;products.push(...(data||[]));if(products.length===(total??0))break
  if(!data?.length)return NextResponse.json({error:'商品取得が途中で終了しました'},{status:503})
 }
 const {data:subs,error:subError}=await c.db.from('subcategories').select('id,name')
 if(subError)return NextResponse.json({error:'分類取得に失敗しました'},{status:503})
 const singleIds=new Set((subs||[]).filter(s=>/シングル/.test(s.name)).map(s=>s.id))
 const singles=products.filter(p=>singleIds.has(p.subcategory_id))
 const saved:Record<string,unknown>={};const prefix=`comparison_v1:${c.profile.tenant_id}:`
 for(let start=0;;start+=500){
  const {data,error}=await c.db.from('app_settings').select('key,value').eq('tenant_id',c.profile.tenant_id).like('key',`${prefix}%`).order('key').range(start,start+499)
  if(error)return NextResponse.json({error:'比較価格の取得に失敗しました'},{status:503})
  for(const row of data||[]){try{saved[row.key.slice(prefix.length)]=record.parse(JSON.parse(row.value))}catch{/* Invalid rows are not used. */}}
  if((data||[]).length<500)break
 }
 // Seed research belongs to Tokyo; never expose or attach it to other tenants.
 // Load the existing saved A/B quotes for registered products as defaults.
 for(let i=0;i<singles.length;i+=50){
  const keys=singles.slice(i,i+50).map(p=>`single_ab_source_${p.id}`)
  const {data,error}=await c.db.from('app_settings').select('key,value').eq('tenant_id',c.profile.tenant_id).in('key',keys)
  if(error)return NextResponse.json({error:'保存済みA/B価格の取得に失敗しました'},{status:503})
  for(const row of data||[]){
   const id=row.key.slice('single_ab_source_'.length),k=`product-${id}`
   if(saved[k])continue
   try{const src=JSON.parse(row.value);if(src.quote?.currency!=='JPY')continue
    const quotes=Object.fromEntries(['rush','dora','yuyu','hare','A','B'].map(s=>[s,{price:s==='A'||s==='B'?src.quote[s]?.price??null:null,url:s==='A'||s==='B'?src.url||'':'',checkedAt:s==='A'||s==='B'?src.quote.checked_at||null:null,note:'保存済み調査'}]))
    saved[k]=record.parse({productId:id,quotes})
   }catch{/* Malformed historic quotes remain unconfirmed. */}
  }
 }
 const candidates=c.profile.tenant_id==='aaaaaaaa-0000-0000-0000-000000000001'?seeds:[]
 return NextResponse.json({products:singles,candidates,saved,canEdit:c.profile.role==='admin'})
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
